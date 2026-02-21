'use client';

import { use, useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { createClient } from '@/lib/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function FollowingPage({ params }: { params: Promise<{ username: string }> }) {
    const { username: rawUsername } = use(params);
    const username = decodeURIComponent(rawUsername).replace(/^@/, '');
    const router = useRouter();
    const supabase = createClient();

    const [following, setFollowing] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUsers = async () => {
            const { data: profile } = await supabase.from('profiles').select('id').eq('username', username).single();
            if (profile) {
                // Fetch follows where follower_id is this user
                const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', profile.id);
                if (follows && follows.length > 0) {
                    const followingIds = follows.map(f => f.following_id);
                    const { data: profiles } = await supabase.from('profiles').select('*').in('id', followingIds);
                    if (profiles) setFollowing(profiles);
                }
            }
            setLoading(false);
        };
        fetchUsers();
    }, [username, supabase]);

    return (
        <AppShell>
            <div className="sticky top-0 z-10 backdrop-blur-md bg-black/70 border-b border-neutral-800 p-4 flex items-center gap-4">
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-neutral-900" onClick={() => router.back()}>
                    <ArrowLeft className="w-5 h-5 text-white" />
                </Button>
                <div>
                    <h1 className="font-bold text-xl text-white">{username}</h1>
                    <p className="text-neutral-500 text-sm">Following</p>
                </div>
            </div>

            <div className="divide-y divide-neutral-800">
                {loading ? (
                    <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-neutral-500" /></div>
                ) : following.length === 0 ? (
                    <div className="p-12 text-center text-neutral-500">Not following anyone yet.</div>
                ) : (
                    following.map(user => (
                        <Link key={user.id} href={`/${user.username}`} className="flex items-center gap-3 p-4 hover:bg-neutral-900/30 transition-colors">
                            <Avatar className="w-12 h-12">
                                <AvatarImage src={user.avatar_url} />
                                <AvatarFallback>{user.username?.substring(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div>
                                <h3 className="font-bold text-white hover:underline">{user.username}</h3>
                                <p className="text-neutral-500 text-sm truncate max-w-sm">{user.bio}</p>
                            </div>
                        </Link>
                    ))
                )}
            </div>
        </AppShell>
    );
}
