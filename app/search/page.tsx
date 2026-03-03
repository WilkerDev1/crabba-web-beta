'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { GlobalTimeline } from '@/components/feed/GlobalTimeline';
import { Search as SearchIcon, Loader2 } from 'lucide-react';

function SearchContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const q = searchParams.get('q') || '';
    const [query, setQuery] = useState(q);

    useEffect(() => {
        setQuery(q);
    }, [q]);

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

            {!q.trim() ? (
                <div className="p-12 text-center text-neutral-500">
                    <SearchIcon className="w-12 h-12 mx-auto mb-4 text-neutral-700" />
                    <h2 className="text-xl font-bold text-white mb-2">Search Crabba</h2>
                    <p>Find posts, hashtags, and users across the platform.</p>
                </div>
            ) : (
                <GlobalTimeline searchQuery={q.trim()} />
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
