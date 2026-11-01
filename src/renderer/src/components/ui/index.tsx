import { cva, type VariantProps } from 'class-variance-authority'
import { AlertTriangle, Check, Loader2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { forwardRef, useEffect, useId, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@renderer/lib/cn'
import { useToasts } from '@renderer/lib/toast'

// ---------- Button ----------

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98] no-drag cursor-default',
  {
    variants: {
      variant: {
        primary:
          'text-white bg-gradient-to-r from-lilac-500 via-[#a77bff] to-[#c88bff] shadow-[0_6px_24px_-6px_rgb(169_120_255/0.8),inset_0_1px_0_rgb(255_255_255/0.35)] hover:brightness-110',
        glass: 'glass text-ink hover:bg-white/15',
        ghost: 'text-ink-soft hover:text-ink hover:bg-white/10',
        outline: 'border border-white/25 text-ink hover:bg-white/10',
        danger: 'bg-rose-400/20 text-rose-100 border border-rose-300/40 hover:bg-rose-400/30',
        success: 'bg-mint-400/20 text-mint-300 border border-mint-300/40 hover:bg-mint-400/30'
      },
      size: {
        sm: 'h-8 px-3 text-[13px] rounded-pill',
        md: 'h-10 px-4 text-sm rounded-pill',
        lg: 'h-12 px-6 text-[15px] rounded-pill',
        icon: 'h-9 w-9 rounded-full',
        'icon-lg': 'h-14 w-14 rounded-full'
      }
    },
    defaultVariants: { variant: 'glass', size: 'md' }
  }
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, children, disabled, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
    {children}
  </button>
))
Button.displayName = 'Button'

// ---------- Card ----------

export function Card({ className, strong, ...props }: HTMLAttributes<HTMLDivElement> & { strong?: boolean }) {
  return <div className={cn(strong ? 'glass-strong' : 'glass', 'rounded-card', className)} {...props} />
}

export function CardHeader({ icon, title, subtitle, action, className }: { icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-3', className)}>
      {icon && <div className="mt-0.5 text-lilac-200 [&_svg]:h-5 [&_svg]:w-5">{icon}</div>}
      <div className="min-w-0 flex-1">
        <h3 className="text-[17px] font-semibold leading-tight text-ink">{title}</h3>
        {subtitle && <p className="mt-1 text-[13px] text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ---------- Badge / Chip ----------

const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-pill font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-white/10 text-ink-soft border border-white/12',
      lilac: 'bg-lilac-400/20 text-lilac-200 border border-lilac-300/30',
      success: 'bg-emerald-500/18 text-mint-300 border border-mint-300/35',
      warn: 'bg-amber-400/15 text-amber-300 border border-amber-300/35',
      danger: 'bg-rose-500/15 text-rose-200 border border-rose-300/35',
      demo: 'bg-amber-300/12 text-amber-200 border border-dashed border-amber-200/50'
    },
    size: { sm: 'h-6 px-2.5 text-[11.5px]', md: 'h-7 px-3 text-[12.5px]' }
  },
  defaultVariants: { tone: 'neutral', size: 'md' }
})

export function Badge({ className, tone, size, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />
}

export function Chip({ selected, onClick, children, icon, className }: { selected?: boolean; onClick?: () => void; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-pill border px-3.5 text-[13px] transition-all no-drag',
        selected ? 'border-lilac-300/70 bg-lilac-400/30 text-white shadow-glow-soft' : 'border-white/14 bg-white/7 text-ink-soft hover:bg-white/12',
        className
      )}
    >
      {selected ? <Check className="h-3.5 w-3.5" /> : icon}
      {children}
    </button>
  )
}

// ---------- Tabs ----------

export function Tabs<T extends string>({ tabs, value, onChange, className, size = 'md' }: { tabs: { value: T; label: ReactNode; icon?: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string; size?: 'sm' | 'md' }) {
  const id = useId()
  return (
    <div role="tablist" className={cn('glass-inset inline-flex rounded-pill p-1', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn('relative inline-flex items-center gap-2 rounded-pill font-medium transition-colors no-drag', size === 'sm' ? 'h-8 px-3.5 text-[13px]' : 'h-10 px-5 text-sm', value === t.value ? 'text-white' : 'text-ink-soft hover:text-ink')}
        >
          {value === t.value && (
            <motion.span layoutId={`tab-${id}`} className="absolute inset-0 rounded-pill bg-gradient-to-r from-lilac-500/80 to-[#b48cff]/80 shadow-glow" transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }} />
          )}
          <span className="relative flex items-center gap-2 [&_svg]:h-4 [&_svg]:w-4">
            {t.icon}
            {t.label}
          </span>
        </button>
      ))}
    </div>
  )
}

// ---------- Form controls ----------

