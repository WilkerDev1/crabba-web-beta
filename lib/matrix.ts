import type { MatrixClient } from 'matrix-js-sdk';

const rawMatrixUrl = process.env.NEXT_PUBLIC_MATRIX_HOMESERVER_URL || process.env.NEXT_PUBLIC_MATRIX_BASE_URL as string;
let MATRIX_BASE_URL = rawMatrixUrl ? rawMatrixUrl.replace(/\/+$/, '') : '';

// Global reference for development HMR to prevent multiple instances
const globalForMatrix = global as unknown as {
    matrixClient: MatrixClient | null;
    loginPromise: Promise<MatrixClient | null> | null;
    startPromise: Promise<void> | null;
    clientStarted: boolean;
    serverOffline: boolean;
    syncBackoffMs: number;
};

export const getSharedClient = (): MatrixClient | null => {
    return globalForMatrix.matrixClient;
};

// ─── Server Health & Status ───

export const getServerStatus = (): boolean => {
    return !!globalForMatrix.serverOffline;
};

export const setServerStatus = (offline: boolean): void => {
    globalForMatrix.serverOffline = offline;
};

/**
 * Get the effective base URL. Environment variable is the PRIMARY source of truth.
 * localStorage override is ONLY used if the env var is empty (local dev with tunnels).
 */
export const getEffectiveBaseUrl = (): string => {
    // Env var always wins if set — this is what Vercel deploys control
    if (MATRIX_BASE_URL) return MATRIX_BASE_URL;

    // Fallback to localStorage only if env var is empty (local dev tunnel scenario)
    if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('matrix_homeserver_url');
        if (stored) return stored.replace(/\/+$/, '');
    }
    return '';
};

/**
 * Persist a new Matrix homeserver base URL (e.g., new Cloudflare tunnel).
 */
export const setBaseUrl = (url: string): void => {
    const clean = url.replace(/\/+$/, '');
    MATRIX_BASE_URL = clean;
    if (typeof window !== 'undefined') {
        localStorage.setItem('matrix_homeserver_url', clean);
    }
};

/**
 * Ping /_matrix/client/versions to verify the homeserver is reachable.
 * Returns true if healthy, false if unreachable.
 */
export const checkServerHealth = async (): Promise<boolean> => {
    const baseUrl = getEffectiveBaseUrl();
    if (!baseUrl) {
        globalForMatrix.serverOffline = true;
        return false;
    }
    try {
        const res = await fetch(`${baseUrl}/_matrix/client/versions`, {
            signal: AbortSignal.timeout(8000), // 8s timeout
        });
        const healthy = res.ok;
        globalForMatrix.serverOffline = !healthy;
        if (healthy) globalForMatrix.syncBackoffMs = 0;
        return healthy;
    } catch {
        globalForMatrix.serverOffline = true;
        return false;
    }
};

