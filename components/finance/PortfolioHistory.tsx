'use client'

import { useId, useState } from 'react'
import { formatMoney, formatMoneyCompact } from '@/lib/finance'

interface PortfolioHistoryProps {
  data: { date: string; value: number }[]
  color?: string
}

const W = 320
const H = 132
const PAD_L = 6
const PAD_R = 6
const PAD_T = 10
const PAD_B = 18

/** Responsive SVG area chart of net worth over time, with a draggable crosshair
 *  that reads out the value/date at the touched point. */
export default function PortfolioHistory({ data, color = '#00d26a' }: PortfolioHistoryProps) {
  const gradientId = useId()
  const [hover, setHover] = useState<number | null>(null)

  if (data.length < 2) return null

  const values = data.map((d) => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const x = (i: number) => PAD_L + (i / (data.length - 1)) * (W - PAD_L - PAD_R)
  const y = (v: number) => PAD_T + (1 - (v - min) / range) * (H - PAD_T - PAD_B)

  const coords = data.map((d, i) => ({ x: x(i), y: y(d.value) }))
  const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const area = `${line} ${coords[coords.length - 1].x.toFixed(1)},${H - PAD_B} ${PAD_L},${H - PAD_B}`

  const active = hover ?? data.length - 1
  const activePt = coords[active]

  const onMove = (clientX: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect()
    const rel = ((clientX - rect.left) / rect.width) * W
    const i = Math.round(((rel - PAD_L) / (W - PAD_L - PAD_R)) * (data.length - 1))
    setHover(Math.min(data.length - 1, Math.max(0, i)))
  }

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span
          className="text-[17px] font-bold text-[var(--text)]"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          {formatMoney(data[active].value)}
        </span>
        <span className="text-[11px] text-[var(--text-faint)]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
          {data[active].date}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', touchAction: 'none' }}
        onPointerMove={(e) => onMove(e.clientX, e.currentTarget)}
        onPointerDown={(e) => onMove(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHover(null)}
        aria-label="Net worth history"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.26" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* baseline */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="var(--ink-06)" strokeWidth={1} />

        <polygon points={area} fill={`url(#${gradientId})`} />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 3px ${color}55)` }}
        />

        {/* crosshair */}
        <line x1={activePt.x} y1={PAD_T} x2={activePt.x} y2={H - PAD_B} stroke="var(--ink-08)" strokeWidth={1} />
        <circle cx={activePt.x} cy={activePt.y} r={3} fill={color} stroke="var(--bg)" strokeWidth={1.5} />

        {/* y range labels */}
        <text x={PAD_L} y={PAD_T + 2} style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 8, fill: 'var(--text-faint)' }}>
          {formatMoneyCompact(max)}
        </text>
        <text x={PAD_L} y={H - PAD_B - 3} style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 8, fill: 'var(--text-faint)' }}>
          {formatMoneyCompact(min)}
        </text>
      </svg>
      <div className="flex justify-between text-[10px] text-[var(--text-faint)]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
        <span>{data[0].date}</span>
        <span>{data[data.length - 1].date}</span>
      </div>
    </div>
  )
}
