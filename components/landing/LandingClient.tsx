'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Sparkles, Lock, Globe, Palette, Zap, Gift, Eye, Hash, Heart, MessageSquare, Repeat } from 'lucide-react';

const FLOATING_TAGS = [
    { label: 'Open Source', top: '8%', left: '8%', rotate: '-6deg', bg: 'bg-orange-950/40', border: 'border-orange-800/50', text: 'text-orange-300' },
    { label: 'Anti-Censorship', top: '15%', right: '10%', rotate: '4deg', bg: 'bg-rose-950/40', border: 'border-rose-800/50', text: 'text-rose-300' },
    { label: 'Total Privacy', top: '55%', left: '5%', rotate: '3deg', bg: 'bg-violet-950/40', border: 'border-violet-800/50', text: 'text-violet-300' },
    { label: 'Decentralized', top: '60%', right: '6%', rotate: '-5deg', bg: 'bg-emerald-950/40', border: 'border-emerald-800/50', text: 'text-emerald-300' },
    { label: 'Matrix Protocol', top: '35%', left: '3%', rotate: '-3deg', bg: 'bg-sky-950/40', border: 'border-sky-800/50', text: 'text-sky-300' },
    { label: 'For Artists ✨', top: '30%', right: '4%', rotate: '6deg', bg: 'bg-amber-950/40', border: 'border-amber-800/50', text: 'text-amber-300' },
    { label: '(◕‿◕)', top: '75%', left: '15%', rotate: '8deg', bg: 'bg-pink-950/40', border: 'border-pink-800/50', text: 'text-pink-300' },
    { label: '♡ Art', top: '78%', right: '12%', rotate: '-4deg', bg: 'bg-orange-950/40', border: 'border-orange-800/50', text: 'text-orange-300' },
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
                    setSubmitted(true);
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
            <nav className="relative z-30 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-900/20">
                        <span className="text-white font-black text-lg">C</span>
                    </div>
                    <span className="text-xl font-bold tracking-tight">Crabba</span>
                    <span className="px-2 py-0.5 bg-orange-950/50 border border-orange-800/40 rounded-full text-[10px] text-orange-400 font-semibold tracking-wider uppercase">Beta</span>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        href="/login"
                        className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-full text-sm font-medium transition-all hover:border-zinc-700"
                    >
                        Sign In
                    </Link>
                </div>
            </nav>

            {/* Hero Section with Kawaii Floating Tags */}
            <section className="relative flex flex-col items-center justify-center text-center px-6 pt-16 pb-28 md:pt-24 md:pb-40 min-h-[85vh]">
                {/* Radial orange glow */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(234,88,12,0.06)_0%,transparent_60%)]" />
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-orange-600/5 rounded-full blur-3xl" />

                {/* Floating Kawaii Tags — scattered with rotations */}
                {FLOATING_TAGS.map((tag, i) => (
                    <div
                        key={i}
                        className="absolute z-20 hidden md:block animate-float"
                        style={{
                            top: tag.top,
                            left: tag.left,
                            right: tag.right,
                            transform: `rotate(${tag.rotate})`,
                            animationDelay: `${i * 0.4}s`,
                        } as React.CSSProperties}
                    >
                        <span className={`px-4 py-2 ${tag.bg} border ${tag.border} ${tag.text} rounded-full text-sm font-medium backdrop-blur-md shadow-lg whitespace-nowrap`}>
                            {tag.label}
                        </span>
                    </div>
                ))}

                {/* Crab Centerpiece */}
                <div className="relative z-10 mb-10">
                    <div className="w-28 h-28 bg-gradient-to-br from-orange-500 via-orange-600 to-amber-700 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-orange-800/30 ring-1 ring-orange-500/20">
                        <span className="text-5xl">🦀</span>
                    </div>
                    <div className="absolute -inset-4 bg-orange-500/10 rounded-[2.5rem] blur-xl -z-10" />
                </div>

                <h1 className="relative z-10 text-5xl sm:text-6xl md:text-8xl font-black tracking-tighter max-w-5xl leading-[0.95]">
                    The Decentralized
                    <br />
                    <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500 bg-clip-text text-transparent">
                        Canvas for Creators
                    </span>
                </h1>

                <p className="relative z-10 mt-7 text-lg md:text-xl text-zinc-400 max-w-2xl leading-relaxed font-light">
                    A censorship-resistant social platform built on the Matrix protocol.
                    <br className="hidden sm:block" />
                    Where artists own their content, <span className="text-orange-400 font-medium">forever.</span>
                </p>

                {/* Waitlist Form */}
                <div className="relative z-10 mt-12 w-full max-w-lg">
                    {submitted ? (
                        <div className="flex items-center justify-center gap-3 px-6 py-5 bg-green-950/30 border border-green-800/40 rounded-2xl backdrop-blur-sm">
                            <Sparkles className="w-5 h-5 text-green-400 shrink-0" />
                            <p className="text-green-300 font-medium">You&apos;re on the list! We&apos;ll be in touch soon. 🦀</p>
                        </div>
                    ) : (
                        <form onSubmit={handleWaitlist} className="flex gap-3">
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="your@email.com"
                                required
                                className="flex-1 px-5 py-3.5 bg-zinc-900/80 border border-zinc-800 rounded-2xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-600 transition-all backdrop-blur-sm text-base"
                            />
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-8 py-3.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold rounded-2xl transition-all disabled:opacity-50 whitespace-nowrap shadow-lg shadow-orange-900/30 hover:shadow-orange-800/40 text-base"
                            >
                                {loading ? 'Joining...' : 'Join Waitlist'}
                            </button>
                        </form>
                    )}
                    {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
                    <p className="mt-4 text-xs text-zinc-600">Closed Beta — invite-only access for creators</p>
                </div>
            </section>

            {/* Bento Feature Section */}
            <section className="relative z-10 max-w-6xl mx-auto px-6 pb-32">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
                        Built for <span className="text-orange-400">artists</span>, by artists
                    </h2>
                    <p className="mt-3 text-zinc-500 max-w-xl mx-auto">A platform that respects your work, your audience, and your freedom.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    {/* Card 1 — Large (9:16 Art Preview) */}
                    <div className="md:col-span-4 group p-8 bg-zinc-950/60 border border-zinc-900 rounded-3xl hover:border-zinc-800 transition-all duration-500 overflow-hidden relative">
                        <div className="flex gap-6 items-start">
                            <div className="flex-1">
                                <div className="w-11 h-11 bg-orange-950/40 border border-orange-900/30 rounded-xl flex items-center justify-center mb-5 group-hover:bg-orange-950/60 transition-colors">
                                    <Eye className="w-5 h-5 text-orange-400" />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">9:16 Vertical Art Feed</h3>
                                <p className="text-zinc-400 text-sm leading-relaxed max-w-sm">Upload vertical webcomics, portraits, and manga panels in full 9:16 glory. No cropping, no compression.</p>
                            </div>
                            {/* Mock feed post */}
                            <div className="hidden lg:block w-48 bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden shrink-0 shadow-xl">
                                <div className="p-3 flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-pink-500" />
                                    <div className="flex-1">
                                        <div className="w-16 h-2 bg-zinc-700 rounded-full" />
                                        <div className="w-10 h-1.5 bg-zinc-800 rounded-full mt-1" />
                                    </div>
                                </div>
                                <div className="w-full aspect-[9/16] bg-gradient-to-br from-violet-900/60 via-pink-900/40 to-orange-900/60 flex items-center justify-center">
                                    <span className="text-4xl opacity-60">🎨</span>
                                </div>
                                <div className="p-3 flex justify-between">
                                    <Heart className="w-3.5 h-3.5 text-zinc-600" />
                                    <MessageSquare className="w-3.5 h-3.5 text-zinc-600" />
                                    <Repeat className="w-3.5 h-3.5 text-zinc-600" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Card 2 — Smart Collections */}
                    <div className="md:col-span-2 group p-7 bg-zinc-950/60 border border-zinc-900 rounded-3xl hover:border-zinc-800 transition-all duration-500">
                        <div className="w-11 h-11 bg-orange-950/40 border border-orange-900/30 rounded-xl flex items-center justify-center mb-5 group-hover:bg-orange-950/60 transition-colors">
                            <Hash className="w-5 h-5 text-orange-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Smart Collections</h3>
                        <p className="text-zinc-400 text-sm leading-relaxed">Auto-generated folders from your hashtags. Your work, organized beautifully.</p>
                        {/* Mock folder pills */}
                        <div className="flex flex-wrap gap-2 mt-5">
                            {['#art', '#manga', '#oc', '#fanart'].map(tag => (
                                <span key={tag} className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-xs text-zinc-400">{tag}</span>
                            ))}
                        </div>
                    </div>

                    {/* Card 3 — BostCrabb Monetization */}
                    <div className="md:col-span-3 group p-7 bg-zinc-950/60 border border-zinc-900 rounded-3xl hover:border-zinc-800 transition-all duration-500 relative overflow-hidden">
                        <div className="w-11 h-11 bg-orange-950/40 border border-orange-900/30 rounded-xl flex items-center justify-center mb-5 group-hover:bg-orange-950/60 transition-colors">
                            <Gift className="w-5 h-5 text-orange-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">BostCrabb Monetization</h3>
                        <p className="text-zinc-400 text-sm leading-relaxed">Premium tiers, exclusive content, and direct fan support. Your art, your rules.</p>
                        {/* Mock locked content */}
                        <div className="mt-5 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl relative overflow-hidden">
                            <div className="blur-sm pointer-events-none">
                                <div className="w-full h-20 bg-gradient-to-r from-pink-900/30 to-violet-900/30 rounded-lg" />
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900/90 border border-zinc-700 rounded-full">
                                    <Lock className="w-3.5 h-3.5 text-orange-400" />
                                    <span className="text-xs text-zinc-300 font-medium">Premium Content</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Card 4 — Decentralized */}
                    <div className="md:col-span-3 group p-7 bg-zinc-950/60 border border-zinc-900 rounded-3xl hover:border-zinc-800 transition-all duration-500">
                        <div className="flex gap-5">
                            <div>
                                <div className="w-11 h-11 bg-orange-950/40 border border-orange-900/30 rounded-xl flex items-center justify-center mb-5 group-hover:bg-orange-950/60 transition-colors">
                                    <Globe className="w-5 h-5 text-orange-400" />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">Truly Decentralized</h3>
                                <p className="text-zinc-400 text-sm leading-relaxed">Built on the Matrix protocol. Federated, open-source, and censorship-resistant. No single point of failure.</p>
                            </div>
                            <div className="hidden sm:flex flex-col items-center gap-2 shrink-0 mt-2">
                                <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center">
                                    <Zap className="w-4 h-4 text-orange-400" />
                                </div>
                                <div className="w-px h-6 bg-zinc-800" />
                                <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center">
                                    <Lock className="w-4 h-4 text-emerald-400" />
                                </div>
                                <div className="w-px h-6 bg-zinc-800" />
                                <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center">
                                    <Palette className="w-4 h-4 text-violet-400" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-zinc-900/80 py-10 px-6">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-zinc-600">
                    <div className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex items-center justify-center">
                            <span className="text-white font-bold text-xs">C</span>
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

            {/* Custom CSS for floating animation */}
            <style jsx>{`
                @keyframes float {
                    0%, 100% { transform: translateY(0px) rotate(var(--rotate, 0deg)); }
                    50% { transform: translateY(-8px) rotate(var(--rotate, 0deg)); }
                }
                .animate-float {
                    animation: float 4s ease-in-out infinite;
                }
            `}</style>
        </div>
    );
}
