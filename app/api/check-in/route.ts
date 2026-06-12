import { NextRequest, NextResponse } from 'next/server'
import { getCurrentGoalDateInTimeZone } from '@/lib/goal-dates'
import { createBriefServerClient } from '@/lib/supabase-server'

const LIFEOS_TIME_ZONE = process.env.LIFEOS_TIME_ZONE ?? 'Europe/Berlin'
const currentDate = () => getCurrentGoalDateInTimeZone(new Date(), LIFEOS_TIME_ZONE)

function score(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5
    ? Number(value)
    : null
}

export async function GET() {
  const supabase = await createBriefServerClient()
  const { data, error } = await supabase
    .from('daily_checkins')
    .select('*')
    .eq('check_date', currentDate())
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ check_in: data })
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const payload = {
    check_date: currentDate(),
    soreness: score(body.soreness),
    motivation: score(body.motivation),
    energy: score(body.energy),
    mood: score(body.mood),
    symptoms: typeof body.symptoms === 'string' ? body.symptoms.trim().slice(0, 300) || null : null,
    note: typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : null,
  }

  const supabase = await createBriefServerClient()
  const { data, error } = await supabase
    .from('daily_checkins')
    .upsert(payload, { onConflict: 'check_date' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ check_in: data })
}
