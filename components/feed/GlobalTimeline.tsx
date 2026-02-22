'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { getMatrixClient, getSharedClient } from '@/lib/matrix';
import { PostCard } from './PostCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { RefreshCcw, Loader2, Flame, Clock } from 'lucide-react';

import { ComposePost } from './ComposePost';

// Public Room ID
const ROOM_ID = process.env.NEXT_PUBLIC_MATRIX_GLOBAL_ROOM_ID || '!iyDNoJTahsHwSkiukz:localhost';

// ─── Trending Algorithm (Hacker News Gravity Model) ───
// Score = (likes*1 + reposts*2 + replies*2) / (ageHours ^ GRAVITY)
// GRAVITY controls how fast old posts decay. 1.5 = moderate decay.
const GRAVITY = 1.5;

interface InteractionCounts {
    likes: number;
    reposts: number;
    replies: number;
}

function computeTrendingScore(interactions: InteractionCounts, timestampMs: number): number {
    const ageMs = Date.now() - timestampMs;
    const ageHours = Math.max(ageMs / (1000 * 60 * 60), 0.1); // min 6 min to avoid division by near-zero
    const baseScore = (interactions.likes * 1) + (interactions.reposts * 2) + (interactions.replies * 2);
    // All posts get a minimum base score of 1 so brand-new posts still rank
    return (baseScore + 1) / Math.pow(ageHours, GRAVITY);
}

interface GlobalTimelineProps {
    filterUserId?: string;
    filterType?: 'all' | 'media' | 'replies';
    searchQuery?: string;
    filterThreadId?: string;
    rootOnly?: boolean;
    showTabs?: boolean;
}

