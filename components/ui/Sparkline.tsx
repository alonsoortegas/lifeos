import { useId } from 'react'

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
}

/** Trace with phosphor area fill and a live end-point. */
export default function Sparkline({
  data,
  width = 120,
  height = 40,
  color = '#00d26a',
}: SparklineProps) {
  const gradientId = useId()
  if (!data || data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pad = 2

  const coords = data.map((val, i) => ({
    x: (i / (data.length - 1)) * (width - pad * 2) + pad,
    y: height - pad - ((val - min) / range) * (height - pad * 2),
  }))
  const points = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const last = coords[coords.length - 1]
  const area = `${points} ${last.x.toFixed(1)},${height} ${pad},${height}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: 'visible' }}
      aria-label="Sparkline chart"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 3px ${color}55)` }}
      />
      <circle cx={last.x} cy={last.y} r={2.2} fill={color}>
        <animate attributeName="opacity" values="1;0.35;1" dur="2.4s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}
