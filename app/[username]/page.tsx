'use client';

import { useEffect, useState, useMemo, use } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Loader2, Calendar, MapPin, Link as LinkIcon, Lock, Gift, FolderOpen } from 'lucide-react';
import { format } from 'date-fns';
import { GlobalTimeline } from '@/components/feed/GlobalTimeline';
import { getSharedClient, getMatrixClient } from '@/lib/matrix';
import { MatrixMedia } from '@/components/feed/MatrixMedia';

const ROOM_ID = process.env.NEXT_PUBLIC_MATRIX_GLOBAL_ROOM_ID || '!iyDNoJTahsHwSkiukz:localhost';

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

interface SmartFolder {
    tag: string;
    count: number;
    coverMxcUrl: string;
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

    // ─── New: Hashtag filter & controlled tabs ───
    const [activeFilter, setActiveFilter] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('posts');

    // ─── New: User hashtags & smart folders data ───
    const [userHashtags, setUserHashtags] = useState<{ tag: string; count: number }[]>([]);
    const [smartFolders, setSmartFolders] = useState<SmartFolder[]>([]);

    useEffect(() => {
        const fetchProfileAndStats = async () => {
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

            const { data: { user } } = await supabase.auth.getUser();
            setCurrentUser(user);

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

    // ─── Extract user's top hashtags & smart folders from Matrix timeline ───
    useEffect(() => {
        if (!profile?.matrix_user_id) return;

        const extractUserHashtags = async () => {
            try {
                const matrixClient = getSharedClient() || await getMatrixClient();
                if (!matrixClient) return;

                const room = matrixClient.getRoom(ROOM_ID);
                if (!room) return;

                const timeline = room.getLiveTimeline();
                const events = timeline.getEvents();

                const tagFreq = new Map<string, number>();
                // For smart folders: tag → { count, mostRecentMediaMxcUrl }
                const mediaTagMap = new Map<string, { count: number; coverUrl: string }>();

                for (const event of events) {
                    if (event.getType() !== 'm.room.message') continue;
                    if (event.getSender() !== profile.matrix_user_id) continue;

                    const content = event.getContent();
                    const body: string = content?.body || '';
                    const msgtype = content?.msgtype;
                    const mxcUrl = content?.url;
                    const isMedia = msgtype === 'm.image' || msgtype === 'm.video';

                    // Extract hashtags
                    const matches = body.match(/#([A-Za-z0-9_]+)/g);
                    if (matches) {
                        for (const raw of matches) {
                            const tag = raw.substring(1);
                            if (tag.length < 2) continue;
                            tagFreq.set(tag, (tagFreq.get(tag) || 0) + 1);

                            // Track media-containing hashtags for smart folders
                            if (isMedia && mxcUrl) {
                                const existing = mediaTagMap.get(tag);
                                if (!existing) {
                                    mediaTagMap.set(tag, { count: 1, coverUrl: mxcUrl });
                                } else {
                                    existing.count += 1;
                                    // Keep most recent (later in timeline = newer)
                                    existing.coverUrl = mxcUrl;
                                }
                            }
                        }
                    }
                }

                // Sort hashtags by frequency, top 10
                const sortedTags = [...tagFreq.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
                    .map(([tag, count]) => ({ tag, count }));

                setUserHashtags(sortedTags);

                // Build smart folders from media tags
                const folders: SmartFolder[] = [...mediaTagMap.entries()]
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([tag, data]) => ({
                        tag,
                        count: data.count,
                        coverMxcUrl: data.coverUrl,
                    }));

                setSmartFolders(folders);
            } catch (err) {
                console.error('[Profile] Failed to extract hashtags:', err);
            }
        };

        extractUserHashtags();
    }, [profile?.matrix_user_id]);

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

    const handlePillClick = (tag: string) => {
        if (activeFilter === tag) {
            setActiveFilter(null);
        } else {
            setActiveFilter(tag);
            setActiveTab('posts');
        }
    };

    const handleFolderClick = (tag: string) => {
        setActiveFilter(tag);
        setActiveTab('posts');
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

    const tabTriggerClass = "shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent data-[state=active]:text-white px-8 py-4 text-neutral-400";

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
                    <div className="w-full h-full bg-gradient-to-r from-orange-900/20 to-amber-900/20" />
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

            {/* ─── Pixiv-Style Hashtag Pills Row ─── */}
            {userHashtags.length > 0 && (
                <div className="px-6 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
                    {userHashtags.map(({ tag }) => (
                        <button
                            key={tag}
                            onClick={() => handlePillClick(tag)}
                            className={`shrink-0 px-3 py-1 rounded-full text-sm font-medium transition-colors ${activeFilter === tag
                                    ? 'bg-orange-600 text-white'
                                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                                }`}
                        >
                            #{tag}
                        </button>
                    ))}
                    {activeFilter && (
                        <button
                            onClick={() => setActiveFilter(null)}
                            className="shrink-0 px-3 py-1 rounded-full text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                        >
                            Clear
                        </button>
                    )}
                </div>
            )}

            {/* Tabs Component - Posts | Carpetas | BostCrabb | Plans */}
            <div className="mt-2 border-t border-neutral-800">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="w-full justify-start rounded-none border-b border-neutral-800 bg-transparent p-0 overflow-x-auto no-scrollbar">
                        <TabsTrigger value="posts" className={tabTriggerClass}>
                            Posts
                        </TabsTrigger>
                        <TabsTrigger value="replies" className={tabTriggerClass}>
                            Replies
                        </TabsTrigger>
                        <TabsTrigger value="media" className={tabTriggerClass}>
                            Media
                        </TabsTrigger>
                        <TabsTrigger value="carpetas" className={tabTriggerClass}>
                            Carpetas
                        </TabsTrigger>
                        <TabsTrigger
                            value="bostcrabb"
                            className="shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent data-[state=active]:text-orange-500 px-8 py-4 text-neutral-400"
                        >
                            BostCrabb
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
                        <GlobalTimeline
                            filterUserId={profile.matrix_user_id}
                            filterType="all"
                            filterHashtag={activeFilter || undefined}
                        />
                    </TabsContent>

                    <TabsContent value="replies" className="p-0 m-0">
                        <GlobalTimeline filterUserId={profile.matrix_user_id} filterType="replies" />
                    </TabsContent>

                    <TabsContent value="media" className="p-0 m-0">
                        <GlobalTimeline filterUserId={profile.matrix_user_id} filterType="media" />
                    </TabsContent>

                    {/* Tab: Carpetas (Smart Media Folders) */}
                    <TabsContent value="carpetas" className="p-0 m-0">
                        {smartFolders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                                <FolderOpen className="w-16 h-16 text-neutral-600 mb-6" />
                                <h2 className="text-xl font-bold text-white mb-3">No Folders Yet</h2>
                                <p className="text-neutral-400 max-w-sm">
                                    Media posts tagged with hashtags will automatically appear as folders here.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
                                {smartFolders.map((folder) => (
                                    <button
                                        key={folder.tag}
                                        onClick={() => handleFolderClick(folder.tag)}
                                        className="group relative rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800 aspect-video text-left transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    >
                                        {/* Background Cover Image */}
                                        <div className="absolute inset-0">
                                            <MatrixMedia
                                                mxcUrl={folder.coverMxcUrl}
                                                alt={`#${folder.tag} cover`}
                                                className="w-full h-full object-cover brightness-50 group-hover:brightness-[0.4] transition-all"
                                            />
                                        </div>

                                        {/* Overlay Text */}
                                        <div className="absolute inset-0 flex flex-col justify-end p-4 bg-gradient-to-t from-black/60 to-transparent">
                                            <h3 className="text-white font-bold text-lg">#{folder.tag}</h3>
                                            <p className="text-neutral-300 text-sm">
                                                {folder.count} post{folder.count !== 1 ? 's' : ''}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    {/* Tab: BostCrabb (Coming Soon) */}
                    <TabsContent value="bostcrabb" className="p-0 m-0">
                        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                            <Gift className="w-16 h-16 text-orange-500 mb-6" />
                            <h2 className="text-2xl font-bold text-white mb-3">BostCrabb</h2>
                            <p className="text-neutral-400 max-w-sm">
                                Want to support your favorite creators? This is for you! Available soon.
                            </p>
                        </div>
                    </TabsContent>

                    {/* Tab: Plans */}
                    {profile.is_creator && (
                        <TabsContent value="plans" className="p-6">
                            {plans.length === 0 ? (
                                <div className="text-center text-neutral-500 py-12">No plans available yet.</div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {plans.map(plan => (
                                        <Card key={plan.id} className="bg-neutral-900 border-neutral-800 p-6 flex flex-col relative overflow-hidden">
                                            <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                                            <div className="text-3xl font-bold text-orange-500 mb-4">${plan.price} <span className="text-lg text-neutral-400 font-normal">/ month</span></div>
                                            {plan.description && <p className="text-sm text-neutral-300 mb-4">{plan.description}</p>}
                                            <ul className="text-sm text-neutral-300 space-y-2 mb-6 flex-1">
                                                {plan.perks?.map((perk: string, i: number) => (
                                                    <li key={i}>• {perk}</li>
                                                ))}
                                            </ul>
                                            <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold">Subscribe</Button>
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
