import type { Metadata } from 'next';
import PostDetailClient from './PostDetailClient';

const ROOM_ID = process.env.NEXT_PUBLIC_MATRIX_GLOBAL_ROOM_ID || '!iyDNoJTahsHwSkiukz:localhost';
const MATRIX_BASE_URL = process.env.NEXT_PUBLIC_MATRIX_HOMESERVER_URL || process.env.NEXT_PUBLIC_MATRIX_BASE_URL || 'https://api.crabba.net';

/**
 * Server-side: Register a temporary guest token to fetch event data for SEO.
 */
async function getServerGuestToken(): Promise<string | null> {
    try {
        const res = await fetch(`${MATRIX_BASE_URL}/_matrix/client/v3/register?kind=guest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
            cache: 'no-store',
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.access_token || null;
    } catch {
        return null;
    }
}

/**
 * Server-side: Fetch event data for Open Graph meta tags.
 */
async function fetchEventForMeta(eventId: string) {
    try {
        const token = await getServerGuestToken();
        if (!token) return null;

        const encodedRoomId = encodeURIComponent(ROOM_ID);
        const encodedEventId = encodeURIComponent(eventId);
        const url = `${MATRIX_BASE_URL}/_matrix/client/v3/rooms/${encodedRoomId}/context/${encodedEventId}?limit=0`;

        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store',
        });

        if (!res.ok) return null;
        const data = await res.json();
        return data.event || null;
    } catch {
        return null;
    }
}

/**
 * Convert mxc:// URL to public download URL.
 */
function mxcToHttp(mxcUrl: string): string {
    const parts = mxcUrl.replace('mxc://', '').split('/');
    if (parts.length < 2) return '';
    return `${MATRIX_BASE_URL}/_matrix/media/v3/download/${parts[0]}/${parts[1]}`;
}

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
    const { eventId: rawEventId } = await params;
    const eventId = decodeURIComponent(rawEventId);

    const event = await fetchEventForMeta(eventId);

    // Defaults
    const siteName = 'Crabba';
    const defaultTitle = 'Post on Crabba';
    const defaultDescription = 'View this post on Crabba — a decentralized art platform for creators.';

    if (!event) {
        return {
            title: defaultTitle,
            description: defaultDescription,
            openGraph: {
                title: defaultTitle,
                description: defaultDescription,
                siteName,
                type: 'article',
            },
            twitter: {
                card: 'summary',
                title: defaultTitle,
                description: defaultDescription,
            },
        };
    }

    const content = event.content || {};
    const sender = event.sender || 'Unknown';
    const body = content.body || '';
    const msgtype = content.msgtype;
    const mxcUrl = content.url;

    // Build title and description
    const displayName = sender.split(':')[0]?.replace('@', '') || sender;
    const title = body
        ? `${displayName}: "${body.slice(0, 80)}${body.length > 80 ? '…' : ''}"`
        : `Post by ${displayName}`;
    const description = body
        ? body.slice(0, 200)
        : `View this post by ${displayName} on Crabba.`;

    // Build image URL — use the SEO proxy so scrapers can access it
    let seoImageUrl: string | null = null;
    const rawMxc = mxcUrl || content.info?.thumbnail_url;
    if ((msgtype === 'm.image' || msgtype === 'm.video') && rawMxc) {
        seoImageUrl = `https://crabba.net/api/media?mxc=${encodeURIComponent(rawMxc)}`;
    } else if (content.info?.thumbnail_url) {
        seoImageUrl = `https://crabba.net/api/media?mxc=${encodeURIComponent(content.info.thumbnail_url)}`;
    }

    const ogTitle = `Post de ${displayName} en Crabba`;

    return {
        title,
        description,
        openGraph: {
            title: ogTitle,
            description,
            siteName,
            type: 'article',
            images: seoImageUrl ? [
                {
                    url: seoImageUrl,
                    alt: 'Art content',
                },
            ] : [],
        },
        twitter: {
            card: 'summary_large_image',
            title: ogTitle,
            description,
            images: seoImageUrl ? [seoImageUrl] : [],
        },
    };
}

export default function PostDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
    return <PostDetailClient params={params} />;
}
