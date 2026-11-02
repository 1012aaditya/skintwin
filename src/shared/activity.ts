import { todaysSteps, type DueStep } from './home'
import { inventoryNotices, type InventoryNotice } from './inventory'
import type { Database, RoutinePeriod } from './models'
import { localDay, silenced } from './notices'
import { sunNotices, type SunNotice, type UvForecast } from './sun'

export { localDay, silenced }

/**
 * Live activities: small, timely notices the island shows one at a time. This file decides
 * which one (if any) is shown now; the island only draws it. Pure, so it's tested.
 */

export interface RoutineActivity {
  kind: 'routine'
  key: string
  period: RoutinePeriod
  /** due steps for this period, ticked or not, in routine order */
  steps: DueStep[]
  remaining: number
}

/** Which routine window `now` falls in, if any. */
export function routinePeriodAt(settings: Database['settings']['companion'], now: Date): RoutinePeriod | null {
  const h = now.getHours() + now.getMinutes() / 60
  const inside = ([a, b]: [number, number]) => h >= a && h < b
  return inside(settings.amWindow) ? 'am' : inside(settings.pmWindow) ? 'pm' : null
}

export function routineActivity(db: Pick<Database, 'routines' | 'settings' | 'notices'>, now: Date): RoutineActivity | null {
  const c = db.settings.companion
  if (!c.routineReminders) return null
  const period = routinePeriodAt(c, now)
  if (!period) return null
  const key = `routine:${period}`
  if (silenced(db.notices, key, now)) return null
  const steps = todaysSteps(db.routines, now, localDay(now)).filter((d) => d.period === period)
  const remaining = steps.filter((d) => !d.done).length
  // nothing to do: empty routine, nothing due today, or already done
  if (!steps.length || remaining === 0) return null
  return { kind: 'routine', key, period, steps, remaining }
}

/** Something about a product the user owns: expired, expiring soon, or running low. */
export interface InventoryActivity {
  kind: 'inventory'
  key: string
  notice: InventoryNotice
}

/** A UV heads-up from the day's real forecast. */
export interface SunActivity {
  kind: 'sun'
  key: string
  notice: SunNotice
}

/** Every kind of live activity. */
export type Activity = RoutineActivity | InventoryActivity | SunActivity

/**
 * One notice at a time, by priority: the routine (it only shows in its own hours), then a sun
 * alert (time-sensitive), then the most urgent product notice. Snoozed or dismissed ones never
 * come back the same day.
 */
export function currentActivity(db: Pick<Database, 'routines' | 'settings' | 'notices' | 'inventory'>, now: Date, uv: UvForecast | null = null): Activity | null {
  const product = inventoryNotices(db, now)[0]
  const sun = db.settings.companion.sunAlerts ? sunNotices(uv, now, db.notices)[0] : undefined
  const candidates: (Activity | null)[] = [
    routineActivity(db, now),
    sun ? { kind: 'sun', key: sun.key, notice: sun } : null,
    product ? { kind: 'inventory', key: product.key, notice: product } : null
  ]
  return candidates.find((a): a is Activity => !!a) ?? null
}

export const routineTitle = (a: RoutineActivity) => `${a.period === 'am' ? 'AM' : 'PM'} routine · ${a.remaining} step${a.remaining === 1 ? '' : 's'}`

/** A short, name-free title (safe in Privacy mode and on the idle pill). */
export const activityTitle = (a: Activity) =>
  a.kind === 'routine' ? routineTitle(a) : a.kind === 'sun' ? (a.notice.kind === 'morning' ? 'Sun today' : 'Reapply SPF') : a.notice.kind === 'low' ? 'Running low' : a.notice.value < 0 ? 'Product expired' : 'Expiring soon'
