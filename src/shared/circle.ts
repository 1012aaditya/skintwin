import { z } from 'zod'

/**
 * "Circle a product": the user draws around something on screen, Claude reads the circled
 * pixels, and the result goes through the same match engine as browser-detected products.
 *
 * Claude only reports what is legible in the image. Ingredients are never filled in from
 * memory — an unreadable ingredient list stays unknown, and the verdict says so.
 */

export const ScreenReadSchema = z.object({
  isSkincareProduct: z.boolean().describe('True only if the circled area shows one identifiable skincare or cosmetic product.'),
  brand: z.string().nullable().describe('Brand exactly as printed in the image; null if not visible.'),
  name: z.string().nullable().describe('Product name exactly as printed in the image; null if not legible.'),
  sizeText: z.string().nullable().describe('Size as printed, e.g. "50 ml"; null if not visible.'),
  ingredientsText: z
    .string()
    .nullable()
    .describe('The ingredient (INCI) list copied verbatim, ONLY if it is legible in the image. Never from memory or general knowledge. null otherwise.'),
  claims: z.array(z.string()).describe('Claims printed in the image, e.g. "fragrance-free", "SPF 50", "non-comedogenic". Empty if none.'),
  confidence: z.enum(['high', 'medium', 'low']).describe('How sure you are of the brand and name.'),
  note: z.string().describe('One short sentence on what you could and could not read.')
})
export type ScreenRead = z.infer<typeof ScreenReadSchema>

export interface Point {
  x: number
  y: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Smallest stroke that counts as a circle, in CSS pixels. */
export const MIN_CIRCLE = 28

/**
 * The rectangle around a drawn lasso, padded a little so labels at the edge aren't clipped,
 * clamped to the screen. Null if the stroke is too small to mean anything.
 */
export function lassoBounds(points: Point[], width: number, height: number, pad = 0.06): Box | null {
  if (points.length < 3) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  if (x1 - x0 < MIN_CIRCLE || y1 - y0 < MIN_CIRCLE) return null
  const px = (x1 - x0) * pad
  const py = (y1 - y0) * pad
  const x = Math.max(0, x0 - px)
  const y = Math.max(0, y0 - py)
  return { x, y, w: Math.min(width, x1 + px) - x, h: Math.min(height, y1 + py) - y }
}
