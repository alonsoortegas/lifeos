import { beforeEach, describe, expect, it } from 'vitest'
import { whoopRedirectUri } from '../lib/whoop-redirect'
import { whoopAuthUrl } from '../lib/whoop-utils'

describe('whoopRedirectUri', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_WHOOP_REDIRECT_URI
  })

  it('defaults to the registered API callback path on the current origin', () => {
    expect(whoopRedirectUri('http://localhost:3000')).toBe('http://localhost:3000/api/whoop-callback')
  })

  it('trims a trailing slash from the origin', () => {
    expect(whoopRedirectUri('http://localhost:3000/')).toBe('http://localhost:3000/api/whoop-callback')
  })

  it('uses the configured registered callback URI when present', () => {
    process.env.NEXT_PUBLIC_WHOOP_REDIRECT_URI = 'https://lifeos-zeta-three.vercel.app/api/whoop-callback'

    expect(whoopRedirectUri('https://preview.vercel.app')).toBe('https://lifeos-zeta-three.vercel.app/api/whoop-callback')
  })
})

describe('whoopAuthUrl', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_WHOOP_REDIRECT_URI
  })

  it('encodes the configured redirect_uri in the authorization URL', () => {
    process.env.NEXT_PUBLIC_WHOOP_REDIRECT_URI = 'https://lifeos-zeta-three.vercel.app/api/whoop-callback'

    const url = new URL(whoopAuthUrl('https://preview.vercel.app'))

    expect(url.searchParams.get('redirect_uri')).toBe('https://lifeos-zeta-three.vercel.app/api/whoop-callback')
  })
})
