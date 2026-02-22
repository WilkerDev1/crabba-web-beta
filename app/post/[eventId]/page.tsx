'use client';

import { useEffect, useState, use } from 'react';
import { getMatrixClient, getSharedClient } from '@/lib/matrix';
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

    // Get current user profile for the composer avatar
    const { profile: currentUserProfile } = useMatrixProfile(client?.getUserId());

    const fetchEventAndReplies = async () => {
        setLoading(true);
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
                console.log(`[PostDetail] Room not in cache, fetching/joining: ${ROOM_ID}`);
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

            // Wrapper for events
            const wrapEvent = (ev: any) => ({
                getContent: () => ev.content,
                getSender: () => ev.sender,
                getTs: () => ev.origin_server_ts,
                getId: () => ev.event_id,
                getRoomId: () => ev.room_id || ROOM_ID,
                getType: () => ev.type,
            });

            // Wrap raw JSON response in a mocked MatrixEvent-like object for PostCard
            const mockEvent = wrapEvent(eventJson);
            setEventData(mockEvent);

            // Fetch Parent Chain (Ancestry)
            const parentChain: any[] = [];
            let currentContent = eventJson.content;
            let depth = 0;

            while (currentContent && currentContent['m.relates_to']?.['m.in_reply_to']?.event_id && depth < 5) {
                const parentId = currentContent['m.relates_to']['m.in_reply_to'].event_id;
                try {
                    // Try cache first
                    const roomObj = matrixClient.getRoom(ROOM_ID);
                    let parentEv = roomObj?.findEventById(parentId);
                    let rawParent;

                    if (parentEv) {
                        // We have to extract crude JSON to wrap it consistently or just use the event
                        // Since wrapEvent expects raw JSON structure, we can reconstruct or just use parentEv
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
                        parentChain.unshift(wrapEvent(rawParent)); // Prepend to show oldest first
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
            // KEY FIX: Matrix threads reference the ROOT event_id. So if we're viewing
            // a deep comment, we must find the root first, then fetch ALL thread descendants
            // from the root, and then filter for replies to THIS specific eventId.
            try {
                // Determine the thread root. If this event IS a thread reply, its
                // m.relates_to.event_id (with rel_type m.thread) points to the root.
                // If this event IS the root, then we query relations on itself.
                const eventContent = eventJson.content;
                const eventRelation = eventContent?.['m.relates_to'];
                let threadRootId = eventId; // Default: this event is the root

                if (eventRelation?.rel_type === 'm.thread' && eventRelation?.event_id) {
                    threadRootId = eventRelation.event_id;
                } else if (parentChain.length > 0) {
                    // If we have parents, the topmost parent is the root
                    threadRootId = parentChain[0].getId();
                }

                const threads = await matrixClient.relations(ROOM_ID, threadRootId, "m.thread", "m.room.message");
                let fetchedReplies = threads?.events || [];

                // Sort by timestamp for proper chronological ordering within depths
                fetchedReplies.sort((a: any, b: any) => a.getTs() - b.getTs());

                // Build a flat tree sorted by depth-first, starting from THIS event
                const buildTree = (parentId: string, currentDepth = 0): any[] => {
                    const children = fetchedReplies.filter((e: any) => {
                        const relates = e.getContent()?.['m.relates_to'];
                        return relates?.['m.in_reply_to']?.event_id === parentId;
                    });

                    let result: any[] = [];
                    children.forEach((child: any) => {
                        result.push({ event: child, depth: currentDepth });
                        result = result.concat(buildTree(child.getId(), currentDepth + 1));
                    });
                    return result;
                };

                const threadedReplies = buildTree(eventId, 0);
                setReplies(threadedReplies);
            } catch (relErr) {
                console.error("Failed to fetch relations:", relErr);
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
                            isDetailView={false} // Parents shouldn't spawn local composers directly, redirect to their thread
                            showThreadLine={true}
                            isLastInThread={false}
                        />
                    ))}
                </div>
            )}

            {/* Main Post - We pass it to PostCard directly, styled via it internally */}
            <div className="border-b border-neutral-800 bg-black relative">
                <PostCard
                    event={eventData}
                    matrixClient={client}
                    isDetailView={true}
                    showThreadLine={replies.length > 0}
                    isLastInThread={false}
                />
            </div>

            {/* Compose Reply Section */}
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

            {/* Replies List */}
            <div className="divide-y divide-neutral-800 pb-20">
                {replies.length === 0 ? (
                    <div className="p-12 text-center text-neutral-500">
                        No replies yet.
                    </div>
                ) : (
                    replies.map(({ event: replyEvent, depth }, index) => {
                        const nextReply = replies[index + 1];
                        // It's the last in its local thread block if the next item jumps back up visually
                        const isLastInThread = !nextReply || nextReply.depth <= depth;

                        return (
                            <div
                                key={replyEvent.getId()}
                                className="border-b border-neutral-800"
                            >
                                <div style={{ paddingLeft: `${depth * 28}px` }} className="h-full">
                                    <PostCard
                                        event={replyEvent}
                                        matrixClient={client}
                                        isDetailView={true}
                                        showThreadLine={true}
                                        isLastInThread={isLastInThread}
                                    />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </AppShell>
    );
}
