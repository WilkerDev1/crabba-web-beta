import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // refreshing the auth token
    const {
        data: { user },
    } = await supabase.auth.getUser()

    const pathname = request.nextUrl.pathname;

    // ─── PUBLIC ROUTES: accessible without authentication ───
    const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register');
    const isLandingPage = pathname === '/';
    const isPostDetail = pathname.startsWith('/post/');
    const isExplorePage = pathname.startsWith('/explore');
    const isSearchPage = pathname.startsWith('/search');
    // Catch-all: any single-segment path like /username is a profile page
    const isProfilePage = /^\/[^/]+$/.test(pathname) && !isAuthRoute && !pathname.startsWith('/api') && !pathname.startsWith('/fanbox') && !pathname.startsWith('/search') && !pathname.startsWith('/notifications') && !pathname.startsWith('/settings') && !pathname.startsWith('/explore');

    const isPublicRoute = isAuthRoute || isLandingPage || isPostDetail || isProfilePage || isExplorePage || isSearchPage;

    if (!user && !isPublicRoute) {
        // no user on a private route → redirect to landing page
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
    }

    if (user && isAuthRoute) {
        // user already logged in but trying to access login/register → redirect to home
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}
