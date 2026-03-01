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
        const extractHashtags = () => {
            const client = getSharedClient();
            if (!client) return;

            const room = client.getRoom(ROOM_ID);
            if (!room) return;

            const timeline = room.getLiveTimeline();
            const events = timeline.getEvents();

            const freq = new Map<string, number>();

            for (const event of events) {
                if (event.getType() !== 'm.room.message') continue;
                const body: string = event.getContent()?.body || '';

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

        // Re-extract every 30s
        const interval = setInterval(extractHashtags, 30_000);
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
