'use client'

import { useEffect, useState } from 'react'

/** Reads the effective theme straight off the html element — single source
 *  of truth, set by the pre-paint script in layout.tsx before hydration. */
function effectiveLight(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('light')
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.4" />
      <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.4 14.2A8.5 8.5 0 0 1 9.8 3.6a8.5 8.5 0 1 0 10.6 10.6Z" />
    </svg>
  )
}

/** One click flips light ↔ dark (from the currently effective theme) and
 *  stores the choice. Until the first click, the pre-paint script follows
 *  the system preference. */
export default function ThemeToggle() {
  const [light, setLight] = useState(false)

  useEffect(() => {
    // Deferred: avoids a synchronous setState during hydration.
    const id = window.setTimeout(() => setLight(effectiveLight()), 0)
    return () => window.clearTimeout(id)
  }, [])

  function toggle() {
    const next = !effectiveLight()
    document.documentElement.classList.toggle('light', next)
    localStorage.setItem('lifeos-theme', next ? 'light' : 'dark')
    setLight(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
      title={light ? 'Switch to dark mode' : 'Switch to light mode'}
      className="glass flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-dim)] transition-all duration-150 hover:text-[var(--text)] active:scale-[0.92]"
    >
      <span
        key={light ? 'sun' : 'moon'}
        className="flicker flex items-center justify-center"
      >
        {light ? <SunIcon /> : <MoonIcon />}
      </span>
    </button>
  )
}
