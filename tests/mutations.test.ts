import { describe, expect, it } from 'vitest'
import { MutationError } from '@shared/mutations'
import { fresh, run } from './helpers'

describe('mutation reducer', () => {
  it('adds, reorders and completes routine steps, and persists order', () => {
    let db = run(fresh(), { type: 'routine.addStep', period: 'am', productId: 'demo:cerave-hydrating-cleanser' }, { type: 'routine.addStep', period: 'am', productId: 'demo:to-niacinamide' }, { type: 'routine.addStep', period: 'am', productId: 'demo:lrp-anthelios' })
    const ids = db.routines.am.steps.map((s) => s.id)
    db = run(db, { type: 'routine.reorder', period: 'am', stepIds: [ids[2]!, ids[0]!, ids[1]!] })
    expect(db.routines.am.steps.map((s) => s.productId)).toEqual(['demo:lrp-anthelios', 'demo:cerave-hydrating-cleanser', 'demo:to-niacinamide'])
    db = run(db, { type: 'routine.toggleComplete', period: 'am', stepId: ids[0]!, date: '2026-11-01' })
    expect(db.routines.am.steps.find((s) => s.id === ids[0])!.completions).toEqual(['2026-11-01'])
    db = run(db, { type: 'routine.toggleComplete', period: 'am', stepId: ids[0]!, date: '2026-11-01' })
    expect(db.routines.am.steps.find((s) => s.id === ids[0])!.completions).toEqual([])
  })

  it('rejects a reorder that drops or invents steps', () => {
    const db = run(fresh(), { type: 'routine.addStep', period: 'pm', productId: 'demo:to-niacinamide' })
    expect(() => run(db, { type: 'routine.reorder', period: 'pm', stepIds: ['nope'] })).toThrow(MutationError)
  })

  it('does not duplicate routine steps, saved items or owned products', () => {
    const db = run(
      fresh(),
      { type: 'routine.addStep', period: 'am', productId: 'demo:to-niacinamide' },
      { type: 'routine.addStep', period: 'am', productId: 'demo:to-niacinamide' },
      { type: 'saved.add', productId: 'demo:to-niacinamide', list: 'wishlist', source: 'companion' },
      { type: 'saved.add', productId: 'demo:to-niacinamide', list: 'wishlist', source: 'app' },
      { type: 'inventory.add', productId: 'demo:to-niacinamide' },
      { type: 'inventory.add', productId: 'demo:to-niacinamide' }
    )
    expect(db.routines.am.steps).toHaveLength(1)
    expect(db.saved).toHaveLength(1)
    expect(db.inventory).toHaveLength(1)
  })

  it('rejects references to unknown products', () => {
    expect(() => run(fresh(), { type: 'saved.add', productId: 'ghost', list: 'wishlist', source: 'app' })).toThrow('Unknown product')
  })

  it('marking finished zeroes the user estimate', () => {
    let db = run(fresh(), { type: 'inventory.add', productId: 'demo:cosrx-snail-96', remainingPct: 40 })
    db = run(db, { type: 'inventory.update', id: db.inventory[0]!.id, patch: { status: 'finished' } })
    expect(db.inventory[0]).toMatchObject({ status: 'finished', remainingPct: 0 })
  })

  it('turning off conversation storage deletes history', () => {
    const base = fresh()
    base.conversations.push({ id: 'c1', createdAt: '', updatedAt: '', messages: [] })
    const db = run(base, { type: 'settings.update', patch: { privacy: { storeConversations: false } } })
    expect(db.conversations).toEqual([])
    expect(db.settings.voice.responseEnabled).toBe(true) // untouched
  })

  it('creates manual products with honest provenance', () => {
    const db = run(fresh(), { type: 'product.createManual', id: 'manual:x', product: { name: 'My Cream', brand: 'B', category: 'moisturizer', sizeMl: 50, ingredients: ['Aqua'], url: null, description: null, price: 500 } })
    const p = db.products.find((x) => x.id === 'manual:x')!
    expect(p.source.kind).toBe('manual')
    expect(p.price).toMatchObject({ amount: 500, verified: false })
  })

  it('never mutates its input', () => {
    const base = fresh()
    const snapshot = JSON.stringify(base)
    run(base, { type: 'profile.update', patch: { skinType: 'oily' } })
    expect(JSON.stringify(base)).toBe(snapshot)
  })
})