const fieldBase = 'w-full rounded-2xl border border-white/15 bg-white/8 px-4 text-sm text-ink placeholder:text-ink-faint focus:border-lilac-300/70 focus:bg-white/12 focus:outline-none transition-colors'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, 'h-11', className)} {...props} />
))
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, 'min-h-24 py-3', className)} {...props} />
))
Textarea.displayName = 'Textarea'

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, 'h-11 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 fill=%27none%27 stroke=%27%23d8ccff%27 stroke-width=%272%27%3E%3Cpath d=%27M2 4l4 4 4-4%27/%3E%3C/svg%3E")] bg-[length:12px] bg-[right_14px_center] bg-no-repeat pr-9 [&>option]:bg-dusk', className)} {...props}>
      {children}
    </select>
  )
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  )
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('flex items-center justify-between gap-4', disabled && 'opacity-50')}>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm font-medium text-ink">{label}</span>}
          {description && <span className="mt-0.5 block text-xs text-ink-soft">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-7 w-12 shrink-0 rounded-pill transition-colors no-drag', checked ? 'bg-gradient-to-r from-lilac-500 to-[#b88cff] shadow-glow-soft' : 'bg-white/15')}
      >
        <motion.span layout className={cn('absolute top-1 h-5 w-5 rounded-full bg-white shadow', checked ? 'right-1' : 'left-1')} transition={{ type: 'spring', stiffness: 500, damping: 32 }} />
      </button>
    </label>
  )
}

// ---------- Progress ----------

export function ProgressRing({ value, size = 120, stroke = 10, label, sublabel, tone = 'mint' }: { value: number | null; size?: number; stroke?: number; label?: ReactNode; sublabel?: ReactNode; tone?: 'mint' | 'lilac' | 'amber' }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value))
  const colors = { mint: ['#4ade80', '#a7f3d0'], lilac: ['#a98bff', '#f0abfc'], amber: ['#fbbf24', '#fde68a'] }[tone]
  const gid = useId()
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={colors[0]} />
            <stop offset="1" stopColor={colors[1]} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(255 255 255 / 0.1)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (pct / 100) * c }}
          transition={{ duration: 1, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 6px ${colors[0]}88)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[1.6em] font-semibold leading-none" style={{ fontSize: size / 4.4 }}>
          {label ?? (value == null ? '—' : `${Math.round(value)}%`)}
        </span>
        {sublabel && <span className="mt-1 text-xs text-ink-soft">{sublabel}</span>}
      </div>
    </div>
  )
}

export function Bar({ value, tone = 'mint' }: { value: number; tone?: 'mint' | 'amber' | 'rose' | 'lilac' }) {
  const color = { mint: 'from-emerald-400 to-mint-300', amber: 'from-amber-400 to-amber-300', rose: 'from-rose-400 to-blush-300', lilac: 'from-lilac-500 to-lilac-300' }[tone]
  return (
    <div className="h-2 w-full overflow-hidden rounded-pill bg-white/10">
      <motion.div className={cn('h-full rounded-pill bg-gradient-to-r', color)} initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, value))}%` }} transition={{ duration: 0.7 }} />
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-lilac-200', className)} />
}

// ---------- States ----------

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 rounded-tile border border-dashed border-white/15 px-6 py-10 text-center', className)}>
      {icon && <div className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-lilac-200 [&_svg]:h-6 [&_svg]:w-6">{icon}</div>}
      <p className="text-[15px] font-semibold">{title}</p>
      {body && <p className="max-w-sm text-[13px] text-ink-soft">{body}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ title, body, onRetry, className }: { title: string; body?: ReactNode; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn('flex items-start gap-3 rounded-tile border border-rose-300/30 bg-rose-500/10 p-4', className)} role="alert">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-rose-100">{title}</p>
        {body && <p className="mt-1 text-[13px] text-rose-100/80">{body}</p>}
      </div>
      {onRetry && (
        <Button size="sm" variant="danger" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

// ---------- Dialog ----------

export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[var(--z-overlay)] grid place-items-center bg-[#120a33]/60 p-6 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div role="dialog" aria-modal aria-label={title} className={cn('glass-strong flex max-h-[85vh] w-full flex-col rounded-card', wide ? 'max-w-3xl' : 'max-w-lg')} initial={{ y: 16, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, scale: 0.98 }}>
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h2 className="text-lg font-semibold">{title}</h2>
              <Button size="icon" variant="ghost" aria-label="Close" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="scroll-area px-6 pb-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------- Toasts ----------

export function Toaster() {
  const toasts = useToasts()
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[var(--z-toast)] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className={cn('glass-strong flex items-center gap-2 rounded-pill px-4 py-2.5 text-sm', t.kind === 'error' && 'border-rose-300/50')}
          >
            {t.kind === 'success' ? <Check className="h-4 w-4 text-mint-300" /> : t.kind === 'error' ? <AlertTriangle className="h-4 w-4 text-rose-300" /> : null}
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export function SectionTitle({ eyebrow, title, body }: { eyebrow: string; title: ReactNode; body?: ReactNode }) {
  return (
    <div>
      <p className="text-[12px] font-medium tracking-[0.28em] text-ink-soft uppercase">{eyebrow}</p>
      <h1 className="mt-2 text-[40px] leading-[1.05] font-semibold tracking-tight text-gradient">{title}</h1>
      {body && <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">{body}</p>}
    </div>
  )
}
