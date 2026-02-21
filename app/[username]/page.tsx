'use client';

import { useEffect, useState, use } from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Loader2, Calendar, MapPin, Link as LinkIcon, Lock } from 'lucide-react';
import { format } from 'date-fns';
import { GlobalTimeline } from '@/components/feed/GlobalTimeline';

interface Profile {
    id: string;
    username: string;
    matrix_user_id: string;
    bio: string | null;
    avatar_url: string | null;
    banner_url: string | null;
    created_at: string;
    is_creator: boolean;
}

export default function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
    const { username } = use(params);
    const supabase = createClient();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [isFollowing, setIsFollowing] = useState(false);
    const [followersCount, setFollowersCount] = useState(0);
    const [followingCount, setFollowingCount] = useState(0);
    const [isFollowingLoading, setIsFollowingLoading] = useState(false);
    const [plans, setPlans] = useState<any[]>([]);
    const [collections, setCollections] = useState<any[]>([]);

    useEffect(() => {
        const fetchProfileAndStats = async () => {
            // Remove @ if they typed it in URL
            const cleanUsername = username.replace(/^@/, '');

            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('username', cleanUsername)
                .single();

            if (error || !data) {
                setProfile(null);
                setLoading(false);
                return;
            }

            setProfile(data);

            // Fetch current user
            const { data: { user } } = await supabase.auth.getUser();
            setCurrentUser(user);

            // Fetch stats
            const [
                { count: followers },
                { count: following },
                { data: plansData },
                { data: collectionsData }
            ] = await Promise.all([
                supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', data.id),
                supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', data.id),
                supabase.from('creator_plans').select('*').eq('creator_id', data.id).order('price', { ascending: true }),
                supabase.from('collections').select('*').eq('creator_id', data.id).order('created_at', { ascending: false })
            ]);

            setFollowersCount(followers || 0);
            setFollowingCount(following || 0);
            if (plansData) setPlans(plansData);
            if (collectionsData) setCollections(collectionsData);

            // Fetch follow status
            if (user && user.id !== data.id) {
                const { data: followData } = await supabase
                    .from('follows')
                    .select('*')
                    .eq('follower_id', user.id)
                    .eq('following_id', data.id)
                    .single();

                setIsFollowing(!!followData);
            }

            setLoading(false);
        };

        fetchProfileAndStats();
    }, [username, supabase]);

    const handleFollow = async () => {
        if (!currentUser || !profile) return;
        setIsFollowingLoading(true);

        try {
            if (isFollowing) {
                await supabase
                    .from('follows')
                    .delete()
                    .eq('follower_id', currentUser.id)
                    .eq('following_id', profile.id);
                setIsFollowing(false);
                setFollowersCount(prev => Math.max(0, prev - 1));
            } else {
                await supabase
                    .from('follows')
                    .insert({ follower_id: currentUser.id, following_id: profile.id });
                setIsFollowing(true);
                setFollowersCount(prev => prev + 1);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsFollowingLoading(false);
        }
    };

    if (loading) {
        return (
            <AppShell>
                <div className="flex h-[50vh] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-neutral-500" />
                </div>
            </AppShell>
        );
    }

    if (!profile) {
        return (
            <AppShell>
                <div className="flex h-[50vh] flex-col items-center justify-center space-y-4">
                    <h1 className="text-4xl font-bold text-white">404</h1>
                    <p className="text-neutral-400">User @{username} not found.</p>
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell>
            {/* Header / Banner */}
            <div className="relative w-full h-48 md:h-64 bg-neutral-900 border-b border-neutral-800">
                {profile.banner_url ? (
                    <img
                        src={profile.banner_url}
                        alt={`${profile.username}'s banner`}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-r from-blue-900/20 to-purple-900/20" />
                )}

                {/* Avatar Overlay */}
                <div className="absolute -bottom-16 left-6">
                    <Avatar className="w-32 h-32 border-4 border-black rounded-2xl bg-black">
                        <AvatarImage src={profile.avatar_url || ''} className="object-cover" />
                        <AvatarFallback className="bg-neutral-800 text-3xl font-bold text-neutral-400 rounded-2xl">
                            {profile.username.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                </div>
            </div>

            {/* Profile Info */}
            <div className="px-6 pt-20 pb-4">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-2xl font-bold text-white">{profile.username}</h1>
                        <p className="text-neutral-400">@{profile.username}</p>
                    </div>
                    <Button
                        onClick={handleFollow}
                        disabled={isFollowingLoading || !currentUser || currentUser?.id === profile.id}
                        className={isFollowing
                            ? "bg-transparent border border-neutral-500 text-white hover:bg-red-500/10 hover:text-red-500 hover:border-red-500 font-bold px-6 rounded-full group transition-colors"
                            : "bg-white text-black hover:bg-neutral-200 font-bold px-6 rounded-full transition-colors"
                        }
                    >
                        {isFollowing ? <span className="group-hover:hidden">Following</span> : null}
                        {isFollowing ? <span className="hidden group-hover:inline">Unfollow</span> : null}
                        {!isFollowing ? 'Follow' : null}
                    </Button>
                </div>

                {profile.bio && (
                    <div className="mt-4 text-neutral-200 whitespace-pre-wrap">
                        {profile.bio}
                    </div>
                )}

                <div className="flex items-center gap-4 mt-4 text-sm text-neutral-500">
                    <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>Joined {format(new Date(profile.created_at), 'MMMM yyyy')}</span>
                    </div>
                </div>

                <div className="flex items-center gap-4 mt-4 text-sm">
                    <div className="flex gap-1 cursor-pointer hover:underline">
                        <span className="text-white font-bold">{followingCount}</span>
                        <span className="text-neutral-500">Following</span>
                    </div>
                    <div className="flex gap-1 cursor-pointer hover:underline">
                        <span className="text-white font-bold">{followersCount}</span>
                        <span className="text-neutral-500">Followers</span>
                    </div>
                </div>
            </div>

            {/* Tabs Component - Posts | Fanbox | Plans */}
            <div className="mt-2 border-t border-neutral-800">
                <Tabs defaultValue="posts" className="w-full">
                    <TabsList className="w-full justify-start rounded-none border-b border-neutral-800 bg-transparent p-0 overflow-x-auto no-scrollbar">
                        <TabsTrigger
                            value="posts"
                            className="shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:text-white px-8 py-4 text-neutral-400"
                        >
                            Posts
                        </TabsTrigger>
                        <TabsTrigger
                            value="replies"
                            className="shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:text-white px-8 py-4 text-neutral-400"
                        >
                            Replies
                        </TabsTrigger>
                        <TabsTrigger
                            value="media"
                            className="shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:text-white px-8 py-4 text-neutral-400"
                        >
                            Media
                        </TabsTrigger>
                        <TabsTrigger
                            value="fanbox"
                            className="shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent data-[state=active]:text-orange-500 px-8 py-4 text-neutral-400"
                        >
                            Fanbox
                        </TabsTrigger>
                        {profile.is_creator && (
                            <TabsTrigger
                                value="plans"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-pink-500 data-[state=active]:bg-transparent data-[state=active]:text-pink-500 px-8 py-4 text-neutral-400"
                            >
                                Plans
                            </TabsTrigger>
                        )}
                    </TabsList>

                    {/* Tab 1: Posts (Filtered Timeline) */}
                    <TabsContent value="posts" className="p-0 m-0">
                        <GlobalTimeline filterUserId={profile.matrix_user_id} filterType="all" />
                    </TabsContent>

                    <TabsContent value="replies" className="p-0 m-0">
                        <GlobalTimeline filterUserId={profile.matrix_user_id} filterType="replies" />
                    </TabsContent>

                    <TabsContent value="media" className="p-0 m-0">
                        <GlobalTimeline filterUserId={profile.matrix_user_id} filterType="media" />
                    </TabsContent>

                    {/* Tab 2: Fanbox (Collections & Locked Grid placeholder) */}
                    <TabsContent value="fanbox" className="p-0 m-0">
                        <div className="p-6">
                            {/* Horizontal Mini-Folders */}
                            <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
                                <div className="shrink-0 px-4 py-2 rounded-full bg-neutral-900 border border-neutral-800 text-sm font-medium hover:bg-neutral-800 cursor-pointer text-white">
                                    All
                                </div>
                                {collections.map((folder) => (
                                    <div key={folder.id} className="shrink-0 px-4 py-2 rounded-full bg-neutral-900 border border-neutral-800 text-sm font-medium hover:bg-neutral-800 cursor-pointer text-white">
                                        {folder.name}
                                    </div>
                                ))}
                            </div>

                            {/* Masonry Grid Placeholder */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                {[1, 2, 3, 4].map((i) => (
                                    <div key={i} className="group relative rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800 aspect-video">
                                        <div className="absolute inset-0 bg-black/60 backdrop-blur-xl flex flex-col items-center justify-center z-10 p-6 text-center">
                                            <Lock className="w-8 h-8 text-neutral-400 mb-3" />
                                            <h3 className="text-white font-bold mb-1">Supporters Only</h3>
                                            <p className="text-sm text-neutral-400 mb-4">Pledge $5/month to unlock this post.</p>
                                            <Button className="bg-orange-500 hover:bg-orange-600 text-white w-full max-w-[200px]">
                                                View Plans
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </TabsContent>

                    {/* Tab 3: Plans (Subscription Tiers placeholder) */}
                    {profile.is_creator && (
                        <TabsContent value="plans" className="p-6">
                            {plans.length === 0 ? (
                                <div className="text-center text-neutral-500 py-12">No plans available yet.</div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {plans.map(plan => (
                                        <Card key={plan.id} className="bg-neutral-900 border-neutral-800 p-6 flex flex-col relative overflow-hidden">
                                            <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                                            <div className="text-3xl font-bold text-blue-500 mb-4">${plan.price} <span className="text-lg text-neutral-400 font-normal">/ month</span></div>
                                            {plan.description && <p className="text-sm text-neutral-300 mb-4">{plan.description}</p>}
                                            <ul className="text-sm text-neutral-300 space-y-2 mb-6 flex-1">
                                                {plan.perks?.map((perk: string, i: number) => (
                                                    <li key={i}>• {perk}</li>
                                                ))}
                                            </ul>
                                            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold">Subscribe</Button>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </TabsContent>
                    )}
                </Tabs>
            </div>
        </AppShell>
    );
}
