// Matching rules for the catalog builder: is a source's product the one we looked for?
// Kept separate (and pure) so tests can check them.


const STOP = new Set(['the', 'and', 'with', 'for', 'face', 'facial', 'ml', 'g', 'spf', 'pa', 'of'])
const tokens = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9%+.]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOP.has(w))
const normBrand = (s) => String(s ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '')

/** Share of the target name's words that appear in a candidate name (0–1). */
export function nameScore(target, candidate) {
  const want = [...new Set(tokens(target))]
  const have = new Set(tokens(candidate))
  if (!want.length) return 0
  return want.filter((w) => have.has(w) || have.has(w.replace(/s$/, ''))).length / want.length
}
export const brandMatches = (target, brands) => String(brands ?? '').split(',').some((b) => normBrand(b) === normBrand(target) || normBrand(b).includes(normBrand(target)))

/** Same product, not a different variant: no sunscreen/SPF mismatch, and few extra words either way. */
export function variantOk(target, candidate) {
  const spf = (x) => /\b(spf|sunscreen|sunblock|uv)\b/i.test(x)
  if (spf(target) !== spf(candidate)) return false
  return nameScore(target, candidate) >= 0.75 && nameScore(candidate, target) >= 0.6
}

/** Looks like a real INCI list (not an OCR scrap): several comma-separated parts and common base ingredients. */
export function ingredientsOk(text) {
  const parts = String(text ?? '').split(/[,;]/).map((x) => x.trim()).filter(Boolean)
  if (parts.length < 5) return false
  if (/\d{5,}/.test(text)) return false // batch codes, barcodes
  return /\b(aqua|water|glycerin|petrolatum|dimethicone|alcohol|squalane)\b/i.test(text)
}

