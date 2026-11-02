import { describe, expect, it } from 'vitest'
import { currentActivity, routineActivity, routinePeriodAt, routineTitle, silenced } from '@shared/activity'
import { MutationSchema } from '@shared/mutations'
import { fresh, run } from './helpers'

// Monday 2 Nov 2026, local time
const at = (h: number, m = 0) => new Date(2026, 10, 2, h, m)

const withSteps = () => {
  let db = run(
    fresh(),
    { type: 'routine.addStep', period: 'am', productId: 'demo:cerave-hydrating-cleanser' },
    { type: 'routine.addStep', period: 'am', productId: 'demo:to-niacinamide' },
    { type: 'routine.addStep', period: 'pm', productId: 'demo:cerave-hydrating-cleanser' }
  )
  // a weekly step isn't due on a Monday
  db = run(db, { type: 'routine.addStep', period: 'am', productId: 'demo:lrp-anthelios' })
  db = run(db, { type: 'routine.updateStep', period: 'am', stepId: db.routines.am.steps[2]!.id, patch: { frequency: 'weekly' } })
  return db
}

describe('routine live activity', () => {
  it('shows only inside the morning and evening windows', () => {
    const c = fresh().settings.companion
    expect([5, 6, 10, 11, 18, 19, 23].map((h) => routinePeriodAt(c, at(h, 30)))).toEqual([null, 'am', 'am', null, null, 'pm', 'pm'])
    expect(routinePeriodAt({ ...c, amWindow: [5, 9] }, at(5, 30))).toBe('am')
  })

  it('lists the steps due now and counts what’s left', () => {
    const a = routineActivity(withSteps(), at(8))!
    expect(a.period).toBe('am')
    expect(a.steps).toHaveLength(2) // the weekly step isn't due today
    expect(routineTitle(a)).toBe('AM routine · 2 steps')
  })

  it('counts ticked steps and disappears when everything is done', () => {
    let db = withSteps()
    const [s1, s2] = db.routines.am.steps
    db = run(db, { type: 'routine.toggleComplete', period: 'am', stepId: s1!.id, date: '2026-11-02' })
    expect(routineActivity(db, at(8))!.remaining).toBe(1)
    db = run(db, { type: 'routine.toggleComplete', period: 'am', stepId: s2!.id, date: '2026-11-02' })
    expect(routineActivity(db, at(8))).toBeNull()
  })

  it('shows nothing for an empty routine, a paused routine, or when turned off', () => {
    expect(routineActivity(fresh(), at(8))).toBeNull()
    const db = withSteps()
    expect(routineActivity(run(db, { type: 'routine.setEnabled', period: 'am', enabled: false }), at(8))).toBeNull()
    expect(routineActivity(run(db, { type: 'settings.update', patch: { companion: { routineReminders: false } } }), at(8))).toBeNull()
  })

  it('respects snooze and dismiss-for-today', () => {
    const db = withSteps()
    const snoozed = run(db, { type: 'notice.snooze', key: 'routine:am', until: at(9).toISOString() })
    expect(routineActivity(snoozed, at(8, 30))).toBeNull()
    expect(routineActivity(snoozed, at(9, 1))).not.toBeNull()
    const dismissed = run(db, { type: 'notice.dismiss', key: 'routine:am', day: '2026-11-02' })
    expect(routineActivity(dismissed, at(10))).toBeNull()
    expect(silenced(dismissed.notices, 'routine:am', new Date(2026, 10, 3, 8))).toBe(false) // back tomorrow
    expect(currentActivity(dismissed, at(20))?.period).toBe('pm') // the evening is separate
  })

  it('rejects a window that ends before it starts', () => {
    // the IPC layer validates every mutation with this schema before applying it
    expect(MutationSchema.safeParse({ type: 'settings.update', patch: { companion: { amWindow: [11, 6] } } }).success).toBe(false)
    expect(MutationSchema.safeParse({ type: 'settings.update', patch: { companion: { amWindow: [5, 10] } } }).success).toBe(true)
  })
})
