import { NextRequest, NextResponse } from 'next/server'

const FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/whoop-sync`

export async function POST(req: NextRequest) {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anonKey) return NextResponse.json({ error: 'Missing anon key' }, { status: 500 })

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* no body */ }

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
