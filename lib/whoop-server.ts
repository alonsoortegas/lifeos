import { createClient } from '@supabase/supabase-js'

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  )
}

// In-process deduplication: if a refresh is already in flight for a token key,
// callers share the same promise instead of triggering duplicate refreshes.
// On Vercel (serverless), this guards concurrent requests within the same instance.
const refreshInFlight = new Map<string, Promise<string>>()

function isRefreshAuthFailure(status: number, body: string): boolean {
  const normalized = body.toLowerCase()
  return (
    status === 401 ||
    normalized.includes('invalid_grant') ||
    normalized.includes('invalid refresh') ||
    normalized.includes('expired refresh') ||
    (normalized.includes('refresh token') && normalized.includes('expired')) ||
    (normalized.includes('refresh token') && normalized.includes('invalid'))
  )
}

async function performRefresh(currentRefreshToken: string): Promise<string> {
  const clientId = process.env.WHOOP_CLIENT_ID ?? ''
  const clientSecret = process.env.WHOOP_CLIENT_SECRET ?? ''

  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: currentRefreshToken,
      scope: 'offline',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    if (isRefreshAuthFailure(res.status, body)) {
      await adminClient()
        .from('whoop_tokens')
        .update({ reauth_required: true })
        .eq('id', 1)
      throw new Error('reauth_required')
    }
    throw new Error(`WHOOP token refresh failed: ${res.status} ${body}`)
  }

  const tokens = await res.json()
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()

  // WHOOP rotates tokens — replace both access and refresh tokens atomically
  await adminClient()
    .from('whoop_tokens')
    .upsert({
      id: 1,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? currentRefreshToken,
      expires_at: expiresAt,
      token_type: tokens.token_type ?? 'Bearer',
      scope: tokens.scope ?? null,
      reauth_required: false,
      updated_at: new Date().toISOString(),
    })

  return tokens.access_token as string
}

/**
 * Returns a valid WHOOP access token, refreshing it if it expires within 5 minutes.
 * Throws 'reauth_required' if the integration needs the user to reconnect.
 */
export async function getValidWhoopAccessToken(): Promise<string> {
  const lockKey = 'whoop_1'

  const supabase = adminClient()
  const { data: row, error } = await supabase
    .from('whoop_tokens')
    .select('access_token, refresh_token, expires_at, reauth_required')
    .eq('id', 1)
    .single()

  if (error || !row) throw new Error('No WHOOP tokens — connect WHOOP first')
  if (row.reauth_required) throw new Error('reauth_required')

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0
  const tokenValid = expiresAt - Date.now() > 5 * 60 * 1000

  if (tokenValid && row.access_token) return row.access_token as string

  if (!row.refresh_token) {
    await supabase.from('whoop_tokens').update({ reauth_required: true }).eq('id', 1)
    throw new Error('reauth_required')
  }

  // Deduplicate concurrent refreshes within this process
  const inflight = refreshInFlight.get(lockKey)
  if (inflight) return inflight

  const promise = performRefresh(row.refresh_token as string).finally(() => {
    refreshInFlight.delete(lockKey)
  })
  refreshInFlight.set(lockKey, promise)
  return promise
}