export function GlobalTimeline({ filterUserId, filterType = 'all', searchQuery, filterThreadId, rootOnly = false, showTabs = false }: GlobalTimelineProps) {
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [client, setClient] = useState<any>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const observerTarget = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<'recientes' | 'tendencias'>('recientes');

    // Interaction cache: eventId → {likes, reposts, replies}
    // Populated lazily when Tendencias tab is active or on initial load
    const [interactionCache, setInteractionCache] = useState<Map<string, InteractionCounts>>(new Map());
    const [cacheFetching, setCacheFetching] = useState(false);

    const fetchMessages = async () => {
        // Only set loading on first load to avoid flickering on refresh
        if (events.length === 0) setLoading(true);
        setError(null);
        try {
            let matrixClient = getSharedClient();
            if (!matrixClient) {
                matrixClient = await getMatrixClient();
            }

            if (!matrixClient) {
                setError('Authentication Failed: Could not initialize Matrix client.');
                setLoading(false);
                return;
            }

            setClient(matrixClient);

            // Instant Cache Access - Always check room FIRST
            let room = matrixClient.getRoom(ROOM_ID);

            // Wait until client is prepared ONLY if room is NOT cached
            if (!room && matrixClient.getSyncState() !== 'PREPARED') {
                setLoadingMessage("Sincronizando con la red Matrix...");

                await new Promise<void>((resolve) => {
                    let retries = 0;

                    const checkSync = () => {
                        if (matrixClient.getRoom(ROOM_ID) || matrixClient.getSyncState() === 'PREPARED') {
                            cleanup();
                            resolve();
                            return true;
                        }
                        return false;
                    };

                    const syncListener = (state: string) => {
                        if (state === 'PREPARED') {
                            checkSync();
                        }
                    };

                    const pollInterval = setInterval(() => {
                        if (!checkSync()) {
                            retries++;
                            // Simple Watchdog: Stop waiting after 20 seconds, DO NOT restart client
                            if (retries >= 40) {
                                console.warn("Sync loop max wait reached. Aborting wait.");
                                cleanup();
                                resolve();
                            }
                        }
                    }, 500);

                    const cleanup = () => {
                        clearInterval(pollInterval);
                        matrixClient.removeListener("sync" as any, syncListener);
                    };

                    matrixClient.on("sync" as any, syncListener);
                    checkSync();
                });

                setLoadingMessage(null);
            }

            // Re-fetch room after potential wait
            room = matrixClient.getRoom(ROOM_ID);

            // If room still isn't in cache, attempt joinRoom
            if (!room && ROOM_ID) {
                console.log(`[GlobalTimeline] Room not in cache, fetching/joining: ${ROOM_ID}`);
                try {
                    await matrixClient.joinRoom(ROOM_ID);
                    room = matrixClient.getRoom(ROOM_ID);
                } catch (joinError) {
                    console.error(`[GlobalTimeline] Failed to join room:`, joinError);
                }
            }

            if (room) {
                // Room already synced
                const timeline = room.getLiveTimeline();
                const events = timeline.getEvents().slice(-100).reverse(); // Fetch more to allow filtering
                const messageEvents = events.filter((e: any) => {
                    if (e.isRedacted() || e.getType() === 'm.room.redaction') return false;

                    const isMsg = e.getType() === 'm.room.message';
                    if (!isMsg) return false;

                    if (filterUserId && e.getSender() !== filterUserId) return false;

                    const content = e.getContent();

                    if (filterType === 'media') {
                        const isImageOrVideo = content.msgtype === 'm.image' || content.msgtype === 'm.video';
                        const isImageFile = content.url && content.body?.toLowerCase().match(/\.(jpeg|jpg|gif|png|webp|mp4|webm)$/);
                        if (!isImageOrVideo && !isImageFile) return false;
                    }

                    // ROOT-ONLY FILTER: Hide threaded replies from home feed.
                    if (rootOnly) {
                        const relatesTo = content['m.relates_to'];
                        if (relatesTo) {
                            const isRepost = relatesTo.rel_type === 'm.reference';
                            const isThreadReply = relatesTo.rel_type === 'm.thread';
                            const isInReplyTo = !!relatesTo['m.in_reply_to'];
                            if (!isRepost && (isThreadReply || isInReplyTo)) return false;
                        }
                    }

                    if (filterType === 'replies') {
                        const hasRelatesTo = content['m.relates_to'];
                        if (!hasRelatesTo) return false;
                    }

                    if (filterThreadId) {
                        const relatesTo = content['m.relates_to'];
                        if (!relatesTo) return false;
                        const isThreadMember = relatesTo.rel_type === 'm.thread' && relatesTo.event_id === filterThreadId;
                        const isDirectReply = relatesTo['m.in_reply_to']?.event_id === filterThreadId;
                        if (!isThreadMember && !isDirectReply) return false;
                    }

                    if (searchQuery) {
                        const body = content.body || '';
                        if (!body.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                    }

                    return true;
                });
                setEvents(messageEvents);
            } else {
                console.warn('Room not found in store, executing initial sync might be needed or join.');
                setError('Room not found. Please ensure the bot is joined to the room.');
            }

        } catch (err: any) {
            console.error('Error fetching messages:', err);
            if (err.isFatal || err.message?.includes('FatalAuthError')) {
                setError(`Authentication Failed: ${err.message}. Please check .env.local credentials.`);
                setLoading(false);
                return;
            }
            setError(err.message || 'Failed to load feed');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMessages();
    }, [refreshTrigger]);

    // ─── Real-Time Event Listener ───
    useEffect(() => {
        if (!client) return;

        const onTimeline = (event: any, room: any, toStartOfTimeline: boolean) => {
            // Only care about events in our room, appended to the END (not backfill)
            if (room?.roomId !== ROOM_ID || toStartOfTimeline) return;

            // Handle redactions: remove the target event from UI
            if (event.getType() === 'm.room.redaction') {
                const redactedId = event.getAssociatedId?.() || event.event?.redacts;
                if (redactedId) {
                    setEvents(prev => prev.filter((e: any) => e.getId() !== redactedId));
                }
                return;
            }

            if (event.getType() !== 'm.room.message') return;
            if (event.isRedacted?.()) return;

            const content = event.getContent() || {};
            if (!content.body && !content.msgtype && !content.url) return;

            // Apply the same filters as fetchMessages
            if (filterUserId && event.getSender() !== filterUserId) return;

            if (rootOnly) {
                const relatesTo = content['m.relates_to'];
                if (relatesTo) {
                    const isRepost = relatesTo.rel_type === 'm.reference';
                    const isThreadReply = relatesTo.rel_type === 'm.thread';
                    const isInReplyTo = !!relatesTo['m.in_reply_to'];
                    if (!isRepost && (isThreadReply || isInReplyTo)) return;
                }
            }

            if (filterType === 'media') {
                const isImageOrVideo = content.msgtype === 'm.image' || content.msgtype === 'm.video';
                if (!isImageOrVideo) return;
            }

            if (filterThreadId) {
                const relatesTo = content['m.relates_to'];
                if (!relatesTo) return;
                const isThreadMember = relatesTo.rel_type === 'm.thread' && relatesTo.event_id === filterThreadId;
                const isDirectReply = relatesTo['m.in_reply_to']?.event_id === filterThreadId;
                if (!isThreadMember && !isDirectReply) return;
            }

            if (searchQuery) {
                const body = content.body || '';
                if (!body.toLowerCase().includes(searchQuery.toLowerCase())) return;
            }

            // Prepend (newest first) — avoid duplicates by event ID
            setEvents(prev => {
                const eventId = event.getId();
                if (prev.some((e: any) => e.getId() === eventId)) return prev;
                return [event, ...prev];
            });
        };

        client.on('Room.timeline' as any, onTimeline);
        return () => {
            client.removeListener('Room.timeline' as any, onTimeline);
        };
    }, [client, filterUserId, filterType, filterThreadId, searchQuery, rootOnly]);

    // ─── Interaction Cache Fetcher ───
    // Batch-fetch interaction counts for all visible events.
    // Runs once when events load and when switching to Tendencias.
    const fetchInteractionCounts = useCallback(async () => {
        if (!client || events.length === 0 || cacheFetching) return;
        setCacheFetching(true);

        const newCache = new Map<string, InteractionCounts>(interactionCache);
        const roomId = ROOM_ID;

        // Only fetch for events we don't have cached yet
        const uncached = events.filter(e => !newCache.has(e.getId()));

        // Batch in chunks of 10 to avoid hammering the server
        for (let i = 0; i < uncached.length; i += 10) {
            const chunk = uncached.slice(i, i + 10);
            await Promise.allSettled(chunk.map(async (event: any) => {
                const eventId = event.getId();
                try {
                    const [reactions, threads, reposts] = await Promise.allSettled([
                        client.relations(roomId, eventId, "m.annotation", "m.reaction"),
                        client.relations(roomId, eventId, "m.thread", "m.room.message"),
                        client.relations(roomId, eventId, "m.reference", "m.room.message"),
                    ]);

                    newCache.set(eventId, {
                        likes: reactions.status === 'fulfilled' ? (reactions.value?.events?.length || 0) : 0,
                        replies: threads.status === 'fulfilled' ? (threads.value?.events?.length || 0) : 0,
                        reposts: reposts.status === 'fulfilled' ? (reposts.value?.events?.length || 0) : 0,
                    });
                } catch {
                    newCache.set(eventId, { likes: 0, reposts: 0, replies: 0 });
                }
            }));
        }

        setInteractionCache(newCache);
        setCacheFetching(false);
    }, [client, events, cacheFetching, interactionCache]);

    // Fetch interaction counts when switching to Tendencias or on initial load
    useEffect(() => {
        if (activeTab === 'tendencias' && events.length > 0 && client) {
            fetchInteractionCounts();
        }
    }, [activeTab, events.length, client]);

    // ─── Display Events (sorted by active tab) ───
    // Only re-sort when activeTab or interactionCache changes, NOT on every event append.
    // This prevents the feed from reshuffling while the user is reading.
    const displayEvents = useMemo(() => {
        if (activeTab === 'recientes') {
            // Chronological: already newest-first from fetchMessages
            return events;
        }

        // Tendencias: sort by trending score
        return [...events].sort((a, b) => {
            const aId = a.getId();
            const bId = b.getId();
            const aInteractions = interactionCache.get(aId) || { likes: 0, reposts: 0, replies: 0 };
            const bInteractions = interactionCache.get(bId) || { likes: 0, reposts: 0, replies: 0 };
            const aScore = computeTrendingScore(aInteractions, a.getTs());
            const bScore = computeTrendingScore(bInteractions, b.getTs());
            return bScore - aScore; // highest score first
        });
    }, [activeTab, events, interactionCache]);

    const loadMore = useCallback(async () => {
        if (!client || !hasMore || loadingMore) return;
        setLoadingMore(true);

        try {
            const room = client.getRoom(ROOM_ID);
            if (!room) throw new Error('Room not found');

            const oldLength = room.getLiveTimeline().getEvents().length;
            await client.scrollback(room, 20);
            const newLength = room.getLiveTimeline().getEvents().length;

            if (newLength === oldLength) {
                setHasMore(false);
            } else {
                setRefreshTrigger(prev => prev + 1);
            }
        } catch (err) {
            console.error("Failed to load more messages:", err);
            setHasMore(false);
        } finally {
            setLoadingMore(false);
        }
    }, [client, hasMore, loadingMore]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
                    loadMore();
                }
            },
            { threshold: 0.1 }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => observer.disconnect();
    }, [hasMore, loadingMore, loading, loadMore]);

    const handleRefresh = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    if (loadingMessage) {
        return (
            <div className="p-12 flex flex-col items-center justify-center text-neutral-500 space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                <p>{loadingMessage}</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="p-4 space-y-4">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex gap-3">
                        <Skeleton className="w-10 h-10 rounded-full" />
                        <div className="space-y-2 flex-1">
                            <Skeleton className="h-4 w-[250px]" />
                            <Skeleton className="h-4 w-[200px]" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center text-red-500">
                <p className="mb-4 font-bold">{error}</p>
                {!error.includes('Authentication Failed') && (
                    <Button onClick={fetchMessages} variant="outline">
                        <RefreshCcw className="mr-2 w-4 h-4" /> Try Again
                    </Button>
                )}
            </div>
        );
    }

    if (events.length === 0) {
        return (
            <div className="p-12 text-center text-neutral-500">
                {filterUserId ? "This user hasn't posted anything yet." : "No messages found in this room."}
            </div>
        )
    }

    // ─── Feed Content (shared between tabs) ───
    const feedContent = (
        <>
            {displayEvents.map((event) => (
                <PostCard key={event.getId()} event={event} matrixClient={client} />
            ))}

            <div ref={observerTarget} className="py-8 text-center text-neutral-500 text-sm">
                {loadingMore && (
                    <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Loading more posts...</span>
                    </div>
                )}
                {!hasMore && events.length > 0 && (
                    <span>You've reached the beginning of the timeline.</span>
                )}
            </div>
        </>
    );

    // ─── Render ───
    return (
        <div className="divide-y divide-neutral-800">
            {client && !filterUserId && (
                <ComposePost
                    matrixClient={client}
                    roomId={ROOM_ID}
                    onPostCreated={handleRefresh}
                />
            )}

            {showTabs ? (
                <Tabs
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as 'recientes' | 'tendencias')}
                    className="w-full"
                >
                    <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-md border-b border-neutral-800">
                        <TabsList variant="line" className="w-full h-12 rounded-none">
                            <TabsTrigger
                                value="recientes"
                                className="flex-1 h-full text-sm font-semibold data-[state=active]:text-white data-[state=inactive]:text-neutral-500 rounded-none"
                            >
                                <Clock className="w-4 h-4 mr-1.5" />
                                Recientes
                            </TabsTrigger>
                            <TabsTrigger
                                value="tendencias"
                                className="flex-1 h-full text-sm font-semibold data-[state=active]:text-white data-[state=inactive]:text-neutral-500 rounded-none"
                            >
                                <Flame className="w-4 h-4 mr-1.5" />
                                Tendencias
                                {cacheFetching && <Loader2 className="w-3 h-3 ml-1 animate-spin" />}
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="recientes" className="mt-0">
                        {feedContent}
                    </TabsContent>
                    <TabsContent value="tendencias" className="mt-0">
                        {feedContent}
                    </TabsContent>
                </Tabs>
            ) : (
                feedContent
            )}
        </div>
    );
}
