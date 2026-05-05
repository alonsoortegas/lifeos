import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'

export async function GET(req: NextRequest) {
  const reqUrl = new URL(req.url)
  const { searchParams } = reqUrl
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) return html(`<h2>Whoop error</h2><pre>${error}: ${searchParams.get('error_description') ?? ''}</pre>`, 400)
  if (!code) return html('<h2>Missing code</h2>', 400)

  const clientId = process.env.WHOOP_CLIENT_ID
  const clientSecret = process.env.WHOOP_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return html('<h2>WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET not set in .env.local</h2>', 500)
  }

  // Use x-forwarded headers when behind Vercel's proxy (where req.url uses http).
  const proto = req.headers.get('x-forwarded-proto') ?? reqUrl.protocol.replace(':', '')
  const host = req.headers.get('x-forwarded-host') ?? reqUrl.host
  const redirectUri = `${proto}://${host}/callback`

  const tokenRes = await fetch(WHOOP_TOKEN_URL, {
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

  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    return html(`<h2>Token exchange failed (${tokenRes.status})</h2><pre>${text}</pre>`, 500)
  }

  const tokens = await tokenRes.json()

  if (!tokens.access_token) {
    return html(`<h2>No access token in response</h2><pre>${JSON.stringify(tokens, null, 2)}</pre>`, 500)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (!serviceKey) {
    return html('<h2>SUPABASE_SERVICE_ROLE_KEY not configured</h2>', 500)
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()

  const { error: dbError } = await supabase.from('whoop_tokens').upsert({
    id: 1,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  })

  if (dbError) return html(`<h2>DB error</h2><pre>${dbError.message}</pre>`, 500)

  return html(`
    <h2>Whoop connected</h2>
    <p>Tokens stored. You can close this tab.</p>
    <p style="color:#888;font-size:.85rem">redirect_uri used: ${redirectUri}</p>
    ${!tokens.refresh_token ? '<p><strong>Note:</strong> No refresh token returned — whoop-sync will use the access token until it expires.</p>' : ''}
  `)
}

function html(body: string, status = 200) {
  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:monospace;padding:2rem">${body}</body></html>`,
    { status, headers: { 'Content-Type': 'text/html' } }
  )
}
