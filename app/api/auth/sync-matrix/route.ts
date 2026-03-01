import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// This route must use the service role key to insert into the profiles table
// because normal users might not have permission to insert initial profile data depending on RLS.
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const rawMatrixUrl = process.env.NEXT_PUBLIC_MATRIX_HOMESERVER_URL || process.env.NEXT_PUBLIC_MATRIX_BASE_URL as string;
const MATRIX_HOMESERVER = rawMatrixUrl ? rawMatrixUrl.replace(/\/+$/, '') : '';
const isNgrok = MATRIX_HOMESERVER.includes('ngrok-free.app') || MATRIX_HOMESERVER.includes('ngrok-free.dev') || MATRIX_HOMESERVER.includes('ngrok.io');
const MATRIX_DOMAIN = process.env.NEXT_PUBLIC_MATRIX_DOMAIN || 'crabba.net'

export async function POST(request: Request) {
    try {
        const { uuid, email } = await request.json()

        if (!uuid || !email) {
            return NextResponse.json({ error: 'Missing uuid or email' }, { status: 400 })
        }

        // 1. Generate Matrix User ID
        // Matrix User IDs are in the format @localpart:domain
        // e.g., @user_1234abcd:crabba.net
        const localpart = `user_${uuid.replace(/-/g, '')}`
        const matrixUserId = `@${localpart}:${MATRIX_DOMAIN}`

        // Generate a secure random password for the Matrix account
        const matrixPassword = Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')

        // 2. Register User on Matrix Synapse Server Using Shared Secret
        console.log(`[Identity Bridge] Attempting to register ${matrixUserId} on Matrix via Shared Secret...`);

        try {
            const sharedSecret = process.env.MATRIX_SHARED_SECRET;
            if (!sharedSecret) {
                throw new Error('MATRIX_SHARED_SECRET is not defined in environment variables.');
            }

            // STEP 1: Fetch Nonce
            const headers1: Record<string, string> = {};
            if (isNgrok) headers1['ngrok-skip-browser-warning'] = 'true';

            const nonceRes = await fetch(`${MATRIX_HOMESERVER}/_synapse/admin/v1/register`, {
                headers: headers1
            });
            if (!nonceRes.ok) {
                const nonceError = await nonceRes.json();
                throw new Error(`Failed to fetch Synapse nonce: ${nonceError.error || nonceRes.statusText}`);
            }
            const { nonce } = await nonceRes.json();

            // STEP 2: Generate HMAC SHA1 Signature
            // The string to sign format is strictly: <nonce>\x00<username>\x00<password>\x00notadmin
            const crypto = await import('crypto');

            const adminMode = 'notadmin';

            // Build the exact string with null bytes matching Python's \x00
            const stringToSign = `${nonce}\x00${localpart}\x00${matrixPassword}\x00${adminMode}`;

            const hmac = crypto.createHmac('sha1', sharedSecret);
            hmac.update(stringToSign);
            const mac = hmac.digest('hex');

            // STEP 3: Execute Registration
            const headers3: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (isNgrok) headers3['ngrok-skip-browser-warning'] = 'true';

            const registerRes = await fetch(`${MATRIX_HOMESERVER}/_synapse/admin/v1/register`, {
                method: 'POST',
                headers: headers3,
                body: JSON.stringify({
                    nonce: nonce,
                    username: localpart,
                    password: matrixPassword,
                    mac: mac,
                    admin: false
                }),
            })

            if (!registerRes.ok) {
                const errorData = await registerRes.json()
                console.error(`[Identity Bridge] Synapse Reg Error:`, errorData);

                // If user already exists on the new domain, that's OK — just update the password
                if (errorData.errcode === 'M_USER_IN_USE') {
                    console.log(`[Identity Bridge] User ${matrixUserId} already exists on ${MATRIX_DOMAIN}. Proceeding with credential update.`);
                } else {
                    throw new Error(`Matrix Registration Failed: ${errorData.error || 'Unknown error'}`);
                }
            } else {
                console.log(`[Identity Bridge] Successfully registered Matrix user: ${matrixUserId}`);
            }

        } catch (matrixError: any) {
            console.error(`[Identity Bridge] Failed to register Matrix identity:`, matrixError.message);
            return NextResponse.json({ error: 'Identity auto-provisioning failed.' }, { status: 500 })
        }

        // 3. Link Supabase UUID with Matrix User ID in the profiles table
        // Use UPSERT to handle migration from :localhost → :crabba.net
        console.log(`[Identity Bridge] Linking Supabase UUID ${uuid} with Matrix User ID ${matrixUserId}...`);

        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .upsert(
                {
                    id: uuid,
                    matrix_user_id: matrixUserId,
                    username: email.split('@')[0],
                },
                { onConflict: 'id' }
            )

        if (profileError) {
            console.error(`[Identity Bridge] Supabase Profile Upsert Error:`, profileError)
            return NextResponse.json({ error: 'Failed to create/update user profile linking.' }, { status: 500 })
        }

        // 4. Store the auto-generated Matrix password in matrix_credentials
        // Use UPSERT to handle migration case where old credentials exist
        const { error: credsError } = await supabaseAdmin
            .from('matrix_credentials')
            .upsert(
                {
                    user_id: uuid,
                    matrix_password: matrixPassword
                },
                { onConflict: 'user_id' }
            )

        if (credsError) {
            console.error(`[Identity Bridge] Matrix Credentials Upsert Error:`, credsError)
            return NextResponse.json({ error: 'Failed to store Matrix credentials.' }, { status: 500 })
        }

        return NextResponse.json({ message: 'Identity bridge synchronization successful.', matrixUserId })
    } catch (error: any) {
        console.error('[Identity Bridge] Unexpected Error:', error)
        return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
    }
}
