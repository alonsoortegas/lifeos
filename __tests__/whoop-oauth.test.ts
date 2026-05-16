import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exchangeWhoopCode } from '../lib/whoop-oauth'

// Configurable mock for @supabase/supabase-js — set upsertResult before each test
let upsertResult: { error: { message: string } | null } = { error: null }

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      upsert: async () => upsertResult,
    }),
  }),
}))

// ── exchangeWhoopCode ──────────────────────────────────────────────────────

describe('exchangeWhoopCode', () => {
  beforeEach(() => {
    process.env.WHOOP_CLIENT_ID = 'test-client-id'
    process.env.WHOOP_CLIENT_SECRET = 'test-client-secret'
    vi.restoreAllMocks()
  })

  it('returns error when env vars are missing', async () => {
    delete process.env.WHOOP_CLIENT_ID
    const result = await exchangeWhoopCode('any-code', 'http://localhost/callback')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(500)
  })

  it('returns error when WHOOP returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'invalid_grant',
    }))
    const result = await exchangeWhoopCode('bad-code', 'http://localhost/callback')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('400')
      expect(result.status).toBe(500)
    }
  })

  it('returns error when access_token is missing in response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token_type: 'Bearer' }),
    }))
    const result = await exchangeWhoopCode('code', 'http://localhost/callback')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('access_token')
  })

  it('returns ok with tokens on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'acc123', refresh_token: 'ref456', expires_in: 3600 }),
    }))
    const result = await exchangeWhoopCode('good-code', 'http://localhost/callback')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.tokens.access_token).toBe('acc123')
      expect(result.tokens.refresh_token).toBe('ref456')
    }
  })

  it('sends correct redirect_uri and grant_type to WHOOP', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tok' }),
    })
    vi.stubGlobal('fetch', mockFetch)
    await exchangeWhoopCode('mycode', 'https://example.com/callback')

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.prod.whoop.com/oauth/oauth2/token')
    const body = new URLSearchParams(init.body as string)
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('mycode')
    expect(body.get('redirect_uri')).toBe('https://example.com/callback')
  })
})

// ── persistWhoopTokens ─────────────────────────────────────────────────────

describe('persistWhoopTokens', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
    upsertResult = { error: null }
  })

  it('returns error string when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const { persistWhoopTokens } = await import('../lib/whoop-oauth')
    const err = await persistWhoopTokens({ access_token: 'tok' })
    expect(typeof err).toBe('string')
    expect(err).toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('returns null on successful upsert', async () => {
    upsertResult = { error: null }
    const { persistWhoopTokens } = await import('../lib/whoop-oauth')
    const err = await persistWhoopTokens({ access_token: 'tok', expires_in: 3600 })
    expect(err).toBeNull()
  })

  it('returns error message when upsert fails', async () => {
    upsertResult = { error: { message: 'db constraint violation' } }
    const { persistWhoopTokens } = await import('../lib/whoop-oauth')
    const err = await persistWhoopTokens({ access_token: 'tok' })
    expect(err).toBe('db constraint violation')
  })
})
