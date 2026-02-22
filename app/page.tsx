import { AppShell } from '@/components/layout/AppShell';
import { GlobalTimeline } from '@/components/feed/GlobalTimeline';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <AppShell>
      <GlobalTimeline rootOnly={true} />
    </AppShell>
  );
}
