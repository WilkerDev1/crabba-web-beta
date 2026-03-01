import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, Heart, Repeat, Share, Loader2, EyeOff } from 'lucide-react';
import { useMatrixProfile } from '@/hooks/useMatrixProfile';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { ComposePostModal } from '@/components/feed/ComposePostModal';
import { LockedContentOverlay } from '@/components/feed/LockedContentOverlay';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { MatrixMedia } from '@/components/feed/MatrixMedia';

interface PostCardProps {
    event: any; // Using any for Matrix Event temporarily, strictly should be MatrixEvent
    matrixClient: any;
    isNested?: boolean;
    isDetailView?: boolean;
    isLastInThread?: boolean;
    showThreadLine?: boolean;
    hasChildren?: boolean;
}

export function PostCard({ event, matrixClient, isNested = false, isDetailView = false, isLastInThread = false, showThreadLine = false, hasChildren = false }: PostCardProps) {
    const router = useRouter();

    // ─── SAFETY: Bail early for redacted, malformed, or redaction-type events ───
    if (!event || typeof event.getContent !== 'function') return null;
    if (event.isRedacted?.() || event.getType?.() === 'm.room.redaction') return null;

    const [liked, setLiked] = useState<boolean>(false);
    const [likeCount, setLikeCount] = useState<number>(0);
    const [replyCount, setReplyCount] = useState<number>(0);
    const [repostCount, setRepostCount] = useState<number>(0);
    const [isLiking, setIsLiking] = useState<boolean>(false);
    const [isReposting, setIsReposting] = useState<boolean>(false);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);
    const [isDeleted, setIsDeleted] = useState<boolean>(false);
    const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
    const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [isWarningRevealed, setIsWarningRevealed] = useState<boolean>(false);

    const content = event.getContent() || {};
    const senderId = event.getSender() || '';
    const timestamp = event.getTs();
    const eventId = event.getId();
    const roomId = event.getRoomId();

    // If content is completely empty (redacted mid-render or malformed), bail
    const body = content?.body;
    const msgtype = content?.msgtype;
    if (!body && !msgtype && !content?.url) return null;

    const relatesTo = content['m.relates_to'];
    // Strict evaluation of reference relations to avoid catching normal threaded replies
    const isRepost = relatesTo?.rel_type === 'm.reference' && !!relatesTo?.event_id;
    const originalEventId = isRepost ? relatesTo.event_id : null;

    // TWITTER/X REPOST MODEL: All interactions target the ORIGINAL post, not the repost wrapper
    const targetEventId = isRepost && originalEventId ? originalEventId : eventId;

    // Threading logic
    const inReplyToId = relatesTo?.['m.in_reply_to']?.event_id;
    const isThreadReply = relatesTo?.rel_type === 'm.thread';
    const hasParent = !!inReplyToId;

    const accessLevel = content['access_level'] || 'public';
    const warningText = content['org.crabba.content_warning'] || null;
    const hasWarning = !!warningText;
    const isLocked = accessLevel === 'premium';
    const showWarningOverlay = hasWarning && !isWarningRevealed && !isLocked;
    const price = content['price'] as number | undefined;

    const [originalEvent, setOriginalEvent] = useState<any>(null);
    const [fetchingOriginal, setFetchingOriginal] = useState(false);
    const [replyToProfile, setReplyToProfile] = useState<{ username: string, senderId: string } | null>(null);

    const { profile, loading } = useMatrixProfile(senderId);

    // Use profile data if available, fallback to Matrix ID
    const senderName = profile?.username || senderId;
    const avatarUrl = profile?.avatar_url || null;


    // Media detection
    const isImageMsg = content.msgtype === 'm.image';
    const isImageFile = content.url && content.body?.toLowerCase().match(/\.(jpeg|jpg|gif|png|webp)$/);
    const hasImage = !!(isImageMsg || isImageFile) && !!content.url;

    const isVideoMsg = content.msgtype === 'm.video';
    const hasVideo = isVideoMsg && !!content.url;

    useEffect(() => {
        if (!matrixClient || !roomId || !eventId || isNested) return;

        const myUserId = matrixClient.getUserId();

        const fetchRelations = async () => {
            try {
                // Likes — target original event for reposts
                const reactions = await matrixClient.relations(roomId, targetEventId, "m.annotation", "m.reaction");
                if (reactions?.events) {
                    setLikeCount(reactions.events.length);
                    // Check if current user liked
                    if (reactions.events.some((e: any) => e.getSender() === myUserId)) {
                        setLiked(true);
                    }
                }

                // Replies (Threads) — target original event for reposts
                const threads = await matrixClient.relations(roomId, targetEventId, "m.thread", "m.room.message");
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

    // Fetch reply context
    useEffect(() => {
        if (!matrixClient || !roomId || !hasParent || !inReplyToId || isNested) return;

        const fetchParentContext = async () => {
            try {
                // 1. Cache-first strategy: Check if the room timeline already has the event
                const room = matrixClient.getRoom(roomId);
                let parentEvent = room?.findEventById(inReplyToId);

                // 2. Network fallback if not in local memory cache
                if (!parentEvent) {
                    const rawEvent = await matrixClient.fetchRoomEvent(roomId, inReplyToId);
                    parentEvent = {
                        getSender: () => rawEvent.sender,
                    };
                }

                if (parentEvent) {
                    const parentSenderId = parentEvent.getSender();
                    // We can optionally use the useMatrixProfile hook logic here or fetch the profile from state
                    // For now we will do a quick room member lookup to get display name
                    const member = room?.getMember(parentSenderId);
                    const displayName = member?.name || parentSenderId;

                    setReplyToProfile({
                        username: displayName,
                        senderId: parentSenderId
                    });
                }
            } catch (err) {
                console.log("Failed to fetch parent event context for replying-to label", err);
            }
        };

        fetchParentContext();
    }, [matrixClient, roomId, inReplyToId, hasParent, isNested]);

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
        if (!text || typeof text !== 'string') return null;
        if (isRepost && !originalEvent) return null; // Hide the "♻️ Reposted..." body text if we are rendering the nested card

        const parts = text.split(/(#\w+)/g);
        return parts.map((part, i) => {
            if (part.startsWith('#')) {
                const tag = part.substring(1);
                return (
                    <Link key={i} href={`/search?q=%23${tag}`} onClick={e => e.stopPropagation()} className="text-orange-500 hover:underline">
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
        const likeRoomId = event.getRoomId();

        try {
            await matrixClient.sendEvent(likeRoomId, "m.reaction", {
                "m.relates_to": {
                    rel_type: "m.annotation",
                    event_id: targetEventId,
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
                    event_id: targetEventId
                }
            });
            setRepostCount(prev => prev + 1);
        } catch (error) {
            console.error("Failed to repost", error);
        } finally {
            setIsReposting(false);
        }
    };

    const handleDeleteClick = () => {
        if (!matrixClient || isDeleting) return;
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        setIsDeleting(true);
        try {
            await matrixClient.redactEvent(roomId, eventId);
            setIsDeleted(true);
            setShowDeleteModal(false);
        } catch (error) {
            console.error("Failed to delete post:", error);
            alert("Could not delete post.");
        } finally {
            setIsDeleting(false);
        }
    };

    if (isDeleted) return null;

    const myUserId = matrixClient?.getUserId();
    const canDelete = myUserId === senderId;
    const [copied, setCopied] = useState(false);

    const handleCardClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        // Don't trigger if clicked on nested interactive items
        if (target.closest('a') || target.closest('button')) return;
        router.push(`/post/${targetEventId}`);
    };

    const isSending = event.status === 'sending';

    return (
        <div
            className={`relative border-b border-neutral-800 px-3 sm:px-4 py-3 sm:py-4 transition-colors cursor-pointer ${isNested ? '' : 'hover:bg-neutral-900/30'} ${isSending ? 'opacity-70' : ''}`}
            onClick={handleCardClick}
        >
            {/* Thread Line Component */}
            {showThreadLine && !isLastInThread && (
                <div className="absolute left-[35px] top-[60px] bottom-0 w-[2px] bg-neutral-800" />
            )}

            {showThreadLine && isLastInThread && (
                <div className="absolute left-[35px] top-[60px] h-[20px] w-[2px] bg-neutral-800" />
            )}

            {isRepost && !isNested && (
                <div className="flex items-center gap-2 text-neutral-500 text-sm mb-2 ml-10 font-medium">
                    <Repeat className="w-4 h-4" />
                    <Link href={`/${senderName}`} className="hover:underline" onClick={e => e.stopPropagation()}>
                        {senderName} reposted
                    </Link>
                </div>
            )}

            <div className="flex gap-3 relative z-10">
                {!isNested && (
                    <Link href={`/${senderName}`} className="shrink-0 relative" onClick={(e) => e.stopPropagation()}>
                        <Avatar className="w-10 h-10 hover:opacity-80 transition-opacity bg-black">
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

                    {/* Replying To Visual Context — only in detail views where it provides useful ancestry context */}
                    {!isRepost && hasParent && replyToProfile && !isNested && isDetailView && (
                        <div className="text-neutral-500 text-xs mb-1.5 italic">
                            Replying to <Link href={`/post/${inReplyToId}`} className="text-blue-400 hover:underline not-italic" onClick={e => e.stopPropagation()}>@{replyToProfile.username}</Link>
                        </div>
                    )}

                    {/* Text Content — show user captions, hide raw filenames */}
                    {!isRepost && body && (() => {
                        const bodyText = body.trim();
                        const isJustFilename = !bodyText.includes(' ') && /\.(jpe?g|png|gif|webp|mp4|mov|webm)$/i.test(bodyText);
                        if (isJustFilename) return null;
                        return (
                            <div className="relative mb-2">
                                <div className={`text-neutral-200 whitespace-pre-wrap break-words text-[15px] leading-normal transition-all duration-300 ${isLocked ? 'blur-md opacity-40 select-none' : ''}`}>
                                    {renderBodyWithHashtags(body)}
                                </div>
                                {isLocked && !hasImage && (
                                    <LockedContentOverlay
                                        accessLevel={accessLevel}
                                        price={price}
                                        onUnlockClick={() => { alert('Premium subscription flow coming soon!') }}
                                    />
                                )}
                            </div>
                        );
                    })()}

                    {/* Image Attachment — authenticated blob fetch */}
                    {!isRepost && hasImage && (
                        <div className="relative block mt-1 mb-3 rounded-2xl overflow-hidden border border-neutral-800">
                            <div
                                className={`cursor-zoom-in ${isLocked ? 'pointer-events-none' : ''}`}
                                onClick={(e) => { e.stopPropagation(); if (!isLocked && !showWarningOverlay) setLightboxOpen(true); }}
                            >
                                <MatrixMedia
                                    mxcUrl={content.url}
                                    alt={body || 'Post image'}
                                    className={`w-full h-auto object-contain max-w-full transition-all duration-300 ${isLocked ? 'blur-2xl scale-110 select-none' : ''}`}
                                    onBlobReady={(url) => setBlobUrl(url)}
                                />
                            </div>
                            {isLocked && (
                                <LockedContentOverlay
                                    accessLevel={accessLevel}
                                    price={price}
                                    onUnlockClick={() => { alert('Premium subscription flow coming soon!') }}
                                />
                            )}
                            {showWarningOverlay && (
                                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-2xl rounded-2xl p-4 text-center">
                                    <EyeOff className="w-8 h-8 text-zinc-400 mb-2" />
                                    <p className="text-zinc-200 font-semibold mb-1">Content Warning</p>
                                    <p className="text-zinc-400 text-sm mb-4">{warningText}</p>
                                    <button
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsWarningRevealed(true); }}
                                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full font-medium transition-colors"
                                    >
                                        Reveal
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Video Attachment — authenticated blob fetch */}
                    {!isRepost && hasVideo && (
                        <div className="relative block mt-1 mb-3 rounded-2xl overflow-hidden border border-neutral-800">
                            <MatrixMedia
                                mxcUrl={content.url}
                                isVideo
                                className={`w-full rounded-xl transition-all duration-300 ${isLocked ? 'blur-2xl scale-110 select-none pointer-events-none' : ''}`}
                                onClick={(e) => e.stopPropagation()}
                            />
                            {isLocked && (
                                <LockedContentOverlay
                                    accessLevel={accessLevel}
                                    price={price}
                                    onUnlockClick={() => { alert('Premium subscription flow coming soon!') }}
                                />
                            )}
                            {showWarningOverlay && (
                                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-2xl rounded-2xl p-4 text-center">
                                    <EyeOff className="w-8 h-8 text-zinc-400 mb-2" />
                                    <p className="text-zinc-200 font-semibold mb-1">Content Warning</p>
                                    <p className="text-zinc-400 text-sm mb-4">{warningText}</p>
                                    <button
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsWarningRevealed(true); }}
                                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full font-medium transition-colors"
                                    >
                                        Reveal
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

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
                            {isDetailView ? (
                                <ComposePostModal replyToEventId={targetEventId} defaultRoomId={roomId} onPostCreated={() => { }}>
                                    <div onClick={e => e.stopPropagation()}>
                                        <ActionIcon icon={<MessageSquare className="w-4 h-4" />} count={replyCount} color="group-hover:text-orange-500" bg="group-hover:bg-orange-500/10" />
                                    </div>
                                </ComposePostModal>
                            ) : (
                                <ActionIcon
                                    icon={<MessageSquare className="w-4 h-4" />}
                                    count={replyCount}
                                    color="group-hover:text-orange-500"
                                    bg="group-hover:bg-orange-500/10"
                                    onClick={() => router.push(`/post/${targetEventId}`)}
                                />
                            )}
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
                            <ActionIcon
                                icon={copied ? <Share className="w-4 h-4 text-green-400" /> : <Share className="w-4 h-4" />}
                                color={copied ? "text-green-400" : "group-hover:text-orange-500"}
                                bg="group-hover:bg-orange-500/10"
                                onClick={() => {
                                    const url = `${window.location.origin}/post/${targetEventId}`;
                                    navigator.clipboard.writeText(url).then(() => {
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 2000);
                                    }).catch(() => { });
                                }}
                            />
                            {canDelete && (
                                <ActionIcon
                                    icon={isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                    color="group-hover:text-red-500"
                                    bg="group-hover:bg-red-500/10"
                                    onClick={handleDeleteClick}
                                />
                            )}
                        </div>
                    )}

                    {/* "Show this thread" indicator for replies that have their own children */}
                    {hasChildren && !isNested && (
                        <div className="mt-2 pt-1">
                            <span className="text-blue-400 text-sm hover:underline cursor-pointer">
                                Show this thread
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <ConfirmDeleteModal
                open={showDeleteModal}
                onOpenChange={setShowDeleteModal}
                onConfirm={confirmDelete}
                isDeleting={isDeleting}
            />

            {blobUrl && (
                <ImageLightbox
                    src={blobUrl}
                    alt={body || 'Post image'}
                    open={lightboxOpen}
                    onClose={() => setLightboxOpen(false)}
                />
            )}
        </div>
    );
}

function ActionIcon({ icon, count, color, bg, onClick }: { icon: React.ReactNode, count?: number, color: string, bg: string, onClick?: () => void }) {
    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        onClick?.();
    };

    return (
        <div className="group flex items-center gap-1 cursor-pointer transition-colors" onClick={handleClick}>
            <div className={`min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center rounded-full transition-colors ${bg} ${color ? 'group-hover:' + color.split(':')[1] : ''}`}>
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
