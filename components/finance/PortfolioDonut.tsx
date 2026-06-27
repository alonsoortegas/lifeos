interface DonutSegment {
  label: string
  value: number
  color: string
  /** 0–1 opacity so same-class holdings stay distinguishable. */
  opacity?: number
}

interface PortfolioDonutProps {
  segments: DonutSegment[]
  centerValue: string
  centerLabel?: string
  size?: number
  thickness?: number
}

/** SVG donut showing how net worth is composed — one arc per segment, drawn
 *  clockwise from 12 o'clock with a hairline gap between slices. */
export default function PortfolioDonut({
  segments,
  centerValue,
  centerLabel = 'net worth',
  size = 156,
  thickness = 18,
}: PortfolioDonutProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  const r = (size - thickness) / 2
  const cx = size / 2
  const circ = 2 * Math.PI * r
  const gap = segments.length > 1 ? 1.5 : 0 // px gap between slices

  const visible = segments.filter((seg) => seg.value > 0)
  const fracs = visible.map((seg) => (total > 0 ? seg.value / total : 0))
  // Cumulative start offset (in circumference units) for each slice.
  const offsets = fracs.map((_, i) => fracs.slice(0, i).reduce((a, b) => a + b, 0) * circ)

  const arcs = visible.map((seg, i) => {
    const len = Math.max(0, fracs[i] * circ - gap)
    return (
      <circle
        key={`${seg.label}-${i}`}
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke={seg.color}
        strokeOpacity={seg.opacity ?? 1}
        strokeWidth={thickness}
        strokeDasharray={`${len} ${circ - len}`}
        strokeDashoffset={-offsets[i]}
        strokeLinecap="butt"
      />
    )
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="Portfolio composition">
      {/* track */}
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--ink-06)" strokeWidth={thickness} />
      {/* slices, rotated so 0 starts at the top */}
      <g transform={`rotate(-90 ${cx} ${cx})`}>{arcs}</g>
      <text
        x={cx} y={cx - 4} textAnchor="middle"
        style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontWeight: 700, fontSize: 19, fill: 'var(--text)' }}
      >
        {centerValue}
      </text>
      <text
        x={cx} y={cx + 14} textAnchor="middle"
        style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 9, letterSpacing: '0.1em', fill: 'var(--text-faint)', textTransform: 'uppercase' }}
      >
        {centerLabel}
      </text>
    </svg>
  )
}
