'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Loader2, Trash2, FolderSync } from 'lucide-react';

export default function CollectionsSettingsPage() {
    const router = useRouter();
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [collections, setCollections] = useState<any[]>([]);
    const [user, setUser] = useState<any>(null);
    const [profile, setProfile] = useState<any>(null);

    // New Collection Form State
    const [name, setName] = useState('');

    useEffect(() => {
        const fetchCollections = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUser(user);

                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                if (profileData && !profileData.is_creator) {
                    router.push('/fanbox/onboarding');
                    return;
                }

                setProfile(profileData);

                const { data } = await supabase
                    .from('collections')
                    .select('*')
                    .eq('creator_id', user.id)
                    .order('created_at', { ascending: false });
                if (data) setCollections(data);
            } else {
                router.push('/login');
            }
            setLoading(false);
        };
        fetchCollections();
    }, [supabase, router]);

    const handleCreateCollection = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !name.trim()) return;
        setSaving(true);

        const { data, error } = await supabase.from('collections').insert({
            creator_id: user.id,
            name: name.trim()
        }).select();

        if (data && data.length > 0) {
            setCollections([data[0], ...collections]);
            setName('');
        }
        setSaving(false);
    };

    const handleDeleteCollection = async (id: string) => {
        if (!confirm('Are you sure you want to delete this folder? Posts will not be deleted.')) return;
        await supabase.from('collections').delete().eq('id', id);
        setCollections(collections.filter(c => c.id !== id));
    };

    if (loading) {
        return (
            <AppShell>
                <div className="flex h-48 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-neutral-500" />
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell>
            <div className="max-w-2xl mx-auto p-4 sm:p-6 lg:p-8">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-white mb-2">Mini-Folders</h1>
                    <p className="text-neutral-400">Organize your work into neat collections for your BostCrabb.</p>
                </div>

                <div className="space-y-6">
                    <Card className="bg-neutral-900 border-neutral-800 p-6">
                        <form onSubmit={handleCreateCollection} className="flex gap-4 items-end">
                            <div className="flex-1 space-y-2">
                                <Label className="text-white">Folder Name</Label>
                                <Input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sketches, Comics, Brushes" className="bg-black/50 border-neutral-800 text-white" />
                            </div>
                            <Button type="submit" disabled={saving || !name.trim()} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-8">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                            </Button>
                        </form>
                    </Card>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {collections.map((collection) => (
                            <div key={collection.id} className="flex items-center justify-between bg-neutral-900 border border-neutral-800 p-4 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-neutral-800 rounded-lg text-orange-500">
                                        <FolderSync className="w-5 h-5" />
                                    </div>
                                    <span className="font-bold text-white">{collection.name}</span>
                                </div>
                                <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-500/10" onClick={() => handleDeleteCollection(collection.id)}>
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
