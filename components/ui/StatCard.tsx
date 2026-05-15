const DELTA_TONE_COLOR: Record<string, string> = {
  good: '#00d26a',
  warn: '#f59e0b',
  bad:  '#ef4444',
  neutral: '#555',
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
  return (
    <div
      className={`bg-[#1a1a1a] rounded-xl p-4 border ${
        accent ? 'border-[#00d26a]' : 'border-[#2a2a2a]'
      }`}
    >
      <div
        style={{ fontFamily: 'inherit' }}
        className="text-[#888] uppercase text-[11px] tracking-widest mb-1"
      >
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: color ?? '#ededed' }}
          className="text-[28px] font-bold leading-none"
        >
          {value}
        </span>
        {unit && (
          <span
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
            className="text-[#888] text-sm"
          >
            {unit}
          </span>
        )}
      </div>
      {delta && (
        <div
          className="flex items-center gap-1.5 mt-2"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          <span className="text-[10px] font-bold" style={{ color: DELTA_TONE_COLOR[delta.tone] }}>
            {delta.value}
          </span>
          <span className="text-[10px] text-[#555]">{delta.label}</span>
        </div>
      )}
      {sub && (
        <div
          className={`text-[10px] ${delta ? 'mt-0.5' : 'mt-1'} text-[#555]`}
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}
