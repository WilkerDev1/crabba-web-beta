'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Sparkles } from 'lucide-react'

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
    const [waitlisted, setWaitlisted] = useState(false)

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        // Validate username client-side (preserve UX)
        const usernameError = validateUsername(username);
        if (usernameError) {
            setError(usernameError);
            setLoading(false);
            return;
        }

        // ─── CLOSED BETA: Intercept sign-up → insert into waitlist ───
        try {
            const { error: insertError } = await supabase
                .from('waitlist')
                .insert({ email: email.trim().toLowerCase() });

            if (insertError) {
                if (insertError.code === '23505') {
                    // Already on waitlist
                    setWaitlisted(true);
                } else {
                    setError('Something went wrong. Please try again.');
                    setLoading(false);
                    return;
                }
            } else {
                setWaitlisted(true);
            }
        } catch (err) {
            console.error('Waitlist insert error:', err);
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    if (waitlisted) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <Card className="w-full max-w-sm">
                    <CardHeader>
                        <div className="flex justify-center mb-4">
                            <div className="w-16 h-16 bg-gradient-to-br from-orange-600 to-amber-700 rounded-2xl flex items-center justify-center">
                                <Sparkles className="w-8 h-8 text-white" />
                            </div>
                        </div>
                        <CardTitle className="text-2xl text-center">You&apos;re on the list! 🦀</CardTitle>
                        <CardDescription className="text-center">
                            Account creation is currently invite-only. You&apos;ve been added to the waitlist!
                            We&apos;ll notify you at <span className="font-medium text-foreground">{email}</span> when it&apos;s your turn.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <Button variant="outline" onClick={() => router.push('/login')} className="w-full">
                            Back to Login
                        </Button>
                        <Button variant="ghost" onClick={() => router.push('/')} className="w-full text-muted-foreground">
                            Explore as Guest
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="flex h-screen w-screen items-center justify-center bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle className="text-2xl">Create an account</CardTitle>
                    <CardDescription>
                        Choose your @handle and join the Crabba waitlist.
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
                            {loading ? 'Joining waitlist...' : 'Join Waitlist'}
                        </Button>
                        <p className="text-xs text-center text-muted-foreground">
                            🦀 Closed Beta — your email will be added to our invite list
                        </p>
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
