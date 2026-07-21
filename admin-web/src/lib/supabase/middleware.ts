import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// 3-tier RBAC - all staff roles allowed to access admin panel
const ADMIN_ROLES = ['super_admin', 'manager', 'operator']

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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protect dashboard routes
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Helper to find profile by ID or email
  const findProfile = async () => {
    let { data: profile } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', user!.id)
      .single()

    if (!profile && user!.email) {
      const { data: profileByEmail } = await supabase
        .from('profiles')
        .select('role, status')
        .eq('email', user!.email)
        .single()
      profile = profileByEmail
    }
    return profile
  }

  // Check if user has admin role
  if (user && request.nextUrl.pathname.startsWith('/dashboard')) {
    const profile = await findProfile()

    if (!profile || !ADMIN_ROLES.includes(profile.role) || profile.status !== 'approved') {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'unauthorized')
      return NextResponse.redirect(url)
    }
  }

  // Redirect logged in admins from login to dashboard
  if (user && request.nextUrl.pathname === '/login') {
    const profile = await findProfile()

    if (profile && ADMIN_ROLES.includes(profile.role) && profile.status === 'approved') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
