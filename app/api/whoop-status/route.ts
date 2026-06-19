import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (!serviceKey) {
    return NextResponse.json({ connected: false, reauth_required: false, has_offline: false })
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const [tokenRes, latestRunRes] = await Promise.all([
    supabase
      .from('whoop_tokens')
      .select('access_token, refresh_token, expires_at, updated_at, reauth_required, scope')
      .eq('id', 1)
      .single(),
    supabase
      .from('whoop_sync_runs')
      .select('status, started_at, finished_at, duration_ms, recovery_records_fetched, sleep_records_fetched, cycle_records_fetched, workout_records_fetched, snapshots_written, snapshot_failures, workouts_written, body_measurement_synced, latest_recovery_at, latest_snapshot_recorded_at, recovery_score, error_code, error_message, first_error')
      .eq('source', 'whoop')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const row = tokenRes.data
  const latestRun = latestRunRes.data ?? null

  if (!row?.access_token) {
    return NextResponse.json({
      connected: false,
      reauth_required: false,
      has_offline: false,
      latest_sync_run: latestRun,
    })
  }

  return NextResponse.json({
    connected: true,
    reauth_required: row.reauth_required ?? false,
    // has_offline is true only when a refresh_token is present (requires offline scope)
    has_offline: !!row.refresh_token,
    expires_at: row.expires_at ?? null,
    updated_at: row.updated_at ?? null,
    latest_sync_run: latestRun,
  })
}
