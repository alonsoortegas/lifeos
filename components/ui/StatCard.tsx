interface StatCardProps {
  label: string
  value: string | number
  unit?: string
  sub?: string
  accent?: boolean
}

export default function StatCard({
  label,
  value,
  unit,
  sub,
  accent = false,
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
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          className="text-[28px] font-bold text-[#ededed] leading-none"
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
      {sub && (
        <div
          className="text-[#555] text-[10px] mt-1"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}
