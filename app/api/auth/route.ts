import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { createSessionToken } from '../../../lib/session'

const COOKIE = 'lifeos_auth'
const NINETY_DAYS = 60 * 60 * 24 * 90

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const expected = process.env.APP_PASSWORD

  if (!expected || password !== expected) {
    return NextResponse.json({ error: 'wrong password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: NINETY_DAYS,
    path: '/',
  })

  // Sign into Supabase with the owner account so the browser gets an authenticated
  // session — RLS policies check is_owner() which requires auth.uid() to match
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
    const { data: { user } } = await supabase.auth.signInWithPassword({ email, password: ownerPass })

    // Auto-register owner_uid in app_config so is_owner() is immediately scoped
    // to this specific UID. Uses service role to bypass RLS on app_config.
    if (user) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (serviceKey) {
        const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', serviceKey)
        await admin.from('app_config').upsert({ key: 'owner_uid', value: user.id })
      }
    }
  }

  return res
}
