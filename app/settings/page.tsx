'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

export default function SettingsPage() {
    const router = useRouter();
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const [form, setForm] = useState({
        username: '',
        bio: '',
        avatar_url: '',
        banner_url: ''
    });

    useEffect(() => {
        const loadProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('username, bio, avatar_url, banner_url')
                    .eq('id', user.id)
                    .single();

                if (profileData) {
                    setForm({
                        username: profileData.username || '',
                        bio: profileData.bio || '',
                        avatar_url: profileData.avatar_url || '',
                        banner_url: profileData.banner_url || ''
                    });
                }
            }
            setLoading(false);
        };
        loadProfile();
    }, [supabase]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setSuccessMsg(null);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setError('You must be logged in.');
            setSaving(false);
            return;
        }

        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                username: form.username,
                bio: form.bio,
                avatar_url: form.avatar_url,
                banner_url: form.banner_url
            })
            .eq('id', user.id);

        if (updateError) {
            setError(updateError.message);
        } else {
            setSuccessMsg('Profile updated successfully!');
            router.refresh(); // Refresh to update AppShell context
        }
        setSaving(false);
    };

    if (loading) {
        return (
            <AppShell>
                <div className="flex items-center justify-center h-48">
                    <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell>
            <div className="max-w-2xl mx-auto p-4 sm:p-6 lg:p-8">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-white mb-2">Profile Settings</h1>
                    <p className="text-neutral-400">Customize your public profile appearance.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="username" className="text-white">Display Name</Label>
                        <Input
                            id="username"
                            value={form.username}
                            onChange={(e) => setForm({ ...form, username: e.target.value })}
                            placeholder="Your display name"
                            className="bg-neutral-900 border-neutral-800 text-white focus-visible:ring-blue-500"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="bio" className="text-white">Bio</Label>
                        <Textarea
                            id="bio"
                            value={form.bio}
                            onChange={(e) => setForm({ ...form, bio: e.target.value })}
                            placeholder="Tell us about yourself..."
                            className="bg-neutral-900 border-neutral-800 text-white min-h-[100px] focus-visible:ring-blue-500"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="avatar_url" className="text-white">Avatar Image URL</Label>
                        <Input
                            id="avatar_url"
                            value={form.avatar_url}
                            onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
                            placeholder="https://example.com/avatar.png"
                            className="bg-neutral-900 border-neutral-800 text-white focus-visible:ring-blue-500"
                        />
                        <p className="text-xs text-neutral-500">Provide a direct link to a hosted image.</p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="banner_url" className="text-white">Banner Image URL</Label>
                        <Input
                            id="banner_url"
                            value={form.banner_url}
                            onChange={(e) => setForm({ ...form, banner_url: e.target.value })}
                            placeholder="https://example.com/banner.png"
                            className="bg-neutral-900 border-neutral-800 text-white focus-visible:ring-blue-500"
                        />
                        <p className="text-xs text-neutral-500">Recommended size: 1500x500 pixels.</p>
                    </div>

                    {error && (
                        <div className="p-3 rounded bg-red-500/10 border border-red-500/50 text-red-500 text-sm">
                            {error}
                        </div>
                    )}

                    {successMsg && (
                        <div className="p-3 rounded bg-green-500/10 border border-green-500/50 text-green-500 text-sm">
                            {successMsg}
                        </div>
                    )}

                    <Button
                        type="submit"
                        disabled={saving}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                Saving...
                            </>
                        ) : (
                            'Save Changes'
                        )}
                    </Button>
                </form>
            </div>
        </AppShell>
    );
}
