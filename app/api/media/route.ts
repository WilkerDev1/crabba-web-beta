import { NextResponse, type NextRequest } from 'next/server';

const MATRIX_BASE_URL = process.env.NEXT_PUBLIC_MATRIX_HOMESERVER_URL || process.env.NEXT_PUBLIC_MATRIX_BASE_URL || 'https://api.crabba.net';

/**
 * SEO Media Proxy — proxies Matrix media for Discord/Twitter OG scrapers.
 * 
 * Usage: GET /api/media?mxc=mxc://server/mediaId
 * 
 * Registers a throwaway guest token server-side, fetches the image from
 * Synapse's authenticated endpoint, and returns the raw image bytes
 * with proper Content-Type headers.
 */
export async function GET(request: NextRequest) {
    const mxc = request.nextUrl.searchParams.get('mxc');
    if (!mxc) {
        return NextResponse.json({ error: 'Missing mxc parameter' }, { status: 400 });
    }

    try {
        // Parse mxc:// URI
        const parts = mxc.replace('mxc://', '').split('/');
        if (parts.length < 2) {
            return NextResponse.json({ error: 'Invalid mxc format' }, { status: 400 });
        }

        const serverName = parts[0];
        const mediaId = parts[1];

        // Register a throwaway guest token server-side
        const registerRes = await fetch(`${MATRIX_BASE_URL}/_matrix/client/v3/register?kind=guest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
            cache: 'no-store',
        });

        if (!registerRes.ok) {
            return NextResponse.json({ error: 'Failed to register guest' }, { status: 502 });
        }

        const { access_token } = await registerRes.json();

        // Fetch media from Synapse's authenticated V1 endpoint
        const mediaUrl = `${MATRIX_BASE_URL}/_matrix/client/v1/media/download/${serverName}/${mediaId}`;
        const mediaRes = await fetch(mediaUrl, {
            headers: { 'Authorization': `Bearer ${access_token}` },
            cache: 'no-store',
        });

        if (!mediaRes.ok) {
            return NextResponse.json({ error: `Media fetch failed: ${mediaRes.status}` }, { status: mediaRes.status });
        }

        const buffer = await mediaRes.arrayBuffer();
        const contentType = mediaRes.headers.get('content-type') || 'image/jpeg';

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400, s-maxage=86400',
            },
        });
    } catch (err) {
        console.error('[SEO Media Proxy] Error:', err);
        return NextResponse.json({ error: 'Internal proxy error' }, { status: 500 });
    }
}
