import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './classnames'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-[var(--border)] bg-[var(--ink-04)] text-[var(--text-dim)]',
  accent: 'border-[#38bdf866] bg-[#38bdf814] text-[#38bdf8]',
  success: 'border-[#00d26a66] bg-[#00d26a14] text-[#00d26a]',
  warning: 'border-[#f59e0b66] bg-[#f59e0b14] text-[#f59e0b]',
  danger: 'border-[#ef444466] bg-[#ef444414] text-[#fb7185]',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  dot?: boolean
  icon?: ReactNode
}

export default function Badge({
  tone = 'neutral',
  dot = false,
  icon,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-1',
        'font-mono text-[9px] font-bold uppercase tracking-[0.12em]',
        TONES[tone],
        className
      )}
      {...props}
    >
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
      {icon}
      {children}
    </span>
  )
}
