import data from './catalog-data.json'
import { splitIngredientText } from './ingredients'
import { PRODUCT_CATEGORIES, SourceRefSchema, type Product } from './models'
import { z } from 'zod'

/**
 * SkinTwin's real product catalog: products popular in India, each confirmed by a public
 * source and credited per field. Built and reviewed with scripts/catalog/build-catalog.mjs —
 * never edited by hand. There are no prices here: a price is only shown when read live from
 * a store page.
 */

const DataSchema = z.object({
  generatedAt: z.string(),
  credit: z.object({ name: z.string(), licence: z.string(), url: z.string() }),
  products: z.array(
    z.object({
      id: z.string(),
      brand: z.string(),
      name: z.string(),
      category: z.enum(PRODUCT_CATEGORIES),
      sizeMl: z.number().nullable(),
      ingredientsText: z.string().nullable(),
      url: z.string().nullable(),
      retailer: z.string().nullable(),
      image: z.object({ file: z.string().nullable(), remote: z.string().nullable() }).nullable(),
      sources: z.object({ page: SourceRefSchema.nullable(), ingredients: SourceRefSchema.nullable(), image: SourceRefSchema.nullable() })
    })
  )
})

const parsed = DataSchema.parse(data)

/** Credit line for data and photos taken from Open Beauty Facts. */
export const CATALOG_CREDIT = parsed.credit

const label = (p: (typeof parsed.products)[number]) =>
  p.sources.ingredients?.kind === 'open_beauty_facts' || p.sources.page?.kind === 'open_beauty_facts'
    ? 'SkinTwin catalog · details from Open Beauty Facts (open data; the version sold in India may differ)'
    : `SkinTwin catalog · from ${p.retailer ?? 'the brand’s page'}`

export const CATALOG: Product[] = parsed.products.map((p) => ({
  id: p.id,
  name: p.name,
  brand: p.brand,
  category: p.category,
  sizeMl: p.sizeMl,
  description: null,
  imageUrl: p.image?.file ?? p.image?.remote ?? null,
  ingredients: p.ingredientsText ? splitIngredientText(p.ingredientsText) : [],
  price: null,
  url: p.url,
  retailer: p.retailer,
  claims: [],
  source: { kind: 'catalog', label: label(p), url: p.sources.page?.url ?? null, fetchedAt: p.sources.page?.fetchedAt ?? parsed.generatedAt, verified: false },
  sources: p.sources,
  createdAt: parsed.generatedAt
}))