export const getMatrixClient = async (): Promise<MatrixClient | null> => {
    // 1. Check for existing in-memory client first
    if (globalForMatrix.matrixClient) {
        if (globalForMatrix.matrixClient.getAccessToken()) {
            return globalForMatrix.matrixClient;
        }
    }

    // 2. Check if a login connection is already in progress
    if (globalForMatrix.loginPromise) {
        return globalForMatrix.loginPromise;
    }

    // 3. Reset SDK global flag for HMR if needed
    if ((globalThis as any).__js_sdk_entrypoint) {
        (globalThis as any).__js_sdk_entrypoint = undefined;
    }

    // 4. Start initialization flow wrapped in a promise
    globalForMatrix.loginPromise = (async () => {
        try {
            const { createClient } = await import('matrix-js-sdk');

            // Check LocalStorage for existing session (Client-side only)
            let accessToken: string | null = null;
            let userId: string | null = null;
            let deviceId: string | null = null;

            if (typeof window !== 'undefined') {
                accessToken = localStorage.getItem('matrix_access_token');
                userId = localStorage.getItem('matrix_user_id');
                deviceId = localStorage.getItem('matrix_device_id');

                // Mandatory Unique Device IDs per browser session to prevent Sync Clashing
                if (!deviceId) {
                    deviceId = `crabba-web-${crypto.randomUUID()}`;
                    localStorage.setItem('matrix_device_id', deviceId);
                    console.log('Generated unique deviceId for this browser session:', deviceId);
                }
            }

            let client: MatrixClient;

            const customFetchFn = (input: string | URL | globalThis.Request, init?: RequestInit) => {
                const newInit = init || {};

                let fetchUrl = '';
                if (typeof input === 'string') {
                    fetchUrl = input;
                } else if (input instanceof URL) {
                    fetchUrl = input.toString();
                } else if (typeof Request !== 'undefined' && input instanceof Request) {
                    fetchUrl = input.url;
                }

                if (fetchUrl.includes('ngrok-free.app') || fetchUrl.includes('ngrok-free.dev') || fetchUrl.includes('ngrok.io')) {
                    newInit.headers = {
                        ...newInit.headers,
                        "ngrok-skip-browser-warning": "true",
                    };
                }

                return fetch(input, newInit);
            };

            if (accessToken && userId && deviceId) {
                console.log('💾 Restoring Matrix session from LocalStorage...');
                client = createClient({
                    baseUrl: getEffectiveBaseUrl(),
                    accessToken,
                    userId,
                    deviceId,
                    fetchFn: customFetchFn,
                });
            } else {
                console.log('🆕 No Matrix session found in LocalStorage, fetching from Identity Bridge...');

                // Fetch dynamic credentials from our Next.js API route
                const res = await fetch('/api/auth/matrix-token');

                if (!res.ok) {
                    const errorText = await res.text();
                    console.error('Matrix Auth Error:', errorText);
                    // Handle graceful reject
                    globalForMatrix.loginPromise = null;
                    return null as any as MatrixClient; // Will safely cast to null
                }

                const data = await res.json();

                client = createClient({
                    baseUrl: getEffectiveBaseUrl(),
                    accessToken: data.access_token,
                    userId: data.user_id,
                    deviceId: data.device_id,
                    fetchFn: customFetchFn,
                });

                if (typeof window !== 'undefined') {
                    console.log('💾 Saving dynamic Matrix session to LocalStorage');
                    localStorage.setItem('matrix_access_token', data.access_token);
                    localStorage.setItem('matrix_user_id', data.user_id);
                    localStorage.setItem('matrix_device_id', data.device_id);
                }
            }

            // Bind error handlers for resilient sync recovery
            client.on("sync" as any, (state: string, prevState: string, data: any) => {
                if (state === 'SYNCING' || state === 'PREPARED') {
                    globalForMatrix.serverOffline = false;
                    globalForMatrix.syncBackoffMs = 0;
                }

                if (state === 'ERROR') {
                    let errMessage = data?.error?.message || "Unknown error";

                    // DNS / network-level failures — apply exponential backoff
                    const isDnsError = errMessage.includes("context canceled")
                        || errMessage.includes("fetch failed")
                        || errMessage.includes("ERR_NAME_NOT_RESOLVED")
                        || errMessage.includes("NXDOMAIN")
                        || errMessage.includes("NetworkError");

                    if (isDnsError) {
                        globalForMatrix.serverOffline = true;
                        const backoff = Math.min((globalForMatrix.syncBackoffMs || 1000) * 2, 30000);
                        globalForMatrix.syncBackoffMs = backoff;
                        console.warn(`⏳ Network error, backing off ${backoff}ms before next sync attempt`);
                        return;
                    }

                    console.error("Matrix Sync Error Details:", errMessage);

                    if (errMessage.includes("M_UNKNOWN_TOKEN")) {
                        console.warn("Matrix token rejected. Client needs to re-auth.");
                    }
                }
            });

            globalForMatrix.matrixClient = client;
            return client;
        } catch (error) {
            console.error('❌ Failed to initialize Matrix client:', error);
            globalForMatrix.loginPromise = null;
            throw error;
        }
    })();

    return globalForMatrix.loginPromise;
};

export const clearMatrixSession = async () => {
    console.log('🧹 Clearing Matrix session and stopping client...');

    // Stop syncing background processes
    if (globalForMatrix.matrixClient) {
        try {
            await globalForMatrix.matrixClient.logout();
            globalForMatrix.matrixClient.stopClient();
        } catch (error) {
            console.error('Non-fatal error logging out of Matrix:', error);
        }
    }

    // Reset SPA global memory
    globalForMatrix.matrixClient = null;
    globalForMatrix.loginPromise = null;

    // Clear local storage
    if (typeof window !== 'undefined') {
        localStorage.removeItem('matrix_access_token');
        localStorage.removeItem('matrix_user_id');
        localStorage.removeItem('matrix_device_id');
    }
};

/**
 * Clear stuck pending events from a room's local timeline.
 * Removes events in NOT_SENT or SENDING state that block the queue.
 */
