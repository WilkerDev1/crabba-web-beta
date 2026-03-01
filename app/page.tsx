import { AppShell } from '@/components/layout/AppShell';
import { GlobalTimeline } from '@/components/feed/GlobalTimeline';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    return (
      <AppShell>
        <GlobalTimeline rootOnly={true} showTabs={true} />
      </AppShell>
    );
  }

  // ─── Closed Beta Landing Page ───
  return <LandingPage />;
}

function LandingPage() {
  return <LandingClient />;
}

// Client component for the waitlist form
import LandingClient from '@/components/landing/LandingClient';
