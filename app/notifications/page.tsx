'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { getMatrixClient, getSharedClient } from '@/lib/matrix';
import { createClient } from '@/lib/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bell, Heart, MessageSquare, Repeat, UserPlus, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

const ROOM_ID = process.env.NEXT_PUBLIC_MATRIX_GLOBAL_ROOM_ID || '!iyDNoJTahsHwSkiukz:localhost';

interface Notification {
    id: string;
    type: 'LIKE' | 'REPOST' | 'REPLY' | 'FOLLOW';
    actorId: string;        // who did it (Matrix user ID or Supabase profile username)
    actorName: string;      // display name
    actorAvatar?: string;
    targetEventId?: string; // the post that was liked/reposted/replied to
    body?: string;          // reply text preview
    timestamp: number;
    href: string;           // where to navigate on click
}

export default function NotificationsPage() {
    const supabase = createClient();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchNotifications = async () => {
            try {
                const matrixClient = getSharedClient() || await getMatrixClient();
                const { data: { user } } = await supabase.auth.getUser();

                if (!matrixClient || !user) {
                    setLoading(false);
                    return;
                }

                const myMatrixUserId = matrixClient.getUserId();
                if (!myMatrixUserId) {
                    setLoading(false);
                    return;
                }
                const allNotifs: Notification[] = [];

                // ─── 1. MATRIX NOTIFICATIONS ───
                // Fetch from the Matrix /notifications endpoint which returns
                // events that matched the user's push rules (mentions, replies, etc.)
                try {
                    const response = await matrixClient.http.authedRequest<any>(
                        "GET" as any,
                        "/notifications",
                        { limit: 50 }
                    );

                    if (response?.notifications) {
                        for (const notif of response.notifications) {
                            const event = notif.event;
                            if (!event || event.sender === myMatrixUserId) continue;

                            const content = event.content || {};
                            const relatesTo = content['m.relates_to'];
                            const type = event.type;

                            // ── LIKE (Reaction) ──
                            if (type === 'm.reaction' && relatesTo?.event_id) {
                                // Only show if the reacted-to event is ours
                                // We check by trying to find it in the room
                                const targetId = relatesTo.event_id;
                                const isOurs = await isMyEvent(matrixClient, targetId, myMatrixUserId);
                                if (!isOurs) continue;

                                allNotifs.push({
                                    id: event.event_id,
                                    type: 'LIKE',
                                    actorId: event.sender,
                                    actorName: event.sender,
                                    targetEventId: targetId,
                                    timestamp: event.origin_server_ts,
                                    href: `/post/${targetId}`,
                                });
                            }
                            // ── REPOST (m.reference) ──
                            else if (type === 'm.room.message' && relatesTo?.rel_type === 'm.reference' && relatesTo?.event_id) {
                                const targetId = relatesTo.event_id;
                                const isOurs = await isMyEvent(matrixClient, targetId, myMatrixUserId);
                                if (!isOurs) continue;

                                allNotifs.push({
                                    id: event.event_id,
                                    type: 'REPOST',
                                    actorId: event.sender,
                                    actorName: event.sender,
                                    targetEventId: targetId,
                                    timestamp: event.origin_server_ts,
                                    href: `/post/${targetId}`,
                                });
                            }
                            // ── REPLY (m.thread or m.in_reply_to) ──
                            else if (type === 'm.room.message' && relatesTo) {
                                const replyToId = relatesTo['m.in_reply_to']?.event_id;
                                const threadRootId = relatesTo.rel_type === 'm.thread' ? relatesTo.event_id : null;

                                // Check if replying to our event or replying within our thread
                                let targetId: string | null = null;
                                if (replyToId) {
                                    const isOurs = await isMyEvent(matrixClient, replyToId, myMatrixUserId);
                                    if (isOurs) targetId = replyToId;
                                }
                                if (!targetId && threadRootId) {
                                    const isOurs = await isMyEvent(matrixClient, threadRootId, myMatrixUserId);
                                    if (isOurs) targetId = threadRootId;
                                }

                                if (!targetId) continue;

                                allNotifs.push({
                                    id: event.event_id,
                                    type: 'REPLY',
                                    actorId: event.sender,
                                    actorName: event.sender,
                                    targetEventId: targetId,
                                    body: content.body || '',
                                    timestamp: event.origin_server_ts,
                                    href: `/post/${event.event_id}`,
                                });
                            }
                        }
                    }
                } catch (err) {
                    console.error("[Notifications] Failed to fetch Matrix notifications:", err);
                }

                // ─── 2. SUPABASE FOLLOW NOTIFICATIONS ───
                try {
                    const { data: recentFollows } = await supabase
                        .from('follows')
                        .select('follower_id, created_at')
                        .eq('following_id', user.id)
                        .order('created_at', { ascending: false })
                        .limit(20);

                    if (recentFollows && recentFollows.length > 0) {
                        const followerIds = recentFollows.map(f => f.follower_id);
                        const { data: profiles } = await supabase
                            .from('profiles')
                            .select('id, username, avatar_url')
                            .in('id', followerIds);

                        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

                        for (const follow of recentFollows) {
                            const profile = profileMap.get(follow.follower_id);
                            allNotifs.push({
                                id: `follow-${follow.follower_id}`,
                                type: 'FOLLOW',
                                actorId: follow.follower_id,
                                actorName: profile?.username || 'Someone',
                                actorAvatar: profile?.avatar_url || undefined,
                                timestamp: new Date(follow.created_at).getTime(),
                                href: `/${profile?.username || follow.follower_id}`,
                            });
                        }
                    }
                } catch (err) {
                    console.error("[Notifications] Failed to fetch follow notifications:", err);
                }

                // ─── 3. SORT BY TIMESTAMP (newest first) ───
                allNotifs.sort((a, b) => b.timestamp - a.timestamp);

                // ─── 4. AGGREGATE LIKES on the same target ───
                const aggregated = aggregateNotifications(allNotifs);

                setNotifications(aggregated);
            } catch (err) {
                console.error("Failed to load notifications:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchNotifications();
    }, [supabase]);

    return (
        <AppShell>
            <div className="sticky top-0 z-10 backdrop-blur-md bg-black/70 border-b border-neutral-800 p-4">
                <h1 className="font-bold text-xl text-white">Notifications</h1>
            </div>

            <div className="divide-y divide-neutral-800 min-h-screen">
                {loading ? (
                    <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-neutral-500" /></div>
                ) : notifications.length === 0 ? (
                    <div className="p-12 text-center text-neutral-500 flex flex-col items-center">
                        <Bell className="w-12 h-12 mb-4 text-neutral-700" />
                        <h2 className="text-xl font-bold text-white mb-2">All caught up!</h2>
                        <p>You have no new notifications.</p>
                    </div>
                ) : (
                    notifications.map((notif) => <NotificationRow key={notif.id} notif={notif} />)
                )}
            </div>
        </AppShell>
    );
}

// ─── Helper: Check if an event was authored by the current user ───
async function isMyEvent(matrixClient: any, eventId: string, myUserId: string): Promise<boolean> {
    try {
        // Cache-first: check the room timeline
        const room = matrixClient.getRoom(ROOM_ID);
        const cachedEvent = room?.findEventById(eventId);
        if (cachedEvent) return cachedEvent.getSender() === myUserId;

        // Network fallback
        const raw = await matrixClient.fetchRoomEvent(ROOM_ID, eventId);
        return raw?.sender === myUserId;
    } catch {
        return false;
    }
}

// ─── Helper: Aggregate likes on the same target ───
function aggregateNotifications(notifs: Notification[]): Notification[] {
    const likeGroups = new Map<string, Notification[]>();
    const result: Notification[] = [];

    for (const notif of notifs) {
        if (notif.type === 'LIKE' && notif.targetEventId) {
            const key = notif.targetEventId;
            if (!likeGroups.has(key)) likeGroups.set(key, []);
            likeGroups.get(key)!.push(notif);
        } else {
            result.push(notif);
        }
    }

    // Merge like groups into single aggregated notifications
    for (const [targetId, likes] of likeGroups) {
        const latest = likes[0]; // Already sorted by timestamp desc
        const otherCount = likes.length - 1;
        result.push({
            ...latest,
            actorName: otherCount > 0
                ? `${latest.actorName} and ${otherCount} other${otherCount > 1 ? 's' : ''}`
                : latest.actorName,
        });
    }

    // Re-sort after merging
    result.sort((a, b) => b.timestamp - a.timestamp);
    return result;
}

// ─── Notification Row Component ───
function NotificationRow({ notif }: { notif: Notification }) {
    const iconMap = {
        LIKE: { Icon: Heart, color: 'text-pink-500', action: 'liked your post' },
        REPOST: { Icon: Repeat, color: 'text-green-500', action: 'reposted your post' },
        REPLY: { Icon: MessageSquare, color: 'text-orange-500', action: 'replied to your post' },
        FOLLOW: { Icon: UserPlus, color: 'text-orange-500', action: 'followed you' },
    };

    const { Icon, color, action } = iconMap[notif.type];

    return (
        <Link href={notif.href} className="flex gap-4 p-4 hover:bg-neutral-900/30 transition-colors">
            <div className={`mt-1 ${color} shrink-0`}>
                <Icon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <Avatar className="w-7 h-7 shrink-0">
                        {notif.actorAvatar ? (
                            <AvatarImage src={notif.actorAvatar} />
                        ) : null}
                        <AvatarFallback className="bg-neutral-800 text-[10px]">
                            {notif.actorId.substring(1, 3).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <span className="font-bold text-white text-sm truncate max-w-[180px]">{notif.actorName}</span>
                    <span className="text-neutral-500 text-sm">{action}</span>
                </div>
                {notif.body && (
                    <p className="text-neutral-400 text-sm mt-1 line-clamp-2">{notif.body}</p>
                )}
                <span className="text-neutral-600 text-xs mt-1 block">
                    {formatDistanceToNow(notif.timestamp, { addSuffix: true })}
                </span>
            </div>
        </Link>
    );
}
