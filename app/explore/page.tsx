import { AppShell } from '@/components/layout/AppShell';
import { GlobalTimeline } from '@/components/feed/GlobalTimeline';

export const dynamic = 'force-dynamic';

export default function ExplorePage() {
    return (
        <AppShell>
            <div className="sticky top-0 z-10 backdrop-blur-md bg-black/70 border-b border-neutral-800 p-4">
                <h1 className="font-bold text-xl text-white">Explore</h1>
            </div>
            <GlobalTimeline rootOnly={true} showTabs={true} />
        </AppShell>
    );
}
