"use client";

import React, { useState, useEffect } from 'react';

interface MediaItem {
    url: string;
    type?: string;
}

interface MatrixMediaProps {
    mxcUrl?: string; // Legacy fallback
    mediaItems?: MediaItem[]; // New multi-media array
    alt?: string;
    className?: string;
    isVideo?: boolean; // Legacy fallback
    onBlobReady?: (blobUrl: string, index?: number) => void;
    onClick?: (e: React.MouseEvent, index?: number) => void;
}

/**
 * Single media fetcher that securely resolves mxc URIs.
 * Fetches Matrix media securely using the authenticated V1 endpoint.
 * Works for both logged-in users (localStorage token) and guests (sessionStorage token).
 * Falls back to error state if no token is available at all.
 */
function SingleMatrixMedia({ mxcUrl, alt, className, isVideo = false, onBlobReady, onClick, index }: { mxcUrl: string, alt?: string, className?: string, isVideo?: boolean, onBlobReady?: (url: string, index?: number) => void, onClick?: (e: React.MouseEvent, index?: number) => void, index?: number }) {
    const [imgSrc, setImgSrc] = useState<string | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!mxcUrl || !mxcUrl.startsWith('mxc://')) return;

        let revoke: string | null = null;

        const fetchMedia = async () => {
            try {
                const parts = mxcUrl.replace('mxc://', '').split('/');
                if (parts.length < 2) throw new Error('Invalid mxc URL format');

                // Use whichever token is available: user token or guest token
                const token = typeof window !== 'undefined'
                    ? (localStorage.getItem('matrix_access_token') || sessionStorage.getItem('matrix_guest_token'))
                    : null;

                if (!token) {
                    throw new Error('No auth token available for media fetch');
                }

                // Always use the authenticated V1 media download endpoint
                const url = `https://api.crabba.net/_matrix/client/v1/media/download/${parts[0]}/${parts[1]}`;

                const response = await fetch(url, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (!response.ok) throw new Error(`Media download failed: ${response.status}`);

                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                revoke = blobUrl;
                setImgSrc(blobUrl);
                onBlobReady?.(blobUrl, index);
            } catch (err) {
                console.error("Failed to load Matrix media:", err);
                setError(true);
            }
        };

        fetchMedia();

        // Cleanup blob URL on unmount
        return () => {
            if (revoke) URL.revokeObjectURL(revoke);
        };
    }, [mxcUrl]);

    if (error) {
        return (
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-500 text-sm text-center">
                Contenido no disponible
            </div>
        );
    }

    if (!imgSrc) {
        return (
            <div className="h-48 w-full bg-zinc-900 animate-pulse rounded-xl" />
        );
    }

    if (isVideo) {
        return (
            <video
                src={imgSrc}
                controls
                playsInline
                preload="metadata"
                className={className}
                onClick={(e) => onClick?.(e, index)}
            />
        );
    }

    return (
        <img
            src={imgSrc}
            alt={alt || "Media"}
            className={className}
            onClick={(e) => onClick?.(e, index)}
        />
    );
}

/**
 * Main MatrixMedia component which correctly routes either a single legacy mxcUrl
 * or a new multi-media array into an aesthetic CSS Grid layout.
 */
export function MatrixMedia({ mxcUrl, mediaItems, alt, className, isVideo = false, onBlobReady, onClick }: MatrixMediaProps) {
    // Determine the items to render
    const items: MediaItem[] = mediaItems?.length ? mediaItems : mxcUrl ? [{ url: mxcUrl, type: isVideo ? 'video/mp4' : 'image/jpeg' }] : [];

    if (items.length === 0) return null;

    if (items.length === 1) {
        return (
            <SingleMatrixMedia
                mxcUrl={items[0].url}
                alt={alt}
                className={className}
                isVideo={items[0].type?.startsWith('video')}
                onBlobReady={onBlobReady}
                onClick={onClick}
                index={0}
            />
        );
    }

    // Grid classes based on item length
    let gridClass = 'grid gap-1 overflow-hidden rounded-xl';

    // For specific heights we want to enforce an aspect ratio container
    const aspectContainerClass = "relative w-full aspect-video sm:aspect-[16/9]";

    if (items.length === 2) {
        gridClass += ' grid-cols-2 h-full';
    } else if (items.length === 3) {
        gridClass += ' grid-cols-2 grid-rows-2 h-full';
    } else if (items.length >= 4) {
        gridClass += ' grid-cols-2 grid-rows-2 h-full';
    }

    return (
        <div className={`${aspectContainerClass} ${gridClass}`}>
            {items.slice(0, 4).map((item, idx) => {
                // For 3 items, make the first one span 2 rows
                const isFirstOfThree = items.length === 3 && idx === 0;
                const itemClass = `w-full h-full object-cover transition-all hover:opacity-90 cursor-zoom-in ${isFirstOfThree ? 'row-span-2' : ''}`;

                return (
                    <div key={idx} className={`${isFirstOfThree ? 'row-span-2' : ''} h-full w-full overflow-hidden bg-neutral-900`}>
                        <SingleMatrixMedia
                            mxcUrl={item.url}
                            alt={alt || `Media ${idx + 1}`}
                            className={itemClass}
                            isVideo={item.type?.startsWith('video')}
                            onBlobReady={onBlobReady}
                            onClick={onClick}
                            index={idx}
                        />
                    </div>
                );
            })}
        </div>
    );
}
