'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function CreatorOnboardingPage() {
    const router = useRouter();
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [user, setUser] = useState<any>(null);
    const [profile, setProfile] = useState<any>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUser(user);
                const { data } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();
                if (data) {
                    setProfile(data);
                    // If already a creator, redirect them to settings
                    if (data.is_creator && data.accepted_creator_tos) {
                        router.push('/settings/plans');
                    }
                }
            } else {
                router.push('/login');
            }
            setLoading(false);
        };
        fetchProfile();
    }, [supabase, router]);

    const handleAcceptAndActivate = async () => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    is_creator: true,
                    accepted_creator_tos: true
                })
                .eq('id', user.id);

            if (error) throw error;
            router.push('/settings/plans');
        } catch (err: any) {
            alert('Failed to activate creator account: ' + err.message);
            setSaving(false);
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

    return (
        <AppShell>
            <div className="max-w-2xl mx-auto p-4 sm:p-6 lg:p-8">
                <div className="text-center mb-10 mt-8">
                    <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-pink-500 mb-4">
                        Become a Crabba Creator
                    </h1>
                    <p className="text-neutral-400 text-lg max-w-lg mx-auto">
                        Monetize your artwork, connect directly with your biggest fans, and build your own custom-tailored Fanbox.
                    </p>
                </div>

                <Card className="bg-neutral-900 border-neutral-800 p-8">
                    <div className="space-y-6">
                        <div className="flex items-start gap-4">
                            <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0 mt-1" />
                            <div>
                                <h3 className="text-white font-bold text-lg mb-1">Set Your Own Subscription Tiers</h3>
                                <p className="text-neutral-400 text-sm">Create plans for your fans to support you monthly.</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-4">
                            <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0 mt-1" />
                            <div>
                                <h3 className="text-white font-bold text-lg mb-1">Upload Premium Collections</h3>
                                <p className="text-neutral-400 text-sm">Organize your exclusive posts into distinct folders that only subscribers can see.</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-4">
                            <ShieldAlert className="w-6 h-6 text-orange-500 shrink-0 mt-1" />
                            <div>
                                <h3 className="text-white font-bold text-lg mb-1">Creator Terms of Service</h3>
                                <p className="text-neutral-400 text-sm mb-2">
                                    By proceeding, you agree that you hold the legal copyright for any material you monetize on this platform, and you will abide by out Acceptable Use Policy regarding prohibited content.
                                </p>
                            </div>
                        </div>

                        <div className="pt-6 border-t border-neutral-800">
                            <Button
                                onClick={handleAcceptAndActivate}
                                disabled={saving}
                                className="w-full bg-gradient-to-r from-orange-500 to-pink-500 hover:opacity-90 text-white font-bold py-6 text-lg"
                            >
                                {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                                Accept Terms & Launch Fanbox
                            </Button>
                        </div>
                    </div>
                </Card>
            </div>
        </AppShell>
    );
}
