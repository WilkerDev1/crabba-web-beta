import type { MatrixClient } from 'matrix-js-sdk';

const MATRIX_BASE_URL = process.env.NEXT_PUBLIC_MATRIX_HOMESERVER_URL || process.env.NEXT_PUBLIC_MATRIX_BASE_URL as string;

// Global reference for development HMR to prevent multiple instances
const globalForMatrix = global as unknown as {
    matrixClient: MatrixClient | null;
    loginPromise: Promise<MatrixClient | null> | null;
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
            }

            let client: MatrixClient;

            if (accessToken && userId && deviceId) {
                console.log('💾 Restoring Matrix session from LocalStorage...');
                client = createClient({
                    baseUrl: MATRIX_BASE_URL,
                    accessToken,
                    userId,
                    deviceId,
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
                    baseUrl: MATRIX_BASE_URL,
                    accessToken: data.access_token,
                    userId: data.user_id,
                    deviceId: data.device_id,
                });

                if (typeof window !== 'undefined') {
                    console.log('💾 Saving dynamic Matrix session to LocalStorage');
                    localStorage.setItem('matrix_access_token', data.access_token);
                    localStorage.setItem('matrix_user_id', data.user_id);
                    localStorage.setItem('matrix_device_id', data.device_id);
                }
            }

            // Start client to sync
            if (!client.clientRunning) {
                await client.startClient({ initialSyncLimit: 10 });
            }

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
