import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from './lib/session'

const COOKIE = 'lifeos_auth'
const LOGIN = '/login'

const PUBLIC_PREFIXES = [LOGIN, '/api/auth', '/api/whoop-auth', '/api/whoop-callback', '/callback', '/api/mcp']

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Vercel cron authorizes with `Authorization: Bearer $CRON_SECRET` alone —
  // no query marker, so nothing depends on query strings surviving the cron
  // invocation. The route re-validates the same header.
  const cronSecret = process.env.CRON_SECRET
  const isAuthorizedBriefCron =
    pathname === '/api/brief' &&
    !!cronSecret &&
    req.headers.get('authorization') === `Bearer ${cronSecret}`

  if (isAuthorizedBriefCron) {
    return NextResponse.next()
  }

  if (PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  const token = req.cookies.get(COOKIE)?.value
  if (!token || !await verifySessionToken(token)) {
    const url = req.nextUrl.clone()
    url.pathname = LOGIN
    return NextResponse.redirect(url)
  }

  let res = NextResponse.next({ request: req })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() { return req.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // If lifeos_auth is valid but the Supabase session expired (refresh token TTL
  // is 7 days), silently re-sign-in so RLS keeps working without a manual login
  if (!user) {
    const email = process.env.SUPABASE_OWNER_EMAIL
    const ownerPass = process.env.SUPABASE_OWNER_PASSWORD
    if (email && ownerPass) {
      await supabase.auth.signInWithPassword({ email, password: ownerPass })
    }
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon\\.png|icon-.*\\.png|apple-icon\\.png|apple-touch-icon\\.png|lifeos-icon\\.svg|manifest.json|sw.js).*)'],
}
