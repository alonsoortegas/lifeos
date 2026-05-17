import { NextRequest, NextResponse } from 'next/server'
import { WHOOP_SCOPES } from '../../../lib/whoop-utils'
import { whoopRedirectUri } from '../../../lib/whoop-redirect'

export async function GET(req: NextRequest) {
  const clientId = process.env.WHOOP_CLIENT_ID

  if (!clientId) {
    return NextResponse.json({ error: 'WHOOP_CLIENT_ID not configured' }, { status: 500 })
  }

  const reqUrl = new URL(req.url)
  const proto = req.headers.get('x-forwarded-proto') ?? reqUrl.protocol.replace(':', '')
  const host = req.headers.get('x-forwarded-host') ?? reqUrl.host
  const redirectUri = whoopRedirectUri(`${proto}://${host}`)

  if (reqUrl.searchParams.get('debug') === '1') {
    return NextResponse.json({
      client_id: clientId,
      redirect_uri: redirectUri,
    })
  }

  const authUrl = new URL('https://api.prod.whoop.com/oauth/oauth2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', WHOOP_SCOPES)
  authUrl.searchParams.set('state', 'lifeos26')

  return NextResponse.redirect(authUrl)
}
