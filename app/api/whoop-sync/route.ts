import { NextResponse } from 'next/server'

const FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/whoop-sync`

export async function POST() {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anonKey) return NextResponse.json({ error: 'Missing anon key' }, { status: 500 })

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${anonKey}` },
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