export const clearPendingEvents = (roomId: string): void => {
    const client = globalForMatrix.matrixClient;
    if (!client) return;

    const room = client.getRoom(roomId);
    if (!room) return;

    try {
        const pendingEvents = room.getPendingEvents();
        if (pendingEvents.length === 0) return;

        console.warn(`🧹 Clearing ${pendingEvents.length} stuck pending events from room ${roomId}`);

        for (const event of pendingEvents) {
            const status = event.status;
            // Only remove events that are stuck (failed or still "sending" but probably dead)
            if (status === 'not_sent' || status === 'sending' || status === 'queued') {
                try {
                    client.cancelPendingEvent(event);
                } catch (cancelErr) {
                    // Fallback: try to remove from the room's pending list directly
                    try {
                        room.removePendingEvent(event.getId()!);
                    } catch {
                        // Last resort — can't remove, but at least we tried
                    }
                }
            }
        }
        console.log('✅ Pending event queue cleared.');
    } catch (err) {
        console.error('Failed to clear pending events:', err);
    }
};

/**
 * Send a Matrix event with automatic retry on "blocked" errors.
 * If the first attempt fails because of stuck pending events,
 * clears the queue and retries ONCE.
 */
export const sendEventWithRetry = async (
    roomId: string,
    eventType: string,
    content: any
): Promise<any> => {
    const client = globalForMatrix.matrixClient;
    if (!client) throw new Error('Matrix client not initialized');

    try {
        return await client.sendEvent(roomId, eventType as any, content);
    } catch (err: any) {
        const msg = err?.message || '';
        const httpCode = err?.httpStatus || err?.data?.errcode;

        // Handle queue-blocked errors
        const isBlocked = msg.includes('blocked') || msg.includes('not yet sent') || msg.includes('NOT_SENT');
        if (isBlocked) {
            console.warn('⚠️ Event blocked by stuck queue. Clearing and retrying...');
            clearPendingEvents(roomId);
            await new Promise(r => setTimeout(r, 500));
            return await client.sendEvent(roomId, eventType as any, content);
        }

        // Handle HTTP 400 — typically "Cannot start threads from an event with a relation"
        const is400 = httpCode === 400 || msg.includes('400') || msg.includes('Cannot start threads');
        if (is400) {
            console.error('🚨 400 error during send — purging pending queue to prevent lockup');
            clearPendingEvents(roomId);
            throw new Error('Thread relation error: the reply target may already be in a thread. Please try again.');
        }

        throw err;
    }
};

/**
 * Safely start the Matrix sync client. Uses a promise-based lock to prevent
 * duplicate startClient calls from concurrent React renders or HMR.
 * Auto-heals corrupted IndexedDB stores (prepareLazyLoadingForSync crash).
 */
export const safeStartClient = async (client: MatrixClient): Promise<void> => {
    // If already running, skip
    if (globalForMatrix.clientStarted && client.clientRunning) {
        return;
    }

    // Promise-based dedup: if another call is already starting, wait for it
    if (globalForMatrix.startPromise) {
        return globalForMatrix.startPromise;
    }

    const startOptions = {
        initialSyncLimit: 20,
        lazyLoadMembers: true,
        pendingEventOrdering: "detached",
        disablePresence: true,
    } as any;

    globalForMatrix.startPromise = (async () => {
        try {
            await client.startClient(startOptions);
            globalForMatrix.clientStarted = true;
        } catch (err: any) {
            const errStr = String(err?.message || err);
            console.warn("⚠️ Matrix startClient failed:", errStr);

            // Auto-heal: corrupted IndexedDB store (prepareLazyLoadingForSync crash)
            if (errStr.includes('prepareLazyLoading') || errStr.includes('store') || errStr.includes('IDB')) {
                console.warn("🔧 Clearing corrupted Matrix stores and retrying...");
                try {
                    await client.clearStores();
                } catch (clearErr) {
                    console.warn("Could not clear stores:", clearErr);
                }

                // Retry once after clearing stores
                try {
                    await client.startClient(startOptions);
                    globalForMatrix.clientStarted = true;
                    console.log("✅ Matrix sync started after store clear.");
                } catch (retryErr) {
                    console.error("❌ Matrix startClient failed even after store clear:", retryErr);
                    globalForMatrix.clientStarted = false;
                    throw retryErr;
                }
            } else {
                globalForMatrix.clientStarted = false;
                throw err;
            }
        } finally {
            globalForMatrix.startPromise = null;
        }
    })();

    return globalForMatrix.startPromise;
};

