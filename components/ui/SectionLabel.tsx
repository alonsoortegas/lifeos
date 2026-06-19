import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './classnames'

interface SectionLabelProps extends HTMLAttributes<HTMLDivElement> {
  aside?: ReactNode
}

export default function SectionLabel({
  aside,
  className,
  children,
  ...props
}: SectionLabelProps) {
  return (
    <div
      className={cx(
        'flex items-center justify-between gap-3 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]',
        className
      )}
      {...props}
    >
      <span>{children}</span>
      {aside}
    </div>
  )
}
