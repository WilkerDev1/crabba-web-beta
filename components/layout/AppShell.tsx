'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Home, Compass, Bell, User, Hash, Box, Search, LogOut, Settings } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { createClient } from '../../lib/supabase/client';
import { clearMatrixSession, getMatrixClient } from '../../lib/matrix';
import { ComposePostModal } from '../feed/ComposePostModal';

interface AppShellProps {
    children: React.ReactNode;
}

interface ProfileData {
    username: string;
    matrix_user_id: string;
    avatar_url: string | null;
}

export function AppShell({ children }: AppShellProps) {
    const router = useRouter();
    const supabase = createClient();
    const [user, setUser] = useState<any>(null);
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [loadingAuth, setLoadingAuth] = useState(true);

    useEffect(() => {
        const fetchUserAndProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                setUser(user);

                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('username, matrix_user_id, avatar_url')
                    .eq('id', user.id)
                    .single();

                if (profileData) {
                    setProfile(profileData);
                }

                // Global Matrix Background Sync Initialization
                try {
                    const matrixClient = await getMatrixClient();
                    if (matrixClient && !matrixClient.clientRunning) {
                        await matrixClient.startClient({
                            initialSyncLimit: 20,
                            pollTimeout: 20000,
                            pendingEventOrdering: "detached"
                        } as any);
                    }
                } catch (err) {
                    console.error("Matrix Provider Sync Error:", err);
                }
            }
            setLoadingAuth(false);
        };

        fetchUserAndProfile();
    }, [supabase]);

    const handleLogout = async () => {
        // 1. Sign out of Supabase
        await supabase.auth.signOut();

        // 2. Clear Matrix LocalStorage and Memory State
        await clearMatrixSession();

        // 3. Redirect to login
        router.push('/login');
        router.refresh();
    };

    return (
        <div className="min-h-screen bg-black text-white flex justify-center">
            <div className="w-full max-w-7xl flex relative">
                {/* Left Sidebar - Navigation */}
                <aside className="hidden sm:flex flex-col w-20 xl:w-72 fixed h-screen z-20 border-r border-neutral-800 px-2 py-4 gap-6">
                    <div className="flex items-center justify-center xl:justify-start px-2">
                        <Link href="/" className="hover:bg-neutral-900 p-2 rounded-full transition-colors">
                            <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                                <span className="text-black font-bold text-lg">C</span>
                            </div>
                        </Link>
                    </div>

                    <nav className="flex-1 flex flex-col gap-2">
                        <NavItem href="/" icon={<Home className="w-7 h-7" />} label="Home" active />
                        <NavItem href="/explore" icon={<Compass className="w-7 h-7" />} label="Explore" />
                        <NavItem href="/fanbox" icon={<Box className="w-7 h-7" />} label="Fanbox" />
                        <NavItem href="/notifications" icon={<Bell className="w-7 h-7" />} label="Notifications" />
                        <NavItem href={profile?.username ? `/${profile.username}` : user?.email ? `/${user.email.split('@')[0]}` : '#'} icon={<User className="w-7 h-7" />} label="Profile" />
                        <NavItem href="/settings" icon={<Settings className="w-7 h-7" />} label="Settings" />
                    </nav>

                    <div className="p-2">
                        <ComposePostModal>
                            <Button className="w-full h-12 rounded-full bg-blue-500 hover:bg-blue-600 text-white font-bold text-lg hidden xl:block">
                                Post
                            </Button>
                        </ComposePostModal>
                        <ComposePostModal>
                            <Button className="w-12 h-12 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center xl:hidden mx-auto">
                                +
                            </Button>
                        </ComposePostModal>
                    </div>

                    {!loadingAuth && user && (
                        <div className="mt-auto p-2 flex items-center justify-between hover:bg-neutral-900 rounded-full cursor-pointer transition-colors group">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <Avatar>
                                    <AvatarImage src={profile?.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${profile?.username || user.email}`} />
                                    <AvatarFallback>{profile?.username ? profile.username[0].toUpperCase() : 'U'}</AvatarFallback>
                                </Avatar>
                                <div className="hidden xl:block overflow-hidden">
                                    <p className="font-bold text-sm truncate">@{profile?.username || user.email?.split('@')[0] || 'Unknown'}</p>
                                    <p className="text-neutral-500 text-sm truncate">{profile?.matrix_user_id || 'Incomplete Profile'}</p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="hidden xl:flex opacity-0 group-hover:opacity-100 transition-opacity rounded-full hover:bg-neutral-800 text-red-400 hover:text-red-500 shrink-0"
                                onClick={handleLogout}
                                title="Log out"
                            >
                                <LogOut className="w-5 h-5" />
                            </Button>
                        </div>
                    )}
                </aside>

                {/* Center - Feed */}
                <main className="flex-1 min-w-0 sm:ml-20 xl:ml-72 border-r border-neutral-800 max-w-2xl">
                    <div className="sticky top-0 z-10 backdrop-blur-md bg-black/70 border-b border-neutral-800 p-4">
                        <h1 className="font-bold text-xl">Home</h1>
                    </div>
                    {children}
                </main>

                {/* Right Sidebar - Trending */}
                <aside className="hidden lg:block w-80 pl-8 py-4 sticky top-0 h-screen">
                    <div className="bg-neutral-900 rounded-full flex items-center px-4 py-2 mb-6 focus-within:ring-1 ring-blue-500">
                        <Search className="w-4 h-4 text-neutral-500 mr-2" />
                        <input
                            type="text"
                            placeholder="Search Crabba"
                            className="bg-transparent border-none focus:outline-none text-white placeholder-neutral-500 w-full"
                        />
                    </div>

                    <Card className="bg-neutral-900 border-none p-4 rounded-xl mb-4">
                        <h2 className="font-bold text-xl mb-4 text-white">Trending Creators</h2>
                        <div className="flex flex-col gap-4">
                            <TrendingItem tag="Art" count="12.5k" />
                            <TrendingItem tag="Music" count="8.2k" />
                            <TrendingItem tag="Gaming" count="5.1k" />
                            <TrendingItem tag="Tech" count="2.3k" />
                        </div>
                    </Card>
                </aside>
            </div>
        </div>
    );
}

function NavItem({ href, icon, label, active = false }: { href: string; icon: React.ReactNode; label: string; active?: boolean }) {
    return (
        <Link href={href} className="group flex items-center xl:justify-start justify-center p-3 rounded-full hover:bg-neutral-900 transition-colors cursor-pointer w-fit xl:w-full">
            <div className={`relative ${active ? 'text-white' : 'text-white'}`}>
                {icon}
            </div>
            <span className={`ml-4 text-xl hidden xl:block ${active ? 'font-bold' : 'font-normal'}`}>
                {label}
            </span>
        </Link>
    );
}

function TrendingItem({ tag, count }: { tag: string; count: string }) {
    return (
        <div className="flex justify-between items-center cursor-pointer hover:bg-neutral-800/50 p-2 rounded transition-colors">
            <div>
                <p className="font-bold text-white">#{tag}</p>
                <p className="text-xs text-neutral-500">{count} posts</p>
            </div>
            <Hash className="w-4 h-4 text-neutral-500" />
        </div>
    )
}
