interface ProgressBarProps {
  value: number
  max: number
  color?: string
}

/** Rounded gradient bar with a soft glow. */
export default function ProgressBar({
  value,
  max,
  color = '#00d26a',
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className="h-[6px] w-full overflow-hidden rounded-full bg-[var(--ink-06)]">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}aa, ${color})`,
          boxShadow: `0 0 10px ${color}66`,
        }}
      />
    </div>
  )
}
