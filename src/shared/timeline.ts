import type { Database, SkinAnalysis } from './models'
import { comparable, metricDeltas, roundDelta, scanScore, type MetricDelta } from './skin'

/**
 * Everything SkinTwin knows happened to the user's skin, on one time axis: real scans,
 * when each product was started (and stopped), and logged reactions. Built only from what
 * the user recorded — nothing is estimated or filled in.
 */

/** Local calendar day, YYYY-MM-DD — the same key routine completions use. */
export const dayKey = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86_400_000)

/** A stretch of days with no logged use after which a product counts as stopped. */
export const STOPPED_AFTER_DAYS = 14

export interface ProductUse {
  productId: string
  /** first day of use: earliest routine tick or the day it was opened */
  start: string
  startBasis: 'routine' | 'opened'
  /** null while still in use */
  stop: string | null
  stopBasis: 'finished' | 'paused' | 'no_recent_use' | null
}

export function productUses(db: Pick<Database, 'routines' | 'inventory'>, today: string): ProductUse[] {
  const ticks = new Map<string, string[]>()
  for (const step of [...db.routines.am.steps, ...db.routines.pm.steps]) ticks.set(step.productId, [...(ticks.get(step.productId) ?? []), ...step.completions])
  const opened = new Map<string, { day: string; status: string; updated: string }>()
  for (const i of db.inventory) {
    if (!i.openedAt) continue
    const day = dayKey(i.openedAt)
    const prev = opened.get(i.productId)
    if (!prev || day < prev.day) opened.set(i.productId, { day, status: i.status, updated: dayKey(i.updatedAt) })
  }
  const ids = new Set([...ticks.keys(), ...opened.keys()])
  const out: ProductUse[] = []
  for (const productId of ids) {
    const days = [...new Set(ticks.get(productId) ?? [])].sort()
    const o = opened.get(productId)
    const first = days[0]
    if (!first && !o) continue
    const fromRoutine = !!first && (!o || first <= o.day)
    const start = fromRoutine ? first! : o!.day
    const last = days.at(-1) ?? null
    const inv = o?.status
    let stop: string | null = null
    let stopBasis: ProductUse['stopBasis'] = null
    if (inv === 'finished' || inv === 'archived' || inv === 'paused') {
      stop = last && last > o!.updated ? last : o!.updated
      stopBasis = inv === 'paused' ? 'paused' : 'finished'
    } else if (last && daysBetween(last, today) >= STOPPED_AFTER_DAYS) {
      stop = last
      stopBasis = 'no_recent_use'
    }
    out.push({ productId, start, startBasis: fromRoutine ? 'routine' : 'opened', stop, stopBasis })
  }
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

export type TimelineEvent =
  | { kind: 'scan'; day: string; at: string; analysisId: string; score: number | null }
  | { kind: 'start'; day: string; productId: string; basis: ProductUse['startBasis'] }
  | { kind: 'stop'; day: string; productId: string; basis: NonNullable<ProductUse['stopBasis']> }
  | { kind: 'reaction'; day: string; at: string; productId: string; reaction: string; reactionId: string }

export const realScans = (analyses: SkinAnalysis[]) => analyses.filter((a) => !a.isMock)

export function timelineEvents(db: Pick<Database, 'routines' | 'inventory' | 'analyses' | 'reactions'>, today: string): TimelineEvent[] {
  const events: TimelineEvent[] = []
  for (const a of realScans(db.analyses)) events.push({ kind: 'scan', day: dayKey(a.createdAt), at: a.createdAt, analysisId: a.id, score: scanScore(a).value })
  for (const u of productUses(db, today)) {
    events.push({ kind: 'start', day: u.start, productId: u.productId, basis: u.startBasis })
    if (u.stop && u.stopBasis) events.push({ kind: 'stop', day: u.stop, productId: u.productId, basis: u.stopBasis })
  }
  for (const r of db.reactions) events.push({ kind: 'reaction', day: dayKey(r.at), at: r.at, productId: r.productId, reaction: r.kind, reactionId: r.id })
  return events.sort((a, b) => a.day.localeCompare(b.day))
}

/** Before this many days, a change can't reasonably be put down to the product. */
export const EARLY_DAYS = 14

export interface SinceStarted {
  productId: string
  start: string
  before: SkinAnalysis
  after: SkinAnalysis
  score: { before: number; after: number } | null
  /** biggest metric moves, both scans scored */
  metrics: MetricDelta[]
  /** days from starting to the later scan */
  days: number
  early: boolean
  /** other products started between the two scans — they could explain the change too */
  alsoStarted: string[]
  direction: 'better' | 'worse' | 'same'
}

/**
 * "Since you started X on <date>, <metric> went a→b": needs a real scan before the start day
 * and one after it (same-day scans are ambiguous, so they don't count), taken in comparable
 * conditions, and while the product was still in use.
 */
export function sinceStarted(db: Pick<Database, 'routines' | 'inventory' | 'analyses'>, today: string): SinceStarted[] {
  const scans = realScans(db.analyses) // newest first
  const uses = productUses(db, today)
  const out: SinceStarted[] = []
  for (const u of uses) {
    const before = scans.find((a) => dayKey(a.createdAt) < u.start)
    if (!before) continue
    const after = scans.find((a) => {
      const d = dayKey(a.createdAt)
      return d > u.start && (!u.stop || d <= u.stop) && comparable(a, before).ok
    })
    if (!after) continue
    const s0 = scanScore(before).value
    const s1 = scanScore(after).value
    const metrics = metricDeltas(after, before).filter((d) => d.delta !== 0)
    const days = daysBetween(u.start, dayKey(after.createdAt))
    const lo = dayKey(before.createdAt)
    const hi = dayKey(after.createdAt)
    const alsoStarted = uses.filter((o) => o.productId !== u.productId && o.start > lo && o.start < hi).map((o) => o.productId)
    const change = s0 != null && s1 != null ? roundDelta(s1 - s0) : 0
    out.push({
      productId: u.productId,
      start: u.start,
      before,
      after,
      score: s0 != null && s1 != null ? { before: s0, after: s1 } : null,
      metrics,
      days,
      early: days < EARLY_DAYS,
      alsoStarted,
      direction: change > 0 ? 'better' : change < 0 ? 'worse' : 'same'
    })
  }
  return out
}

const prettyDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** The insight in words — a pattern, never a claim that the product caused it. */
export function describeSince(s: SinceStarted, productName: string): string {
  const top = s.metrics[0]
  const parts = [`Since you started ${productName} on ${prettyDay(s.start)}`]
  const moves = [s.score ? `your skin score went ${s.score.before} → ${s.score.after}` : null, top ? `${top.label.toLowerCase()} ${top.before} → ${top.after}` : null].filter(Boolean)
  const body = moves.length ? `${parts[0]}, ${moves.join(' and ')}.` : `${parts[0]}, your scores haven’t moved.`
  const caveat = s.early
    ? ` Only ${s.days} day${s.days === 1 ? '' : 's'} in — too early to read much into it.`
    : s.alsoStarted.length
      ? ` You started ${s.alsoStarted.length} other product${s.alsoStarted.length > 1 ? 's' : ''} in that time too, so it’s a pattern, not proof.`
      : ' A pattern worth watching, not proof.'
  return body + caveat
}
