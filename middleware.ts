import { NextRequest, NextResponse } from 'next/server'

const COOKIE = 'lifeos_auth'
const LOGIN = '/login'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Let login page, auth endpoint, and Whoop OAuth callback through
  if (pathname === LOGIN || pathname.startsWith('/api/auth') || pathname === '/api/whoop-callback' || pathname === '/callback') {
    return NextResponse.next()
  }

  const token = req.cookies.get(COOKIE)?.value
  const expected = process.env.APP_PASSWORD

  if (!expected || token !== expected) {
    const url = req.nextUrl.clone()
    url.pathname = LOGIN
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|manifest.json|sw.js).*)'],
}
