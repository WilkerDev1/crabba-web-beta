"use client";

import React, { useState, useEffect } from 'react';

interface MatrixMediaProps {
    mxcUrl: string;
    alt?: string;
    className?: string;
    isVideo?: boolean;
    onBlobReady?: (blobUrl: string) => void;
    onClick?: (e: React.MouseEvent) => void;
}

/**
 * Fetches Matrix media securely using the authenticated V1 endpoint.
 * Works for both logged-in users (localStorage token) and guests (sessionStorage token).
 * Falls back to error state if no token is available at all.
 */
export function MatrixMedia({ mxcUrl, alt, className, isVideo = false, onBlobReady, onClick }: MatrixMediaProps) {
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
                onBlobReady?.(blobUrl);
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
                onClick={onClick}
            />
        );
    }

    return (
        <img
            src={imgSrc}
            alt={alt || "Media"}
            className={className}
            onClick={onClick}
        />
    );
}
