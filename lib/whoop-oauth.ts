import 'server-only'
import { createClient } from '@supabase/supabase-js'

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'

export interface WhoopTokens {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

export type ExchangeResult =
  | { ok: true; tokens: WhoopTokens }
  | { ok: false; error: string; status: number }

export async function exchangeWhoopCode(
  code: string,
  redirectUri: string,
): Promise<ExchangeResult> {
  const clientId = process.env.WHOOP_CLIENT_ID
  const clientSecret = process.env.WHOOP_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return { ok: false, error: 'WHOOP credentials not configured on server', status: 500 }
  }

  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  })

  if (!res.ok) {
    // Log the raw body server-side only — do not forward it to the browser.
    const body = await res.text()
    console.error('[whoop-oauth] token exchange failed', res.status, body)
    return { ok: false, error: `Token exchange failed (HTTP ${res.status})`, status: 500 }
  }

  const tokens: WhoopTokens = await res.json()
  if (!tokens.access_token) {
    return { ok: false, error: 'No access_token in WHOOP response', status: 500 }
  }

  return { ok: true, tokens }
}

// Returns null on success, or an error message string.
export async function persistWhoopTokens(tokens: WhoopTokens): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (!serviceKey) return 'SUPABASE_SERVICE_ROLE_KEY not configured'

  const supabase = createClient(supabaseUrl, serviceKey)
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()

  const { error } = await supabase.from('whoop_tokens').upsert({
    id: 1,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_at: expiresAt,
    token_type: tokens.token_type ?? 'Bearer',
    scope: tokens.scope ?? null,
    reauth_required: false,
    updated_at: new Date().toISOString(),
  })

  return error ? error.message : null
}
