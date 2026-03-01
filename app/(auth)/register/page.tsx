'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

// Matrix localpart rules: lowercase a-z, 0-9, and _=-./ only
const USERNAME_REGEX = /^[a-z0-9_=\-./]+$/;
const USERNAME_MIN = 3;
const USERNAME_MAX = 24;

function validateUsername(value: string): string | null {
    if (value.length < USERNAME_MIN) return `Username must be at least ${USERNAME_MIN} characters.`;
    if (value.length > USERNAME_MAX) return `Username must be at most ${USERNAME_MAX} characters.`;
    if (!USERNAME_REGEX.test(value)) return 'Only lowercase letters, numbers, and _ - . / = are allowed.';
    if (value.startsWith('_') || value.startsWith('.')) return 'Username cannot start with _ or .';
    return null;
}

export default function RegisterPage() {
    const router = useRouter()
    const supabase = createClient()

    const [email, setEmail] = useState('')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        // Validate username client-side
        const usernameError = validateUsername(username);
        if (usernameError) {
            setError(usernameError);
            setLoading(false);
            return;
        }

        // 1. Sign up to Supabase Auth — store username in user metadata
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username: username.toLowerCase(),
                },
            },
        })

        if (authError) {
            setError(authError.message)
            setLoading(false)
            return
        }

        const uuid = authData.user?.id

        if (uuid) {
            try {
                // 2. Trigger Identity Bridge Sync with custom username
                const res = await fetch('/api/auth/sync-matrix', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        uuid,
                        email,
                        username: username.toLowerCase(),
                    }),
                })

                if (!res.ok) {
                    const syncError = await res.json()
                    console.error('Identity Bridge sync failed:', syncError)
                    setError(syncError.error || 'Failed to create your Matrix identity. Please try again.')
                    setLoading(false)
                    return
                }
            } catch (err) {
                console.error('Error calling Identity Bridge:', err)
                setError('Network error during registration. Please try again.')
                setLoading(false)
                return
            }
        }

        setLoading(false)
        router.push('/')
        router.refresh()
    }

    return (
        <div className="flex h-screen w-screen items-center justify-center bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle className="text-2xl">Create an account</CardTitle>
                    <CardDescription>
                        Choose your @handle and join Crabba.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleRegister} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                                <Input
                                    id="username"
                                    type="text"
                                    placeholder="your_handle"
                                    required
                                    className="pl-7"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_=\-./]/g, ''))}
                                    minLength={USERNAME_MIN}
                                    maxLength={USERNAME_MAX}
                                    autoComplete="username"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                This will be your Matrix ID: <span className="font-mono text-primary">@{username || '...'}</span>
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="m@example.com"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                        {error && (
                            <div className="text-sm text-red-500">{error}</div>
                        )}
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? 'Creating account...' : 'Sign up'}
                        </Button>
                    </form>
                </CardContent>
                <CardFooter className="justify-center">
                    <div className="text-sm text-muted-foreground">
                        Already have an account?{' '}
                        <Link href="/login" className="text-primary underline hover:text-primary/90">
                            Log in
                        </Link>
                    </div>
                </CardFooter>
            </Card>
        </div>
    )
}
