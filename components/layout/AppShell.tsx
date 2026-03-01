'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Home, Compass, Bell, User, Box, Search, LogOut, Settings, WifiOff, RefreshCcw, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { createClient } from '../../lib/supabase/client';
import { clearMatrixSession, getMatrixClient, safeStartClient, checkServerHealth, getServerStatus, setBaseUrl, getEffectiveBaseUrl } from '../../lib/matrix';
import { ComposePostModal } from '../feed/ComposePostModal';
import { TrendingTopics } from './TrendingTopics';

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
    const pathname = usePathname();
    const supabase = createClient();
    const [user, setUser] = useState<any>(null);
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [loadingAuth, setLoadingAuth] = useState(true);

    const [serverOffline, setServerOffline] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const [newTunnelUrl, setNewTunnelUrl] = useState('');
    const [showUrlInput, setShowUrlInput] = useState(false);

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

                // Health check before starting Matrix client
                const healthy = await checkServerHealth();
                setServerOffline(!healthy);

                if (healthy) {
                    try {
                        const matrixClient = await getMatrixClient();
                        if (matrixClient && matrixClient.getAccessToken()) {
                            await safeStartClient(matrixClient);
                        }
                    } catch (err) {
                        console.error("Matrix Provider Sync Error:", err);
                    }
                }
            }
            setLoadingAuth(false);
        };

        fetchUserAndProfile();

        // Periodic health polling (every 30s)
        const healthInterval = setInterval(async () => {
            const offline = getServerStatus();
            setServerOffline(offline);
        }, 30000);

        return () => clearInterval(healthInterval);
    }, [supabase]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        await clearMatrixSession();
        router.push('/login');
        router.refresh();
    };

    const handleRetry = async () => {
        setRetrying(true);
        try {
            // If user provided a new tunnel URL, apply it
            if (newTunnelUrl.trim()) {
                setBaseUrl(newTunnelUrl.trim());
                setNewTunnelUrl('');
                setShowUrlInput(false);
            }

            const healthy = await checkServerHealth();
            setServerOffline(!healthy);

            if (healthy) {
                const matrixClient = await getMatrixClient();
                if (matrixClient) {
                    await safeStartClient(matrixClient);
                }
            }
        } catch (err) {
            console.error("Retry failed:", err);
        } finally {
            setRetrying(false);
        }
    };

    const profileHref = profile?.username ? `/${profile.username}` : user?.email ? `/${user.email.split('@')[0]}` : '#';

    return (
        <div className="min-h-screen bg-black text-white flex justify-center">

            {/* ─── Server Offline Overlay ─── */}
            {serverOffline && (
                <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 max-w-md w-full text-center space-y-4">
                        <WifiOff className="w-12 h-12 text-red-400 mx-auto" />
                        <h2 className="text-xl font-bold text-white">Servidor no disponible</h2>
                        <p className="text-neutral-400 text-sm">
                            Conexión perdida con el servidor de Matrix. Verifica si tu túnel de Cloudflare sigue activo.
                        </p>
                        <p className="text-neutral-600 text-xs font-mono truncate">
                            {getEffectiveBaseUrl() || 'No URL configured'}
                        </p>

                        <button
                            onClick={handleRetry}
                            disabled={retrying}
                            className="w-full py-3 rounded-full bg-orange-600 hover:bg-orange-700 disabled:bg-neutral-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                        >
                            {retrying ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</>
                            ) : (
                                <><RefreshCcw className="w-4 h-4" /> Reintentar conexión</>
                            )}
                        </button>

                        {!showUrlInput ? (
                            <button
                                onClick={() => setShowUrlInput(true)}
                                className="text-neutral-500 text-xs hover:text-neutral-300 underline transition-colors"
                            >
                                ¿Nuevo túnel? Cambiar URL
                            </button>
                        ) : (
                            <div className="space-y-2">
                                <input
                                    type="url"
                                    placeholder="https://new-tunnel.trycloudflare.com"
                                    value={newTunnelUrl}
                                    onChange={e => setNewTunnelUrl(e.target.value)}
                                    className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                                />
                                <p className="text-neutral-600 text-xs">
                                    Ingresa la nueva URL del túnel y presiona Reintentar.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
            <div className="w-full max-w-7xl flex relative">
                {/* Left Sidebar - Hidden on mobile (<lg), icon-only on lg, expanded on xl */}
                <aside className="hidden lg:flex flex-col w-20 xl:w-72 fixed h-screen z-20 border-r border-neutral-800 px-2 py-4 gap-6">
                    <div className="flex items-center justify-center xl:justify-start px-2">
                        <Link href="/" className="hover:bg-neutral-900 p-2 rounded-full transition-colors">
                            <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                                <span className="text-black font-bold text-lg">C</span>
                            </div>
                        </Link>
                    </div>

                    <nav className="flex-1 flex flex-col gap-2">
                        <NavItem href="/" icon={<Home className="w-7 h-7" />} label="Home" active={pathname === '/'} />
                        <NavItem href="/search" icon={<Search className="w-7 h-7" />} label="Search" active={pathname === '/search'} />
                        <NavItem href="/fanbox" icon={<Box className="w-7 h-7" />} label="BostCrabb" active={pathname === '/fanbox'} />
                        <NavItem href="/notifications" icon={<Bell className="w-7 h-7" />} label="Notifications" active={pathname === '/notifications'} />
                        <NavItem href={profileHref} icon={<User className="w-7 h-7" />} label="Profile" active={pathname === profileHref} />
                        <NavItem href="/settings" icon={<Settings className="w-7 h-7" />} label="Settings" active={pathname === '/settings'} />
                    </nav>

                    <div className="p-2">
                        {user ? (
                            <>
                                <ComposePostModal>
                                    <Button className="w-full h-12 rounded-full bg-orange-600 hover:bg-orange-700 text-white font-bold text-lg hidden xl:block">
                                        Post
                                    </Button>
                                </ComposePostModal>
                                <ComposePostModal>
                                    <Button className="w-12 h-12 rounded-full bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center xl:hidden mx-auto">
                                        +
                                    </Button>
                                </ComposePostModal>
                            </>
                        ) : (
                            <>
                                <Link href="/">
                                    <Button className="w-full h-12 rounded-full bg-orange-600 hover:bg-orange-700 text-white font-bold text-lg hidden xl:block">
                                        Join Beta
                                    </Button>
                                </Link>
                                <Link href="/">
                                    <Button className="w-12 h-12 rounded-full bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center xl:hidden mx-auto text-xs font-bold">
                                        🦀
                                    </Button>
                                </Link>
                            </>
                        )}
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
                <main className="flex-1 min-w-0 lg:ml-20 xl:ml-72 border-r border-neutral-800 max-w-2xl w-full pb-16 lg:pb-0">
                    {children}
                </main>

                {/* Right Sidebar - Trending (hidden below xl) */}
                <aside className="hidden xl:block w-80 pl-8 py-4 sticky top-0 h-screen">
                    <form action="/search" method="GET" className="bg-neutral-900 rounded-full flex items-center px-4 py-2 mb-6 focus-within:ring-1 ring-orange-500">
                        <Search className="w-4 h-4 text-neutral-500 mr-2" />
                        <input
                            type="text"
                            name="q"
                            placeholder="Search Crabba"
                            className="bg-transparent border-none focus:outline-none text-white placeholder-neutral-500 w-full"
                        />
                    </form>

                    <TrendingTopics />
                </aside>
            </div >

            {/* ─── Mobile Bottom Navigation Bar ─── */}
            < nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-t border-neutral-800 flex items-center justify-around py-2 px-2 lg:hidden safe-area-bottom" >
                <MobileNavItem href="/" icon={<Home className="w-6 h-6" />} active={pathname === '/'} />
                <MobileNavItem href="/search" icon={<Search className="w-6 h-6" />} active={pathname === '/search'} />

                {/* Floating Compose Button */}
                <ComposePostModal>
                    <button className="w-12 h-12 rounded-full bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center shadow-lg shadow-orange-600/30 -mt-5 text-2xl font-light active:scale-95 transition-transform">
                        +
                    </button>
                </ComposePostModal>

                <MobileNavItem href="/notifications" icon={<Bell className="w-6 h-6" />} active={pathname === '/notifications'} />
                <MobileNavItem href={profileHref} icon={<User className="w-6 h-6" />} active={pathname === profileHref} />
            </nav >
        </div >
    );
}

function NavItem({ href, icon, label, active = false }: { href: string; icon: React.ReactNode; label: string; active?: boolean }) {
    return (
        <Link href={href} className="group flex items-center xl:justify-start justify-center p-3 rounded-full hover:bg-neutral-900 transition-colors cursor-pointer w-fit xl:w-full">
            <div className={`relative ${active ? 'text-white' : 'text-neutral-400'}`}>
                {icon}
            </div>
            <span className={`ml-4 text-xl hidden xl:block ${active ? 'font-bold text-white' : 'font-normal text-neutral-400'}`}>
                {label}
            </span>
        </Link>
    );
}

function MobileNavItem({ href, icon, active = false }: { href: string; icon: React.ReactNode; active?: boolean }) {
    return (
        <Link
            href={href}
            className={`flex items-center justify-center w-12 h-12 rounded-full transition-colors active:scale-95 ${active ? 'text-white' : 'text-neutral-500'}`}
        >
            {icon}
        </Link>
    );
}
