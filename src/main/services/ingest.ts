import { createHash } from 'node:crypto'
import { splitIngredientText } from '@shared/ingredients'
import type { Product, ProductCategory } from '@shared/models'
import { parseSizeMl, sanitizeExtracted, type ExtractedProduct } from '@shared/protocol'

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
