import { NextRequest, NextResponse } from 'next/server'
import { createBriefServerClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  let body: {
    brief_id?: number
    rating?: 'useful' | 'not_useful'
    note?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!Number.isInteger(body.brief_id) || !['useful', 'not_useful'].includes(body.rating ?? '')) {
    return NextResponse.json({ error: 'A brief id and rating are required' }, { status: 400 })
  }

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null
  const supabase = await createBriefServerClient()

  const { data: brief } = await supabase
    .from('ai_briefs')
    .select('id')
    .eq('id', body.brief_id)
    .maybeSingle()
  if (!brief) {
    return NextResponse.json({ error: 'Brief not found' }, { status: 404 })
  }

  const { data, error } = await supabase.from('ai_brief_outcomes').upsert({
    brief_id: body.brief_id,
    user_rating: body.rating,
    user_note: note || null,
  }, { onConflict: 'brief_id' }).select('*').single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ outcome: data })
}
