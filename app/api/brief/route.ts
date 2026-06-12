import { NextRequest, NextResponse } from 'next/server'
import { GOAL_RESET_HOUR, getZonedHour } from '@/lib/goal-dates'
import { createBriefServerClient } from '@/lib/supabase-server'
import {
  computePreviousBriefOutcomes,
  generateDailyBrief,
} from '@/lib/brief/generate'

export const maxDuration = 60

const LIFEOS_TIME_ZONE = process.env.LIFEOS_TIME_ZONE ?? 'Europe/Berlin'

// Vercel cron sends `Authorization: Bearer $CRON_SECRET` automatically when
// the env var is set. The header alone authorizes cron — no query marker, so
// nothing depends on query strings surviving the cron invocation or proxy.
function isCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  return !!cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`
}

// GET is read-serving: it returns the existing brief for the current goal
// date and only generates when none exists yet. It never regenerates, so
// page loads cannot burn model calls or expire pending proposals.
export async function GET(request: NextRequest) {
  const isCron = isCronRequest(request)

  // The dual UTC schedules cover 6:05 Berlin across DST; the off-season run
  // lands before the 6 AM goal reset and would generate a brief for the
  // *previous* goal date that nobody will see. Skip it.
  if (isCron && getZonedHour(new Date(), LIFEOS_TIME_ZONE) < GOAL_RESET_HOUR) {
    return NextResponse.json({ skipped: 'before local goal reset' })
  }

  try {
    const supabase = await createBriefServerClient({ admin: isCron })
    if (isCron) await computePreviousBriefOutcomes(supabase)
    const brief = await generateDailyBrief(supabase, undefined, 'ensure')
    return NextResponse.json({ brief })
  } catch (error) {
    console.error('Daily Brief GET failed:', error)
    return NextResponse.json({ error: 'Daily Brief is unavailable' }, { status: 500 })
  }
}

// POST is the explicit, user-initiated regeneration path (Regenerate button,
// check-in save). It regenerates when the context changed, which expires the
// previous brief's pending proposals.
export async function POST() {
  try {
    const supabase = await createBriefServerClient()
    const brief = await generateDailyBrief(supabase, undefined, 'refresh')
    return NextResponse.json({ brief })
  } catch (error) {
    console.error('Daily Brief POST failed:', error)
    return NextResponse.json({ error: 'Daily Brief generation failed' }, { status: 500 })
  }
}
