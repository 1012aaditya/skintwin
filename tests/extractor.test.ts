// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { ExtractedProductSchema } from '@shared/protocol'
import { extractProductFromPage } from '../extension/extractor.js'

const setPage = (url: string, html: string) => {
  ;(window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(url)
  document.head.innerHTML = ''
  document.body.innerHTML = html
}

describe('product page extractor', () => {
  beforeEach(() => setPage('about:blank', ''))

  it('prefers JSON-LD and resolves relative images', () => {
    setPage(
      'https://shop.example.com/p/niacinamide',
      `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'BreadcrumbList' }, { '@type': 'Product', name: 'Niacinamide 10% + Zinc 1%', brand: { '@type': 'Brand', name: 'The Ordinary' }, image: ['/img/a.jpg'], offers: { '@type': 'Offer', price: '590.00', priceCurrency: 'INR' } }] })}</script>
       <h1>Niacinamide 10% + Zinc 1% 30ml</h1>
       <div class="accordion"><button aria-controls="ing">Ingredients</button><div id="ing">Aqua (Water), Niacinamide, Pentylene Glycol, Zinc PCA, Xanthan Gum</div></div>`
    )
    const r = extractProductFromPage()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.product).toMatchObject({ title: 'Niacinamide 10% + Zinc 1%', brand: 'The Ordinary', price: 590, currency: 'INR', imageUrl: 'https://shop.example.com/img/a.jpg', method: 'json-ld' })
    expect(r.product.ingredientsText).toMatch(/^Aqua \(Water\), Niacinamide/)
    expect(ExtractedProductSchema.safeParse(r.product).success).toBe(true)
  })

  it('falls back to Open Graph product metadata', () => {
    setPage('https://store.example.com/x', '')
    document.head.innerHTML = `<meta property="og:type" content="product"><meta property="og:title" content="Hydrating Cleanser"><meta property="product:price:amount" content="1,150"><meta property="product:price:currency" content="INR"><meta property="og:site_name" content="Store">`
    const r = extractProductFromPage()
    expect(r.ok && r.product).toMatchObject({ title: 'Hydrating Cleanser', price: 1150, currency: 'INR', retailer: 'Store', method: 'open-graph' })
  })

  it('uses scoped heuristics only when the page has product signals', () => {
    setPage('https://blog.example.com/post', '<h1>My morning thoughts</h1><p>Nothing to buy here.</p>')
    expect(extractProductFromPage()).toMatchObject({ ok: false })
    setPage('https://shop.example.com/y', '<h1>Barrier Cream 50 ml</h1><span class="product-price">₹1,250</span><p>Ingredients: Aqua, Glycerin, Ceramide NP, Cholesterol, Phenoxyethanol</p>')
    const r = extractProductFromPage()
    expect(r.ok && r.product).toMatchObject({ title: 'Barrier Cream 50 ml', price: 1250, currency: 'INR', method: 'heuristic', sizeText: '50 ml' })
  })
})

describe('extractor on tricky real-world layouts', () => {
  const run = async (html: string, title = '') => {
    document.documentElement.innerHTML = html
    document.title = title
    const { extractProductFromPage } = await import('../extension/extractor.js')
    return extractProductFromPage()
  }

  it('ignores menu text under a "Key Ingredients" filter label', async () => {
    const r = await run(`<h1>Daily Lotion</h1><span class="price">$14.99</span>
      <nav><div><span>Key Ingredients</span><div>Skin Type, Concern, Key Benefits, Key Ingredients, Texture, Hyaluronic Acid, Ceramides, Niacinamide, Water-based gel cream for oily skin that feels light all day</div></div></nav>`)
    if (!r.ok) throw new Error(r.reason)
    expect(r.product.ingredientsText).toBeNull()
  })

  it('finds an unlabelled INCI list that starts with water', async () => {
    const r = await run(`<h1>Daily Lotion</h1><span class="price">$14.99</span>
      <div><p>AQUA / WATER / EAU, GLYCERIN, CAPRYLIC/CAPRIC TRIGLYCERIDE, CETEARYL ALCOHOL, CETYL ALCOHOL, DIMETHICONE, PHENOXYETHANOL, CERAMIDE NP, SODIUM HYALURONATE</p></div>`)
    if (!r.ok) throw new Error(r.reason)
    expect(r.product.ingredientsText).toMatch(/^AQUA \/ WATER/)
  })

  it('does not treat a 404 page with a price widget as a product', async () => {
    const r = await run(`<h1>Page not found</h1><span class="price">₹269</span>`, 'Page not found')
    expect(r.ok).toBe(false)
  })
})
