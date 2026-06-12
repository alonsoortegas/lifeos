const DELTA_TONE_COLOR: Record<string, string> = {
  good: '#00d26a',
  warn: '#fbbf24',
  bad:  '#fb7185',
  neutral: 'var(--text-faint)',
}

interface StatCardProps {
  label: string
  value: string | number
  unit?: string
  sub?: string
  accent?: boolean
  color?: string
  delta?: {
    value: string
    tone: 'good' | 'warn' | 'bad' | 'neutral'
    label: string
  }
}

export default function StatCard({
  label,
  value,
  unit,
  sub,
  accent = false,
  color,
  delta,
}: StatCardProps) {
  const channel = color ?? '#00d26a'
  return (
    <div className={`panel relative overflow-hidden rounded-2xl p-4 ${accent ? 'ticks' : ''}`}>
      {/* Soft channel aura in the corner */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full"
        style={{ background: channel, opacity: 0.09, filter: 'blur(22px)' }}
      />
      <div className="mb-1.5 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ background: channel, boxShadow: `0 0 8px ${channel}88` }}
        />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-dim)]">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono, monospace)',
            color: color ?? 'var(--text)',
            fontVariantNumeric: 'tabular-nums',
            textShadow: accent ? `0 0 18px ${channel}55` : undefined,
          }}
          className="text-[30px] font-bold leading-none"
        >
          {value}
        </span>
        {unit && (
          <span
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
            className="text-sm text-[var(--text-dim)]"
          >
            {unit}
          </span>
        )}
      </div>
      {delta && (
        <div
          className="mt-2 flex items-center gap-1.5"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
            style={{
              color: DELTA_TONE_COLOR[delta.tone],
              background: `${DELTA_TONE_COLOR[delta.tone]}1a`,
            }}
          >
            {delta.value}
          </span>
          <span className="text-[10px] text-[var(--text-faint)]">{delta.label}</span>
        </div>
      )}
      {sub && (
        <div
          className={`text-[10px] ${delta ? 'mt-1' : 'mt-1'} text-[var(--text-faint)]`}
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}
