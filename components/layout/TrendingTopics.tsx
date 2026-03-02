'use client';

import { useState, useEffect } from 'react';
import { getSharedClient } from '@/lib/matrix';
import { Hash } from 'lucide-react';
import Link from 'next/link';

const ROOM_ID = process.env.NEXT_PUBLIC_MATRIX_GLOBAL_ROOM_ID || '!iyDNoJTahsHwSkiukz:localhost';

const FALLBACK_TAGS = [
    { tag: 'CrabbaAlpha', count: 0 },
    { tag: 'Art', count: 0 },
    { tag: 'Music', count: 0 },
    { tag: 'Tech', count: 0 },
    { tag: 'Gaming', count: 0 },
];

interface TagCount {
    tag: string;
    count: number;
}

export function TrendingTopics() {
    const [tags, setTags] = useState<TagCount[]>(FALLBACK_TAGS);

    useEffect(() => {
        const extractHashtags = async () => {
            let events: { getType: () => string; getContent: () => Record<string, unknown> }[] = [];
            const client = getSharedClient();

            if (client && client.getRoom(ROOM_ID)) {
                // Logged-in or active client route
                const room = client.getRoom(ROOM_ID);
                const timeline = room?.getLiveTimeline();
                if (timeline) {
                    events = timeline.getEvents();
                }
            } else {
                // Guest route: Fetch directly via HTTP
                try {
                    const baseUrl = process.env.NEXT_PUBLIC_MATRIX_HOMESERVER_URL || 'https://matrix.crabba.net';
                    const encodedRoomId = encodeURIComponent(ROOM_ID);
                    // Use guestFetch from our matrix auth lib if available, or fetch directly
                    const { guestFetch } = await import('@/lib/matrix');
                    const data = await guestFetch(baseUrl, `/_matrix/client/v3/rooms/${encodedRoomId}/messages?dir=b&limit=100`);
                    if (data && data.chunk) {
                        events = data.chunk.map((ev: { type: string; content?: Record<string, unknown> }) => ({
                            getType: () => ev.type,
                            getContent: () => ev.content || {}
                        }));
                    }
                } catch (err) {
                    console.error('Failed to guest-fetch trending tags', err);
                }
            }

            if (!events || events.length === 0) return;

            const freq = new Map<string, number>();

            for (const event of events) {
                if (event.getType() !== 'm.room.message') continue;
                const body = (event.getContent()?.body as string) || '';

                // Extract all #hashtags
                const matches = body.match(/#([A-Za-z0-9_]+)/g);
                if (matches) {
                    for (const raw of matches) {
                        const tag = raw.substring(1); // remove #
                        if (tag.length < 2) continue; // ignore single-char tags
                        freq.set(tag, (freq.get(tag) || 0) + 1);
                    }
                }
            }

            // Sort descending by count, take top 5
            const sorted = [...freq.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([tag, count]) => ({ tag, count }));

            if (sorted.length > 0) {
                setTags(sorted);
            }
            // else keep fallbacks
        };

        extractHashtags();

        // Re-extract every 60s
        const interval = setInterval(extractHashtags, 60_000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="bg-neutral-900 border-none p-4 rounded-xl mb-4">
            <h2 className="font-bold text-xl mb-4 text-white">Trending Topics</h2>
            <div className="flex flex-col gap-1">
                {tags.map(({ tag, count }) => (
                    <Link
                        key={tag}
                        href={`/search?q=%23${tag}`}
                        className="flex justify-between items-center cursor-pointer hover:bg-neutral-800/50 p-2.5 rounded-lg transition-colors group"
                    >
                        <div>
                            <p className="font-bold text-white group-hover:text-orange-500 transition-colors">#{tag}</p>
                            <p className="text-xs text-neutral-500">
                                {count > 0 ? `${count} post${count !== 1 ? 's' : ''}` : 'Trending'}
                            </p>
                        </div>
                        <Hash className="w-4 h-4 text-neutral-600" />
                    </Link>
                ))}
            </div>
        </div>
    );
}
