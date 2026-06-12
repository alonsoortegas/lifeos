'use client'

import { useEffect, useId, useState } from 'react'

interface RingProps {
  value: number
  size?: number
  thickness?: number
  color?: string
}

/** Gradient gauge with a soft halo; sweeps to its value on mount. */
export default function Ring({
  value,
  size = 140,
  thickness = 12,
  color = '#00d26a',
}: RingProps) {
  const gradientId = useId()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const radius = (size - thickness) / 2 - 2
  const circumference = 2 * Math.PI * radius
  const clampedValue = Math.min(100, Math.max(0, value))
  const target = circumference - (clampedValue / 100) * circumference
  const strokeDashoffset = mounted ? target : circumference
  const center = size / 2
  // Alpha-suffixed effects (#rrggbb + 55) only work for literal hexes; theme
  // vars (e.g. the empty-state var(--border)) skip the glow.
  const isHex = color.startsWith('#')

  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      {/* Halo */}
      <div
        aria-hidden="true"
        className="absolute inset-3 rounded-full"
        style={{ background: color, opacity: clampedValue > 0 && isHex ? 0.13 : 0, filter: 'blur(26px)', transition: 'opacity 0.8s ease' }}
      />
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)', overflow: 'visible', position: 'relative' }}
        aria-label={`Recovery ${value}%`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            {/* style-based stops so CSS variables resolve */}
            <stop offset="0%" style={{ stopColor: color }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 0.55 }} />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          style={{ stroke: 'var(--ring-track)' }}
          strokeWidth={thickness}
        />
        {/* Value arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={thickness}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{
            filter: isHex ? `drop-shadow(0 0 ${thickness * 0.6}px ${color}55)` : undefined,
            transition: 'stroke-dashoffset 1.2s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
        {/* Center value — counter-rotate */}
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            transform: 'rotate(90deg)',
            transformOrigin: `${center}px ${center}px`,
            fontFamily: 'var(--font-jetbrains-mono, monospace)',
            fontVariantNumeric: 'tabular-nums',
            fontSize: size * 0.2,
            fontWeight: 700,
            fill: 'var(--text)',
          }}
        >
          {value}%
        </text>
      </svg>
    </div>
  )
}
