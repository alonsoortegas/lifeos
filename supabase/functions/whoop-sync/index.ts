// Whoop data poller — runs on cron every 30 minutes via Supabase scheduler.
// Reads refresh_token from whoop_tokens table, gets a fresh access_token,
// fetches recovery + sleep + cycle + workouts, and upserts into whoop_snapshots + whoop_workouts.
// Pass { days: 7 } in the POST body to backfill multiple days at once.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
const WHOOP_BASE = 'https://api.prod.whoop.com/developer/v2'

const SPORT_NAMES: Record<number, string> = {
  0: 'running',
  1: 'cycling',
  3: 'crossfit',
  16: 'baseball',
  27: 'elliptical',
  35: 'rowing',
  44: 'soccer',
  47: 'swimming',
  49: 'boxing',
  51: 'yoga',
  57: 'spin',
  63: 'walking',
  70: 'functional fitness',
  71: 'hiit',
  72: 'weightlifting',
  73: 'cross training',
  74: 'pilates',
  82: 'basketball',
  126: 'commuting',
  233: "barry's",
}

serve(async (req) => {
  try {
    const clientId = Deno.env.get('WHOOP_CLIENT_ID')
    const clientSecret = Deno.env.get('WHOOP_CLIENT_SECRET')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!clientId || !clientSecret || !supabaseUrl || !supabaseKey) {
      return json({ error: 'Missing required environment variables' }, 500)
    }

    // Optional: pass { days: 7 } to backfill multiple cycles
    let days = 1
    try {
      const body = await req.json()
      if (typeof body?.days === 'number') days = Math.min(Math.max(1, body.days), 25)
    } catch { /* no body or not JSON — default to 1 */ }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Load stored tokens
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('whoop_tokens')
      .select('access_token, refresh_token, expires_at, reauth_required')
      .eq('id', 1)
      .single()

    if (tokenErr || !tokenRow?.access_token) {
      return json({ error: 'No tokens found — complete Whoop OAuth first via /whoop-auth' }, 400)
    }

    if (tokenRow.reauth_required) {
      return json({ error: 'reauth_required', message: 'Please reconnect WHOOP in the dashboard' }, 401)
    }

    let accessToken = tokenRow.access_token as string

    // 2. Refresh access token when expired or within 5 minutes of expiry
    const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at).getTime() : 0
    const needsRefresh = expiresAt - Date.now() <= 5 * 60 * 1000

    if (needsRefresh && tokenRow.refresh_token) {
      const tokenRes = await fetch(WHOOP_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokenRow.refresh_token,
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'offline',
        }),
      })

      if (tokenRes.ok) {
        const tokens = await tokenRes.json()
        accessToken = tokens.access_token
        const newExpiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()
        // WHOOP rotates tokens — store both new access and refresh tokens
        await supabase.from('whoop_tokens').upsert({
          id: 1,
          access_token: accessToken,
          refresh_token: tokens.refresh_token,
          expires_at: newExpiresAt,
          token_type: tokens.token_type ?? 'Bearer',
          scope: tokens.scope ?? null,
          reauth_required: false,
          updated_at: new Date().toISOString(),
        })
      } else {
        const body = await tokenRes.text()
        const isAuthFailure = tokenRes.status === 401 || body.includes('invalid_grant')
        if (isAuthFailure) {
          await supabase.from('whoop_tokens').update({ reauth_required: true }).eq('id', 1)
          return json({ error: 'reauth_required', message: 'WHOOP token expired — please reconnect WHOOP in the dashboard' }, 401)
        }
        console.warn('Token refresh failed, proceeding with stored access token:', body)
      }
    } else if (needsRefresh && !tokenRow.refresh_token) {
      // No refresh token — mark as needing reauth and return error
      await supabase.from('whoop_tokens').update({ reauth_required: true }).eq('id', 1)
      return json({ error: 'reauth_required', message: 'WHOOP token expired and no refresh token — please reconnect WHOOP in the dashboard' }, 401)
    }

    // 3. Fetch recovery, sleep, cycle, and workouts
    const workoutLimit = Math.max(days * 3, 10)

    async function whoopGetGuarded(token: string, path: string, optional = false) {
      try {
        return await whoopGet(token, path)
      } catch (e: unknown) {
        const status = (e as { status?: number }).status
        if (status === 401) {
          await supabase.from('whoop_tokens').update({ reauth_required: true }).eq('id', 1)
          throw Object.assign(new Error('reauth_required'), { reauth: true })
        }
        if (optional) { console.warn(`optional fetch failed (${path}):`, e); return null }
        throw e
      }
    }

    let recoveryData: Record<string, unknown> | null = null
    try {
      recoveryData = await whoopGetGuarded(accessToken, `/recovery?limit=${days}`)
    } catch (e: unknown) {
      if ((e as { reauth?: boolean }).reauth) {
        return json({ error: 'reauth_required', message: 'WHOOP returned 401 — please reconnect WHOOP in the dashboard' }, 401)
      }
      throw e
    }

    const [sleepData, cycleData, workoutData] = await Promise.all([
      whoopGetGuarded(accessToken, `/activity/sleep?limit=${days}`, true),
      whoopGetGuarded(accessToken, `/cycle?limit=${days}`, true),
      whoopGetGuarded(accessToken, `/activity/workout?limit=${workoutLimit}`, true),
    ])

    const recoveries: Record<string, unknown>[] = recoveryData?.records ?? []
    if (!recoveries.length) return json({ error: 'No recovery records returned' }, 500)

    const sleepRecords: Record<string, unknown>[] = sleepData?.records ?? []
    const cycleRecords: Record<string, unknown>[] = cycleData?.records ?? []

    // 4. Upsert one snapshot row per recovery record
    let snapshotsUpserted = 0

    for (const recovery of recoveries) {
      const cycleId = recovery.cycle_id as number
      const cycle = cycleRecords.find((c) => (c.id as number) === cycleId) ?? null
      const sleep = sleepRecords.find((s) => (s.cycle_id as number) === cycleId) ?? null

      let sleep_score: number | null = null
      let sleep_duration_ms: number | null = null
      let sleep_deep_pct: number | null = null
      let sleep_rem_pct: number | null = null
      let sleep_light_pct: number | null = null
      let sleep_awake_pct: number | null = null
      let sleep_consistency_pct: number | null = null
      let respiratory_rate: number | null = null

      const sleepScore = (sleep as Record<string, unknown> | null)?.score as Record<string, unknown> | null
      if (sleepScore) {
        sleep_score = sleepScore.sleep_performance_percentage as number ?? null
        sleep_consistency_pct = sleepScore.sleep_consistency_percentage as number ?? null
        respiratory_rate = sleepScore.respiratory_rate as number ?? null
        const s = sleepScore.stage_summary as Record<string, number> ?? {}
        const total = s.total_in_bed_time_milli ?? 0
        sleep_duration_ms = total || null
        if (total > 0) {
          sleep_deep_pct = ((s.total_slow_wave_sleep_time_milli ?? 0) / total) * 100
          sleep_rem_pct = ((s.total_rem_sleep_time_milli ?? 0) / total) * 100
          sleep_light_pct = ((s.total_light_sleep_time_milli ?? 0) / total) * 100
          sleep_awake_pct = ((s.total_awake_time_milli ?? 0) / total) * 100
        }
      }

      const cycleScore = (cycle as Record<string, unknown> | null)?.score as Record<string, unknown> | null
      const recoveryScore = (recovery.score as Record<string, unknown> | null)

      const row = {
        cycle_id: cycleId,
        recorded_at: recovery.created_at,
        recovery_score: recoveryScore?.recovery_score ?? null,
        rhr: recoveryScore?.resting_heart_rate ?? null,
        hrv_rmssd: recoveryScore?.hrv_rmssd_milli ?? null,
        strain: cycleScore?.strain ?? null,
        kilojoule: cycleScore?.kilojoule ?? null,
        sleep_score,
        sleep_duration_ms,
        sleep_deep_pct,
        sleep_rem_pct,
        sleep_light_pct,
        sleep_awake_pct,
        sleep_consistency_pct,
        respiratory_rate,
        raw_json: { recovery, sleep, cycle },
      }

      const { error: upsertErr } = await supabase
        .from('whoop_snapshots')
        .upsert(row, { onConflict: 'cycle_id' })

      if (upsertErr) console.warn(`snapshot upsert error (cycle ${cycleId}):`, upsertErr.message)
      else snapshotsUpserted++
    }

    // 5. Upsert workouts
    let workoutCount = 0
    for (const w of workoutData?.records ?? []) {
      if (!w?.id || !w?.start) continue
      const workoutScore = w.score as Record<string, unknown> | null
      const zd = (workoutScore?.zone_durations ?? workoutScore?.zone_duration ?? {}) as Record<string, number>
      const wRow = {
        workout_id: w.id,
        cycle_id: w.cycle_id ?? null,
        started_at: w.start,
        sport_name: w.sport_name ?? SPORT_NAMES[w.sport_id as number] ?? `sport_${w.sport_id}`,
        strain: workoutScore?.strain ?? null,
        avg_hr: workoutScore?.average_heart_rate ?? null,
        max_hr: workoutScore?.max_heart_rate ?? null,
        zone0_min: zd.zone_zero_milli != null ? zd.zone_zero_milli / 60000 : null,
        zone1_min: zd.zone_one_milli != null ? zd.zone_one_milli / 60000 : null,
        zone2_min: zd.zone_two_milli != null ? zd.zone_two_milli / 60000 : null,
        zone3_min: zd.zone_three_milli != null ? zd.zone_three_milli / 60000 : null,
        zone4_min: zd.zone_four_milli != null ? zd.zone_four_milli / 60000 : null,
        zone5_min: zd.zone_five_milli != null ? zd.zone_five_milli / 60000 : null,
        raw_json: w,
      }
      const { error: wErr } = await supabase
        .from('whoop_workouts')
        .upsert(wRow, { onConflict: 'workout_id' })
      if (wErr) console.warn('workout upsert error:', wErr.message)
      else workoutCount++
    }

    const latest = recoveries[0]
    const latestScore = (latest.score as Record<string, unknown> | null)

    return json({
      ok: true,
      days_requested: days,
      snapshots_synced: snapshotsUpserted,
      workouts_synced: workoutCount,
      recovery_score: latestScore?.recovery_score,
      synced_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('whoop-sync error:', err)
    return json({ error: String(err) }, 500)
  }
})

async function whoopGet(token: string, path: string) {
  const res = await fetch(`${WHOOP_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const body = await res.text()
    throw Object.assign(new Error(`Whoop ${path} error ${res.status}: ${body}`), { status: res.status })
  }
  return res.json()
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
