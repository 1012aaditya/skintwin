import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATALOG } from '@shared/catalog'
import { createEmptyDatabase, migrateCatalog } from '../src/main/db'
import { ingredientsOk, variantOk } from '../scripts/catalog/match.mjs'
import { fresh, run } from './helpers'

describe('the shipped catalog', () => {
  it('has only real, credited products and no prices', () => {
    expect(CATALOG.length).toBeGreaterThan(0)
    for (const p of CATALOG) {
      expect(p.source.kind).toBe('catalog')
      expect(p.price).toBeNull() // prices only when read live from a store
      expect(p.sources?.page?.url).toMatch(/^https:\/\//)
      if (p.ingredients.length) expect(p.sources?.ingredients).toBeTruthy()
    }
  })

  it('ships photos only with a source and an open licence, and the files exist', () => {
    for (const p of CATALOG.filter((x) => x.imageUrl?.startsWith('catalog/'))) {
      expect(existsSync(join(__dirname, '../src/renderer/public', p.imageUrl!))).toBe(true)
      expect(p.sources?.image?.licence).toBe('CC BY-SA 3.0')
    }
  })

  it('starts new databases with the real catalog', () => {
    expect(createEmptyDatabase().products.map((p) => p.id)).toEqual(CATALOG.map((p) => p.id))
  })
})

describe('moving off the old demo catalog', () => {
  it('points the user’s routine, reactions and inventory at the same real product', () => {
    let db = run(
      fresh(),
      { type: 'routine.addStep', period: 'am', productId: 'demo:cerave-hydrating-cleanser' },
      { type: 'reaction.add', productId: 'demo:cerave-hydrating-cleanser', kind: 'dryness' },
      { type: 'inventory.add', productId: 'demo:minimalist-arbutin' }
    )
    db = migrateCatalog(db, CATALOG)
    expect(db.routines.am.steps[0]!.productId).toBe('catalog:cerave-hydrating-cleanser')
    expect(db.reactions[0]!.productId).toBe('catalog:cerave-hydrating-cleanser')
    // no real match: kept because the user owns it, but without a placeholder price
    const kept = db.products.find((p) => p.id === 'demo:minimalist-arbutin')!
    expect(kept.price).toBeNull()
    expect(kept.source.label).toMatch(/older SkinTwin version/)
    // demo products nobody uses are gone
    expect(db.products.some((p) => p.id === 'demo:pc-bha')).toBe(false)
    expect(db.listings).toEqual([])
  })
})

describe('catalog builder matching', () => {
  it('rejects a different variant of the same line', () => {
    expect(variantOk('Hydro Boost Water Gel', 'Hydro Boost Water Gel Lotion SPF 50')).toBe(false)
    expect(variantOk('Hydrating Cleanser', 'Hydrating Cleanser')).toBe(true)
  })

  it('rejects scanned scraps that aren’t ingredient lists', () => {
    expect(ingredientsOk('La Roche-Posay, E108, crème, E102, E170, Crème.')).toBe(false)
    expect(ingredientsOk('INSON INC LR SL2 2017 XM/32 30038736\nSalicid Acid')).toBe(false)
    expect(ingredientsOk('Aqua, Glycerin, Cetearyl Alcohol, Ceramide NP, Ceramide AP, Phenoxyethanol')).toBe(true)
  })
})
