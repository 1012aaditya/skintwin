import { z } from 'zod'

/**
 * Browser extension → desktop bridge protocol (v1).
 * Everything here originates from arbitrary web pages: it is treated as untrusted
 * DATA. It is length-capped, stripped of markup, and never used as instructions.
 */

export const BRIDGE_DEFAULT_PORT = 47821
export const PROTOCOL_VERSION = 1

const httpUrl = z
  .string()
  .max(2048)
  .refine((u) => {
    try {
      const p = new URL(u).protocol
      return p === 'http:' || p === 'https:'
    } catch {
      return false
    }
  }, 'Must be an http(s) URL')

export const ExtractedProductSchema = z.object({
  title: z.string().min(1).max(300),
  brand: z.string().max(120).nullable(),
  description: z.string().max(4000).nullable(),
  imageUrl: httpUrl.nullable(),
  price: z.number().nonnegative().max(10_000_000).nullable(),
  currency: z.string().max(8).nullable(),
  ingredientsText: z.string().max(6000).nullable(),
  url: httpUrl,
  retailer: z.string().max(120).nullable(),
  sizeText: z.string().max(60).nullable(),
  method: z.enum(['json-ld', 'microdata', 'open-graph', 'heuristic'])
})
export type ExtractedProduct = z.infer<typeof ExtractedProductSchema>

export const BridgeMessageSchema = z.discriminatedUnion('type', [
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('product_detected'), product: ExtractedProductSchema }),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('product_updated'), product: ExtractedProductSchema }),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('product_detection_failed'), url: httpUrl, reason: z.string().max(300) }),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('analysis_requested'), product: ExtractedProductSchema }),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('comparison_requested'), product: ExtractedProductSchema })
])
export type BridgeMessage = z.infer<typeof BridgeMessageSchema>

/** Strip tags/control chars and collapse whitespace. */
export function sanitizeText(input: string | null | undefined, max = 2000): string | null {
  if (input == null) return null
  const out = input
    .replace(/<[^>]*>/g, ' ')
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
  return out.length ? out : null
}

export function sanitizeExtracted(p: ExtractedProduct): ExtractedProduct {
  return {
    ...p,
    title: sanitizeText(p.title, 300) ?? 'Untitled product',
    brand: sanitizeText(p.brand, 120),
    description: sanitizeText(p.description, 1500),
    ingredientsText: sanitizeText(p.ingredientsText, 6000),
    retailer: sanitizeText(p.retailer, 120),
    sizeText: sanitizeText(p.sizeText, 60),
    currency: sanitizeText(p.currency, 8)?.toUpperCase() ?? null
  }
}

/** Parse "30 mL", "1 fl oz", "50ml" into millilitres. */
export function parseSizeMl(text: string | null): number | null {
  if (!text) return null
  const ml = text.match(/(\d+(?:\.\d+)?)\s*m\s?l\b/i)
  if (ml) return parseFloat(ml[1]!)
  const oz = text.match(/(\d+(?:\.\d+)?)\s*(fl\.?\s*)?oz\b/i)
  if (oz) return Math.round(parseFloat(oz[1]!) * 29.57)
  return null
}
