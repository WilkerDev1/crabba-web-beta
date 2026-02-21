'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { getMatrixClient } from '@/lib/matrix';
import { createClient } from '@/lib/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bell, Heart, MessageSquare, Repeat, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function NotificationsPage() {
    const supabase = createClient();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchNotifications = async () => {
            try {
                const matrixClient = await getMatrixClient();
                const { data: { user } } = await supabase.auth.getUser();

                if (!matrixClient || !user) {
                    setLoading(false);
                    return;
                }

                // In a real Matrix app, you'd sync and listen to push rules / notifications endpoint
                // `/notifications` or `/_matrix/client/v3/notifications`
                // Because matrix-js-sdk sync can be heavy, we will just fetch the /notifications manually

                const response = await matrixClient.http.authedRequest<any>(
                    "GET" as any,
                    "/notifications",
                    { limit: 20 }
                );

                if (response && response.notifications) {
                    setNotifications(response.notifications);
                }
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
                    <div className="p-12 pl-4 text-center text-neutral-500 flex flex-col items-center">
                        <Bell className="w-12 h-12 mb-4 text-neutral-700" />
                        <h2 className="text-xl font-bold text-white mb-2">Caught up!</h2>
                        <p>You have no new notifications.</p>
                    </div>
                ) : (
                    notifications.map((notif: any, i: number) => {
                        const event = notif.event;
                        const type = event.type;
                        const isReaction = type === 'm.reaction';
                        const isMessage = type === 'm.room.message';
                        const body = event.content.body || '';

                        let Icon = MessageSquare;
                        let color = 'text-blue-500';
                        let action = 'replied to your post';

                        if (isReaction) {
                            Icon = Heart;
                            color = 'text-pink-500';
                            action = 'liked your post';
                        } else if (isMessage && event.content['m.relates_to']?.rel_type === 'm.reference') {
                            Icon = Repeat;
                            color = 'text-green-500';
                            action = 'reposted your post';
                        } else if (isMessage) {
                            Icon = MessageSquare;
                            color = 'text-blue-500';
                            action = 'mentioned you';
                        }

                        return (
                            <Link key={i} href={`/post/${event.event_id}`} className="flex gap-4 p-4 hover:bg-neutral-900/30 transition-colors block">
                                <div className={`mt-1 ${color}`}>
                                    <Icon className="w-6 h-6 fill-current" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Avatar className="w-8 h-8">
                                            <AvatarFallback className="bg-neutral-800 text-xs">
                                                {event.sender.substring(1, 3).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span className="font-bold text-white">{event.sender}</span>
                                        <span className="text-neutral-500 text-sm">{action}</span>
                                    </div>
                                    {!isReaction && (
                                        <p className="text-neutral-300 mt-2">{body}</p>
                                    )}
                                </div>
                            </Link>
                        );
                    })
                )}
            </div>
        </AppShell>
    );
}
