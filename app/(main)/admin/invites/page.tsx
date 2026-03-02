'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Copy, CheckCircle2, Ticket } from 'lucide-react';

interface WaitlistEntry {
    id: string;
    email: string;
    created_at: string;
    status: string;
}

export default function AdminInvitesPage() {
    const router = useRouter();
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
    const [generating, setGenerating] = useState<string | null>(null);
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
            const { data } = await supabase
                .from('waitlist')
                .select('*')
                .order('created_at', { ascending: false });

            if (data) setWaitlist(data);
            setLoading(false);
        };

        checkAccessAndLoad();
    }, [router, supabase]);

    const generateCode = async (email: string) => {
        setGenerating(email);

        // Generate random 8 char uppercase alphanumeric string
        const randomString = Math.random().toString(36).substring(2, 10).toUpperCase();
        const inviteCode = `CRAB-${randomString}`;

        try {
            const { error } = await supabase
                .from('invite_codes')
                .insert({ code: inviteCode });

            if (error) throw error;

            // Format message
            const message = `Welcome to Crabba! Use this code to register: ${inviteCode} at https://crabba.net/register`;

            await navigator.clipboard.writeText(message);
            setCopiedId(email);
            showToast('Invite code generated and copied!', 'success');

            // Reset copy icon after 3 seconds
            setTimeout(() => setCopiedId(null), 3000);

        } catch (err) {
            console.error('Failed to generate code:', err);
            showToast('Failed to generate code. Check console for details.', 'error');
        } finally {
            setGenerating(null);
        }
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
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-neutral-800 bg-neutral-900/50">
                        <h2 className="font-semibold text-white">Waitlist Queue ({waitlist.length})</h2>
                        <p className="text-sm text-neutral-400">Generate single-use invite codes for users waiting to join.</p>
                    </div>

                    {waitlist.length === 0 ? (
                        <div className="p-8 text-center text-neutral-500">
                            No one is on the waitlist right now.
                        </div>
                    ) : (
                        <div className="divide-y divide-neutral-800">
                            {waitlist.map((entry) => (
                                <div key={entry.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-800/50 transition-colors">
                                    <div>
                                        <div className="font-medium text-white">{entry.email}</div>
                                        <div className="text-xs text-neutral-500 mt-1">
                                            Joined: {new Date(entry.created_at).toLocaleDateString()} at {new Date(entry.created_at).toLocaleTimeString()}
                                        </div>
                                    </div>

                                    <Button
                                        onClick={() => generateCode(entry.email)}
                                        disabled={generating === entry.email}
                                        className={`shrink-0 transition-all ${copiedId === entry.email
                                            ? 'bg-green-600 hover:bg-green-700 text-white'
                                            : 'bg-white text-black hover:bg-neutral-200'
                                            }`}
                                    >
                                        {generating === entry.email ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : copiedId === entry.email ? (
                                            <CheckCircle2 className="w-4 h-4 mr-2" />
                                        ) : (
                                            <Copy className="w-4 h-4 mr-2" />
                                        )}
                                        {copiedId === entry.email ? 'Copied!' : 'Generate & Copy'}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
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
