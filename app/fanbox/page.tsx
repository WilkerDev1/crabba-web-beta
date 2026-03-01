'use client';

import { AppShell } from '@/components/layout/AppShell';
import { Gift } from 'lucide-react';

export default function FanboxPage() {
    return (
        <AppShell>
            <div className="sticky top-0 z-10 backdrop-blur-md bg-black/70 border-b border-neutral-800 p-4">
                <h1 className="text-xl font-bold text-white">BostCrabb</h1>
            </div>

            <div className="flex flex-col items-center justify-center py-32 px-6 text-center">
                <Gift className="w-20 h-20 text-orange-500 mb-8" />
                <h2 className="text-3xl font-bold text-white mb-4">BostCrabb</h2>
                <p className="text-neutral-400 text-lg max-w-md">
                    Want to support your favorite creators? This is for you! Available soon.
                </p>
            </div>
        </AppShell>
    );
}
