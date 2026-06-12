'use client'

import { useEffect, useState } from 'react'

// Chart.js paints to <canvas> and SVG presentation attributes are not CSS —
// neither resolves `var(--token)`. Charts must use literal colors, resolved
// from the active theme at render time and refreshed when the theme flips.

export interface ResolvedThemeColors {
  bg: string
  surface: string
  border: string
  borderHi: string
  text: string
  dim: string
  faint: string
  grid: string
  /** Canvas font strings can't use var() either. */
  fontMono: string
}

const DARK_FALLBACK: ResolvedThemeColors = {
  bg: '#0b0d12',
  surface: '#14161d',
  border: '#232733',
  borderHi: '#343a4a',
  text: '#f4f6f8',
  dim: '#9aa3b2',
  faint: '#5d6575',
  grid: 'rgba(255,255,255,0.05)',
  fontMono: 'ui-monospace, monospace',
}

function readThemeColors(): ResolvedThemeColors {
  if (typeof window === 'undefined') return DARK_FALLBACK
  const styles = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback
  const light = document.documentElement.classList.contains('light')
  return {
    bg: read('--bg', DARK_FALLBACK.bg),
    surface: read('--surface', DARK_FALLBACK.surface),
    border: read('--border', DARK_FALLBACK.border),
    borderHi: read('--border-hi', DARK_FALLBACK.borderHi),
    text: read('--text', DARK_FALLBACK.text),
    dim: read('--text-dim', DARK_FALLBACK.dim),
    faint: read('--text-faint', DARK_FALLBACK.faint),
    grid: light ? 'rgba(15,23,32,0.06)' : 'rgba(255,255,255,0.05)',
    fontMono: read('--font-geist-mono', DARK_FALLBACK.fontMono),
  }
}

/** Literal theme colors for canvas/SVG charts; updates when the theme flips. */
export function useThemeColors(): ResolvedThemeColors {
  const [colors, setColors] = useState<ResolvedThemeColors>(DARK_FALLBACK)

  useEffect(() => {
    const update = () => setColors(readThemeColors())
    const id = window.setTimeout(update, 0)

    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => {
      window.clearTimeout(id)
      observer.disconnect()
    }
  }, [])

  return colors
}
