interface ProgressBarProps {
  value: number
  max: number
  color?: string
}

export default function ProgressBar({
  value,
  max,
  color = '#00d26a',
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className="w-full h-1 bg-[#2a2a2a] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  )
}
