'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(false)

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      router.replace('/')
    } else {
      setError(true)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="boot w-full max-w-xs space-y-7">
        <div className="space-y-2 text-center">
          <div
            className="mx-auto h-12 w-12 rounded-[14px] bg-cover bg-center"
            style={{ backgroundImage: 'url(/lifeos-icon.svg)', boxShadow: '0 0 30px rgba(0,210,106,0.35)' }}
            role="img"
            aria-label="LifeOS"
          />
          <div className="display pt-1 text-[30px] font-bold tracking-tight text-[var(--text)]">
            Life<span className="text-[#00d26a]" style={{ textShadow: '0 0 20px rgba(0,210,106,0.5)' }}>OS</span>
          </div>
          <div className="flicker text-[13px] text-[var(--text-dim)]">
            Welcome back. Ready when you are.
          </div>
        </div>

        <form onSubmit={submit} className="ticks panel space-y-3 rounded-2xl p-5">
          <input
            id="lifeos-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="w-full rounded-xl border border-[var(--border-hi)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text)] outline-none transition-all placeholder:text-[var(--text-faint)] focus:border-[#00d26a]"
            onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 4px rgba(0,210,106,0.12), 0 0 20px rgba(0,210,106,0.1)' }}
            onBlur={e => { e.currentTarget.style.boxShadow = 'none' }}
          />
          {error && (
            <div className="text-center text-xs text-[#fb7185]">
              That&apos;s not it — try again
            </div>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="display min-h-[46px] w-full rounded-xl py-3 text-[14px] font-bold text-[var(--bg)] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg, #00d26a, #2ee6a8)',
              boxShadow: '0 8px 28px rgba(0,210,106,0.3)',
            }}
          >
            {loading ? 'Unlocking…' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  )
}
