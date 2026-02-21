import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const MATRIX_HOMESERVER = process.env.NEXT_PUBLIC_MATRIX_HOMESERVER_URL || process.env.NEXT_PUBLIC_MATRIX_BASE_URL as string;

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
        // (since RLS might prevent normal server-client fetching depending on setup)
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

        if (!profile?.matrix_user_id || !creds?.matrix_password) {
            return NextResponse.json({ error: 'Matrix credentials not found for this user' }, { status: 404 })
        }

        // 3. Login to Matrix Server-Side
        const matrixLoginRes = await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: 'm.login.password',
                identifier: {
                    type: 'm.id.user',
                    user: profile.matrix_user_id,
                },
                password: creds.matrix_password,
                initial_device_display_name: 'Crabba Web Client',
            }),
        })

        if (!matrixLoginRes.ok) {
            const errorData = await matrixLoginRes.json()
            console.error('/api/auth/matrix-token: Matrix login failed:', errorData)
            return NextResponse.json({ error: 'Failed to authenticate with Matrix' }, { status: 502 })
        }

        const matrixData = await matrixLoginRes.json()

        // 4. Return the Token securely to the client
        return NextResponse.json({
            access_token: matrixData.access_token,
            device_id: matrixData.device_id,
            user_id: matrixData.user_id,
        })
    } catch (error) {
        console.error('Error exchanging Matrix token:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
