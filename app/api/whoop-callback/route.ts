import { NextRequest, NextResponse } from 'next/server'
import { exchangeWhoopCode, persistWhoopTokens } from '../../../lib/whoop-oauth'

// Legacy callback path — kept for backwards compatibility if this redirect_uri was
// registered in an older WHOOP developer app config. New flows use /callback.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

function html(body: string, status = 200) {
  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:monospace;padding:2rem">${body}</body></html>`,
    { status, headers: { 'Content-Type': 'text/html' } },
  )
}

function getRedirectUri(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'http'
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000'
  return `${proto}://${host}/api/whoop-callback`
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) return html(`<h2>Whoop error</h2><p>${escapeHtml(error)}</p>`, 400)
  if (!code) return html('<h2>Missing code</h2>', 400)

  const result = await exchangeWhoopCode(code, getRedirectUri(req))
  if (!result.ok) return html(`<h2>Error</h2><p>${escapeHtml(result.error)}</p>`, result.status)

  const dbError = await persistWhoopTokens(result.tokens)
  if (dbError) return html('<h2>DB error — check server logs</h2>', 500)

  const { tokens } = result
  const offlineNote = tokens.refresh_token
    ? '<p>Offline access enabled — tokens will refresh automatically.</p>'
    : '<p><strong>Note:</strong> No refresh token returned. You will need to reconnect when the access token expires.</p>'

  return html(`
    <h2>Whoop connected</h2>
    <p>Tokens stored. You can close this tab.</p>
    ${offlineNote}
  `)
}
