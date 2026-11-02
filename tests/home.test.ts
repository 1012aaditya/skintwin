import { describe, expect, it } from 'vitest'
import type { SkinAnalysis } from '@shared/models'
import { checkIn, isDue, todaysSteps, whatsWorking, whatToAvoid } from '@shared/home'
import type { SinceStarted } from '@shared/timeline'
import { fresh, run } from './helpers'

const monday = new Date('2026-11-02T09:00:00')
const scanAt = (iso: string, isMock = false) => ({ id: iso, createdAt: iso, isMock }) as SkinAnalysis

describe('home: today’s routine', () => {
  it('lists due, enabled steps and whether they’re ticked', () => {
    let db = run(fresh(), { type: 'routine.addStep', period: 'am', productId: 'demo:to-niacinamide' }, { type: 'routine.addStep', period: 'pm', productId: 'demo:cerave-hydrating-cleanser' })
    db = run(db, { type: 'routine.updateStep', period: 'pm', stepId: db.routines.pm.steps[0]!.id, patch: { frequency: 'weekly' } })
    db = run(db, { type: 'routine.toggleComplete', period: 'am', stepId: db.routines.am.steps[0]!.id, date: '2026-11-02' })
    expect(todaysSteps(db.routines, monday, '2026-11-02').map((d) => [d.period, d.done])).toEqual([['am', true]]) // weekly = Sundays
    expect(isDue({ ...db.routines.pm.steps[0]! }, new Date('2026-11-01T09:00:00'))).toBe(true)
  })
})

describe('home: what’s working', () => {
  const s = (direction: SinceStarted['direction'], early: boolean, before: number, after: number) => ({ direction, early, score: { before, after } }) as SinceStarted
  it('keeps only improving patterns that have had time, biggest first', () => {
    expect(whatsWorking([s('better', false, 50, 55), s('better', true, 50, 70), s('worse', false, 60, 50), s('better', false, 50, 62)]).map((x) => x.score!.after)).toEqual([62, 55])
  })
})

describe('home: what to avoid', () => {
  it('lists suspects not yet avoided and reacted-to products still in the routine', () => {
    let db = run(fresh(), { type: 'routine.addStep', period: 'am', productId: 'demo:to-niacinamide' })
    db = run(db, { type: 'reaction.add', productId: 'demo:to-niacinamide', kind: 'redness' })
    const a = whatToAvoid(db)
    expect(a.reactedInRoutine).toEqual([{ productId: 'demo:to-niacinamide', count: 1 }])
    expect(a.suspects).toEqual([]) // one reacted product isn't a pattern
  })
})

describe('home: weekly check-in', () => {
  it('asks for a first scan, then nudges weekly, ignoring mocks', () => {
    expect(checkIn([], monday).due).toBe(true)
    expect(checkIn([scanAt('2026-11-01T09:00:00', true)], monday).days).toBeNull()
    expect(checkIn([scanAt('2026-10-30T09:00:00')], monday)).toMatchObject({ due: false, days: 3, text: expect.stringMatching(/in 4 days/) })
    expect(checkIn([scanAt('2026-10-24T09:00:00')], monday)).toMatchObject({ due: true, days: 9 })
  })
})
