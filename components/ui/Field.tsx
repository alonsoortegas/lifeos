import type {
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react'
import { cx } from './classnames'

const CONTROL_CLASS = [
  'w-full rounded-xl border border-[var(--border)] bg-[var(--ink-04)]',
  'px-3 text-sm text-[var(--text)] outline-none transition-all duration-150',
  'placeholder:text-[var(--text-faint)] hover:border-[var(--border-hi)]',
  'focus:border-[#00d26a] focus:ring-4 focus:ring-[rgba(0,210,106,0.10)]',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ')

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL_CLASS, 'h-10', className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(CONTROL_CLASS, 'min-h-24 resize-y py-2.5', className)} {...props} />
}

export interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  label?: string
  htmlFor?: string
  hint?: ReactNode
  error?: ReactNode
  optional?: boolean
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional = false,
  className,
  children,
  ...props
}: FieldProps) {
  return (
    <div className={cx('space-y-1.5', className)} {...props}>
      {(label || optional) && (
        <div className="flex items-center justify-between gap-3">
          {label && (
            <label
              htmlFor={htmlFor}
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-dim)]"
            >
              {label}
            </label>
          )}
          {optional && <span className="text-[10px] text-[var(--text-faint)]">Optional</span>}
        </div>
      )}
      {children}
      {error ? (
        <div role="alert" className="text-[11px] text-[#fb7185]">{error}</div>
      ) : hint ? (
        <div className="text-[10px] leading-relaxed text-[var(--text-faint)]">{hint}</div>
      ) : null}
    </div>
  )
}
