'use client'

import { useEffect, useState } from 'react'

type ThemeMode = 'auto' | 'light' | 'dark'

const ORDER: ThemeMode[] = ['auto', 'light', 'dark']
const GLYPH: Record<ThemeMode, string> = { auto: '◐', light: '○', dark: '●' }

function storedMode(): ThemeMode {
  if (typeof window === 'undefined') return 'auto'
  const value = localStorage.getItem('lifeos-theme')
  return value === 'light' || value === 'dark' ? value : 'auto'
}

function applyMode(mode: ThemeMode) {
  const light = mode === 'light' ||
    (mode === 'auto' && window.matchMedia('(prefers-color-scheme: light)').matches)
  document.documentElement.classList.toggle('light', light)
}

/** Cycles auto → light → dark. Persists to localStorage; the layout's
 *  pre-paint script applies the stored choice on the next load. */
export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<ThemeMode>('auto')

  useEffect(() => {
    // Deferred: avoids a synchronous setState during hydration.
    const id = window.setTimeout(() => setMode(storedMode()), 0)
    return () => window.clearTimeout(id)
  }, [])

  // Follow system changes while in auto.
  useEffect(() => {
    if (mode !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => applyMode('auto')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  function cycle() {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]
    setMode(next)
    if (next === 'auto') localStorage.removeItem('lifeos-theme')
    else localStorage.setItem('lifeos-theme', next)
    applyMode(next)
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${mode}. Tap to change.`}
      title={`Theme: ${mode}`}
      className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--ink-04)] px-2.5 py-1.5 transition-colors hover:border-[var(--border-hi)]"
    >
      <span className="font-mono text-[11px] leading-none text-[var(--text-dim)]">{GLYPH[mode]}</span>
      {!compact && (
        <span className="font-mono text-[10px] uppercase leading-none tracking-[0.1em] text-[var(--text-faint)]">
          {mode}
        </span>
      )}
    </button>
  )
}
