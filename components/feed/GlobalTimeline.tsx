'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { getMatrixClient } from '@/lib/matrix';
import { PostCard } from './PostCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { RefreshCcw, Loader2 } from 'lucide-react';

import { ComposePost } from './ComposePost';

// Public Room ID
const ROOM_ID = process.env.NEXT_PUBLIC_MATRIX_GLOBAL_ROOM_ID || '!iyDNoJTahsHwSkiukz:localhost';

interface GlobalTimelineProps {
    filterUserId?: string;
    filterType?: 'all' | 'media' | 'replies';
    searchQuery?: string;
}

export function GlobalTimeline({ filterUserId, filterType = 'all', searchQuery }: GlobalTimelineProps) {
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [client, setClient] = useState<any>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const observerTarget = useRef<HTMLDivElement>(null);

    const fetchMessages = async () => {
        // Only set loading on first load to avoid flickering on refresh
        if (events.length === 0) setLoading(true);
        setError(null);
        try {
            const matrixClient = await getMatrixClient();

            if (!matrixClient) {
                setError('Authentication Failed: Could not initialize Matrix client.');
                setLoading(false);
                return;
            }

            setClient(matrixClient);

            // Auto-Join the Global Timeline Room
            try {
                if (ROOM_ID) {
                    console.log(`[GlobalTimeline] Attempting to ensure joined state for room: ${ROOM_ID}`);
                    await matrixClient.joinRoom(ROOM_ID);
                }
            } catch (joinError) {
                // Ignore errors related to already being joined
                console.log(`[GlobalTimeline] Note on room join (expected if already in room):`, joinError);
            }

            // Simple fetch of last 20 messages from room
            // In production we would use a proper pagination hook or library support
            const room = matrixClient.getRoom(ROOM_ID);

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
                        // also check if body ends with image extensions as fallback
                        const isImageFile = content.url && content.body?.toLowerCase().match(/\.(jpeg|jpg|gif|png|webp|mp4|webm)$/);
                        if (!isImageOrVideo && !isImageFile) return false;
                    }

                    if (filterType === 'replies') {
                        const hasRelatesTo = content['m.relates_to'];
                        if (!hasRelatesTo) return false;
                    }

                    if (searchQuery) {
                        const body = content.body || '';
                        if (!body.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                    }

                    if (filterType === 'all') {
                        // Ensure standard messages OR reposts pass through
                        // A repost is typically a standard message, but we explicitly allow it
                    }

                    return true;
                });
                setEvents(messageEvents);

                // If less than 20 events returned initially, we might be at the end, but matrix events slice might just be small.
            } else {
                // Room not found in initial sync, try to join or peek?
                // For this scaffold, we assume the user is already joined.
                // Fallback: try to fetch via scrollback if room exists but empty timeline?
                // Actually, if we are logged in, we should see the room if we are joined.

                // Let's try to just use room_id directly if possible or show error
                console.warn('Room not found in store, executing initial sync might be needed or join.');
                setError('Room not found. Please ensure the bot is joined to the room.');
            }

        } catch (err: any) {
            console.error('Error fetching messages:', err);
            if (err.isFatal || err.message?.includes('FatalAuthError')) {
                setError(`Authentication Failed: ${err.message}. Please check .env.local credentials.`);
                // Do not allow retry for fatal errors
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
                // No new events fetched
                setHasMore(false);
            } else {
                // Trigger re-render of messages
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

    return (
        <div className="divide-y divide-neutral-800">
            {client && !filterUserId && (
                <ComposePost
                    matrixClient={client}
                    roomId={ROOM_ID}
                    onPostCreated={handleRefresh}
                />
            )}
            {events.map((event) => (
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
        </div>
    );
}
