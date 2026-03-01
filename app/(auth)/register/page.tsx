'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RegisterPage() {
    const router = useRouter()

    useEffect(() => {
        // Registration is disabled during Closed Beta.
        // Redirect to the landing page waitlist.
        router.replace('/')
    }, [router])

    return (
        <div className="flex h-screen w-screen items-center justify-center bg-black text-white">
            <div className="text-center space-y-4 max-w-sm px-4">
                <div className="w-16 h-16 bg-gradient-to-br from-orange-600 to-amber-700 rounded-2xl flex items-center justify-center mx-auto">
                    <span className="text-3xl">🦀</span>
                </div>
                <h1 className="text-2xl font-bold">Closed Beta</h1>
                <p className="text-zinc-400">
                    Public registration is currently closed. Join our waitlist to get early access.
                </p>
                <p className="text-zinc-500 text-sm">Redirecting to the waitlist...</p>
            </div>
        </div>
    )
}
