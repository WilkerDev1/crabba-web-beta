'use client';

import { useState, useEffect } from 'react';
import { Hash, Lock } from 'lucide-react';
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
    const [isGuest, setIsGuest] = useState(false);

    useEffect(() => {
        const extractHashtags = async () => {
            const token = localStorage.getItem('matrix_access_token');
            const guestToken = localStorage.getItem('matrix_guest_token');

            // If the user has no token or explicitly has a guest token, mark as guest and abort fetch
            if (!token || guestToken) {
                setIsGuest(true);
                return;
            }
            setIsGuest(false);

            try {
                // Check cache first (2 minute expiration)
                const cacheStr = sessionStorage.getItem('trending_tags_cache');
                if (cacheStr) {
                    try {
                        const cache = JSON.parse(cacheStr);
                        if (Date.now() - cache.timestamp < 120_000 && cache.tags?.length > 0) {
                            setTags(cache.tags);
                            return;
                        }
                    } catch {
                        // ignore corrupt cache
                    }
                }

                // Fetch via HTTP with correct authentication token
                const baseUrl = process.env.NEXT_PUBLIC_MATRIX_HOMESERVER_URL || 'https://matrix.crabba.net';
                const encodedRoomId = encodeURIComponent(ROOM_ID);
                const res = await fetch(`${baseUrl}/_matrix/client/v3/rooms/${encodedRoomId}/messages?dir=b&limit=300`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!res.ok) {
                    console.error('Failed to unauthenticated-fetch trending tags', res.status);
                    return;
                }

                const data = await res.json();
                if (!data || !data.chunk) return;

                const events = data.chunk;
                const freq = new Map<string, number>();

                for (const event of events) {
                    if (event.type !== 'm.room.message') continue;
                    const body = (event.content?.body as string) || '';

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
                    // Update cache
                    sessionStorage.setItem('trending_tags_cache', JSON.stringify({
                        timestamp: Date.now(),
                        tags: sorted
                    }));
                }
            } catch (err) {
                console.error('Error in trending tags extraction:', err);
            }
        };

        extractHashtags();

        // Re-extract every 60s
        const interval = setInterval(extractHashtags, 60_000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="bg-neutral-900 border-none p-4 rounded-xl mb-4">
            <h2 className="font-bold text-xl mb-4 text-white">Trending Topics</h2>
            {isGuest ? (
                <div className="flex flex-col items-center justify-center p-6 text-center text-neutral-500 border border-neutral-800 rounded-lg bg-neutral-900/50">
                    <Lock className="w-6 h-6 mb-2 text-neutral-600" />
                    <p className="text-sm">Sign in to see trending topics.</p>
                </div>
            ) : (
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
            )}
        </div>
    );
}
