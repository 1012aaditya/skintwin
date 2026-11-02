import { describe, expect, it } from 'vitest'
import { lassoBounds, ScreenReadSchema, type ScreenRead } from '@shared/circle'
import { ProductSchema } from '@shared/models'
import { productFromScreenRead, SCREEN_MERGE_MS } from '../src/main/services/ingest'
import { companionReducer as r, initialContext, type CompanionContext } from '../src/renderer/src/companion/machine'

const read = (over: Partial<ScreenRead> = {}): ScreenRead => ({
  isSkincareProduct: true,
  brand: 'CeraVe',
  name: 'Hydrating Facial Cleanser',
  sizeText: '236 ml',
  ingredientsText: null,
  claims: ['Fragrance-free', 'Non-comedogenic'],
  confidence: 'high',
  note: 'Brand and name are clear; no ingredient list visible.',
  ...over
})
const NOW = '2026-11-02T10:00:00.000Z'

describe('lasso bounds', () => {
  const ring = (cx: number, cy: number, rad: number) => Array.from({ length: 24 }, (_, i) => ({ x: cx + rad * Math.cos(i / 4), y: cy + rad * Math.sin(i / 4) }))

  it('pads the circle and keeps it on screen', () => {
    const b = lassoBounds(ring(100, 100, 50), 1000, 800)!
    expect(b.x).toBeLessThan(50)
    expect(b.w).toBeGreaterThan(100)
    const edge = lassoBounds(ring(10, 10, 40), 1000, 800)!
    expect(edge.x).toBe(0)
    expect(edge.y).toBe(0)
    const far = lassoBounds(ring(990, 790, 40), 1000, 800)!
    expect(far.x + far.w).toBeLessThanOrEqual(1000)
    expect(far.y + far.h).toBeLessThanOrEqual(800)
  })

  it('ignores clicks, scribbles and junk', () => {
    expect(lassoBounds([{ x: 5, y: 5 }], 100, 100)).toBeNull()
    expect(lassoBounds(ring(50, 50, 5), 100, 100)).toBeNull()
    expect(lassoBounds([{ x: 0, y: 0 }, { x: NaN, y: 9 }, { x: 90, y: 90 }], 100, 100)).toBeNull()
  })
})

describe('product from a circled screen region', () => {
  it('builds an unverified screen product without inventing ingredients', () => {
    const p = productFromScreenRead(read(), NOW, null)!
    expect(ProductSchema.safeParse(p).success).toBe(true)
    expect(p).toMatchObject({ brand: 'CeraVe', category: 'cleanser', sizeMl: 236, ingredients: [], price: null, url: null })
    expect(p.source).toMatchObject({ kind: 'screen', verified: false })
    expect(p.source.label).toContain('high confidence')
    expect(p.id).toBe(productFromScreenRead(read({ brand: 'cerave', name: 'hydrating facial cleanser' }), NOW, null)!.id)
  })

  it('uses an ingredient list only when it was read from the image', () => {
    const p = productFromScreenRead(read({ ingredientsText: 'Aqua, Glycerin, Ceramide NP, Hyaluronic Acid' }), NOW, null)!
    expect(p.ingredients).toEqual(['Aqua', 'Glycerin', 'Ceramide NP', 'Hyaluronic Acid'])
  })

  it('returns nothing for non-products or unreadable names', () => {
    expect(productFromScreenRead(read({ isSkincareProduct: false }), NOW, null)).toBeNull()
    expect(productFromScreenRead(read({ name: null }), NOW, null)).toBeNull()
  })

  it('fills in a recent product from a second circle around its ingredients', () => {
    const first = productFromScreenRead(read(), NOW, null)!
    const later = new Date(Date.parse(NOW) + 60_000).toISOString()
    const second = read({ isSkincareProduct: false, name: null, brand: null, ingredientsText: 'Water, Glycerin, Niacinamide' })
    const merged = productFromScreenRead(second, later, first)!
    expect(merged.id).toBe(first.id)
    expect(merged.ingredients).toEqual(['Water', 'Glycerin', 'Niacinamide'])
    // too late, or the product already had ingredients → no silent merge
    const stale = new Date(Date.parse(NOW) + SCREEN_MERGE_MS + 1).toISOString()
    expect(productFromScreenRead(second, stale, first)).toBeNull()
    expect(productFromScreenRead(second, later, merged)).toBeNull()
  })

  it('sanitises what was read', () => {
    const p = productFromScreenRead(read({ name: '<b>Glow</b>\u0007 Serum' }), NOW, null)!
    expect(p.name).toBe('Glow Serum')
  })

  it('schema accepts the structured shape Claude returns', () => {
    expect(ScreenReadSchema.safeParse(read()).success).toBe(true)
  })
})

describe('companion: circle flow', () => {
  it('reads, then asks about the circled product', () => {
    let c: CompanionContext = r(initialContext, { type: 'READING_SCREEN', requestId: 'c1' })
    expect(c).toMatchObject({ state: 'processing', stage: 'reading' })
    c = r(c, { type: 'RESEARCHING', requestId: 'c1' })
    expect(c.stage).toBe('researching')
    expect(r(c, { type: 'RESEARCHING', requestId: 'old' })).toBe(c)
    c = r(c, { type: 'SCREEN_READ', requestId: 'c1', productId: 'screen:1', nextRequestId: 'q1', question: 'Is this product good for my skin?' })
    expect(c).toMatchObject({ state: 'processing', stage: 'thinking', requestId: 'q1', productId: 'screen:1' })
  })

  it('drops a result that arrives after cancelling', () => {
    let c = r(initialContext, { type: 'READING_SCREEN', requestId: 'c1' })
    c = r(c, { type: 'CANCEL' })
    c = r(c, { type: 'SCREEN_READ', requestId: 'c1', productId: 'screen:1', nextRequestId: 'q1', question: 'x' })
    expect(c.state).toBe('idle')
    expect(r(c, { type: 'FAILED', requestId: 'c1', error: { kind: 'screen_unreadable', message: 'x' } }).state).toBe('idle')
  })
})
