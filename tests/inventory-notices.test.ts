import { describe, expect, it } from 'vitest'
import { activityTitle, currentActivity } from '@shared/activity'
import { effectiveExpiry, inventoryNotices, noticeText, TYPICAL_PAO } from '@shared/inventory'
import type { Database } from '@shared/models'
import { fresh, run } from './helpers'

const now = new Date(2026, 10, 2, 9) // 2 Nov 2026, 9:00 local
const daysFromNow = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString()

/** One owned product with the given patch applied. */
function owned(patch: Partial<Database['inventory'][number]>) {
  const db = run(fresh(), { type: 'inventory.add', productId: 'demo:to-niacinamide', status: 'in_use' })
  return run(db, { type: 'inventory.update', id: db.inventory[0]!.id, patch })
}

describe('when a product goes off', () => {
  it('uses the printed date first, else opened date + the PAO the user entered', () => {
    expect(effectiveExpiry({ expiresAt: '2027-01-01T00:00:00.000Z', openedAt: '2026-01-01T00:00:00.000Z', paoMonths: 6 })).toEqual({ at: '2027-01-01T00:00:00.000Z', basis: 'date' })
    expect(effectiveExpiry({ expiresAt: null, openedAt: '2026-01-15T12:00:00.000Z', paoMonths: 6 })).toMatchObject({ basis: 'pao', at: expect.stringMatching(/^2026-07-15/) })
    expect(effectiveExpiry({ expiresAt: null, openedAt: '2026-01-15T12:00:00.000Z', paoMonths: null })).toBeNull() // never guessed
    expect(TYPICAL_PAO.serum).toBeGreaterThan(0)
  })

  it('notices expired and soon-to-expire products, not ones far off', () => {
    expect(inventoryNotices(owned({ expiresAt: daysFromNow(60) }), now)).toEqual([])
    const [soon] = inventoryNotices(owned({ expiresAt: daysFromNow(5) }), now)
    expect(soon).toMatchObject({ kind: 'expiry', value: 5, basis: 'date' })
    expect(noticeText(soon!, 'Niacinamide')).toBe('Niacinamide expires in 5 days')
    const [past] = inventoryNotices(owned({ openedAt: '2026-04-01T09:00:00.000Z', paoMonths: 6 }), now)
    expect(noticeText(past!, 'Niacinamide')).toMatch(/^Niacinamide expired \d+ days ago \(from the date you opened it\)$/)
  })

  it('treats ≤15% (the user’s own estimate) as running low', () => {
    expect(inventoryNotices(owned({ remainingPct: 20 }), now)).toEqual([])
    const [low] = inventoryNotices(owned({ remainingPct: 10 }), now)
    expect(noticeText(low!, 'Niacinamide')).toBe('Niacinamide is running low (~10% left, your estimate)')
  })

  it('ignores finished or archived products and orders expiry before running low', () => {
    expect(inventoryNotices(owned({ remainingPct: 5, status: 'finished' }), now)).toEqual([])
    expect(inventoryNotices(owned({ remainingPct: 10, expiresAt: daysFromNow(3) }), now).map((n) => n.kind)).toEqual(['expiry', 'low'])
  })

  it('shows at most once a day per item, then joins the queue after the routine', () => {
    const db = owned({ remainingPct: 10, expiresAt: daysFromNow(3) })
    const key = `expiry:${db.inventory[0]!.id}`
    const dismissed = run(db, { type: 'notice.dismiss', key, day: '2026-11-02' })
    expect(inventoryNotices(dismissed, now).map((n) => n.kind)).toEqual(['low'])
    expect(inventoryNotices(dismissed, new Date(2026, 10, 3, 9)).map((n) => n.kind)).toEqual(['expiry', 'low'])
    const a = currentActivity(dismissed, now)
    expect(a).toMatchObject({ kind: 'inventory', notice: { kind: 'low' } })
    expect(activityTitle(a!)).toBe('Running low')
  })
})
