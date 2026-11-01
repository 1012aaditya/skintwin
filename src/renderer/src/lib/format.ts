import type { Price } from '@shared/models'

export function formatPrice(p: Price | null | undefined): string | null {
  if (!p) return null
  try {
    return new Intl.NumberFormat(p.currency === 'INR' ? 'en-IN' : undefined, { style: 'currency', currency: p.currency, maximumFractionDigits: 0 }).format(p.amount)
  } catch {
    return `${p.amount} ${p.currency}`
  }
}

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, opts)
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

export function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
