import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, Heart, Repeat, Share, Loader2 } from 'lucide-react';
import { useMatrixProfile } from '@/hooks/useMatrixProfile';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ComposePostModal } from '@/components/feed/ComposePostModal';
import { LockedContentOverlay } from '@/components/feed/LockedContentOverlay';

interface PostCardProps {
    event: any; // Using any for Matrix Event temporarily, strictly should be MatrixEvent
    matrixClient: any;
    isNested?: boolean;
}

export function PostCard({ event, matrixClient, isNested = false }: PostCardProps) {
    const [liked, setLiked] = useState<boolean>(false);
    const [likeCount, setLikeCount] = useState<number>(0);
    const [replyCount, setReplyCount] = useState<number>(0);
    const [repostCount, setRepostCount] = useState<number>(0);
    const [isLiking, setIsLiking] = useState<boolean>(false);
    const [isReposting, setIsReposting] = useState<boolean>(false);

    const content = event.getContent();
    const senderId = event.getSender();
    const timestamp = event.getTs();
    const eventId = event.getId();
    const roomId = event.getRoomId();

    const relatesTo = content['m.relates_to'];
    // Strict evaluation of reference relations to avoid catching normal threaded replies
    const isRepost = relatesTo?.rel_type === 'm.reference' && !!relatesTo?.event_id;
    const originalEventId = isRepost ? relatesTo.event_id : null;

    const accessLevel = content['access_level'] || 'public';
    const hasWarning = !!content['org.crabba.content_warning'];
    const isLocked = accessLevel === 'premium' || hasWarning;
    const price = content['price'] as number | undefined;

    const [originalEvent, setOriginalEvent] = useState<any>(null);
    const [fetchingOriginal, setFetchingOriginal] = useState(false);

    const { profile, loading } = useMatrixProfile(senderId);

    // Use profile data if available, fallback to Matrix ID
    const senderName = profile?.username || senderId;
    const avatarUrl = profile?.avatar_url || null;

    const body = content.body || '';

    // Aggressive Debugging
    console.log("MSG DEBUG:", {
        type: content.msgtype,
        url: content.url,
        body: content.body,
        eventId: event.getId()
    });

    let imageUrl = null;
    const isImageMsg = content.msgtype === 'm.image';
    // Permissive check: if it has a URL and looks like an image file
    const isImageFile = content.url && content.body?.toLowerCase().match(/\.(jpeg|jpg|gif|png|webp)$/);

    if (isImageMsg || isImageFile) {
        // Convert mxc:// to http via client
        imageUrl = matrixClient.mxcUrlToHttp(content.url);
    }

    // Attempt to fetch relation counts natively
    useEffect(() => {
        if (!matrixClient || !roomId || !eventId || isNested) return;

        const fetchRelations = async () => {
            try {
                // Likes
                const reactions = await matrixClient.relations(roomId, eventId, "m.annotation", "m.reaction");
                if (reactions?.events) {
                    setLikeCount(reactions.events.length);
                    // Check if current user liked
                    const myUserId = matrixClient.getUserId();
                    if (reactions.events.some((e: any) => e.getSender() === myUserId)) {
                        setLiked(true);
                    }
                }

                // Replies (Threads)
                const threads = await matrixClient.relations(roomId, eventId, "m.thread", "m.room.message");
                if (threads?.events) {
                    setReplyCount(threads.events.length);
                }

                // Reposts
                const reposts = await matrixClient.relations(roomId, eventId, "m.reference", "m.room.message");
                if (reposts?.events) {
                    setRepostCount(reposts.events.length);
                }

            } catch (err) {
                console.log("Could not fetch relations, likely missing pagination token or not supported:", err);
            }
        };

        fetchRelations();
    }, [matrixClient, roomId, eventId, isNested]);

    useEffect(() => {
        if (isRepost && matrixClient && originalEventId && !originalEvent && !fetchingOriginal) {
            setFetchingOriginal(true);
            matrixClient.fetchRoomEvent(roomId, originalEventId)
                .then((res: any) => {
                    const mockEvent = {
                        getContent: () => res.content,
                        getSender: () => res.sender,
                        getTs: () => res.origin_server_ts,
                        getId: () => res.event_id,
                        getRoomId: () => res.room_id || roomId,
                        getType: () => res.type,
                    };
                    setOriginalEvent(mockEvent);
                })
                .catch((err: any) => console.log("Failed to fetch original event for repost", err))
                .finally(() => setFetchingOriginal(false));
        }
    }, [isRepost, matrixClient, originalEventId, roomId, originalEvent, fetchingOriginal]);

    const renderBodyWithHashtags = (text: string) => {
        if (!text) return null;
        if (isRepost && !originalEvent) return null; // Hide the "♻️ Reposted..." body text if we are rendering the nested card

        const parts = text.split(/(#\w+)/g);
        return parts.map((part, i) => {
            if (part.startsWith('#')) {
                const tag = part.substring(1);
                return (
                    <Link key={i} href={`/search?q=%23${tag}`} onClick={e => e.stopPropagation()} className="text-blue-500 hover:underline">
                        {part}
                    </Link>
                );
            }
            return <span key={i}>{part}</span>;
        });
    };

    const handleLike = async () => {
        if (!matrixClient || isLiking) return;
        setIsLiking(true);
        const roomId = event.getRoomId();
        const eventId = event.getId();

        try {
            await matrixClient.sendEvent(roomId, "m.reaction", {
                "m.relates_to": {
                    rel_type: "m.annotation",
                    event_id: eventId,
                    key: "❤️"
                }
            });
            setLiked(true);
            setLikeCount(prev => prev + 1);
        } catch (error: any) {
            const errStr = String(error);
            if (error?.data?.errcode === 'M_DUPLICATE_ANNOTATION' || error?.errcode === 'M_DUPLICATE_ANNOTATION' || errStr.includes('M_DUPLICATE_ANNOTATION') || errStr.includes('400')) {
                // Ignore Matrix error if we've already liked it
                setLiked(true);
            } else {
                // Silently omit to user but log
                console.warn("Failed to send like reaction", error);
            }
        } finally {
            setIsLiking(false);
        }
    };

    const handleRepost = async () => {
        if (!matrixClient || isReposting) return;
        setIsReposting(true);
        try {
            await matrixClient.sendEvent(roomId, "m.room.message" as any, {
                msgtype: "m.text",
                body: `♻️ Reposted @${senderName}'s post`,
                "m.relates_to": {
                    rel_type: "m.reference",
                    event_id: eventId
                }
            });
            setRepostCount(prev => prev + 1);
        } catch (error) {
            console.error("Failed to repost", error);
        } finally {
            setIsReposting(false);
        }
    };

    return (
        <div className={`border-b border-neutral-800 p-4 transition-colors cursor-pointer ${isNested ? '' : 'hover:bg-neutral-900/30'}`}>
            {isRepost && !isNested && (
                <div className="flex items-center gap-2 text-neutral-500 text-sm mb-2 ml-10 font-medium">
                    <Repeat className="w-4 h-4" />
                    <Link href={`/${senderName}`} className="hover:underline" onClick={e => e.stopPropagation()}>
                        {senderName} reposted
                    </Link>
                </div>
            )}
            <div className="flex gap-3">
                {!isNested && (
                    <Link href={`/${senderName}`} className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Avatar className="w-10 h-10 hover:opacity-80 transition-opacity">
                            <AvatarImage src={avatarUrl || ''} />
                            <AvatarFallback className="bg-neutral-800 text-neutral-400">
                                {senderId?.substring(1, 3).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                    </Link>
                )}

                <div className="flex-1 min-w-0">
                    {!isRepost && (
                        <div className="flex items-center gap-2 mb-1">
                            <Link href={`/${senderName}`} className="font-bold text-white truncate hover:underline" onClick={(e) => e.stopPropagation()}>
                                {senderName}
                            </Link>
                            <span className="text-neutral-500 text-sm truncate">{senderId}</span>
                            <span className="text-neutral-500 text-sm">·</span>
                            <span className="text-neutral-500 text-sm hover:underline">
                                {timestamp ? formatDistanceToNow(timestamp, { addSuffix: true }) : ''}
                            </span>
                        </div>
                    )}

                    {!isRepost && imageUrl ? (
                        <div className="relative block mt-2 mb-3 rounded-2xl overflow-hidden border border-neutral-800 max-h-[500px]">
                            <Link href={`/post/${eventId}`}>
                                <img
                                    src={imageUrl}
                                    alt={body}
                                    className={`w-full h-full object-cover max-w-full mt-2 transition-all duration-300 ${isLocked ? 'blur-2xl scale-110 select-none' : ''}`}
                                    loading="lazy"
                                />
                            </Link>
                            {isLocked && (
                                <LockedContentOverlay
                                    accessLevel={accessLevel}
                                    price={price}
                                    onUnlockClick={() => { alert('Premium subscription flow coming soon!') }}
                                />
                            )}
                        </div>
                    ) : null}

                    {!isRepost && !imageUrl && body ? (
                        <div className="relative mb-3">
                            <div className={`text-neutral-200 whitespace-pre-wrap break-words text-[15px] leading-normal transition-all duration-300 ${isLocked ? 'blur-md opacity-40 select-none' : ''}`}>
                                <Link href={`/post/${eventId}`} className="block">
                                    {renderBodyWithHashtags(body)}
                                </Link>
                            </div>
                            {isLocked && (
                                <LockedContentOverlay
                                    accessLevel={accessLevel}
                                    price={price}
                                    onUnlockClick={() => { alert('Premium subscription flow coming soon!') }}
                                />
                            )}
                        </div>
                    ) : null}

                    {isRepost && fetchingOriginal && (
                        <div className="flex items-center justify-center p-6 border border-neutral-800 rounded-2xl mb-3">
                            <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" />
                        </div>
                    )}

                    {isRepost && originalEvent && (
                        <div className="border border-neutral-800 rounded-2xl mt-1 mb-3 overflow-hidden" onClick={e => e.stopPropagation()}>
                            <PostCard event={originalEvent} matrixClient={matrixClient} isNested={true} />
                        </div>
                    )}

                    {isRepost && !originalEventId && body && (
                        /* Fallback if the repost is just a text string from an older version */
                        <div className="text-neutral-200 whitespace-pre-wrap break-words mb-3 text-[15px] leading-normal">
                            <Link href={`/post/${eventId}`} className="block">
                                {renderBodyWithHashtags(body)}
                            </Link>
                        </div>
                    )}

                    {!isNested && (
                        <div className="flex justify-between text-neutral-500 max-w-md mt-3">
                            <Link href={`/post/${eventId}`}>
                                <ActionIcon icon={<MessageSquare className="w-4 h-4" />} count={replyCount} color="group-hover:text-blue-500" bg="group-hover:bg-blue-500/10" />
                            </Link>
                            <ActionIcon
                                icon={isReposting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Repeat className={`w-4 h-4 ${isRepost ? 'text-green-500' : ''}`} />}
                                count={repostCount}
                                color="group-hover:text-green-500"
                                bg="group-hover:bg-green-500/10"
                                onClick={handleRepost}
                            />
                            <ActionIcon
                                icon={isLiking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />}
                                count={likeCount}
                                color={liked ? "text-pink-500" : "group-hover:text-pink-500"}
                                bg="group-hover:bg-pink-500/10"
                                onClick={handleLike}
                            />
                            <ActionIcon icon={<Share className="w-4 h-4" />} color="group-hover:text-blue-500" bg="group-hover:bg-blue-500/10" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ActionIcon({ icon, count, color, bg, onClick }: { icon: React.ReactNode, count?: number, color: string, bg: string, onClick?: () => void }) {
    return (
        <div className="group flex items-center gap-1 cursor-pointer transition-colors" onClick={onClick}>
            <div className={`p-2 rounded-full transition-colors ${bg} ${color ? 'group-hover:' + color.split(':')[1] : ''}`}>
                <span className={`transition-colors ${color ? 'group-hover:' + color.split(':')[1] : ''}`}>
                    {icon}
                </span>
            </div>
            {count !== undefined && (
                <span className={`text-xs ${color ? 'group-hover:' + color.split(':')[1] : ''}`}>
                    {count || ''}
                </span>
            )}
        </div>
    )
}
