import type { Concern, Goal } from './models'

/**
 * Curated, conservative ingredient reference used by the rule-based match engine.
 * Descriptions reflect commonly cited cosmetic functions, not medical claims.
 */
export type IngredientFlag =
  | 'fragrance'
  | 'essential_oil'
  | 'drying_alcohol'
  | 'potentially_comedogenic'
  | 'exfoliating_acid'
  | 'retinoid'
  | 'strong_active'
  | 'uv_filter'
  | 'animal_derived'

export interface IngredientInfo {
  id: string
  name: string
  /** lower-case substrings that identify this ingredient in an INCI list */
  match: string[]
  role: string
  description: string
  helps: Concern[]
  goals: Goal[]
  flags: IngredientFlag[]
  /** optional caution shown to the user */
  caution?: string
  /** dedupe key for routine-overlap detection (e.g. two niacinamide serums) */
  activeGroup?: string
}

export const INGREDIENTS: IngredientInfo[] = [
  {
    id: 'niacinamide',
    name: 'Niacinamide',
    match: ['niacinamide'],
    role: 'Vitamin B3',
    description: 'Commonly used to support oil balance, the look of pores, and a more even-looking tone.',
    helps: ['excess_oil', 'visible_pores', 'uneven_tone', 'dark_spots', 'barrier'],
    goals: ['oil_balance', 'even_tone', 'clear_skin', 'barrier_repair'],
    flags: [],
    caution: 'High concentrations (10%+) can feel irritating for some people; start a few times a week.',
    activeGroup: 'niacinamide'
  },
  {
    id: 'zinc_pca',
    name: 'Zinc PCA',
    match: ['zinc pca'],
    role: 'Oil-balancing mineral salt',
    description: 'Often included to help manage the look of excess oil.',
    helps: ['excess_oil', 'acne'],
    goals: ['oil_balance', 'clear_skin'],
    flags: []
  },
  {
    id: 'hyaluronic_acid',
    name: 'Hyaluronic acid',
    match: ['hyaluronic acid', 'sodium hyaluronate', 'hydrolyzed hyaluronic'],
    role: 'Humectant',
    description: 'Attracts and holds water in the outer skin layers for a hydrated feel.',
    helps: ['dryness', 'fine_lines'],
    goals: ['hydration'],
    flags: []
  },
  {
    id: 'glycerin',
    name: 'Glycerin',
    match: ['glycerin'],
    role: 'Humectant',
    description: 'A well-tolerated moisture-binding ingredient found in many formulas.',
    helps: ['dryness'],
    goals: ['hydration'],
    flags: []
  },
  {
    id: 'ceramides',
    name: 'Ceramides',
    match: ['ceramide'],
    role: 'Barrier lipids',
    description: 'Lipids naturally found in skin; used to support the moisture barrier.',
    helps: ['barrier', 'dryness', 'redness'],
    goals: ['barrier_repair', 'hydration'],
    flags: []
  },
  {
    id: 'panthenol',
    name: 'Panthenol',
    match: ['panthenol'],
    role: 'Pro-vitamin B5',
    description: 'Soothing and hydrating; commonly paired with humectants.',
    helps: ['dryness', 'redness', 'barrier'],
    goals: ['hydration', 'calm_redness'],
    flags: []
  },
  {
    id: 'salicylic_acid',
    name: 'Salicylic acid (BHA)',
    match: ['salicylic acid', 'betaine salicylate'],
    role: 'Oil-soluble exfoliant',
    description: 'Exfoliates inside pores; frequently used for breakouts and congestion.',
    helps: ['acne', 'visible_pores', 'excess_oil', 'texture'],
    goals: ['clear_skin', 'smooth_texture'],
    flags: ['exfoliating_acid'],
    caution: 'Can be drying; avoid layering with other strong exfoliants in the same routine.',
    activeGroup: 'exfoliant'
  },
  {
    id: 'glycolic_acid',
    name: 'Glycolic acid (AHA)',
    match: ['glycolic acid'],
    role: 'Water-soluble exfoliant',
    description: 'Surface exfoliant used for texture and dullness.',
    helps: ['texture', 'dullness', 'uneven_tone'],
    goals: ['smooth_texture', 'brightening'],
    flags: ['exfoliating_acid', 'strong_active'],
    caution: 'Increases sun sensitivity; use sunscreen and introduce slowly.',
    activeGroup: 'exfoliant'
  },
  {
    id: 'lactic_acid',
    name: 'Lactic acid (AHA)',
    match: ['lactic acid'],
    role: 'Gentle AHA',
    description: 'A milder AHA used for texture and hydration.',
    helps: ['texture', 'dullness', 'dryness'],
    goals: ['smooth_texture', 'brightening'],
    flags: ['exfoliating_acid'],
    activeGroup: 'exfoliant'
  },
  {
    id: 'mandelic_acid',
    name: 'Mandelic acid (AHA)',
    match: ['mandelic acid'],
    role: 'Gentle AHA',
    description: 'Larger-molecule AHA often chosen by people with reactive skin.',
    helps: ['texture', 'acne', 'uneven_tone'],
    goals: ['smooth_texture', 'clear_skin'],
    flags: ['exfoliating_acid'],
    activeGroup: 'exfoliant'
  },
  {
    id: 'retinoids',
    name: 'Retinoid',
    match: ['retinol', 'retinal', 'retinaldehyde', 'retinyl', 'hydroxypinacolone retinoate', 'adapalene'],
    role: 'Vitamin A derivative',
    description: 'Widely used for texture, fine lines and breakouts.',
    helps: ['fine_lines', 'texture', 'acne', 'uneven_tone'],
    goals: ['anti_aging', 'smooth_texture', 'clear_skin'],
    flags: ['retinoid', 'strong_active'],
    caution: 'Use at night, start slowly, and wear sunscreen. Not usually advised during pregnancy—check with a professional.',
    activeGroup: 'retinoid'
  },
  {
    id: 'bakuchiol',
    name: 'Bakuchiol',
    match: ['bakuchiol'],
    role: 'Plant-derived retinol alternative',
    description: 'Often marketed as a gentler alternative to retinol.',
    helps: ['fine_lines', 'texture'],
    goals: ['anti_aging'],
    flags: []
  },
  {
    id: 'ascorbic_acid',
    name: 'Vitamin C',
    match: ['ascorbic acid', 'ascorbyl glucoside', 'ascorbyl tetraisopalmitate', 'magnesium ascorbyl', 'sodium ascorbyl', 'ethyl ascorbic'],
    role: 'Antioxidant',
    description: 'Used for brightness and the look of uneven tone.',
    helps: ['dullness', 'dark_spots', 'uneven_tone'],
    goals: ['brightening', 'even_tone'],
    flags: [],
    activeGroup: 'vitamin_c'
  },
  {
    id: 'azelaic_acid',
    name: 'Azelaic acid',
    match: ['azelaic acid', 'potassium azeloyl'],
    role: 'Multi-purpose acid',
    description: 'Used for breakouts, redness and uneven tone.',
    helps: ['acne', 'redness', 'uneven_tone', 'dark_spots'],
    goals: ['clear_skin', 'calm_redness', 'even_tone'],
    flags: []
  },
  {
    id: 'alpha_arbutin',
    name: 'Alpha arbutin',
    match: ['arbutin'],
    role: 'Tone-evening ingredient',
    description: 'Commonly used for the look of dark spots.',
    helps: ['dark_spots', 'uneven_tone'],
    goals: ['even_tone', 'brightening'],
    flags: []
  },
  {
    id: 'tranexamic_acid',
    name: 'Tranexamic acid',
    match: ['tranexamic acid'],
    role: 'Tone-evening ingredient',
    description: 'Used for the look of discoloration and post-blemish marks.',
    helps: ['dark_spots', 'uneven_tone'],
    goals: ['even_tone'],
    flags: []
  },
  {
    id: 'centella',
    name: 'Centella asiatica',
    match: ['centella asiatica', 'madecassoside', 'asiaticoside'],
    role: 'Soothing botanical',
    description: 'Popular for calming the look of redness.',
    helps: ['redness', 'barrier'],
    goals: ['calm_redness', 'barrier_repair'],
    flags: []
  },
  {
    id: 'snail_mucin',
    name: 'Snail secretion filtrate',
    match: ['snail secretion filtrate'],
    role: 'Hydrating filtrate',
    description: 'Used in essences for hydration and a smoother feel.',
    helps: ['dryness', 'texture'],
    goals: ['hydration', 'smooth_texture'],
    flags: ['animal_derived']
  },
  {
    id: 'green_tea',
    name: 'Green tea extract',
    match: ['camellia sinensis'],
    role: 'Antioxidant botanical',
    description: 'Antioxidant extract often used in soothing, oil-balancing formulas.',
    helps: ['redness', 'excess_oil'],
    goals: ['calm_redness'],
    flags: []
  },
  {
    id: 'allantoin',
    name: 'Allantoin',
    match: ['allantoin'],
    role: 'Soothing agent',
    description: 'A gentle soothing and conditioning ingredient.',
    helps: ['redness'],
    goals: ['calm_redness'],
    flags: []
  },
  {
    id: 'squalane',
    name: 'Squalane',
    match: ['squalane'],
    role: 'Lightweight emollient',
    description: 'A light, skin-compatible oil that softens without heaviness.',
    helps: ['dryness'],
    goals: ['hydration', 'barrier_repair'],
    flags: []
  },
  {
    id: 'peptides',
    name: 'Peptides',
    match: ['peptide', 'palmitoyl', 'acetyl hexapeptide', 'copper tripeptide'],
    role: 'Signal peptides',
    description: 'Included in many formulas targeting firmness and fine lines.',
    helps: ['fine_lines'],
    goals: ['anti_aging'],
    flags: []
  },
  {
    id: 'zinc_oxide',
    name: 'Zinc oxide',
    match: ['zinc oxide'],
    role: 'Mineral UV filter',
    description: 'Broad-spectrum mineral sunscreen filter.',
    helps: ['dark_spots'],
    goals: ['sun_protection'],
    flags: ['uv_filter']
  },
  {
    id: 'titanium_dioxide',
    name: 'Titanium dioxide',
    match: ['titanium dioxide'],
    role: 'Mineral UV filter',
    description: 'Mineral sunscreen filter, primarily UVB/short UVA.',
    helps: [],
    goals: ['sun_protection'],
    flags: ['uv_filter']
  },
  {
    id: 'chemical_filters',
    name: 'Organic UV filters',
    match: ['avobenzone', 'butyl methoxydibenzoylmethane', 'octocrylene', 'bis-ethylhexyloxyphenol', 'ethylhexyl triazone', 'drometrizole trisiloxane', 'terephthalylidene dicamphor', 'diethylamino hydroxybenzoyl', 'ethylhexyl salicylate', 'homosalate', 'octinoxate', 'ethylhexyl methoxycinnamate', 'methylene bis-benzotriazolyl'],
    role: 'UV filters',
    description: 'Sunscreen filters that absorb UV radiation.',
    helps: ['dark_spots'],
    goals: ['sun_protection'],
    flags: ['uv_filter']
  },
  {
    id: 'fragrance',
    name: 'Fragrance / parfum',
    match: ['fragrance', 'parfum', 'aroma'],
    role: 'Scent',
    description: 'Added scent. A common source of irritation for sensitive skin.',
    helps: [],
    goals: [],
    flags: ['fragrance']
  },
  {
    id: 'fragrance_allergens',
    name: 'Fragrance allergens',
    match: ['linalool', 'limonene', 'citronellol', 'geraniol', 'eugenol', 'citral', 'coumarin'],
    role: 'Scent components',
    description: 'Fragrance components that must be declared because some people react to them.',
    helps: [],
    goals: [],
    flags: ['fragrance']
  },
  {
    id: 'essential_oils',
    name: 'Essential oils',
    match: ['lavandula', 'citrus aurantium', 'citrus limon', 'mentha piperita', 'eucalyptus', 'melaleuca alternifolia', 'rosmarinus officinalis leaf oil'],
    role: 'Aromatic botanical oils',
    description: 'Scented plant oils that can irritate sensitive skin.',
    helps: [],
    goals: [],
    flags: ['essential_oil', 'fragrance']
  },
  {
    id: 'drying_alcohol',
    name: 'Denatured alcohol',
    match: ['alcohol denat', 'sd alcohol', 'ethanol', 'isopropyl alcohol'],
    role: 'Solvent',
    description: 'Gives a quick-dry feel; high amounts can be drying for dry or sensitive skin.',
    helps: [],
    goals: [],
    flags: ['drying_alcohol']
  },
  {
    id: 'comedogenic_oils',
    name: 'Heavier occlusive oils/esters',
    match: ['cocos nucifera oil', 'coconut oil', 'isopropyl myristate', 'isopropyl palmitate', 'myristyl myristate', 'laureth-4', 'algae extract', 'theobroma cacao seed butter'],
    role: 'Emollient',
    description: 'Some people prone to breakouts prefer to avoid these heavier emollients.',
    helps: ['dryness'],
    goals: [],
    flags: ['potentially_comedogenic']
  },
  {
    id: 'benzoyl_peroxide',
    name: 'Benzoyl peroxide',
    match: ['benzoyl peroxide'],
    role: 'Anti-blemish active',
    description: 'Commonly used for breakouts; can bleach fabrics and be drying.',
    helps: ['acne'],
    goals: ['clear_skin'],
    flags: ['strong_active'],
    caution: 'Can be drying; may deactivate some retinoids if applied together.'
  }
]

