'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Field'

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

        <Card surface="glass-thick" radius="3xl" className="ticks p-5">
          <form onSubmit={submit} className="space-y-3">
            <Field error={error ? 'That’s not it - try again' : undefined}>
              <Input
                id="lifeos-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                autoFocus
                aria-invalid={error}
                className="h-12 border-[var(--border-hi)] bg-[var(--bg)] px-4"
              />
            </Field>
            <Button
              type="submit"
              size="lg"
              block
              loading={loading}
              disabled={!password}
            >
              {loading ? 'Unlocking…' : 'Unlock'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
