// One-time OAuth2 callback handler for Whoop authorization code flow.
// After authorizing in browser, Whoop redirects here with ?code=...
// This exchanges the code for tokens and stores them in whoop_tokens.
// Run once; whoop-sync handles all subsequent token refreshes automatically.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'

serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    return html(`<h2>Whoop auth error</h2><pre>${error}</pre>`, 400)
  }

  if (!code) {
    return html('<h2>Missing code parameter</h2>', 400)
  }

  const clientId = Deno.env.get('WHOOP_CLIENT_ID')
  const clientSecret = Deno.env.get('WHOOP_CLIENT_SECRET')
  const redirectUri = Deno.env.get('WHOOP_REDIRECT_URI')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!clientId || !clientSecret || !redirectUri || !supabaseUrl || !supabaseKey) {
    return html('<h2>Missing environment variables</h2>', 500)
  }

  // Exchange code for tokens
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
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()

  // Store tokens in whoop_tokens (upsert on id=1)
  const supabase = createClient(supabaseUrl, supabaseKey)
  const { error: dbError } = await supabase.from('whoop_tokens').upsert({
    id: 1,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  })

  if (dbError) {
    return html(`<h2>DB error</h2><pre>${dbError.message}</pre>`, 500)
  }

  return html(`
    <h2>Whoop connected</h2>
    <p>Tokens stored. You can close this tab.</p>
    <p>whoop-sync will now run on cron and keep data fresh.</p>
  `)
})

function html(body: string, status = 200) {
  return new Response(
    `<!DOCTYPE html><html><body style="font-family:monospace;padding:2rem">${body}</body></html>`,
    { status, headers: { 'Content-Type': 'text/html' } }
  )
}
