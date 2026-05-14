import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const COOKIE = 'lifeos_auth'
const NINETY_DAYS = 60 * 60 * 24 * 90

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const expected = process.env.APP_PASSWORD

  if (!expected || password !== expected) {
    return NextResponse.json({ error: 'wrong password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: NINETY_DAYS,
    path: '/',
  })

  // Sign into Supabase with the owner account so the browser gets an authenticated
  // session — RLS policies check auth.role() = 'authenticated'
  const email = process.env.SUPABASE_OWNER_EMAIL
  const ownerPass = process.env.SUPABASE_OWNER_PASSWORD
  if (email && ownerPass) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      {
        cookies: {
          getAll: () => [],
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
            )
          },
        },
      }
    )
    await supabase.auth.signInWithPassword({ email, password: ownerPass })
  }

  return res
}
