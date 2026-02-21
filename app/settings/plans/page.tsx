'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Loader2, Trash2 } from 'lucide-react';

export default function PlansSettingsPage() {
    const router = useRouter();
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [plans, setPlans] = useState<any[]>([]);
    const [user, setUser] = useState<any>(null);

    // New Plan Form State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [perksText, setPerksText] = useState(''); // Comma separated

    useEffect(() => {
        const fetchPlans = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUser(user);
                const { data } = await supabase
                    .from('creator_plans')
                    .select('*')
                    .eq('creator_id', user.id)
                    .order('price', { ascending: true });
                if (data) setPlans(data);
            }
            setLoading(false);
        };
        fetchPlans();
    }, [supabase]);

    const handleCreatePlan = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setSaving(true);

        const perksArray = perksText.split(',').map(p => p.trim()).filter(Boolean);

        const { data, error } = await supabase.from('creator_plans').insert({
            creator_id: user.id,
            name,
            description,
            price: parseFloat(price) || 0,
            perks: perksArray
        }).select();

        if (data && data.length > 0) {
            setPlans([...plans, data[0]].sort((a, b) => a.price - b.price));
            setName('');
            setDescription('');
            setPrice('');
            setPerksText('');
        }
        setSaving(false);
    };

    const handleDeletePlan = async (id: string) => {
        if (!confirm('Are you sure you want to delete this plan?')) return;
        await supabase.from('creator_plans').delete().eq('id', id);
        setPlans(plans.filter(p => p.id !== id));
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
                    <h1 className="text-2xl font-bold text-white mb-2">Subscription Plans</h1>
                    <p className="text-neutral-400">Create tiers for your closest supporters to pledge.</p>
                </div>

                <div className="space-y-6">
                    {plans.map((plan) => (
                        <Card key={plan.id} className="bg-neutral-900 border-neutral-800 p-6 flex justify-between items-start">
                            <div>
                                <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                                <div className="text-2xl font-bold text-blue-500 my-2">${plan.price} <span className="text-sm font-normal text-neutral-400">/ month</span></div>
                                <p className="text-neutral-300 text-sm mb-4">{plan.description}</p>
                                {plan.perks && plan.perks.length > 0 && (
                                    <ul className="text-sm text-neutral-400 space-y-1">
                                        {plan.perks.map((perk: string, i: number) => (
                                            <li key={i}>• {perk}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-500/10 hover:text-red-400" onClick={() => handleDeletePlan(plan.id)}>
                                <Trash2 className="w-5 h-5" />
                            </Button>
                        </Card>
                    ))}

                    <Card className="bg-neutral-900 border-neutral-800 p-6">
                        <h3 className="text-xl font-bold text-white mb-4">Add New Plan</h3>
                        <form onSubmit={handleCreatePlan} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-white">Plan Name</Label>
                                    <Input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Tip Jar" className="bg-black/50 border-neutral-800 text-white" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-white">Price ($ USD)</Label>
                                    <Input required type="number" step="1" min="1" value={price} onChange={e => setPrice(e.target.value)} placeholder="5" className="bg-black/50 border-neutral-800 text-white" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-white">Description</Label>
                                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Short pitch for this tier" className="bg-black/50 border-neutral-800 text-white" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-white">Perks (Comma separated)</Label>
                                <Input value={perksText} onChange={e => setPerksText(e.target.value)} placeholder="Discord Access, Work in Progress, HD Downloads" className="bg-black/50 border-neutral-800 text-white" />
                            </div>
                            <Button type="submit" disabled={saving || !name || !price} className="w-full bg-blue-600 hover:bg-blue-700 font-bold">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                Create Plan
                            </Button>
                        </form>
                    </Card>
                </div>
            </div>
        </AppShell>
    );
}
