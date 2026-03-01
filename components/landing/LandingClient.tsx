'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Shell, Sparkles, Lock, Globe, Palette, Zap, Gift } from 'lucide-react';

const FLOATING_TAGS = [
    { label: 'Open Source', angle: -30, distance: 180, delay: '0s' },
    { label: 'Anti-Censorship', angle: 15, distance: 200, delay: '0.5s' },
    { label: 'Total Privacy', angle: 60, distance: 170, delay: '1s' },
    { label: 'Decentralized', angle: 120, distance: 190, delay: '1.5s' },
    { label: 'Matrix Protocol', angle: 170, distance: 175, delay: '2s' },
    { label: 'For Artists', angle: 210, distance: 185, delay: '0.3s' },
];

export default function LandingClient() {
    const [email, setEmail] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleWaitlist = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) return;
        setLoading(true);
        setError(null);

        try {
            const supabase = createClient();
            const { error: insertError } = await supabase
                .from('waitlist')
                .insert({ email: email.trim().toLowerCase() });

            if (insertError) {
                if (insertError.code === '23505') {
                    setSubmitted(true); // Already on the list
                } else {
                    setError('Something went wrong. Please try again.');
                }
            } else {
                setSubmitted(true);
            }
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black text-white overflow-hidden">
            {/* Navigation */}
            <nav className="relative z-20 flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                        <span className="text-black font-bold text-lg">C</span>
                    </div>
                    <span className="text-xl font-bold">Crabba</span>
                </div>
                <Link
                    href="/login"
                    className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-full text-sm font-medium transition-colors"
                >
                    Sign In
                </Link>
            </nav>

            {/* Hero Section */}
            <section className="relative flex flex-col items-center justify-center text-center px-6 py-24 md:py-36">
                {/* Floating Tags */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    {FLOATING_TAGS.map((tag, i) => {
                        const x = Math.cos((tag.angle * Math.PI) / 180) * tag.distance;
                        const y = Math.sin((tag.angle * Math.PI) / 180) * tag.distance;
                        return (
                            <div
                                key={i}
                                className="absolute left-1/2 top-1/2 animate-pulse"
                                style={{
                                    transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                                    animationDelay: tag.delay,
                                    animationDuration: '3s',
                                }}
                            >
                                <span className="px-3 py-1.5 bg-orange-950/30 border border-orange-900/40 text-orange-400 rounded-full text-xs font-medium backdrop-blur-sm whitespace-nowrap">
                                    {tag.label}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Radial glow */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(234,88,12,0.08)_0%,transparent_70%)]" />

                {/* Crab Icon */}
                <div className="relative z-10 w-24 h-24 bg-gradient-to-br from-orange-600 to-amber-700 rounded-3xl flex items-center justify-center mb-8 shadow-2xl shadow-orange-900/30">
                    <Shell className="w-12 h-12 text-white" />
                </div>

                <h1 className="relative z-10 text-5xl md:text-7xl font-extrabold tracking-tight max-w-4xl leading-tight">
                    The Decentralized Canvas
                    <br />
                    <span className="bg-gradient-to-r from-orange-400 to-amber-500 bg-clip-text text-transparent">
                        for Creators.
                    </span>
                </h1>

                <p className="relative z-10 mt-6 text-lg md:text-xl text-zinc-400 max-w-2xl leading-relaxed">
                    A censorship-resistant social platform built on the Matrix protocol.
                    Where artists own their content, forever.
                </p>

                {/* Waitlist Form */}
                <div className="relative z-10 mt-10 w-full max-w-md">
                    {submitted ? (
                        <div className="flex items-center justify-center gap-2 px-6 py-4 bg-green-950/30 border border-green-800/50 rounded-2xl">
                            <Sparkles className="w-5 h-5 text-green-400" />
                            <p className="text-green-300 font-medium">You&apos;re on the list! We&apos;ll be in touch soon. 🦀</p>
                        </div>
                    ) : (
                        <form onSubmit={handleWaitlist} className="flex gap-2">
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="your@email.com"
                                required
                                className="flex-1 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                            />
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap"
                            >
                                {loading ? 'Joining...' : 'Join Waitlist'}
                            </button>
                        </form>
                    )}
                    {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
                    <p className="mt-3 text-xs text-zinc-600">Closed Beta — invite-only access coming soon</p>
                </div>
            </section>

            {/* Bento Feature Cards */}
            <section className="relative z-10 max-w-5xl mx-auto px-6 pb-24">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <BentoCard
                        icon={<Lock className="w-6 h-6 text-orange-400" />}
                        title="True Ownership"
                        description="Your posts live on the Matrix protocol. No platform can take them down."
                        className="md:col-span-2 lg:col-span-1"
                    />
                    <BentoCard
                        icon={<Globe className="w-6 h-6 text-orange-400" />}
                        title="Decentralized & Open"
                        description="Built on open standards. Federated, interoperable, and future-proof."
                    />
                    <BentoCard
                        icon={<Palette className="w-6 h-6 text-orange-400" />}
                        title="Smart Collections"
                        description="Organize your work into auto-generated folders based on hashtags."
                    />
                    <BentoCard
                        icon={<Gift className="w-6 h-6 text-orange-400" />}
                        title="BostCrabb Monetization"
                        description="Premium tiers, exclusive content, and direct fan support."
                        className="lg:col-span-2"
                    />
                    <BentoCard
                        icon={<Zap className="w-6 h-6 text-orange-400" />}
                        title="Real-Time Feed"
                        description="Live timeline powered by Matrix events. Instant reactions & threads."
                    />
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-zinc-900 py-8 px-6">
                <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-zinc-600">
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center">
                            <span className="text-black font-bold text-xs">C</span>
                        </div>
                        <span>© 2026 Crabba. All rights reserved.</span>
                    </div>
                    <div className="flex gap-6">
                        <a href="#" className="hover:text-zinc-400 transition-colors">Terms & Conditions</a>
                        <a href="#" className="hover:text-zinc-400 transition-colors">Privacy Policy</a>
                        <a href="#" className="hover:text-zinc-400 transition-colors">Community Rules</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}

function BentoCard({ icon, title, description, className = '' }: {
    icon: React.ReactNode;
    title: string;
    description: string;
    className?: string;
}) {
    return (
        <div className={`group p-6 bg-zinc-950 border border-zinc-900 rounded-2xl hover:border-zinc-800 transition-all duration-300 hover:bg-zinc-900/50 ${className}`}>
            <div className="w-12 h-12 bg-orange-950/30 border border-orange-900/30 rounded-xl flex items-center justify-center mb-4 group-hover:bg-orange-950/50 transition-colors">
                {icon}
            </div>
            <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">{description}</p>
        </div>
    );
}
