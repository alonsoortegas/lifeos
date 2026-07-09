'use client'

// Shared SVG/CSS chart primitives (extracted from WhoopTab).
// SVG presentation attributes can't take var(--token) — colors go through
// style={} where needed; C mirrors the Aurora tokens used by the charts.
const C = {
  card: 'var(--surface)', dim: 'var(--text-dim)', faint: 'var(--text-faint)',
  border: 'var(--border)', accent: '#00d26a',
}
const mono = 'var(--font-jetbrains-mono, monospace)'

export function ChartTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
      <span style={{ fontFamily: mono, fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</span>
      {right}
    </div>
  )
}

export function AxisRow({ first, last }: { first: string; last: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: mono, fontSize: 9, color: C.faint }}>
      <span>{first}</span><span>{last}</span>
    </div>
  )
}

// ─── BigSpark ─────────────────────────────────────────────────────────────────
export function BigSpark({
  data,
  color = C.accent,
  colorByValue = false,
  height = 80,
}: {
  data: number[]
  color?: string
  colorByValue?: boolean
  height?: number
}) {
  if (data.length < 2) return <div style={{ height }} />

  const W = 320
  const H = height
  const pad = { t: 8, r: 8, b: 8, l: 8 }
  const iW = W - pad.l - pad.r
  const iH = H - pad.t - pad.b

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const pts = data.map((v, i) => {
    const x = pad.l + (i / (data.length - 1)) * iW
    const y = pad.t + (1 - (v - min) / range) * iH
    return [x, y] as [number, number]
  })

  const polylinePoints = pts.map(([x, y]) => `${x},${y}`).join(' ')

  const fillPoints = [
    `${pts[0][0]},${pad.t + iH}`,
    ...pts.map(([x, y]) => `${x},${y}`),
    `${pts[pts.length - 1][0]},${pad.t + iH}`,
  ].join(' ')

  function dotColor(v: number): string {
    if (v >= 67) return '#00d26a'
    if (v >= 34) return '#f59e0b'
    return '#ef4444'
  }

  const y34 = pad.t + (1 - (34 - min) / range) * iH
  const y67 = pad.t + (1 - (67 - min) / range) * iH

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', overflow: 'visible' }}>
      <polygon
        points={fillPoints}
        style={{ fill: colorByValue ? 'var(--ink-04)' : color }}
        fillOpacity={colorByValue ? 1 : 0.08}
      />
      {colorByValue && min < 67 && max > 34 && (
        <>
          {y34 >= pad.t && y34 <= pad.t + iH && (
            <line x1={pad.l} y1={y34} x2={pad.l + iW} y2={y34} stroke="#f59e0b" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.5} />
          )}
          {y67 >= pad.t && y67 <= pad.t + iH && (
            <line x1={pad.l} y1={y67} x2={pad.l + iW} y2={y67} stroke="#00d26a" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.5} />
          )}
        </>
      )}
      {/* var(--token) is invalid in SVG presentation attributes — use style */}
      <polyline
        points={polylinePoints}
        fill="none"
        style={{ stroke: colorByValue ? C.dim : color }}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {pts.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={3}
          style={{ fill: colorByValue ? dotColor(data[i]) : color, stroke: C.card }}
          strokeWidth={1}
        />
      ))}
    </svg>
  )
}

// ─── DualSpark ────────────────────────────────────────────────────────────────
export function DualSpark({
  dataA,
  dataB,
  colorA = '#3b82f6',
  colorB = '#f97316',
  height = 80,
}: {
  dataA: number[]
  dataB: number[]
  colorA?: string
  colorB?: string
  height?: number
}) {
  const len = Math.min(dataA.length, dataB.length)
  if (len < 2) return <div style={{ height }} />

  const W = 320
  const H = height
  const pad = { t: 8, r: 8, b: 8, l: 8 }
  const iW = W - pad.l - pad.r
  const iH = H - pad.t - pad.b

  function normalize(arr: number[]) {
    const mn = Math.min(...arr)
    const mx = Math.max(...arr)
    const rng = mx - mn || 1
    return arr.map((v, i) => {
      const x = pad.l + (i / (arr.length - 1)) * iW
      const y = pad.t + (1 - (v - mn) / rng) * iH
      return [x, y] as [number, number]
    })
  }

  const ptsA = normalize(dataA.slice(0, len))
  const ptsB = normalize(dataB.slice(0, len))

  function toPolyline(pts: [number, number][]) {
    return pts.map(([x, y]) => `${x},${y}`).join(' ')
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      <polyline points={toPolyline(ptsA)} fill="none" stroke={colorA} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={toPolyline(ptsB)} fill="none" stroke={colorB} strokeWidth={1.5} strokeDasharray="5 3" strokeLinejoin="round" strokeLinecap="round" />
      {ptsA.map(([x, y], i) => (
        <circle key={`a${i}`} cx={x} cy={y} r={2.5} fill={colorA} style={{ stroke: C.card }} strokeWidth={1} />
      ))}
      {ptsB.map(([x, y], i) => (
        <circle key={`b${i}`} cx={x} cy={y} r={2.5} fill={colorB} style={{ stroke: C.card }} strokeWidth={1} />
      ))}
    </svg>
  )
}

// ─── BarChart ─────────────────────────────────────────────────────────────────
export function BarChart({
  data,
  color = '#a78bfa',
  colors,
  height = 80,
  maxVal,
}: {
  data: number[]
  color?: string
  colors?: string[]
  height?: number
  maxVal?: number
}) {
  if (data.length === 0) return <div style={{ height }} />
  const mx = maxVal ?? Math.max(...data, 1)

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', height, gap: 2 }}>
      {data.map((v, i) => {
        const pct = Math.min(v / mx, 1) * 100
        const bg = colors ? colors[i] : color
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${Math.max(pct, 2)}%`,
              backgroundColor: bg,
              borderRadius: '3px 3px 0 0',
              opacity: 0.85,
            }}
          />
        )
      })}
    </div>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────
export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
      {items.map(item => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {item.dashed
            ? <div style={{ width: 20, height: 0, border: `1px dashed ${item.color}`, borderRadius: 1 }} />
            : <div style={{ width: 20, height: 2, background: item.color, borderRadius: 1 }} />
          }
          <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{item.label}</span>
        </div>
      ))}
    </div>
  )
}
