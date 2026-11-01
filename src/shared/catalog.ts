import type { MarketplaceListing, Partner, Product, ProductCategory } from './models'

/**
 * DEVELOPMENT DEMO CATALOG.
 * - Ingredient lists contain KEY ingredients only, transcribed for development; they
 *   are not complete INCI lists and must be verified on the brand's own page.
 * - Prices are illustrative placeholders (verified: false), never live retail prices.
 * - No partnerships exist. Brand links point to official brand homepages.
 * Seeded only when SKINTWIN_DEMO_CATALOG is not "0" (see main/db.ts).
 */

const SEEDED_AT = '2026-11-01T00:00:00.000Z'
const NOTE = 'Demo catalog — key ingredients only; verify on the brand’s page.'

function demo(
  id: string,
  brand: string,
  name: string,
  category: ProductCategory,
  sizeMl: number | null,
  ingredients: string[],
  opts: { price?: number; url: string; claims?: string[]; description?: string }
): Product {
  return {
    id: `demo:${id}`,
    brand,
    name,
    category,
    sizeMl,
    description: opts.description ?? null,
    imageUrl: null,
    ingredients,
    price: opts.price
      ? { amount: opts.price, currency: 'INR', verified: false, note: 'Illustrative demo price — not a live price' }
      : null,
    url: opts.url,
    retailer: brand,
    claims: opts.claims ?? [],
    source: { kind: 'demo_catalog', label: NOTE, url: opts.url, fetchedAt: SEEDED_AT, verified: false },
    createdAt: SEEDED_AT
  }
}

