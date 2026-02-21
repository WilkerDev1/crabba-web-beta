'use client';

import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LockedContentOverlayProps {
    accessLevel: string;
    price?: number;
    onUnlockClick?: () => void;
}

export function LockedContentOverlay({ accessLevel, price, onUnlockClick }: LockedContentOverlayProps) {
    return (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-2xl flex flex-col items-center justify-center z-10 p-6 text-center select-none">
            <Lock className="w-8 h-8 text-neutral-400 mb-3" />
            <h3 className="text-white font-bold mb-1">
                {accessLevel === 'premium' ? 'Premium Content' : 'Locked Content'}
            </h3>
            <p className="text-sm text-neutral-400 mb-4">
                {price ? `Unlock this post for $${price.toFixed(2)}` : 'Join the creator\'s tier to unlock this post.'}
            </p>
            <Button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUnlockClick?.(); }}
                className="bg-orange-500 hover:bg-orange-600 text-white w-full max-w-[200px] rounded-full font-bold"
            >
                {price ? `Unlock for $${price.toFixed(2)}` : 'View Plans'}
            </Button>
        </div>
    );
}
