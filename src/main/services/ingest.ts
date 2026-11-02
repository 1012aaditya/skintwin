import { createHash } from 'node:crypto'
import { splitIngredientText } from '@shared/ingredients'
import type { Product, ProductCategory } from '@shared/models'
import type { ScreenRead } from '@shared/circle'
import { parseSizeMl, sanitizeExtracted, sanitizeText, type ExtractedProduct } from '@shared/protocol'

const CATEGORY_HINTS: [RegExp, ProductCategory][] = [
  [/sunscreen|spf|sun ?block|uv /i, 'sunscreen'],
  [/cleans|face ?wash|cleansing/i, 'cleanser'],
  [/toner|tonic/i, 'toner'],
  [/essence/i, 'essence'],
  [/exfoli|peel|aha|bha/i, 'exfoliant'],
  [/serum|ampoule|booster/i, 'serum'],
  [/moisturi[sz]|cream|lotion|gel cream|balm/i, 'moisturizer'],
  [/mask/i, 'mask'],
  [/eye/i, 'eye'],
  [/treatment|spot/i, 'treatment'],
  // "Niacinamide 10% + Zinc 1%"-style names are almost always serums
  [/\b\d+(\.\d+)?\s?%/, 'serum']
]

export function guessCategory(text: string): ProductCategory {
  for (const [re, cat] of CATEGORY_HINTS) if (re.test(text)) return cat
  return 'other'
}

/** Stable id per product URL so re-detections update rather than duplicate. */
export function browserProductId(url: string): string {
  const u = new URL(url)
  return `web:${createHash('sha256').update(`${u.host}${u.pathname}`).digest('hex').slice(0, 16)}`
}

export function productFromExtraction(raw: ExtractedProduct, now: string): Product {
  const p = sanitizeExtracted(raw)
  const host = new URL(p.url).hostname.replace(/^www\./, '')
  const ingredients = p.ingredientsText ? splitIngredientText(p.ingredientsText) : []
  const claims = [/fragrance[- ]free/i, /non[- ]comedogenic/i, /vegan/i, /cruelty[- ]free/i]
    .map((re) => `${p.title} ${p.description ?? ''}`.match(re)?.[0]?.toLowerCase())
    .filter((x): x is string => !!x)
  return {
    id: browserProductId(p.url),
    name: p.title,
    brand: p.brand ?? '',
    category: guessCategory(`${p.title} ${p.description ?? ''}`),
    sizeMl: parseSizeMl(`${p.sizeText ?? ''} ${p.title}`),
    description: p.description,
    imageUrl: p.imageUrl,
    ingredients,
    price: p.price != null && p.currency ? { amount: p.price, currency: p.currency, verified: false, note: `Read from ${host} when detected` } : null,
    url: p.url,
    retailer: p.retailer ?? host,
    claims: [...new Set(claims)],
    source: { kind: 'browser', label: `Detected on ${host} (${p.method})`, url: p.url, fetchedAt: now, verified: false },
    createdAt: now
  }
}

/** A product the user circled on screen stays "recent" this long, so a second circle around its ingredient list can fill them in. */
export const SCREEN_MERGE_MS = 15 * 60_000

/**
 * Turn what Claude read from a circled screen region into a product. Returns null when it
 * isn't a readable product. A circle that only caught an ingredient list fills in the
 * ingredients of the product circled just before it (if that one had none).
 */
export function productFromScreenRead(read: ScreenRead, now: string, recent: Product | null): Product | null {
  const name = sanitizeText(read.name, 200)
  const brand = sanitizeText(read.brand, 120) ?? ''
  const ingredientsText = sanitizeText(read.ingredientsText, 6000)
  const ingredients = ingredientsText ? splitIngredientText(ingredientsText).slice(0, 120) : []
  const confidence = `${read.confidence} confidence`

  if (!read.isSkincareProduct || !name) {
    const fresh = recent?.source.kind === 'screen' && Date.parse(now) - Date.parse(recent.source.fetchedAt) < SCREEN_MERGE_MS
    if (!fresh || !ingredients.length || recent.ingredients.length) return null
    return { ...recent, ingredients, source: { ...recent.source, label: `${recent.source.label}; ingredients read from a second circle`, fetchedAt: now } }
  }

  const claims = read.claims.map((c) => sanitizeText(c, 80)).filter((c): c is string => !!c)
  return {
    id: `screen:${createHash('sha256').update(`${brand}|${name}`.toLowerCase()).digest('hex').slice(0, 16)}`,
    name,
    brand,
    category: guessCategory(`${name} ${claims.join(' ')}`),
    sizeMl: parseSizeMl(`${read.sizeText ?? ''} ${name}`),
    description: null,
    imageUrl: null,
    ingredients,
    price: null,
    url: null,
    retailer: null,
    claims: [...new Set(claims)].slice(0, 10),
    source: { kind: 'screen', label: `Read from your screen (${confidence})`, url: null, fetchedAt: now, verified: false },
    createdAt: now
  }
}
