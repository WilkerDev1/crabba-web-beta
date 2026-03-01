import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const rawMatrixUrl = process.env.NEXT_PUBLIC_MATRIX_HOMESERVER_URL || process.env.NEXT_PUBLIC_MATRIX_BASE_URL as string;
const MATRIX_HOMESERVER = rawMatrixUrl ? rawMatrixUrl.replace(/\/+$/, '') : '';
const MATRIX_DOMAIN = 'crabba.net';
const isNgrok = MATRIX_HOMESERVER.includes('ngrok-free.app') || MATRIX_HOMESERVER.includes('ngrok-free.dev') || MATRIX_HOMESERVER.includes('ngrok.io');

export async function GET() {
    try {
        const supabase = await createClient()

        // 1. Verify Supabase Session
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            console.warn('[/api/auth/matrix-token] No active Supabase session found. Returning 401.');
            return NextResponse.json({ error: 'Unauthorized: No active session' }, { status: 401 })
        }

        // 2. Fetch Matrix Credentials using Service Role
        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('matrix_user_id')
            .eq('id', user.id)
            .single()

        const { data: creds } = await supabaseAdmin
            .from('matrix_credentials')
            .select('matrix_password')
            .eq('user_id', user.id)
            .single()

        // ─── Migration: Detect stale :localhost credentials ───
        const hasStaleLocalhost = profile?.matrix_user_id?.endsWith(':localhost');

        if (!profile?.matrix_user_id || !creds?.matrix_password || hasStaleLocalhost) {
            // User has no credentials OR has stale localhost credentials.
            // Attempt to auto-provision a new account on the production domain.
            console.log(`[matrix-token] ${hasStaleLocalhost ? 'Migrating stale :localhost user' : 'No credentials found'} for ${user.id}. Auto-provisioning on ${MATRIX_DOMAIN}...`);

            try {
                const provisionRes = await fetch(
                    `${process.env.NEXT_PUBLIC_SITE_URL || 'https://crabba-web-beta.vercel.app'}/api/auth/sync-matrix`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            uuid: user.id,
                            email: user.email || `${user.id}@crabba.net`,
                            username: user.user_metadata?.username || undefined,
                        }),
                    }
                );

                if (!provisionRes.ok) {
                    const provisionError = await provisionRes.json();
                    console.error('[matrix-token] Auto-provision failed:', provisionError);
                    return NextResponse.json(
                        { error: `Auto-provisioning failed: ${provisionError.error || 'Unknown error'}` },
                        { status: 502 }
                    );
                }

                // Re-fetch the newly created credentials
                const { data: newProfile } = await supabaseAdmin
                    .from('profiles')
                    .select('matrix_user_id')
                    .eq('id', user.id)
                    .single();

                const { data: newCreds } = await supabaseAdmin
                    .from('matrix_credentials')
                    .select('matrix_password')
                    .eq('user_id', user.id)
                    .single();

                if (!newProfile?.matrix_user_id || !newCreds?.matrix_password) {
                    return NextResponse.json({ error: 'Auto-provisioning completed but credentials still missing.' }, { status: 500 });
                }

                // Use the fresh credentials for login below
                return await loginToMatrix(newProfile.matrix_user_id, newCreds.matrix_password);

            } catch (provisionError: any) {
                console.error('[matrix-token] Auto-provision exception:', provisionError);
                return NextResponse.json({ error: 'Identity auto-provisioning failed.' }, { status: 500 });
            }
        }

        // 3. Normal flow: Login with existing credentials
        return await loginToMatrix(profile.matrix_user_id, creds.matrix_password);

    } catch (error) {
        console.error('Error exchanging Matrix token:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

/**
 * Login to Matrix homeserver and return the access token.
 */
async function loginToMatrix(matrixUserId: string, password: string) {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (isNgrok) {
        headers['ngrok-skip-browser-warning'] = 'true';
    }

    const matrixLoginRes = await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/login`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            type: 'm.login.password',
            identifier: {
                type: 'm.id.user',
                user: matrixUserId,
            },
            password: password,
            initial_device_display_name: 'Crabba Web Client',
        }),
    });

    if (!matrixLoginRes.ok) {
        const errorData = await matrixLoginRes.json();
        console.error('[matrix-token] Matrix login failed:', errorData);
        return NextResponse.json({ error: 'Failed to authenticate with Matrix' }, { status: 502 });
    }

    const matrixData = await matrixLoginRes.json();

    return NextResponse.json({
        access_token: matrixData.access_token,
        device_id: matrixData.device_id,
        user_id: matrixData.user_id,
    });
}
