import { describe, it, expect, beforeEach, vi } from 'vitest'

beforeEach(() => {
  process.env.APP_PASSWORD = 'test-secret-password'
  vi.useRealTimers()
})

async function session() {
  return import('../lib/session')
}

describe('createSessionToken', () => {
  it('returns a string with exactly one dot separator', async () => {
    const { createSessionToken } = await session()
    const token = await createSessionToken()
    expect(typeof token).toBe('string')
    expect(token.split('.').length).toBe(2)
  })

  it('embeds the current timestamp as the first segment', async () => {
    const { createSessionToken } = await session()
    const before = Date.now()
    const token = await createSessionToken()
    const after = Date.now()
    const ts = Number(token.split('.')[0])
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('produces different tokens on consecutive calls', async () => {
    const { createSessionToken } = await session()
    const t1 = await createSessionToken()
    await new Promise(r => setTimeout(r, 2))
    const t2 = await createSessionToken()
    expect(t1).not.toBe(t2)
  })
})

describe('verifySessionToken', () => {
  it('accepts a freshly created token', async () => {
    const { createSessionToken, verifySessionToken } = await session()
    expect(await verifySessionToken(await createSessionToken())).toBe(true)
  })

  it('rejects a tampered timestamp (signature mismatch)', async () => {
    const { createSessionToken, verifySessionToken } = await session()
    const token = await createSessionToken()
    const [, sig] = token.split('.')
    // Different timestamp → different expected HMAC → reject
    const tampered = `${Date.now() + 99999}.${sig}`
    expect(await verifySessionToken(tampered)).toBe(false)
  })

  it('rejects a tampered signature', async () => {
    const { createSessionToken, verifySessionToken } = await session()
    const token = await createSessionToken()
    const [ts] = token.split('.')
    const tampered = `${ts}.aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899`
    expect(await verifySessionToken(tampered)).toBe(false)
  })

  it('rejects a token with no dot', async () => {
    const { verifySessionToken } = await session()
    expect(await verifySessionToken('nodothere')).toBe(false)
  })

  it('rejects an empty string', async () => {
    const { verifySessionToken } = await session()
    expect(await verifySessionToken('')).toBe(false)
  })

  it('rejects a token with an odd-length hex signature', async () => {
    const { verifySessionToken } = await session()
    expect(await verifySessionToken(`${Date.now()}.abc`)).toBe(false)
  })

  it('rejects a legitimately signed token whose timestamp is 91 days old', async () => {
    const { createSessionToken, verifySessionToken } = await session()

    // Back-date Date.now() so the token is signed with an old timestamp
    const ninetyOneDaysAgo = Date.now() - 91 * 24 * 60 * 60 * 1000
    vi.useFakeTimers()
    vi.setSystemTime(ninetyOneDaysAgo)
    const expiredToken = await createSessionToken()
    vi.useRealTimers()

    // The token has a valid HMAC but its issuedAt is too old
    expect(await verifySessionToken(expiredToken)).toBe(false)
  })

  it('rejects a legitimately signed token with a timestamp 2 minutes in the future', async () => {
    const { createSessionToken, verifySessionToken } = await session()
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 2 * 60 * 1000)
    const futureToken = await createSessionToken()
    vi.useRealTimers()
    expect(await verifySessionToken(futureToken)).toBe(false)
  })

  it('rejects a token signed with a different key', async () => {
    const { createSessionToken } = await session()
    const token = await createSessionToken()

    // Change key, re-import to pick up new env value
    process.env.APP_PASSWORD = 'different-secret'
    const { verifySessionToken } = await import('../lib/session')
    expect(await verifySessionToken(token)).toBe(false)

    process.env.APP_PASSWORD = 'test-secret-password'
  })
})
