import { describe, expect, it } from 'vitest'
import { DEMO_CATALOG } from '@shared/catalog'
import { splitIngredientText } from '@shared/ingredients'
import type { SkinProfile } from '@shared/models'
import { alternativesFor, computeMatch, recommend, routineGaps } from '@shared/scoring'
import { fresh, product } from './helpers'

const oilyAcne: SkinProfile = { ...fresh().profile, skinType: 'oily', sensitivity: 'moderate', concerns: ['acne', 'excess_oil', 'visible_pores'], goals: ['clear_skin', 'oil_balance'], preferences: ['fragrance_free', 'non_comedogenic'] }

describe('compatibility engine', () => {
  it('rates a niacinamide + zinc serum well for oily, acne-prone skin and explains why', () => {
    const m = computeMatch(product('to-niacinamide'), oilyAcne, { routineProducts: [] })
    expect(m.verdict === 'great' || m.verdict === 'good').toBe(true)
    expect(m.positives.some((p) => /Niacinamide/.test(p.text))).toBe(true)
    expect(m.mismatches).toHaveLength(0)
  })

  it('flags fragrance for a fragrance-free preference and lowers the score', () => {
    const withFragrance = computeMatch(product('neutrogena-hydro-boost'), oilyAcne, { routineProducts: [] })
    expect(withFragrance.mismatches.some((m) => /fragrance/i.test(m.text))).toBe(true)
    const without = computeMatch(product('to-ha-b5'), oilyAcne, { routineProducts: [] })
    expect(withFragrance.score!).toBeLessThan(without.score!)
  })

  it('treats essential oils as fragrance', () => {
    const m = computeMatch(product('cosrx-good-morning'), oilyAcne, { routineProducts: [] })
    expect(m.mismatches.some((x) => /fragrance/i.test(x.text))).toBe(true)
  })

  it('does not count fatty alcohols as drying alcohol', () => {
    const dry: SkinProfile = { ...oilyAcne, skinType: 'dry', preferences: ['alcohol_free'] }
    const m = computeMatch(product('cerave-hydrating-cleanser'), dry, { routineProducts: [] })
    expect(m.mismatches.some((x) => /alcohol/i.test(x.text))).toBe(false)
  })

  it('returns no score without ingredients, rather than guessing', () => {
    const p = { ...product('to-niacinamide'), ingredients: [] }
    const m = computeMatch(p, oilyAcne, { routineProducts: [] })
    expect(m.score).toBeNull()
    expect(m.basis).toBe('no_ingredients')
  })

  it('returns no score with an empty profile', () => {
    expect(computeMatch(product('to-niacinamide'), fresh().profile, { routineProducts: [] }).score).toBeNull()
  })

  it('detects routine overlap and retinoid + exfoliant pairing', () => {
    const overlap = computeMatch(product('minimalist-niacinamide'), oilyAcne, { routineProducts: [product('to-niacinamide')] })
    expect(overlap.routineOverlap.length).toBeGreaterThan(0)
    const pairing = computeMatch(product('to-retinol-05'), oilyAcne, { routineProducts: [product('pc-bha')] })
    expect(pairing.cautions.some((c) => /alternate nights/.test(c))).toBe(true)
  })

  it('hits the avoid list', () => {
    const m = computeMatch(product('to-retinol-05'), { ...oilyAcne, avoidIngredients: ['retinol'] }, { routineProducts: [] })
    expect(m.mismatches.some((x) => /avoid list/.test(x.text))).toBe(true)
  })

  it('recommendations skip owned products and prioritise routine gaps', () => {
    const db = fresh()
    const products = new Map(DEMO_CATALOG.map((p) => [p.id, p]))
    const gaps = routineGaps(db.routines, products)
    expect(gaps).toContain('sunscreen')
    const recs = recommend({ catalog: DEMO_CATALOG, profile: oilyAcne, ownedIds: new Set(['demo:to-niacinamide']), routineProducts: [], gaps })
    expect(recs.some((r) => r.product.id === 'demo:to-niacinamide')).toBe(false)
    expect(recs.every((r) => r.reason.length > 0)).toBe(true)
  })

  it('alternatives share the category or active', () => {
    const alts = alternativesFor(product('to-niacinamide'), DEMO_CATALOG, oilyAcne, [])
    expect(alts.length).toBeGreaterThan(0)
    expect(alts.every((a) => a.product.id !== 'demo:to-niacinamide')).toBe(true)
  })
})

describe('ingredient text splitting', () => {
  it('splits on top-level commas only and strips the label', () => {
    expect(splitIngredientText('Ingredients: Aqua (Water), Niacinamide, Zinc PCA (1%), Parfum.')).toEqual(['Aqua (Water)', 'Niacinamide', 'Zinc PCA (1%)', 'Parfum'])
  })
})

describe('same-product detection', () => {
  it('recognises the same product from a retailer page and the catalog', async () => {
    const { isSameProduct } = await import('@shared/scoring')
    const web = { ...product('to-niacinamide'), id: 'web:1', name: 'Niacinamide 10% + Zinc 1% Serum 30ml' }
    expect(isSameProduct(web, product('to-niacinamide'))).toBe(true)
    expect(isSameProduct(web, product('minimalist-niacinamide'))).toBe(false)
    const m = computeMatch(web, oilyAcne, { routineProducts: [product('to-niacinamide')] })
    expect(m.routineOverlap[0]?.text).toMatch(/already use this product/)
    expect(alternativesFor(web, DEMO_CATALOG, oilyAcne, []).some((a) => a.product.id === 'demo:to-niacinamide')).toBe(false)
  })
})