export const DEMO_CATALOG: Product[] = [
  demo('to-niacinamide', 'The Ordinary', 'Niacinamide 10% + Zinc 1%', 'serum', 30,
    ['Aqua (Water)', 'Niacinamide', 'Pentylene Glycol', 'Zinc PCA', 'Dimethyl Isosorbide', 'Tamarindus Indica Seed Gum', 'Xanthan Gum', 'Isoceteth-20', 'Ethoxydiglycol', 'Phenoxyethanol', 'Chlorphenesin'],
    { price: 899, url: 'https://theordinary.com', claims: ['fragrance-free', 'vegan'], description: 'High-strength niacinamide serum with zinc PCA, positioned for blemish-prone and oily skin.' }),
  demo('minimalist-niacinamide', 'Minimalist', 'Niacinamide 10% Face Serum', 'serum', 30,
    ['Aqua', 'Niacinamide', 'Zinc PCA'],
    { price: 699, url: 'https://beminimalist.co', claims: ['fragrance-free'], description: 'Niacinamide serum with zinc, marketed for oil balance and blemishes.' }),
  demo('plum-niacinamide', 'Plum', '10% Niacinamide Face Serum', 'serum', 30,
    ['Aqua', 'Niacinamide'],
    { price: 799, url: 'https://plumgoodness.com', description: 'Niacinamide serum marketed for blemishes and tone.' }),
  demo('cosrx-niacinamide-15', 'COSRX', 'The Niacinamide 15 Serum', 'serum', 20,
    ['Water', 'Niacinamide', 'Zinc PCA'],
    { price: 1050, url: 'https://www.cosrx.com', claims: ['fragrance-free'], description: 'Higher-strength niacinamide serum focused on tone and post-blemish marks.' }),
  demo('cerave-hydrating-cleanser', 'CeraVe', 'Hydrating Cleanser', 'cleanser', 236,
    ['Aqua', 'Glycerin', 'Cetearyl Alcohol', 'PEG-40 Stearate', 'Stearyl Alcohol', 'Potassium Phosphate', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Carbomer', 'Glyceryl Stearate', 'Behentrimonium Methosulfate', 'Sodium Lauroyl Lactylate', 'Sodium Hyaluronate', 'Cholesterol', 'Phenoxyethanol', 'Disodium EDTA', 'Dipotassium Phosphate', 'Tocopherol', 'Phytosphingosine', 'Xanthan Gum', 'Ethylhexylglycerin'],
    { price: 1150, url: 'https://www.cerave.com', claims: ['fragrance-free', 'non-comedogenic'], description: 'Non-foaming cream cleanser with ceramides and hyaluronic acid.' }),
  demo('cerave-moisturizing-cream', 'CeraVe', 'Moisturising Cream', 'moisturizer', 340,
    ['Aqua', 'Glycerin', 'Cetearyl Alcohol', 'Caprylic/Capric Triglyceride', 'Cetyl Alcohol', 'Ceteareth-20', 'Petrolatum', 'Potassium Phosphate', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Carbomer', 'Dimethicone', 'Sodium Hyaluronate', 'Cholesterol', 'Phenoxyethanol', 'Tocopherol', 'Phytosphingosine', 'Xanthan Gum'],
    { price: 1600, url: 'https://www.cerave.com', claims: ['fragrance-free', 'non-comedogenic'], description: 'Rich barrier cream with ceramides.' }),
  demo('cosrx-snail-96', 'COSRX', 'Advanced Snail 96 Mucin Power Essence', 'essence', 100,
    ['Snail Secretion Filtrate', 'Betaine', 'Butylene Glycol', '1,2-Hexanediol', 'Sodium Polyacrylate', 'Phenoxyethanol', 'Sodium Hyaluronate', 'Allantoin', 'Ethyl Hexanediol', 'Carbomer', 'Panthenol', 'Arginine'],
    { price: 1350, url: 'https://www.cosrx.com', description: 'Lightweight hydrating essence.' }),
  demo('lrp-anthelios', 'La Roche-Posay', 'Anthelios UVMune 400 Fluid SPF50+', 'sunscreen', 50,
    ['Aqua', 'Bis-Ethylhexyloxyphenol Methoxyphenyl Triazine', 'Butyl Methoxydibenzoylmethane', 'Drometrizole Trisiloxane', 'Terephthalylidene Dicamphor Sulfonic Acid', 'Ethylhexyl Triazone', 'Glycerin'],
    { price: 1950, url: 'https://www.laroche-posay.com', description: 'Lightweight high-protection fluid sunscreen.' }),
  demo('isntree-green-tea', 'ISNTREE', 'Green Tea Fresh Serum', 'serum', 50,
    ['Camellia Sinensis Leaf Extract', 'Sodium Hyaluronate', 'Glycerin'],
    { price: 1400, url: 'https://isntree.com', description: 'Light hydrating serum with green tea.' }),
  demo('lrp-toleriane-cleanser', 'La Roche-Posay', 'Toleriane Hydrating Gentle Cleanser', 'cleanser', 200,
    ['Aqua', 'Glycerin', 'Ceramide NP', 'Niacinamide'],
    { price: 1500, url: 'https://www.laroche-posay.com', claims: ['fragrance-free'], description: 'Gentle cream cleanser for sensitive skin.' }),
  demo('cetaphil-gentle', 'Cetaphil', 'Gentle Skin Cleanser', 'cleanser', 250,
    ['Aqua', 'Glycerin', 'Panthenol', 'Niacinamide'],
    { price: 1100, url: 'https://www.cetaphil.com', claims: ['fragrance-free'], description: 'Mild, low-foam cleanser.' }),
  demo('cosrx-good-morning', 'COSRX', 'Low pH Good Morning Gel Cleanser', 'cleanser', 150,
    ['Water', 'Cocamidopropyl Betaine', 'Betaine Salicylate', 'Melaleuca Alternifolia (Tea Tree) Leaf Oil', 'Allantoin'],
    { price: 750, url: 'https://www.cosrx.com', description: 'Low-pH gel cleanser with BHA and tea tree oil.' }),
  demo('pc-bha', 'Paula’s Choice', 'Skin Perfecting 2% BHA Liquid Exfoliant', 'exfoliant', 118,
    ['Water', 'Methylpropanediol', 'Butylene Glycol', 'Salicylic Acid', 'Polysorbate 20', 'Camellia Oleifera Leaf Extract', 'Sodium Hydroxide', 'Tetrasodium EDTA'],
    { price: 3100, url: 'https://www.paulaschoice.com', claims: ['fragrance-free'], description: 'Leave-on salicylic acid exfoliant.' }),
  demo('to-ha-b5', 'The Ordinary', 'Hyaluronic Acid 2% + B5', 'serum', 30,
    ['Aqua', 'Sodium Hyaluronate', 'Pentylene Glycol', 'Propanediol', 'Sodium Hyaluronate Crosspolymer', 'Panthenol', 'Glycerin'],
    { price: 750, url: 'https://theordinary.com', claims: ['fragrance-free'], description: 'Hydration serum with hyaluronic acid and panthenol.' }),
  demo('neutrogena-hydro-boost', 'Neutrogena', 'Hydro Boost Water Gel', 'moisturizer', 50,
    ['Aqua', 'Dimethicone', 'Glycerin', 'Sodium Hyaluronate', 'Fragrance'],
    { price: 999, url: 'https://www.neutrogena.com', description: 'Gel-cream moisturizer with hyaluronic acid.' }),
  demo('to-azelaic', 'The Ordinary', 'Azelaic Acid Suspension 10%', 'treatment', 30,
    ['Aqua', 'Isodecyl Neopentanoate', 'Dimethicone', 'Azelaic Acid'],
    { price: 1100, url: 'https://theordinary.com', claims: ['fragrance-free'], description: 'Cream-gel with azelaic acid for tone and blemishes.' }),
  demo('to-retinol-05', 'The Ordinary', 'Retinol 0.5% in Squalane', 'treatment', 30,
    ['Squalane', 'Caprylic/Capric Triglyceride', 'Retinol'],
    { price: 990, url: 'https://theordinary.com', description: 'Water-free retinol serum in squalane.' }),
  demo('lrp-cicaplast', 'La Roche-Posay', 'Cicaplast Baume B5+', 'moisturizer', 40,
    ['Aqua', 'Panthenol', 'Glycerin', 'Madecassoside'],
    { price: 1250, url: 'https://www.laroche-posay.com', claims: ['fragrance-free'], description: 'Soothing multi-purpose balm.' }),
  demo('minimalist-arbutin', 'Minimalist', 'Alpha Arbutin 2% Serum', 'serum', 30,
    ['Aqua', 'Alpha-Arbutin', 'Sodium Hyaluronate'],
    { price: 549, url: 'https://beminimalist.co', claims: ['fragrance-free'], description: 'Tone-evening serum.' })
]

export const DEMO_PARTNERS: Partner[] = []

/** Links to official brand homepages. These are not partnerships or offers. */
export const DEMO_LISTINGS: MarketplaceListing[] = DEMO_CATALOG.map((p) => ({
  id: `listing:${p.id}`,
  productId: p.id,
  partnerId: 'brand-site',
  url: p.url!,
  isDemo: true,
  fetchedAt: '2026-11-01T00:00:00.000Z'
}))
