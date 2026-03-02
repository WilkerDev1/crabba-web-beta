'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Copy, CheckCircle2, Ticket } from 'lucide-react';

interface WaitlistEntry {
    id: string;
    email: string;
    created_at: string;
    status: string;
}

interface InviteCode {
    id: string;
    code: string;
    is_used: boolean;
    created_at: string;
    used_by_email: string | null;
    max_uses: number;
    current_uses: number;
}

export default function AdminInvitesPage() {
    const router = useRouter();
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [waitlistUsers, setWaitlistUsers] = useState<WaitlistEntry[]>([]);
    const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);

    const [customCodeName, setCustomCodeName] = useState('');
    const [maxUses, setMaxUses] = useState<number>(1);
    const [creating, setCreating] = useState(false);

    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        const checkAccessAndLoad = async () => {
            const { data: { user } } = await supabase.auth.getUser();

            if (!user || (user.email !== 'wilkersandraw@gmail.com' && user.user_metadata?.username !== 'ishiro')) {
                router.replace('/explore');
                return;
            }

            // Fetch waitlist
            const { data: waitlistData } = await supabase
                .from('waitlist')
                .select('*')
                .order('created_at', { ascending: false });

            // Fetch invite codes
            const { data: inviteData } = await supabase
                .from('invite_codes')
                .select('*')
                .order('created_at', { ascending: false });

            if (waitlistData) {
                setWaitlistUsers(waitlistData);
            }
            if (inviteData) {
                setInviteCodes(inviteData);
            }
            setLoading(false);
        };

        checkAccessAndLoad();
    }, [router, supabase]);

    const handleCreateCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);

        const code = customCodeName.trim().toUpperCase() || `CRAB-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

        try {
            const { data, error } = await supabase
                .from('invite_codes')
                .insert({ code, max_uses: maxUses })
                .select()
                .single();

            if (error) throw error;

            setInviteCodes([data, ...inviteCodes]);
            setCustomCodeName('');
            setMaxUses(1);

            // Format message
            const message = `Welcome to Crabba! Use this code to register: ${code} at https://crabba.net/register`;

            await navigator.clipboard.writeText(message);
            setCopiedId(code);
            showToast('Invite code generated and copied!', 'success');

            // Reset copy icon after 3 seconds
            setTimeout(() => setCopiedId(null), 3000);

        } catch (err: any) {
            console.error('Failed to generate code:', err);
            showToast(err?.message || 'Failed to generate code.', 'error');
        } finally {
            setCreating(false);
        }
    };

    const copyCode = async (code: string) => {
        const message = `Welcome to Crabba! Use this code to register: ${code} at https://crabba.net/register`;
        await navigator.clipboard.writeText(message);
        setCopiedId(code);
        showToast('Code copied!', 'success');
        setTimeout(() => setCopiedId(null), 3000);
    };

    if (loading) {
        return (
            <AppShell>
                <div className="flex justify-center p-12">
                    <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell>
            <div className="sticky top-0 z-10 backdrop-blur-md bg-black/70 border-b border-neutral-800 p-4 flex items-center justify-between">
                <h1 className="font-bold text-xl text-white flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-orange-500" />
                    VIP Invites Dashboard
                </h1>
            </div>

            <div className="p-4 max-w-4xl mx-auto">
                <Tabs defaultValue="invites" className="w-full">
                    <div className="flex justify-center mb-6">
                        <TabsList>
                            <TabsTrigger value="invites" className="w-32">Invite Codes</TabsTrigger>
                            <TabsTrigger value="waitlist" className="w-32">Waitlist</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="invites" className="mt-0 space-y-4">
                        {/* Creation Form */}
                        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden p-6">
                            <h2 className="font-semibold text-white mb-1">Create VIP Invite Code</h2>
                            <p className="text-sm text-neutral-400 mb-6">Generate custom or random invite codes with usage limits.</p>

                            <form onSubmit={handleCreateCode} className="flex flex-col sm:flex-row gap-4 items-end">
                                <div className="space-y-2 flex-grow">
                                    <Label className="text-sm font-medium text-neutral-300">Custom Code Name (Optional)</Label>
                                    <Input
                                        placeholder="e.g. CRABBA-BETA"
                                        value={customCodeName}
                                        onChange={(e) => setCustomCodeName(e.target.value.toUpperCase())}
                                        className="bg-neutral-800 border-neutral-700"
                                    />
                                </div>
                                <div className="space-y-2 w-32 shrink-0">
                                    <Label className="text-sm font-medium text-neutral-300">Max Uses</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={maxUses}
                                        onChange={(e) => setMaxUses(parseInt(e.target.value) || 1)}
                                        className="bg-neutral-800 border-neutral-700"
                                        required
                                    />
                                </div>
                                <Button type="submit" disabled={creating} className="w-full sm:w-auto mt-4 sm:mt-0 font-medium">
                                    {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Ticket className="w-4 h-4 mr-2" />}
                                    Create Code
                                </Button>
                            </form>
                        </div>

                        {/* List Area */}
                        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                            <div className="p-4 border-b border-neutral-800 bg-neutral-900/50">
                                <h2 className="font-semibold text-white">Active Codes ({inviteCodes.length})</h2>
                            </div>

                            {inviteCodes.length === 0 ? (
                                <div className="p-8 text-center text-neutral-500">
                                    No invite codes generated yet.
                                </div>
                            ) : (
                                <div className="divide-y divide-neutral-800">
                                    {inviteCodes.map((invite) => {
                                        const isExhausted = invite.current_uses >= invite.max_uses;

                                        return (
                                            <div key={invite.id} className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${isExhausted ? 'opacity-50 bg-neutral-900/40' : 'hover:bg-neutral-800/50'}`}>
                                                <div>
                                                    <div className="font-medium text-white font-mono text-lg">{invite.code}</div>
                                                    <div className="text-xs text-neutral-500 mt-1">
                                                        Created: {new Date(invite.created_at).toLocaleDateString()}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-6">
                                                    {/* Usage Stats (Current / Max) */}
                                                    <div className="text-right shrink-0">
                                                        <div className="text-xs text-neutral-500">Usage</div>
                                                        <div className={`font-semibold ${isExhausted ? 'text-red-400' : 'text-green-400'}`}>
                                                            {invite.current_uses} / {invite.max_uses}
                                                        </div>
                                                    </div>

                                                    <Button
                                                        variant="outline"
                                                        onClick={() => copyCode(invite.code)}
                                                        className={`shrink-0 transition-all ${copiedId === invite.code
                                                            ? 'bg-green-600 hover:bg-green-700 text-white border-green-600'
                                                            : 'bg-neutral-800 hover:bg-neutral-700 text-white border-neutral-700'
                                                            }`}
                                                    >
                                                        {copiedId === invite.code ? (
                                                            <CheckCircle2 className="w-4 h-4 mr-2" />
                                                        ) : (
                                                            <Copy className="w-4 h-4 mr-2" />
                                                        )}
                                                        {copiedId === invite.code ? 'Copied' : 'Copy'}
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="waitlist" className="mt-0">
                        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                            <div className="p-4 border-b border-neutral-800 bg-neutral-900/50">
                                <h2 className="font-semibold text-white">Waitlist Users ({waitlistUsers.length})</h2>
                                <p className="text-sm text-neutral-400">View users who have registered on the waitlist.</p>
                            </div>

                            {waitlistUsers.length === 0 ? (
                                <div className="p-8 text-center text-neutral-500">
                                    No users in the waitlist yet.
                                </div>
                            ) : (
                                <div className="divide-y divide-neutral-800">
                                    {waitlistUsers.map((user) => (
                                        <div key={user.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-800/50 transition-colors">
                                            <div>
                                                <div className="font-medium text-white">{user.email}</div>
                                            </div>
                                            <div className="text-sm text-neutral-500 shrink-0">
                                                Joined: {new Date(user.created_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {toast && (
                <div className={`fixed bottom-4 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center gap-3 transition-all animate-in slide-in-from-bottom-5 ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                    }`}>
                    {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : null}
                    <p className="font-medium text-sm">{toast.message}</p>
                </div>
            )}
        </AppShell>
    );
}
