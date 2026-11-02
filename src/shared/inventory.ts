import type { Database, InventoryItem, ProductCategory } from './models'
import { silenced } from './notices'

/**
 * When a product the user owns runs out or goes off — from what they entered: a printed
 * use-by date, or the opened date plus the period after opening (PAO) read off the jar.
 * SkinTwin never guesses a PAO; the category values below are only offered as a starting
 * point, labelled as typical guidance.
 */

/** Typical PAO by category, in months. Offered as a suggestion only — the jar's own symbol wins. */
export const TYPICAL_PAO: Record<ProductCategory, number> = {
  cleanser: 12,
  toner: 12,
  essence: 12,
  serum: 6,
  treatment: 6,
  moisturizer: 12,
  sunscreen: 12,
  exfoliant: 12,
  mask: 12,
  eye: 6,
  other: 12
}
export const PAO_GUIDANCE = 'Typical guidance only — check the open-jar symbol on your product (e.g. “12M”).'

/** Days ahead to start mentioning an expiry. */
export const EXPIRY_NOTICE_DAYS = 14
/** At or below this (the user's own estimate) a product counts as running low. */
export const LOW_PCT = 15

const ACTIVE = new Set(['in_use', 'running_low', 'unopened'])

/** The date it should be used by, and where that date comes from. */
export function effectiveExpiry(item: Pick<InventoryItem, 'expiresAt' | 'openedAt' | 'paoMonths'>): { at: string; basis: 'date' | 'pao' } | null {
  if (item.expiresAt) return { at: item.expiresAt, basis: 'date' }
  if (item.openedAt && item.paoMonths) {
    const d = new Date(item.openedAt)
    d.setMonth(d.getMonth() + item.paoMonths)
    return { at: d.toISOString(), basis: 'pao' }
  }
  return null
}

const daysUntil = (iso: string, now: Date) => Math.ceil((Date.parse(iso) - now.getTime()) / 86_400_000)

export interface InventoryNotice {
  kind: 'expiry' | 'low'
  key: string
  itemId: string
  productId: string
  /** expiry: days left (negative = past); low: the user's remaining estimate */
  value: number
  basis: 'date' | 'pao' | 'estimate' | 'status'
}

/** Expired / expiring soon / running low, most urgent first; snoozed or dismissed ones left out. */
export function inventoryNotices(db: Pick<Database, 'inventory' | 'notices'>, now: Date): InventoryNotice[] {
  const out: InventoryNotice[] = []
  for (const i of db.inventory) {
    if (!ACTIVE.has(i.status)) continue
    const exp = effectiveExpiry(i)
    if (exp) {
      const days = daysUntil(exp.at, now)
      if (days <= EXPIRY_NOTICE_DAYS) out.push({ kind: 'expiry', key: `expiry:${i.id}`, itemId: i.id, productId: i.productId, value: days, basis: exp.basis })
    }
    if ((i.remainingPct != null && i.remainingPct <= LOW_PCT) || i.status === 'running_low')
      out.push({ kind: 'low', key: `low:${i.id}`, itemId: i.id, productId: i.productId, value: i.remainingPct ?? LOW_PCT, basis: i.remainingPct != null ? 'estimate' : 'status' })
  }
  return out
    .filter((n) => !silenced(db.notices, n.key, now))
    .sort((a, b) => (a.kind === b.kind ? a.value - b.value : a.kind === 'expiry' ? -1 : 1))
}

/** The notice in words, given the product's name. */
export function noticeText(n: InventoryNotice, name: string): string {
  if (n.kind === 'low') return n.basis === 'estimate' ? `${name} is running low (~${n.value}% left, your estimate)` : `${name} is running low`
  const from = n.basis === 'pao' ? ' (from the date you opened it)' : ''
  if (n.value < 0) return `${name} expired ${-n.value} day${n.value === -1 ? '' : 's'} ago${from}`
  if (n.value === 0) return `${name} expires today${from}`
  return `${name} expires in ${n.value} day${n.value === 1 ? '' : 's'}${from}`
}
