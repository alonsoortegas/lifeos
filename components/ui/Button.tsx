import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './classnames'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'btn-accent border border-transparent text-[#062514]',
  secondary: 'glass border border-[var(--border)] text-[var(--text)] hover:border-[var(--border-hi)]',
  outline: 'border border-[#00d26a] bg-transparent text-[#00d26a] hover:bg-[rgba(0,210,106,0.08)]',
  ghost: 'border border-transparent bg-transparent text-[var(--text-dim)] hover:bg-[var(--ink-04)] hover:text-[var(--text)]',
  danger: 'border border-[#ef444466] bg-[#ef44440d] text-[#fb7185] hover:bg-[#ef444419]',
}

const SIZES: Record<ButtonSize, string> = {
  xs: 'min-h-7 rounded-lg px-2.5 py-1 text-[10px]',
  sm: 'min-h-9 rounded-xl px-3 py-2 text-[11px]',
  md: 'min-h-10 rounded-xl px-4 py-2.5 text-[13px]',
  lg: 'min-h-[46px] rounded-xl px-5 py-3 text-[14px]',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  loading?: boolean
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
}

export default function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  leadingIcon,
  trailingIcon,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'display inline-flex items-center justify-center gap-2 font-bold transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d26a] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
        'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className
      )}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      ) : leadingIcon}
      <span>{children}</span>
      {!loading && trailingIcon}
    </button>
  )
}
