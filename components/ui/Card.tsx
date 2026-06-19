import type { HTMLAttributes } from 'react'
import { cx } from './classnames'

type CardSurface = 'panel' | 'glass' | 'glass-thick' | 'plain'
type CardRadius = 'lg' | 'xl' | '2xl' | '3xl'

const SURFACES: Record<CardSurface, string> = {
  panel: 'panel',
  glass: 'glass border border-[var(--border)]',
  'glass-thick': 'glass-thick border border-[var(--border)]',
  plain: 'border border-[var(--border)] bg-[var(--surface)]',
}

const RADII: Record<CardRadius, string> = {
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  '3xl': 'rounded-3xl',
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  surface?: CardSurface
  radius?: CardRadius
  interactive?: boolean
}

export default function Card({
  surface = 'panel',
  radius = '2xl',
  interactive = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cx(
        SURFACES[surface],
        RADII[radius],
        interactive && [
          'transition-all duration-150 hover:border-[var(--border-hi)]',
          'hover:shadow-[0_12px_30px_rgba(0,0,0,0.18)]',
        ].join(' '),
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
