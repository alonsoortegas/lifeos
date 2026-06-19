import type { ButtonHTMLAttributes } from 'react'
import { cx } from './classnames'

export type IconButtonSize = 'sm' | 'md' | 'lg'
export type IconButtonVariant = 'glass' | 'ghost' | 'outline'

const SIZES: Record<IconButtonSize, string> = {
  sm: 'h-8 w-8 text-[13px]',
  md: 'h-10 w-10 text-[15px]',
  lg: 'h-11 w-11 text-[18px]',
}

const VARIANTS: Record<IconButtonVariant, string> = {
  glass: 'glass border border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border-hi)] hover:text-[var(--text)]',
  ghost: 'border border-transparent text-[var(--text-dim)] hover:bg-[var(--ink-04)] hover:text-[var(--text)]',
  outline: 'border border-[var(--border)] bg-transparent text-[var(--text-dim)] hover:border-[var(--border-hi)] hover:text-[var(--text)]',
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  size?: IconButtonSize
  variant?: IconButtonVariant
}

export default function IconButton({
  label,
  size = 'sm',
  variant = 'glass',
  className,
  children,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={props.title ?? label}
      className={cx(
        'inline-flex flex-shrink-0 items-center justify-center rounded-full leading-none transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d26a] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
        'active:scale-[0.92] disabled:pointer-events-none disabled:opacity-40',
        SIZES[size],
        VARIANTS[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
