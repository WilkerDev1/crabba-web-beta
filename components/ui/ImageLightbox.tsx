'use client';

import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface ImageLightboxProps {
    srcs: string[];
    initialIndex?: number;
    alt?: string;
    open: boolean;
    onClose: () => void;
}

export function ImageLightbox({ srcs, initialIndex = 0, alt = "Image", open, onClose }: ImageLightboxProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);

    useEffect(() => {
        if (open) setCurrentIndex(initialIndex);
    }, [open, initialIndex]);

    const handlePrevious = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : srcs.length - 1));
    }, [srcs.length]);

    const handleNext = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        setCurrentIndex((prev) => (prev < srcs.length - 1 ? prev + 1 : 0));
    }, [srcs.length]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowLeft' && srcs.length > 1) handlePrevious();
        if (e.key === 'ArrowRight' && srcs.length > 1) handleNext();
    }, [onClose, srcs.length, handlePrevious, handleNext]);

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
            <div className="relative flex items-center justify-center w-full h-full max-w-[90vw] max-h-[90vh]">
                {srcs.length > 1 && (
                    <button
                        className="absolute left-4 z-10 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors animate-in fade-in zoom-in-50"
                        onClick={handlePrevious}
                        aria-label="Previous image"
                    >
                        <ChevronLeft className="w-8 h-8" />
                    </button>
                )}

                <img
                    key={currentIndex} // forces re-render/animation on change
                    src={srcs[currentIndex]}
                    alt={`${alt} ${currentIndex + 1}`}
                    className="max-h-full max-w-full object-contain rounded-lg shadow-2xl cursor-default animate-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                />

                {srcs.length > 1 && (
                    <button
                        className="absolute right-4 z-10 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors animate-in fade-in zoom-in-50"
                        onClick={handleNext}
                        aria-label="Next image"
                    >
                        <ChevronRight className="w-8 h-8" />
                    </button>
                )}
            </div>

            {/* Pagination dots if multiple */}
            {srcs.length > 1 && (
                <div className="absolute bottom-6 flex gap-2 z-10" onClick={(e) => e.stopPropagation()}>
                    {srcs.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); }}
                            className={`w-2.5 h-2.5 rounded-full transition-all ${idx === currentIndex ? 'bg-white scale-125' : 'bg-white/40 hover:bg-white/60'}`}
                            aria-label={`Go to slide ${idx + 1}`}
                        />
                    ))}
                </div>
            )}
        </div>,
        document.body
    );
}
