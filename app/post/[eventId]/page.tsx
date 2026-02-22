'use client';

import { useEffect, useState, use } from 'react';
import { getMatrixClient } from '@/lib/matrix';
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
            const matrixClient = await getMatrixClient();
            if (!matrixClient) {
                setError('Authentication Failed: Could not initialize Matrix client.');
                setLoading(false);
                return;
            }
            setClient(matrixClient);

            // Try to join global room just in case
            try {
                await matrixClient.joinRoom(ROOM_ID);
            } catch (e) {
                /* ignore */
            }

            let room = matrixClient.getRoom(ROOM_ID);

            if (!room || matrixClient.getSyncState() !== 'PREPARED') {
                setLoadingMessage("Sincronizando con la red Matrix...");

                await new Promise<void>((resolve) => {
                    let retries = 0;
                    let lastState = matrixClient.getSyncState();

                    const checkRoom = () => {
                        const r = matrixClient.getRoom(ROOM_ID);
                        if (r && matrixClient.getSyncState() === 'PREPARED') {
                            room = r;
                            cleanup();
                            resolve();
                            return true;
                        }
                        return false;
                    };

                    const syncListener = (state: string) => {
                        lastState = state as any;
                        if (state === 'PREPARED') {
                            checkRoom();
                        } else if (state === 'ERROR') {
                            console.warn("Matrix sync ERROR state encountered. Waiting for reconnect...");
                        } else if (state === 'RECONNECTING') {
                            setLoadingMessage("Reconectando a la red Matrix...");
                        }
                    };

                    const pollInterval = setInterval(() => {
                        if (!checkRoom()) {
                            if (lastState === 'RECONNECTING' || lastState === 'SYNCING') {
                                return;
                            }

                            retries++;
                            if (retries >= 10) {
                                console.warn("Sync loop timeout reached. Aborting waiting for room.");
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
                    checkRoom();
                });

                setLoadingMessage(null);
            }

            if (!room) {
                throw new Error('Room not found. Please try again or ensure you are joined.');
            }

            // 1. Fetch main event
            const eventJson = await matrixClient.fetchRoomEvent(ROOM_ID, eventId);

            // Wrap raw JSON response in a mocked MatrixEvent-like object for PostCard
            const mockEvent = {
                getContent: () => eventJson.content,
                getSender: () => eventJson.sender,
                getTs: () => eventJson.origin_server_ts,
                getId: () => eventJson.event_id,
                getRoomId: () => eventJson.room_id || ROOM_ID,
                getType: () => eventJson.type,
            };
            setEventData(mockEvent);

            // 2. Fetch replies / threads
            try {
                const threads = await matrixClient.relations(ROOM_ID, eventId, "m.thread", "m.room.message");
                if (threads?.events) {
                    setReplies(threads.events);
                }
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

            {/* Main Post - We pass it to PostCard directly, styled via it internally */}
            <div className="border-b border-neutral-800 bg-black">
                <PostCard event={eventData} matrixClient={client} />
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
                    replies.map(replyEvent => (
                        <PostCard key={replyEvent.getId()} event={replyEvent} matrixClient={client} />
                    ))
                )}
            </div>
        </AppShell>
    );
}
