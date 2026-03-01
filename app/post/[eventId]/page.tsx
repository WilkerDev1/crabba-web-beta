'use client';

import { useEffect, useState, use } from 'react';
import { getMatrixClient, getSharedClient, guestFetch } from '@/lib/matrix';
import { PostCard } from '@/components/feed/PostCard';
import { AppShell } from '@/components/layout/AppShell';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ComposePostModal } from '@/components/feed/ComposePostModal';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useMatrixProfile } from '@/hooks/useMatrixProfile';

const ROOM_ID = process.env.NEXT_PUBLIC_MATRIX_GLOBAL_ROOM_ID || '!iyDNoJTahsHwSkiukz:localhost';

// Lightweight event adapter for raw JSON → PostCard-compatible shape
const wrapEvent = (ev: any) => ({
    getContent: () => ev.content,
    getSender: () => ev.sender,
    getTs: () => ev.origin_server_ts,
    getId: () => ev.event_id,
    getRoomId: () => ev.room_id || ROOM_ID,
    getType: () => ev.type,
    isRedacted: () => false,
    getDate: () => new Date(ev.origin_server_ts || 0),
    event: ev,
    status: null,
});

export default function PostDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
    const { eventId: urlEventId } = use(params);
    const eventId = decodeURIComponent(urlEventId);

    const router = useRouter();
    const [client, setClient] = useState<any>(null);
    const [eventData, setEventData] = useState<any>(null);
    const [parents, setParents] = useState<any[]>([]);
    const [replies, setReplies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isGuest, setIsGuest] = useState(false);

    // Get current user profile for the composer avatar
    const { profile: currentUserProfile } = useMatrixProfile(client?.getUserId?.());

    const fetchEventAndReplies = async () => {
        setLoading(true);
        setError(null);
        try {
            let matrixClient = getSharedClient();
            if (!matrixClient) {
                matrixClient = await getMatrixClient();
            }

            if (!matrixClient) {
                setError('Could not initialize Matrix client.');
                setLoading(false);
                return;
            }
            setClient(matrixClient);

            const token = matrixClient.getAccessToken();
            const guestMode = !token;
            setIsGuest(guestMode);

            if (guestMode) {
                // ─── GUEST MODE: Fetch event + context via REST API ───
                console.log('[PostDetail] Guest mode: fetching via /context API...');
                const baseUrl = matrixClient.getHomeserverUrl();
                const encodedRoomId = encodeURIComponent(ROOM_ID);
                const encodedEventId = encodeURIComponent(eventId);

                // Fetch event context (the event + surrounding events)
                const contextData = await guestFetch(
                    baseUrl,
                    `/_matrix/client/v3/rooms/${encodedRoomId}/context/${encodedEventId}?limit=20`
                );

                // Main event
                if (contextData.event) {
                    setEventData(wrapEvent(contextData.event));
                } else {
                    throw new Error('Event not found');
                }

                // Parent chain from events_before
                const parentEvents = (contextData.events_before || [])
                    .filter((ev: any) => ev.type === 'm.room.message')
                    .map(wrapEvent);
                setParents(parentEvents);

                // Replies from events_after
                const replyEvents = (contextData.events_after || [])
                    .filter((ev: any) => {
                        if (ev.type !== 'm.room.message') return false;
                        const relatesTo = ev.content?.['m.relates_to'];
                        // Only show direct replies to THIS event
                        return relatesTo?.['m.in_reply_to']?.event_id === eventId ||
                            (relatesTo?.rel_type === 'm.thread' && relatesTo?.['m.in_reply_to']?.event_id === eventId);
                    })
                    .map((ev: any) => ({ event: wrapEvent(ev), childCount: 0 }));
                setReplies(replyEvents);

            } else {
                // ─── AUTHENTICATED MODE: Use SDK methods ───

                // Instant Cache Access
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

                // joinRoom only for authenticated users
                if (!room && ROOM_ID) {
                    console.log(`[PostDetail] Room not in cache, joining: ${ROOM_ID}`);
                    try {
                        await matrixClient.joinRoom(ROOM_ID);
                        room = matrixClient.getRoom(ROOM_ID);
                    } catch (e) {
                        console.error("[PostDetail] Failed to join room:", e);
                    }
                }

                if (!room) {
                    throw new Error('Room not found. Please try again or ensure you are joined.');
                }

                // 1. Fetch main event
                const eventJson = await matrixClient.fetchRoomEvent(ROOM_ID, eventId);
                const mockEvent = wrapEvent(eventJson);
                setEventData(mockEvent);

                // Fetch Parent Chain (Ancestry)
                const parentChain: any[] = [];
                let currentContent = eventJson.content;
                let depth = 0;

                while (currentContent && currentContent['m.relates_to']?.['m.in_reply_to']?.event_id && depth < 5) {
                    const parentId = currentContent['m.relates_to']['m.in_reply_to'].event_id;
                    try {
                        const roomObj = matrixClient.getRoom(ROOM_ID);
                        let parentEv = roomObj?.findEventById(parentId);
                        let rawParent;

                        if (parentEv) {
                            rawParent = {
                                content: parentEv.getContent(),
                                sender: parentEv.getSender(),
                                origin_server_ts: parentEv.getTs(),
                                event_id: parentEv.getId(),
                                room_id: parentEv.getRoomId(),
                                type: parentEv.getType()
                            };
                        } else {
                            rawParent = await matrixClient.fetchRoomEvent(ROOM_ID, parentId);
                        }

                        if (rawParent) {
                            parentChain.unshift(wrapEvent(rawParent));
                            currentContent = rawParent.content;
                        } else {
                            break;
                        }
                    } catch (e) {
                        console.error("Failed to fetch parent event:", e);
                        break;
                    }
                    depth++;
                }
                setParents(parentChain);

                // 2. Fetch replies / threads
                try {
                    const eventContent = eventJson.content;
                    const eventRelation = eventContent?.['m.relates_to'];
                    let threadRootId = eventId;

                    if (eventRelation?.rel_type === 'm.thread' && eventRelation?.event_id) {
                        threadRootId = eventRelation.event_id;
                    } else if (parentChain.length > 0) {
                        threadRootId = parentChain[0].getId();
                    }

                    const threads = await matrixClient.relations(ROOM_ID, threadRootId, "m.thread", "m.room.message");
                    const allDescendants = threads?.events || [];

                    const directReplies = allDescendants
                        .filter((e: any) => {
                            const relates = e.getContent()?.['m.relates_to'];
                            return relates?.['m.in_reply_to']?.event_id === eventId;
                        })
                        .sort((a: any, b: any) => a.getTs() - b.getTs());

                    const repliesWithMeta = directReplies.map((reply: any) => {
                        const childCount = allDescendants.filter((e: any) => {
                            const relates = e.getContent()?.['m.relates_to'];
                            return relates?.['m.in_reply_to']?.event_id === reply.getId();
                        }).length;
                        return { event: reply, childCount };
                    });

                    setReplies(repliesWithMeta);
                } catch (relErr) {
                    console.error("Failed to fetch relations:", relErr);
                }
            }

        } catch (err: any) {
            console.error("Error fetching post details:", err);
            setError(err.message || "Post not found or unavailable.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (eventId) {
            fetchEventAndReplies();
        }
    }, [eventId]);

    // ─── Real-Time Reply Listener (authenticated only) ───
    useEffect(() => {
        if (!client || isGuest) return;

        const onTimeline = (event: any, room: any, toStartOfTimeline: boolean) => {
            if (room?.roomId !== ROOM_ID || toStartOfTimeline) return;
            if (event.getType() !== 'm.room.message') return;
            if (event.isRedacted()) return;

            const content = event.getContent();
            const relatesTo = content?.['m.relates_to'];
            if (!relatesTo) return;

            const isDirectReply = relatesTo['m.in_reply_to']?.event_id === eventId;
            if (!isDirectReply) return;

            setReplies(prev => {
                const newId = event.getId();
                if (prev.some((r: any) => r.event.getId() === newId)) return prev;
                return [...prev, { event, childCount: 0 }];
            });
        };

        client.on('Room.timeline' as any, onTimeline);
        return () => {
            client.removeListener('Room.timeline' as any, onTimeline);
        };
    }, [client, eventId, isGuest]);

    if (loadingMessage) {
        return (
            <AppShell>
                <div className="p-12 flex flex-col items-center justify-center text-neutral-500 space-y-4 min-h-[50vh]">
                    <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                    <p>{loadingMessage}</p>
                </div>
            </AppShell>
        );
    }

    if (loading) {
        return (
            <AppShell>
                <div className="p-4 space-y-6 pt-16">
                    <div className="flex gap-3 items-center">
                        <Skeleton className="w-12 h-12 rounded-full" />
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                    </div>
                    <Skeleton className="h-32 w-full rounded-xl" />
                </div>
            </AppShell>
        );
    }

    if (error || !eventData) {
        return (
            <AppShell>
                <div className="p-12 text-center">
                    <p className="text-red-500 font-bold mb-4">{error || "Post not found"}</p>
                    <Button onClick={() => router.back()} variant="outline" className="rounded-full">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell>
            {/* Header / Top Bar */}
            <div className="sticky top-0 z-10 backdrop-blur-md bg-black/70 border-b border-neutral-800 p-4 flex items-center gap-4">
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-neutral-900" onClick={() => router.back()}>
                    <ArrowLeft className="w-5 h-5 text-white" />
                </Button>
                <h1 className="font-bold text-xl text-white">Post</h1>
            </div>

            {/* Parent Chain (Ancestry) */}
            {parents.length > 0 && (
                <div className="bg-black">
                    {parents.map((parentEvent) => (
                        <PostCard
                            key={parentEvent.getId()}
                            event={parentEvent}
                            matrixClient={client}
                            isDetailView={false}
                            showThreadLine={true}
                            isLastInThread={false}
                        />
                    ))}
                </div>
            )}

            {/* Main Post */}
            <div className="border-b border-neutral-800 bg-black relative">
                <PostCard
                    event={eventData}
                    matrixClient={client}
                    isDetailView={true}
                    showThreadLine={replies.length > 0}
                    isLastInThread={false}
                />
            </div>

            {/* Compose Reply Section — hidden for guests */}
            {!isGuest && (
                <div className="border-b border-neutral-800 bg-neutral-950 p-4">
                    <ComposePostModal
                        defaultRoomId={ROOM_ID}
                        replyToEventId={eventId}
                        onPostCreated={fetchEventAndReplies}
                    >
                        <div className="flex gap-4 items-center cursor-text">
                            <Avatar className="w-10 h-10 shrink-0">
                                <AvatarImage src={currentUserProfile?.avatar_url || ''} />
                                <AvatarFallback className="bg-neutral-800">U</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 bg-transparent text-neutral-500 text-lg">
                                Post your reply...
                            </div>
                            <Button className="bg-orange-500 hover:bg-orange-600 text-white rounded-full font-bold px-6">
                                Reply
                            </Button>
                        </div>
                    </ComposePostModal>
                </div>
            )}

            {/* Guest CTA */}
            {isGuest && (
                <div className="border-b border-neutral-800 bg-neutral-950/50 p-6 text-center">
                    <p className="text-neutral-400 text-sm mb-3">Want to reply? Join the closed beta!</p>
                    <a href="/register" className="inline-block px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-full font-bold text-sm transition-colors">
                        Join Waitlist
                    </a>
                </div>
            )}

            {/* Replies List */}
            <div className="divide-y divide-neutral-800 pb-20">
                {replies.length === 0 ? (
                    <div className="p-12 text-center text-neutral-500">
                        No replies yet.
                    </div>
                ) : (
                    replies.map(({ event: replyEvent, childCount }: any) => (
                        <PostCard
                            key={replyEvent.getId()}
                            event={replyEvent}
                            matrixClient={client}
                            isDetailView={false}
                            showThreadLine={false}
                            isLastInThread={true}
                            hasChildren={childCount > 0}
                        />
                    ))
                )}
            </div>
        </AppShell>
    );
}
