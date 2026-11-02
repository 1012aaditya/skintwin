import { describe, expect, it } from 'vitest'
import type { Database, Product } from '@shared/models'
import { MutationError } from '@shared/mutations'
import { ingredientKey, onAvoidList, reactionSuspects, suspectsIn } from '@shared/reactions'
import { computeMatch } from '@shared/scoring'
import { buildContext, buildUserMessage } from '../src/main/services/llm'
import { fresh, run } from './helpers'

const add = (db: Database, id: string, ingredients: string[]) =>
  run(db, { type: 'product.createManual', id, product: { name: id, brand: 'Test', category: 'serum', sizeMl: null, ingredients, url: null, description: null } })

const withProducts = () => {
  let db = fresh()
  db = add(db, 'a', ['Aqua (Water)', 'Glycerin', 'Niacinamide', 'Parfum (Fragrance)', 'Phenoxyethanol'])
  db = add(db, 'b', ['Water', 'Glycerin', 'Fragrance', 'Phenoxyethanol', 'Butylene Glycol'])
  db = add(db, 'c', ['Water/Aqua/Eau', 'Glycerin', 'Niacinamide', 'Butylene Glycol'])
  db = add(db, 'd', ['Aqua', 'Squalane', 'Parfum'])
  return db
}
const get = (db: Database, id: string) => db.products.find((p) => p.id === id) as Product

describe('reaction log', () => {
  it('adds and deletes reactions, newest first', () => {
    let db = run(withProducts(), { type: 'reaction.add', productId: 'a', kind: 'stinging', note: '  burned a bit ' }, { type: 'reaction.add', productId: 'b', kind: 'redness' })
    expect(db.reactions.map((r) => r.kind)).toEqual(['redness', 'stinging'])
    expect(db.reactions[1]!.note).toBe('burned a bit')
    db = run(db, { type: 'reaction.delete', id: db.reactions[0]!.id })
    expect(db.reactions.map((r) => r.productId)).toEqual(['a'])
  })

  it('rejects reactions to unknown products', () => {
    expect(() => run(fresh(), { type: 'reaction.add', productId: 'ghost', kind: 'other' })).toThrow(MutationError)
  })
})

describe('reaction suspects', () => {
  it('ignores water, glycerin and other bases', () => {
    for (const x of ['Aqua (Water)', 'Water/Aqua/Eau', 'Glycerin', 'Butylene Glycol', 'Citric Acid']) expect(ingredientKey(x)).toBeNull()
    expect(ingredientKey('Phenoxyethanol')?.key).toBe('phenoxyethanol')
  })

  it('needs at least two reacted products', () => {
    const db = run(withProducts(), { type: 'reaction.add', productId: 'a', kind: 'redness' }, { type: 'reaction.add', productId: 'a', kind: 'itching' })
    expect(reactionSuspects(db.reactions, db.products)).toEqual([])
  })

  it('finds ingredients shared by reacted products, matching name variants', () => {
    const db = run(withProducts(), { type: 'reaction.add', productId: 'a', kind: 'redness' }, { type: 'reaction.add', productId: 'b', kind: 'stinging' })
    const s = reactionSuspects(db.reactions, db.products)
    // "Parfum (Fragrance)" and "Fragrance" are the same thing; water/glycerin are excluded; niacinamide is only in one
    expect(s.map((x) => x.key).sort()).toEqual(['fragrance', 'phenoxyethanol'])
    const fragrance = s.find((x) => x.key === 'fragrance')!
    expect(fragrance.productIds.sort()).toEqual(['a', 'b'])
    expect(fragrance.inci).toBe('Fragrance')
  })

  it('flags suspects in other products and respects the avoid list', () => {
    const db = run(withProducts(), { type: 'reaction.add', productId: 'a', kind: 'redness' }, { type: 'reaction.add', productId: 'b', kind: 'stinging' })
    const s = reactionSuspects(db.reactions, db.products)
    expect(suspectsIn(get(db, 'd'), s).map((x) => x.key)).toEqual(['fragrance'])
    expect(suspectsIn(get(db, 'c'), s)).toEqual([])
    expect(onAvoidList(s.find((x) => x.key === 'fragrance')!, ['fragrance'])).toBe(true)
    expect(onAvoidList(s.find((x) => x.key === 'fragrance')!, ['retinol'])).toBe(false)
  })
})

describe('reactions in verdicts', () => {
  const profile = { ...fresh().profile, skinType: 'oily' as const, concerns: ['acne' as const] }

  it('adds cautions for a reacted product and for suspects, and lowers the score', () => {
    const db = run(withProducts(), { type: 'reaction.add', productId: 'a', kind: 'redness' }, { type: 'reaction.add', productId: 'b', kind: 'stinging' })
    const suspects = reactionSuspects(db.reactions, db.products)
    const plain = computeMatch(get(db, 'd'), profile, { routineProducts: [] })
    const informed = computeMatch(get(db, 'd'), profile, { routineProducts: [], reactions: db.reactions, suspects })
    expect(informed.cautions.some((c) => /Fragrance.*2 products you reacted to.*not proof/.test(c))).toBe(true)
    expect(informed.score!).toBeLessThan(plain.score!)
    const own = computeMatch(get(db, 'a'), profile, { routineProducts: [], reactions: db.reactions, suspects })
    expect(own.cautions.some((c) => /You logged redness/.test(c))).toBe(true)
  })

  it('does not double-count a suspect already on the avoid list', () => {
    const db = run(withProducts(), { type: 'reaction.add', productId: 'a', kind: 'redness' }, { type: 'reaction.add', productId: 'b', kind: 'stinging' })
    const suspects = reactionSuspects(db.reactions, db.products)
    const m = computeMatch(get(db, 'd'), { ...profile, avoidIngredients: ['Fragrance'] }, { routineProducts: [], reactions: db.reactions, suspects })
    expect(m.mismatches.some((x) => /avoid list/.test(x.text))).toBe(true)
    expect(m.cautions.some((c) => /reacted to/.test(c))).toBe(false)
  })

  it('tells Claude about reactions and suspects in the current product', () => {
    const db = run(withProducts(), { type: 'reaction.add', productId: 'a', kind: 'redness', note: 'cheeks' }, { type: 'reaction.add', productId: 'b', kind: 'stinging' })
    const msg = buildUserMessage(buildContext(db, 'Is this ok?', 'd', null))
    expect(msg).toContain('<reactions>')
    expect(msg).toMatch(/redness after Test a \(user note: cheeks\)/)
    expect(msg).toMatch(/Current product contains suspects: Fragrance/)
    expect(buildUserMessage(buildContext(fresh(), 'hi', null, null))).not.toContain('<reactions>')
  })
})

describe('older databases', () => {
  it('load without a reactions field', async () => {
    const { DatabaseSchema } = await import('@shared/models')
    const { reactions: _drop, ...old } = fresh()
    void _drop
    expect(DatabaseSchema.parse(old).reactions).toEqual([])
  })
})