export interface IngredientMatch {
  inci: string
  info: IngredientInfo | null
}

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Each term must start at a word boundary, so "ethanol" doesn't match "phenoxyethanol".
const MATCHERS = new Map(INGREDIENTS.map((ing) => [ing.id, ing.match.map((m) => new RegExp(`(^|[^a-z])${escape(m)}`))]))

export function identifyIngredient(inci: string): IngredientInfo | null {
  const n = normalize(inci)
  for (const ing of INGREDIENTS) {
    if (MATCHERS.get(ing.id)!.some((re) => re.test(n))) {
      // "alcohol" alone shouldn't match fatty alcohols like cetearyl alcohol
      if (ing.id === 'drying_alcohol' && /(cetyl|cetearyl|stearyl|behenyl|benzyl) alcohol/.test(n)) continue
      return ing
    }
  }
  return null
}

export function analyzeIngredients(list: string[]): IngredientMatch[] {
  return list.map((inci) => ({ inci, info: identifyIngredient(inci) }))
}

/** Split a raw ingredient paragraph from a web page into INCI tokens. */
export function splitIngredientText(text: string): string[] {
  const cleaned = text
    .replace(/^\s*(full\s+)?ingredients?\s*(list)?\s*[:-]?/i, '')
    .replace(/\(?\s*may contain[^)]*\)?/gi, '')
    .replace(/[\r\n]+/g, ',')
  // split on commas that are not inside parentheses
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of cleaned) {
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if ((ch === ',' || ch === '•' || ch === ';') && depth === 0) {
      parts.push(current)
      current = ''
    } else current += ch
  }
  parts.push(current)
  return parts
    .map((p) => p.replace(/\.$/, '').trim())
    .filter((p) => p.length > 1 && p.length < 160)
    .slice(0, 120)
}
