import { analyzeIngredients, type IngredientInfo } from './ingredients'
import { label, type Product, type ProductCategory, type Reaction, type Routine, type SkinProfile } from './models'
import { ingredientKey, onAvoidList, suspectsIn, type Suspect } from './reactions'

/**
 * Rule-based, explainable compatibility estimate. Every point added or removed
 * has a human-readable reason, so the UI never shows an unexplained number.
 */

export type Verdict = 'great' | 'good' | 'mixed' | 'caution' | 'unknown'

export interface MatchReason {
  text: string
  ingredient?: string
  /** short user-facing benefit, e.g. "Helps with excess oil" */
  topic?: string
}

export interface MatchResult {
  productId: string
  score: number | null
  verdict: Verdict
  headline: string
  positives: MatchReason[]
  mismatches: MatchReason[]
  cautions: string[]
  routineOverlap: { text: string; productId: string }[]
  identified: IngredientInfo[]
  basis: 'ingredients' | 'no_ingredients' | 'no_profile'
}

export interface MatchContext {
  routineProducts: Product[]
  /** reactions the user logged, and ingredients shared by the products they reacted to */
  reactions?: Reaction[]
  suspects?: Suspect[]
}

const uniqueBy = <T>(arr: T[], key: (t: T) => string) => {
  const seen = new Set<string>()
  return arr.filter((x) => {
    const k = key(x)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b\d+(\.\d+)?\s?(ml|g|oz|fl\.? ?oz)\b/g, '')
    .replace(/[^a-z0-9%+ ]/g, ' ')
    .replace(/\b(serum|the|face|facial)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Same product from two sources (e.g. demo catalog vs. a retailer page)? */
export function isSameProduct(a: Product, b: Product): boolean {
  if (a.id === b.id) return true
  if (!a.brand || !b.brand || normName(a.brand) !== normName(b.brand)) return false
  const x = normName(a.name)
  const y = normName(b.name)
  return x.length > 3 && y.length > 3 && (x.includes(y) || y.includes(x))
}

export function profileIsEmpty(p: SkinProfile): boolean {
  return !p.skinType && p.concerns.length === 0 && p.goals.length === 0 && p.preferences.length === 0
}

export function identifiedIngredients(product: Product): IngredientInfo[] {
  return uniqueBy(
    analyzeIngredients(product.ingredients)
      .map((m) => m.info)
      .filter((x): x is IngredientInfo => x !== null),
    (i) => i.id
  )
}

export function computeMatch(product: Product, profile: SkinProfile, ctx: MatchContext): MatchResult {
  const identified = identifiedIngredients(product)
  const base: MatchResult = {
    productId: product.id,
    score: null,
    verdict: 'unknown',
    headline: '',
    positives: [],
    mismatches: [],
    cautions: [],
    routineOverlap: [],
    identified,
    basis: 'ingredients'
  }

  if (product.ingredients.length === 0) {
    return {
      ...base,
      basis: 'no_ingredients',
      headline: 'Ingredient list unavailable — SkinTwin can’t estimate a match without it.'
    }
  }

  const flags = new Set<string>(identified.flatMap((i) => i.flags))
  const has = (flag: string) => flags.has(flag)
  let score = 60

  // Concern & goal coverage
  for (const concern of profile.concerns) {
    const helpers = identified.filter((i) => i.helps.includes(concern))
    if (helpers.length) {
      score += 7
      base.positives.push({
        text: `${helpers.map((h) => h.name).join(' & ')} — commonly used for ${label(concern).toLowerCase()}`,
        ingredient: helpers[0]!.id,
        topic: `Helps with ${label(concern).toLowerCase()}`
      })
    }
  }
  for (const goal of profile.goals) {
    const helpers = identified.filter((i) => i.goals.includes(goal))
    if (helpers.length) {
      score += 4
      if (!base.positives.some((p) => p.ingredient === helpers[0]!.id)) {
        base.positives.push({
          text: `${helpers[0]!.name} supports your goal: ${label(goal).toLowerCase()}`,
          ingredient: helpers[0]!.id,
          topic: `Supports ${label(goal).toLowerCase()}`
        })
      }
    }
  }

  // Preference conflicts
  const prefs = new Set(profile.preferences)
  const claims = product.claims.map((c) => c.toLowerCase())
  if (has('fragrance')) {
    if (prefs.has('fragrance_free') || profile.sensitivity === 'high') {
      score -= 20
      base.mismatches.push({ text: 'Contains fragrance or fragrance components — you prefer fragrance-free.' })
    } else base.cautions.push('Contains fragrance components.')
  } else if (prefs.has('fragrance_free')) {
    score += 4
    base.positives.push({ text: 'No fragrance found in the listed ingredients.', topic: 'Fragrance-free' })
  }
  if (has('essential_oil') && prefs.has('essential_oil_free')) {
    score -= 12
    base.mismatches.push({ text: 'Contains essential oils — you prefer essential-oil-free.' })
  }
  if (has('potentially_comedogenic') && (prefs.has('non_comedogenic') || profile.concerns.includes('acne'))) {
    score -= 12
    base.mismatches.push({ text: 'Contains heavier emollients some breakout-prone skin prefers to avoid.' })
  }
  if (has('drying_alcohol')) {
    if (prefs.has('alcohol_free') || profile.skinType === 'dry' || profile.sensitivity === 'high') {
      score -= 10
      base.mismatches.push({ text: 'Contains drying alcohol, which may not suit dry or sensitive skin.' })
    }
  }
  if (has('animal_derived') && prefs.has('vegan')) {
    score -= 15
    base.mismatches.push({ text: 'Contains an animal-derived ingredient — you prefer vegan products.' })
  }
  if (has('strong_active') && profile.sensitivity === 'high') {
    score -= 6
    base.cautions.push('Contains a strong active; with high sensitivity, patch test and introduce slowly.')
  }
  for (const avoid of profile.avoidIngredients) {
    const a = avoid.toLowerCase().trim()
    if (!a) continue
    // also match synonyms the ingredient reference knows, e.g. "Parfum" for "Fragrance"
    const key = ingredientKey(avoid)?.key
    const hit = product.ingredients.find((i) => i.toLowerCase().includes(a) || (key && ingredientKey(i)?.key === key))
    if (hit) {
      score -= 25
      base.mismatches.push({ text: `Contains “${hit}”, which is on your avoid list.` })
    }
  }
  if (claims.some((c) => c.includes('non-comedogenic')) && prefs.has('non_comedogenic')) {
    score += 3
    base.positives.push({ text: 'Labelled non-comedogenic by the brand.' })
  }

  // What the user's own skin told us
  const own = (ctx.reactions ?? []).filter((r) => r.productId === product.id)
  if (own.length) {
    score -= 15
    const kinds = [...new Set(own.map((r) => label(r.kind).toLowerCase()))].join(', ')
    base.cautions.push(`You logged ${kinds} after using this (${own.length === 1 ? 'once' : `${own.length} times`}).`)
  }
  for (const s of suspectsIn(product, ctx.suspects ?? [])) {
    if (onAvoidList(s, profile.avoidIngredients)) continue // already a mismatch above
    score -= 5
    base.cautions.push(`Contains ${s.name}, which is in common between ${s.productIds.length} products you reacted to — a pattern, not proof.`)
  }

  // Ingredient-level cautions
  for (const ing of identified) if (ing.caution) base.cautions.push(`${ing.name}: ${ing.caution}`)

  // Routine overlap
  const groups = new Set(identified.map((i) => i.activeGroup).filter(Boolean) as string[])
  for (const other of ctx.routineProducts) {
    if (other.id === product.id) continue
    if (isSameProduct(other, product)) {
      base.routineOverlap.push({ text: `You already use this product (${other.brand} ${other.name}).`, productId: other.id })
      continue
    }
    const otherGroups = new Set(identifiedIngredients(other).map((i) => i.activeGroup).filter(Boolean) as string[])
    for (const g of groups) {
      if (otherGroups.has(g)) {
        base.routineOverlap.push({
          text: `Your routine already has ${g.replace('_', ' ')} in ${other.brand} ${other.name}.`,
          productId: other.id
        })
      }
    }
    if ((groups.has('retinoid') && otherGroups.has('exfoliant')) || (groups.has('exfoliant') && otherGroups.has('retinoid'))) {
      base.cautions.push(`Pairing with ${other.name} (retinoid + exfoliant) can irritate — consider alternate nights.`)
    }
  }
  if (base.routineOverlap.length) score -= 4

  base.cautions = [...new Set(base.cautions)]

  if (profileIsEmpty(profile)) {
    return {
      ...base,
      basis: 'no_profile',
      score: null,
      verdict: 'unknown',
      headline: 'Complete your skin profile to get a personalized match.'
    }
  }

  score = Math.max(5, Math.min(97, Math.round(score)))
  const verdict: Verdict = score >= 80 ? 'great' : score >= 66 ? 'good' : score >= 50 ? 'mixed' : 'caution'
  const headline =
    verdict === 'great'
      ? 'Great match for your skin'
      : verdict === 'good'
        ? 'Good match for your skin'
        : verdict === 'mixed'
          ? 'Mixed fit — check the notes'
          : 'Probably not the best fit'
  return { ...base, score, verdict, headline }
}

// ---------- Recommendations ----------

export interface Recommendation {
  product: Product
  match: MatchResult
  reason: string
  fillsGap: ProductCategory | null
}

const AM_ESSENTIALS: ProductCategory[] = ['cleanser', 'moisturizer', 'sunscreen']
const PM_ESSENTIALS: ProductCategory[] = ['cleanser', 'moisturizer']

export function routineGaps(routines: { am: Routine; pm: Routine }, products: Map<string, Product>): ProductCategory[] {
  const cats = (r: Routine) => new Set(r.steps.map((s) => products.get(s.productId)?.category).filter(Boolean))
  const am = cats(routines.am)
  const pm = cats(routines.pm)
  const gaps = new Set<ProductCategory>()
  for (const c of AM_ESSENTIALS) if (!am.has(c)) gaps.add(c)
  for (const c of PM_ESSENTIALS) if (!pm.has(c)) gaps.add(c)
  return [...gaps]
}

export function recommend(args: {
  catalog: Product[]
  profile: SkinProfile
  ownedIds: Set<string>
  routineProducts: Product[]
  reactions?: Reaction[]
  suspects?: Suspect[]
  gaps: ProductCategory[]
  limit?: number
}): Recommendation[] {
  const ctx: MatchContext = { routineProducts: args.routineProducts, reactions: args.reactions, suspects: args.suspects }
  const ownedProducts = args.catalog.filter((p) => args.ownedIds.has(p.id))
  const recs = args.catalog
    .filter((p) => !args.ownedIds.has(p.id) && !ownedProducts.some((o) => isSameProduct(o, p)))
    .map((product) => {
      const match = computeMatch(product, args.profile, ctx)
      const fillsGap = args.gaps.includes(product.category) ? product.category : null
      const reason = fillsGap
        ? `Fills a gap: your routine has no ${label(fillsGap).toLowerCase()} yet.`
        : (match.positives[0]?.text ?? 'Matches your stated preferences.')
      return { product, match, reason, fillsGap }
    })
    .filter((r) => r.match.score === null || r.match.verdict === 'great' || r.match.verdict === 'good' || r.fillsGap)
    .sort((a, b) => (b.fillsGap ? 5 : 0) + (b.match.score ?? 0) - ((a.fillsGap ? 5 : 0) + (a.match.score ?? 0)))
  return recs.slice(0, args.limit ?? 6)
}

export function alternativesFor(product: Product, catalog: Product[], profile: SkinProfile, ctx: MatchContext) {
  const groups = new Set(identifiedIngredients(product).map((i) => i.activeGroup).filter(Boolean))
  return catalog
    .filter((p) => !isSameProduct(p, product))
    .filter(
      (p) =>
        p.category === product.category ||
        identifiedIngredients(p).some((i) => i.activeGroup && groups.has(i.activeGroup))
    )
    .map((p) => ({ product: p, match: computeMatch(p, profile, ctx) }))
    .sort((a, b) => (b.match.score ?? 0) - (a.match.score ?? 0))
    .slice(0, 4)
}

export function pricePerMl(p: Product): number | null {
  if (!p.price || !p.sizeMl) return null
  return Math.round((p.price.amount / p.sizeMl) * 100) / 100
}
