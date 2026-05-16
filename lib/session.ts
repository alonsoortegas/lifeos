// Web Crypto implementation — works in Edge Runtime, Node.js 18+, and browsers.
// Deliberately avoids Node.js `crypto` module so this file is safe to import
// from proxy.ts regardless of the runtime target.

const enc = new TextEncoder()
const SEP = '.'
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000
const CLOCK_SKEW_MS = 60_000 // 1 minute tolerance for clock drift

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length % 2 !== 0) return null
  // Explicit ArrayBuffer satisfies TypeScript's stricter BufferSource overload on
  // crypto.subtle APIs (Uint8Array<ArrayBufferLike> is not assignable to BufferSource).
  const buf = new ArrayBuffer(hex.length / 2)
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16)
    if (isNaN(byte)) return null
    bytes[i >> 1] = byte
  }
  return bytes
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function createSessionToken(): Promise<string> {
  const secret = process.env.APP_PASSWORD
  if (!secret) throw new Error('APP_PASSWORD not set')
  const issuedAt = String(Date.now())
  const key = await importKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(issuedAt))
  return `${issuedAt}${SEP}${toHex(sig)}`
}

export async function verifySessionToken(token: string): Promise<boolean> {
  const secret = process.env.APP_PASSWORD
  if (!secret) return false

  const idx = token.indexOf(SEP)
  if (idx === -1) return false
  const issuedAt = token.slice(0, idx)
  const sigHex = token.slice(idx + 1)

  const ts = Number(issuedAt)
  const now = Date.now()
  if (!Number.isInteger(ts)) return false
  if (now - ts > NINETY_DAYS_MS) return false        // expired
  if (ts > now + CLOCK_SKEW_MS) return false         // issued in the future

  const sigBytes = fromHex(sigHex)
  if (!sigBytes) return false

  try {
    const key = await importKey(secret)
    // crypto.subtle.verify is timing-safe by spec
    return await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(issuedAt))
  } catch {
    return false
  }
}
