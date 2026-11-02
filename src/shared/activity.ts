import { todaysSteps, type DueStep } from './home'
import type { Database, RoutinePeriod } from './models'

/**
 * Live activities: small, timely notices the island shows one at a time. This file decides
 * which one (if any) is shown now; the island only draws it. Pure, so it's tested.
 */

const pad = (n: number) => String(n).padStart(2, '0')
export const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Snoozed or dismissed for today? */
export function silenced(notices: Database['notices'], key: string, now: Date): boolean {
  const n = notices[key]
  if (!n) return false
  return n.dismissedDay === localDay(now) || (!!n.snoozedUntil && Date.parse(n.snoozedUntil) > now.getTime())
}

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

/** Every kind of live activity, highest priority first. More kinds join this list later. */
export type Activity = RoutineActivity

export function currentActivity(db: Pick<Database, 'routines' | 'settings' | 'notices'>, now: Date): Activity | null {
  const candidates: (Activity | null)[] = [routineActivity(db, now)]
  return candidates.find((a): a is Activity => !!a) ?? null
}

export const routineTitle = (a: RoutineActivity) => `${a.period === 'am' ? 'AM' : 'PM'} routine · ${a.remaining} step${a.remaining === 1 ? '' : 's'}`
