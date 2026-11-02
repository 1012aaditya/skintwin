import { identifyIngredient } from './ingredients'
import type { Product, Reaction } from './models'

/**
 * Ingredients that keep turning up in products the user reacted to. This is a
 * pattern to look at, never proof of cause: two products share many ingredients
 * by chance, and skin reacts for reasons no ingredient list shows.
 */

export interface Suspect {
  /** identified ingredient id, or the normalised INCI name */
  key: string
  name: string
  /** the INCI text as written on a label — what goes on the avoid list */
  inci: string
  productIds: string[]
  reactionCount: number
}

// Solvents, humectants, pH adjusters and thickeners found in almost every formula.
// Sharing them says nothing, so they never become suspects.
const WATER = /^(aqua|water|eau)( (aqua|water|eau))*$/
const UBIQUITOUS = new Set([
  'glycerin',
  'butylene glycol',
  'propanediol',
  'pentylene glycol',
  '1 2 hexanediol',
  'sodium hydroxide',
  'potassium hydroxide',
  'citric acid',
  'sodium citrate',
  'xanthan gum',
  'carbomer',
  'disodium edta',
  'tetrasodium edta',
  'sodium chloride'
])

/** Lower-case, drop "(…)" asides and punctuation: "Aqua (Water)" → "aqua". */
export function normaliseInci(inci: string): string {
  return inci
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function ingredientKey(inci: string): { key: string; name: string } | null {
  const n = normaliseInci(inci)
  if (!n || WATER.test(n) || UBIQUITOUS.has(n)) return null
  const info = identifyIngredient(inci)
  return info ? { key: info.id, name: info.name } : { key: n, name: inci.trim() }
}

export function reactionSuspects(reactions: Reaction[], products: Product[]): Suspect[] {
  const byId = new Map(products.map((p) => [p.id, p]))
  const counts = new Map<string, number>()
  for (const r of reactions) counts.set(r.productId, (counts.get(r.productId) ?? 0) + 1)

  const found = new Map<string, Suspect>()
  for (const [productId, reactionCount] of counts) {
    const product = byId.get(productId)
    if (!product) continue
    const seen = new Set<string>()
    for (const inci of product.ingredients) {
      const k = ingredientKey(inci)
      if (!k || seen.has(k.key)) continue
      seen.add(k.key)
      const s = found.get(k.key) ?? { key: k.key, name: k.name, inci: inci.trim(), productIds: [], reactionCount: 0 }
      s.productIds.push(productId)
      s.reactionCount += reactionCount
      // keep the shortest label text, e.g. "Fragrance" over "Fragrance (Parfum)"
      if (inci.trim().length < s.inci.length) s.inci = inci.trim()
      found.set(k.key, s)
    }
  }
  return [...found.values()]
    .filter((s) => s.productIds.length >= 2)
    .sort((a, b) => b.productIds.length - a.productIds.length || b.reactionCount - a.reactionCount || a.name.localeCompare(b.name))
}

/** Suspects this product contains. */
export function suspectsIn(product: Product, suspects: Suspect[]): Suspect[] {
  if (!suspects.length) return []
  const keys = new Set(product.ingredients.map((i) => ingredientKey(i)?.key).filter(Boolean))
  return suspects.filter((s) => keys.has(s.key))
}

/** Is this suspect already covered by the user's avoid list? Same substring rule as the match engine. */
export function onAvoidList(s: Suspect, avoid: string[]): boolean {
  return avoid.some((a) => {
    const x = a.toLowerCase().trim()
    return !!x && (s.inci.toLowerCase().includes(x) || s.name.toLowerCase().includes(x) || ingredientKey(a)?.key === s.key)
  })
}

export const SUSPECT_DISCLAIMER = 'In common between products you reacted to — a pattern to watch, not proof it’s the cause.'
