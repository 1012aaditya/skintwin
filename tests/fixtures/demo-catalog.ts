import type { Product, ProductCategory } from '@shared/models'

/**
 * TEST FIXTURE — not shipped. Stable product data for unit tests (the app ships the real
 * catalog in src/shared/catalog-data.json). Ingredient lists are key ingredients only.
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
  opts: { url: string; claims?: string[]; description?: string }
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
    price: null,
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
    { url: 'https://theordinary.com', claims: ['fragrance-free', 'vegan'], description: 'High-strength niacinamide serum with zinc PCA, positioned for blemish-prone and oily skin.' }),
  demo('minimalist-niacinamide', 'Minimalist', 'Niacinamide 10% Face Serum', 'serum', 30,
    ['Aqua', 'Niacinamide', 'Zinc PCA'],
    { url: 'https://beminimalist.co', claims: ['fragrance-free'], description: 'Niacinamide serum with zinc, marketed for oil balance and blemishes.' }),
  demo('plum-niacinamide', 'Plum', '10% Niacinamide Face Serum', 'serum', 30,
    ['Aqua', 'Niacinamide'],
    { url: 'https://plumgoodness.com', description: 'Niacinamide serum marketed for blemishes and tone.' }),
  demo('cosrx-niacinamide-15', 'COSRX', 'The Niacinamide 15 Serum', 'serum', 20,
    ['Water', 'Niacinamide', 'Zinc PCA'],
    { url: 'https://www.cosrx.com', claims: ['fragrance-free'], description: 'Higher-strength niacinamide serum focused on tone and post-blemish marks.' }),
  demo('cerave-hydrating-cleanser', 'CeraVe', 'Hydrating Cleanser', 'cleanser', 236,
    ['Aqua', 'Glycerin', 'Cetearyl Alcohol', 'PEG-40 Stearate', 'Stearyl Alcohol', 'Potassium Phosphate', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Carbomer', 'Glyceryl Stearate', 'Behentrimonium Methosulfate', 'Sodium Lauroyl Lactylate', 'Sodium Hyaluronate', 'Cholesterol', 'Phenoxyethanol', 'Disodium EDTA', 'Dipotassium Phosphate', 'Tocopherol', 'Phytosphingosine', 'Xanthan Gum', 'Ethylhexylglycerin'],
    { url: 'https://www.cerave.com', claims: ['fragrance-free', 'non-comedogenic'], description: 'Non-foaming cream cleanser with ceramides and hyaluronic acid.' }),
  demo('cerave-moisturizing-cream', 'CeraVe', 'Moisturising Cream', 'moisturizer', 340,
    ['Aqua', 'Glycerin', 'Cetearyl Alcohol', 'Caprylic/Capric Triglyceride', 'Cetyl Alcohol', 'Ceteareth-20', 'Petrolatum', 'Potassium Phosphate', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Carbomer', 'Dimethicone', 'Sodium Hyaluronate', 'Cholesterol', 'Phenoxyethanol', 'Tocopherol', 'Phytosphingosine', 'Xanthan Gum'],
    { url: 'https://www.cerave.com', claims: ['fragrance-free', 'non-comedogenic'], description: 'Rich barrier cream with ceramides.' }),
  demo('cosrx-snail-96', 'COSRX', 'Advanced Snail 96 Mucin Power Essence', 'essence', 100,
    ['Snail Secretion Filtrate', 'Betaine', 'Butylene Glycol', '1,2-Hexanediol', 'Sodium Polyacrylate', 'Phenoxyethanol', 'Sodium Hyaluronate', 'Allantoin', 'Ethyl Hexanediol', 'Carbomer', 'Panthenol', 'Arginine'],
    { url: 'https://www.cosrx.com', description: 'Lightweight hydrating essence.' }),
  demo('lrp-anthelios', 'La Roche-Posay', 'Anthelios UVMune 400 Fluid SPF50+', 'sunscreen', 50,
    ['Aqua', 'Bis-Ethylhexyloxyphenol Methoxyphenyl Triazine', 'Butyl Methoxydibenzoylmethane', 'Drometrizole Trisiloxane', 'Terephthalylidene Dicamphor Sulfonic Acid', 'Ethylhexyl Triazone', 'Glycerin'],
    { url: 'https://www.laroche-posay.com', description: 'Lightweight high-protection fluid sunscreen.' }),
  demo('isntree-green-tea', 'ISNTREE', 'Green Tea Fresh Serum', 'serum', 50,
    ['Camellia Sinensis Leaf Extract', 'Sodium Hyaluronate', 'Glycerin'],
    { url: 'https://isntree.com', description: 'Light hydrating serum with green tea.' }),
  demo('lrp-toleriane-cleanser', 'La Roche-Posay', 'Toleriane Hydrating Gentle Cleanser', 'cleanser', 200,
    ['Aqua', 'Glycerin', 'Ceramide NP', 'Niacinamide'],
    { url: 'https://www.laroche-posay.com', claims: ['fragrance-free'], description: 'Gentle cream cleanser for sensitive skin.' }),
  demo('cetaphil-gentle', 'Cetaphil', 'Gentle Skin Cleanser', 'cleanser', 250,
    ['Aqua', 'Glycerin', 'Panthenol', 'Niacinamide'],
    { url: 'https://www.cetaphil.com', claims: ['fragrance-free'], description: 'Mild, low-foam cleanser.' }),
  demo('cosrx-good-morning', 'COSRX', 'Low pH Good Morning Gel Cleanser', 'cleanser', 150,
    ['Water', 'Cocamidopropyl Betaine', 'Betaine Salicylate', 'Melaleuca Alternifolia (Tea Tree) Leaf Oil', 'Allantoin'],
    { url: 'https://www.cosrx.com', description: 'Low-pH gel cleanser with BHA and tea tree oil.' }),
  demo('pc-bha', 'Paula’s Choice', 'Skin Perfecting 2% BHA Liquid Exfoliant', 'exfoliant', 118,
    ['Water', 'Methylpropanediol', 'Butylene Glycol', 'Salicylic Acid', 'Polysorbate 20', 'Camellia Oleifera Leaf Extract', 'Sodium Hydroxide', 'Tetrasodium EDTA'],
    { url: 'https://www.paulaschoice.com', claims: ['fragrance-free'], description: 'Leave-on salicylic acid exfoliant.' }),
  demo('to-ha-b5', 'The Ordinary', 'Hyaluronic Acid 2% + B5', 'serum', 30,
    ['Aqua', 'Sodium Hyaluronate', 'Pentylene Glycol', 'Propanediol', 'Sodium Hyaluronate Crosspolymer', 'Panthenol', 'Glycerin'],
    { url: 'https://theordinary.com', claims: ['fragrance-free'], description: 'Hydration serum with hyaluronic acid and panthenol.' }),
  demo('neutrogena-hydro-boost', 'Neutrogena', 'Hydro Boost Water Gel', 'moisturizer', 50,
    ['Aqua', 'Dimethicone', 'Glycerin', 'Sodium Hyaluronate', 'Fragrance'],
    { url: 'https://www.neutrogena.com', description: 'Gel-cream moisturizer with hyaluronic acid.' }),
  demo('to-azelaic', 'The Ordinary', 'Azelaic Acid Suspension 10%', 'treatment', 30,
    ['Aqua', 'Isodecyl Neopentanoate', 'Dimethicone', 'Azelaic Acid'],
    { url: 'https://theordinary.com', claims: ['fragrance-free'], description: 'Cream-gel with azelaic acid for tone and blemishes.' }),
  demo('to-retinol-05', 'The Ordinary', 'Retinol 0.5% in Squalane', 'treatment', 30,
    ['Squalane', 'Caprylic/Capric Triglyceride', 'Retinol'],
    { url: 'https://theordinary.com', description: 'Water-free retinol serum in squalane.' }),
  demo('lrp-cicaplast', 'La Roche-Posay', 'Cicaplast Baume B5+', 'moisturizer', 40,
    ['Aqua', 'Panthenol', 'Glycerin', 'Madecassoside'],
    { url: 'https://www.laroche-posay.com', claims: ['fragrance-free'], description: 'Soothing multi-purpose balm.' }),
  demo('minimalist-arbutin', 'Minimalist', 'Alpha Arbutin 2% Serum', 'serum', 30,
    ['Aqua', 'Alpha-Arbutin', 'Sodium Hyaluronate'],
    { url: 'https://beminimalist.co', claims: ['fragrance-free'], description: 'Tone-evening serum.' })
]
