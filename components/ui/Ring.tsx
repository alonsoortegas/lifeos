interface RingProps {
  value: number
  size?: number
  thickness?: number
  color?: string
}

export default function Ring({
  value,
  size = 140,
  thickness = 12,
  color = '#00d26a',
}: RingProps) {
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const clampedValue = Math.min(100, Math.max(0, value))
  const strokeDashoffset = circumference - (clampedValue / 100) * circumference
  const center = size / 2

  return (
    <svg
      width={size}
      height={size}
      style={{ transform: 'rotate(-90deg)' }}
      aria-label={`Recovery ${value}%`}
    >
      {/* Track */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="#2a2a2a"
        strokeWidth={thickness}
      />
      {/* Arc */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={thickness}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
      />
      {/* Center label — counter-rotate */}
      <text
        x={center}
        y={center}
        textAnchor="middle"
        dominantBaseline="central"
        style={{
          transform: `rotate(90deg) translate(0, 0)`,
          transformOrigin: `${center}px ${center}px`,
          fontFamily: 'var(--font-jetbrains-mono, monospace)',
          fontSize: size * 0.2,
          fontWeight: 700,
          fill: '#ededed',
        }}
      >
        {value}%
      </text>
    </svg>
  )
}
