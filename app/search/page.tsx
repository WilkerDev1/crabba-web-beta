'use client';

import { use } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { GlobalTimeline } from '@/components/feed/GlobalTimeline';

export default function SearchPage({ searchParams }: { searchParams: Promise<{ q: string }> }) {
    const { q } = use(searchParams);
    const query = q || '';

    return (
        <AppShell>
            <div className="sticky top-0 z-10 backdrop-blur-md bg-black/70 border-b border-neutral-800 p-4">
                <h1 className="text-xl font-bold text-white">Search Results</h1>
                <p className="text-neutral-500">Showing posts containing "{query}"</p>
            </div>
            <GlobalTimeline searchQuery={query} />
        </AppShell>
    );
}
