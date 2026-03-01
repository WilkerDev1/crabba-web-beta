'use client';

import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ImageLightboxProps {
    src: string;
    alt: string;
    open: boolean;
    onClose: () => void;
}

export function ImageLightbox({ src, alt, open, onClose }: ImageLightboxProps) {
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    }, [onClose]);

    useEffect(() => {
        if (!open) return;
        document.addEventListener('keydown', handleKeyDown);
        // Prevent body scroll while lightbox is open
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [open, handleKeyDown]);

    if (!open) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md cursor-zoom-out animate-in fade-in duration-200"
            onClick={onClose}
        >
            {/* Close button */}
            <button
                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
                onClick={onClose}
                aria-label="Close"
            >
                <X className="w-6 h-6" />
            </button>

            {/* Full image */}
            <img
                src={src}
                alt={alt}
                className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl cursor-default animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            />
        </div>,
        document.body
    );
}
