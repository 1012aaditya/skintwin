import type { Database } from './models'

/** Snooze and dismiss state for island notices, shared by every kind of live activity. */

const pad = (n: number) => String(n).padStart(2, '0')
export const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Snoozed, or dismissed for today? A dismissed notice can come back the next day. */
export function silenced(notices: Database['notices'], key: string, now: Date): boolean {
  const n = notices[key]
  if (!n) return false
  return n.dismissedDay === localDay(now) || (!!n.snoozedUntil && Date.parse(n.snoozedUntil) > now.getTime())
}
