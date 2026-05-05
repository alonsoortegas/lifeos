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
    <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center px-6">
      <div className="w-full max-w-xs space-y-6">
        <div className="text-center space-y-1">
          <div className="text-[#00d26a] text-2xl font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
            ◆ LIFEOS
          </div>
          <div className="text-[#555] text-xs tracking-widest uppercase" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
            personal dashboard
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="password"
            autoFocus
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-[#ededed] text-sm outline-none focus:border-[#00d26a] transition-colors"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          />
          {error && (
            <div className="text-[#ef4444] text-xs text-center" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
              wrong password
            </div>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-[#00d26a] text-[#0e0e0e] rounded-xl py-3 text-sm font-bold min-h-[44px] disabled:opacity-40 transition-opacity"
          >
            {loading ? '...' : 'enter →'}
          </button>
        </form>
      </div>
    </div>
  )
}
