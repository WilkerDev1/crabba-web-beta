'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { getMatrixClient, getSharedClient } from '@/lib/matrix';
import { PostCard } from '@/components/feed/PostCard';
import { Search as SearchIcon, Loader2 } from 'lucide-react';

const ROOM_ID = process.env.NEXT_PUBLIC_MATRIX_GLOBAL_ROOM_ID || '!iyDNoJTahsHwSkiukz:localhost';

function SearchContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const q = searchParams.get('q') || '';
    const [query, setQuery] = useState(q);
    const [client, setClient] = useState<any>(null);
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setQuery(q);
    }, [q]);

    useEffect(() => {
        const init = async () => {
            try {
                const matrixClient = getSharedClient() || await getMatrixClient();
                if (!matrixClient) {
                    setLoading(false);
                    return;
                }
                setClient(matrixClient);

                const room = matrixClient.getRoom(ROOM_ID);
                if (room) {
                    const timeline = room.getLiveTimeline();
                    const allEvents = timeline.getEvents().reverse();
                    const messageEvents = allEvents.filter((e: any) => {
                        if (e.isRedacted() || e.getType() !== 'm.room.message') return false;
                        return true;
                    });
                    setEvents(messageEvents);
                }
            } catch (err) {
                console.error('Search init failed:', err);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    const filteredEvents = useMemo(() => {
        if (!q.trim()) return [];
        const lower = q.toLowerCase();

        return events.filter((event: any) => {
            // Username search: @username
            if (lower.startsWith('@')) {
                const sender = event.getSender()?.toLowerCase() || '';
                return sender.includes(lower);
            }
            // Hashtag or text search
            const body = event.getContent()?.body?.toLowerCase() || '';
            return body.includes(lower);
        });
    }, [q, events]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            router.push(`/search?q=${encodeURIComponent(query.trim())}`);
        }
    };

    return (
        <>
            <div className="sticky top-0 z-10 backdrop-blur-md bg-black/70 border-b border-neutral-800 p-4">
                <form onSubmit={handleSearch} className="flex items-center gap-3">
                    <div className="flex-1 bg-neutral-900 rounded-full flex items-center px-4 py-2.5 focus-within:ring-1 ring-orange-500">
                        <SearchIcon className="w-5 h-5 text-neutral-500 mr-3 shrink-0" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search posts, #hashtags, or @users..."
                            className="bg-transparent border-none focus:outline-none text-white placeholder-neutral-500 w-full"
                            autoFocus
                        />
                    </div>
                    <button
                        type="submit"
                        className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-full font-bold text-sm transition-colors"
                    >
                        Search
                    </button>
                </form>
            </div>

            {loading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
                </div>
            ) : !q.trim() ? (
                <div className="p-12 text-center text-neutral-500">
                    <SearchIcon className="w-12 h-12 mx-auto mb-4 text-neutral-700" />
                    <h2 className="text-xl font-bold text-white mb-2">Search Crabba</h2>
                    <p>Find posts, hashtags, and users across the platform.</p>
                </div>
            ) : filteredEvents.length === 0 ? (
                <div className="p-12 text-center text-neutral-500">
                    <p className="text-lg">No results found for &quot;{q}&quot;</p>
                    <p className="text-sm mt-2">Try a different search term or hashtag.</p>
                </div>
            ) : (
                <div className="divide-y divide-neutral-800">
                    <div className="p-4 text-sm text-neutral-400">
                        {filteredEvents.length} result{filteredEvents.length !== 1 ? 's' : ''} for &quot;{q}&quot;
                    </div>
                    {filteredEvents.map((event: any) => (
                        <PostCard key={event.getId()} event={event} matrixClient={client} />
                    ))}
                </div>
            )}
        </>
    );
}

export default function SearchPage() {
    return (
        <AppShell>
            <Suspense fallback={
                <div className="flex justify-center p-12">
                    <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
                </div>
            }>
                <SearchContent />
            </Suspense>
        </AppShell>
    );
}
