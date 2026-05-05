import { NextRequest, NextResponse } from 'next/server'

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
  return res
}
