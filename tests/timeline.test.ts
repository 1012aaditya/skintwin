import { describe, expect, it } from 'vitest'
import type { Database, SkinAnalysis } from '@shared/models'
import { describeSince, productUses, sinceStarted, timelineEvents } from '@shared/timeline'
import { fresh, run } from './helpers'

const scan = (id: string, day: string, moisture: number, extra: Partial<SkinAnalysis> = {}): SkinAnalysis => ({
  id,
  createdAt: `${day}T12:00:00.000Z`,
  provider: 'youcam',
  isMock: false,
  overallScore: null,
  skinAge: null,
  skinType: null,
  metrics: [
    { key: 'moisture', label: 'Moisture', score: moisture, raw: null },
    { key: 'redness', label: 'Redness', score: 60, raw: null }
  ],
  taskId: null,
  ...extra
})

/** A DB where the niacinamide serum was ticked in the AM routine on the given days. */
function withRoutine(days: string[]): Database {
  let db = run(fresh(), { type: 'routine.addStep', period: 'am', productId: 'demo:to-niacinamide' })
  const stepId = db.routines.am.steps[0]!.id
  for (const date of days) db = run(db, { type: 'routine.toggleComplete', period: 'am', stepId, date })
  return db
}

const TODAY = '2026-11-02'

describe('product use from the routine and inventory', () => {
  it('starts on the first tick and stops after two weeks without use', () => {
    const u = productUses(withRoutine(['2026-09-10', '2026-09-01', '2026-09-20']), TODAY)
    expect(u).toEqual([{ productId: 'demo:to-niacinamide', start: '2026-09-01', startBasis: 'routine', stop: '2026-09-20', stopBasis: 'no_recent_use' }])
    expect(productUses(withRoutine(['2026-10-01', '2026-10-30']), TODAY)[0]!.stop).toBeNull()
  })

  it('uses the opened date when it is earlier, and a finished status as the stop', () => {
    let db = run(withRoutine(['2026-10-05']), { type: 'inventory.add', productId: 'demo:to-niacinamide', openedAt: '2026-10-01T09:00:00.000Z' })
    expect(productUses(db, '2026-10-10')[0]).toMatchObject({ start: '2026-10-01', startBasis: 'opened', stop: null })
    db = run(db, { type: 'inventory.update', id: db.inventory[0]!.id, patch: { status: 'finished' } })
    expect(productUses(db, '2026-10-10')[0]!.stopBasis).toBe('finished')
  })
})

describe('since you started…', () => {
  const base = withRoutine(['2026-10-01', '2026-10-31'])

  it('needs a scan before the start and one after it', () => {
    expect(sinceStarted({ ...base, analyses: [scan('after', '2026-10-20', 70)] }, TODAY)).toEqual([])
    expect(sinceStarted({ ...base, analyses: [scan('before', '2026-09-20', 60)] }, TODAY)).toEqual([])
    // a scan on the start day itself is ambiguous and doesn't count
    expect(sinceStarted({ ...base, analyses: [scan('same', '2026-10-01', 70), scan('before', '2026-09-20', 60)] }, TODAY)).toEqual([])
  })

  it('reports the change as a pattern, never proof', () => {
    const [s] = sinceStarted({ ...base, analyses: [scan('after', '2026-10-25', 72), scan('before', '2026-09-20', 60)] }, TODAY)
    expect(s).toMatchObject({ before: { id: 'before' }, after: { id: 'after' }, score: { before: 60, after: 66 }, days: 24, early: false, direction: 'better' })
    expect(describeSince(s!, 'Niacinamide 10%')).toBe('Since you started Niacinamide 10% on 1 Oct, your skin score went 60 → 66 and moisture 60 → 72. A pattern worth watching, not proof.')
  })

  it('says when it is too early, and ignores mock scans', () => {
    const [s] = sinceStarted({ ...base, analyses: [scan('mock', '2026-10-28', 99, { isMock: true }), scan('after', '2026-10-05', 61), scan('before', '2026-09-20', 60)] }, TODAY)
    expect(s!.after.id).toBe('after')
    expect(describeSince(s!, 'X')).toMatch(/Only 4 days in — too early/)
  })

  it('mentions other products started in the same window', () => {
    let db = run(base, { type: 'routine.addStep', period: 'pm', productId: 'demo:cerave-hydrating-cleanser' })
    db = run(db, { type: 'routine.toggleComplete', period: 'pm', stepId: db.routines.pm.steps[0]!.id, date: '2026-10-10' })
    const s = sinceStarted({ ...db, analyses: [scan('after', '2026-10-25', 72), scan('before', '2026-09-20', 60)] }, TODAY).find((x) => x.productId === 'demo:to-niacinamide')!
    expect(s.alsoStarted).toEqual(['demo:cerave-hydrating-cleanser'])
    expect(describeSince(s, 'X')).toMatch(/1 other product in that time too/)
  })

  it('skips scans taken in very different light', () => {
    const cap = (lightMean: number) => ({ capture: { source: 'live' as const, camera: 'Cam', lightMean, lightBalance: 0.9, effectsOn: [], exposureLocked: false, skinDetail: null } })
    expect(sinceStarted({ ...base, analyses: [scan('after', '2026-10-25', 72, cap(0.75)), scan('before', '2026-09-20', 60, cap(0.4))] }, TODAY)).toEqual([])
  })
})

describe('timeline events', () => {
  it('puts scans, starts, stops and reactions on one axis, without mocks', () => {
    let db = { ...withRoutine(['2026-09-01', '2026-09-05']), analyses: [scan('mock', '2026-09-03', 50, { isMock: true }), scan('s', '2026-09-02', 60)] }
    db = run(db, { type: 'reaction.add', productId: 'demo:to-niacinamide', kind: 'redness', at: '2026-09-04T12:00:00.000Z' })
    expect(timelineEvents(db, TODAY).map((e) => `${e.day} ${e.kind}`)).toEqual(['2026-09-01 start', '2026-09-02 scan', '2026-09-04 reaction', '2026-09-05 stop'])
  })
})
