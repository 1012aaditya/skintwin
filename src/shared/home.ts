import type { Database, RoutinePeriod, RoutineStep, SkinAnalysis } from './models'
import { onAvoidList, reactionSuspects, type Suspect } from './reactions'
import type { SinceStarted } from './timeline'

/**
 * What the home screen ("your twin") shows, decided here so it can be tested: today's
 * routine, what seems to be working, what to avoid, and when to check in again.
 */

/** Frequency-aware: is this step due on `date`? */
export function isDue(step: RoutineStep, date: Date): boolean {
  const day = date.getDay()
  switch (step.frequency) {
    case 'daily':
      return true
    case 'alternate_days':
      return Math.floor(date.getTime() / 86_400_000) % 2 === 0
    case '3x_week':
      return [1, 3, 5].includes(day)
    case '2x_week':
      return [2, 5].includes(day)
    case 'weekly':
      return day === 0
  }
}

export interface DueStep {
  period: RoutinePeriod
  step: RoutineStep
  done: boolean
}

/** Enabled steps due today in each enabled routine, and whether they're ticked. */
export function todaysSteps(routines: Database['routines'], date: Date, today: string): DueStep[] {
  return (['am', 'pm'] as const).flatMap((period) =>
    routines[period].enabled ? routines[period].steps.filter((s) => s.enabled && isDue(s, date)).map((step) => ({ period, step, done: step.completions.includes(today) })) : []
  )
}

/** Patterns that point the right way and have had time to show — never early ones. */
export function whatsWorking(insights: SinceStarted[]): SinceStarted[] {
  return insights
    .filter((s) => s.direction === 'better' && !s.early)
    .sort((a, b) => (b.score ? b.score.after - b.score.before : 0) - (a.score ? a.score.after - a.score.before : 0))
}

export interface AvoidSummary {
  /** shared ingredients of reacted products, not yet on the avoid list */
  suspects: Suspect[]
  avoidList: string[]
  /** products still in the routine that the user has logged a reaction to */
  reactedInRoutine: { productId: string; count: number }[]
}

export function whatToAvoid(db: Pick<Database, 'reactions' | 'products' | 'profile' | 'routines'>): AvoidSummary {
  const suspects = reactionSuspects(db.reactions, db.products).filter((s) => !onAvoidList(s, db.profile.avoidIngredients))
  const inRoutine = new Set([...db.routines.am.steps, ...db.routines.pm.steps].filter((s) => s.enabled).map((s) => s.productId))
  const counts = new Map<string, number>()
  for (const r of db.reactions) if (inRoutine.has(r.productId)) counts.set(r.productId, (counts.get(r.productId) ?? 0) + 1)
  return { suspects, avoidList: db.profile.avoidIngredients, reactedInRoutine: [...counts].map(([productId, count]) => ({ productId, count })) }
}

/** A real scan every week keeps the timeline meaningful. */
export const CHECK_IN_DAYS = 7

export type CheckIn = { due: true; days: number | null; text: string } | { due: false; days: number; text: string }

export function checkIn(analyses: SkinAnalysis[], now: Date): CheckIn {
  const last = analyses.find((a) => !a.isMock)
  if (!last) return { due: true, days: null, text: 'Take your first real scan — it’s the starting point everything else is compared with.' }
  const days = Math.floor((now.getTime() - Date.parse(last.createdAt)) / 86_400_000)
  if (days >= CHECK_IN_DAYS) return { due: true, days, text: `It’s been ${days} days since your last scan — time for your weekly check-in.` }
  const left = CHECK_IN_DAYS - days
  return { due: false, days, text: `Next check-in in ${left} day${left === 1 ? '' : 's'}. Same spot and light as last time.` }
}
