/**
 * Product-page extractor. Injected into the active tab ONLY after the user clicks
 * "Check this product" (activeTab). It must stay self-contained — Chrome serialises
 * the function, so it cannot reference anything outside its own body.
 *
 * Priority: JSON-LD → microdata → Open Graph → scoped heuristics.
 * Returns plain data; nothing on the page is treated as an instruction.
 */
export function extractProductFromPage() {
  const clean = (s, max = 2000) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : null) || null
  const abs = (u) => {
    try {
      const url = new URL(u, location.href)
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
    } catch {
      return null
    }
  }
  const num = (v) => {
    if (v == null) return null
    const n = parseFloat(String(v).replace(/[^0-9.,]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.'))
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  const meta = (sel) => document.querySelector(sel)?.getAttribute('content') ?? null
  const firstImage = (img) => {
    if (!img) return null
    if (typeof img === 'string') return abs(img)
    if (Array.isArray(img)) return firstImage(img[0])
    if (typeof img === 'object') return abs(img.url || img.contentUrl || '')
    return null
  }

  // ---------- 1. JSON-LD ----------
  let ld = null
  const nodes = []
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(walk)
    nodes.push(n)
    if (n['@graph']) walk(n['@graph'])
    if (n.mainEntity) walk(n.mainEntity)
  }
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      walk(JSON.parse(s.textContent || ''))
    } catch {
      /* ignore malformed blocks */
    }
  }
  const isProduct = (n) => {
    const t = n['@type']
    return t === 'Product' || (Array.isArray(t) && t.includes('Product')) || t === 'ProductGroup'
  }
  const p = nodes.find(isProduct)
  if (p) {
    let offer = Array.isArray(p.offers) ? p.offers[0] : p.offers
    if (!offer && p.hasVariant) offer = [].concat(p.hasVariant)[0]?.offers
    if (Array.isArray(offer)) offer = offer[0]
    const props = [].concat(p.additionalProperty || [])
    const ingProp = props.find((x) => x && /ingredient/i.test(x.name || ''))
    ld = {
      title: clean(p.name, 300),
      brand: clean(typeof p.brand === 'string' ? p.brand : p.brand?.name, 120),
      description: clean(p.description, 4000),
      imageUrl: firstImage(p.image),
      price: num(offer?.price ?? offer?.lowPrice ?? offer?.priceSpecification?.price),
      currency: clean(offer?.priceCurrency ?? offer?.priceSpecification?.priceCurrency, 8),
      ingredientsText: clean(p.ingredients || ingProp?.value, 6000),
      sizeText: clean(p.size || p.weight?.value || null, 60)
    }
  }

  // ---------- 2. Microdata ----------
  let md = null
  const scope = document.querySelector('[itemtype*="schema.org/Product"]')
  if (scope) {
    const prop = (name) => {
      const el = scope.querySelector(`[itemprop="${name}"]`)
      return el ? el.getAttribute('content') || el.getAttribute('src') || el.textContent : null
    }
    md = {
      title: clean(prop('name'), 300),
      brand: clean(prop('brand'), 120),
      description: clean(prop('description'), 4000),
      imageUrl: abs(prop('image') || ''),
      price: num(prop('price')),
      currency: clean(prop('priceCurrency'), 8)
    }
  }

  // ---------- 3. Open Graph ----------
  const og = {
    title: clean(meta('meta[property="og:title"]'), 300),
    description: clean(meta('meta[property="og:description"]') || meta('meta[name="description"]'), 4000),
    imageUrl: abs(meta('meta[property="og:image"]') || ''),
    price: num(meta('meta[property="product:price:amount"]') || meta('meta[property="og:price:amount"]')),
    currency: clean(meta('meta[property="product:price:currency"]') || meta('meta[property="og:price:currency"]'), 8),
    brand: clean(meta('meta[property="product:brand"]'), 120),
    isProduct: /product/i.test(meta('meta[property="og:type"]') || '')
  }

  // ---------- 4. Ingredients (scoped heuristic) ----------
  // An INCI list is mostly short comma-separated names; menus and marketing copy aren't.
  const looksLikeInci = (t) => {
    if (!t || t.length >= 6000 || !/(aqua|water|glycerin|alcohol|acid|extract|oil|niacinamide|phenoxyethanol)/i.test(t)) return false
    const parts = t.split(',').map((x) => x.trim()).filter(Boolean)
    if (parts.length < 4) return false
    const nameLike = parts.filter((x) => x.length <= 60 && x.split(/\s+/).length <= 6).length
    // INCI names mostly carry chemical-looking words (…ate, …ide, glycol, extract, …).
    const chemical = parts.filter((x) => /(aqua|water|glycer|alcohol|acid|extract|oil|glycol|gum|wax|butter|parfum|fragrance|paraben|silica|mica|[a-z](ate|ide|ides|one|ol|ine|ane|ene|ose|yl|ium)\b)/i.test(x)).length
    return nameLike / parts.length >= 0.8 && chemical / parts.length >= 0.5
  }
  /** The most specific element inside `root` whose text reads as an ingredient list. */
  const findInci = (root) => {
    if (!root) return null
    let best = null
    for (const el of [root, ...[...root.querySelectorAll('*')].slice(0, 400)]) {
      const t = clean(el.textContent?.replace(/^\s*(full\s+|key\s+)?ingredients?\s*(list)?\s*:?/i, ''), 6000)
      if (looksLikeInci(t) && (!best || t.length < best.length)) best = t
    }
    return best
  }
  let ingredientsText = ld?.ingredientsText || null
  if (!ingredientsText) {
    const labels = [...document.querySelectorAll('h1,h2,h3,h4,h5,button,summary,strong,b,dt,th,span,div,p,li,a')].filter((el) => {
      const t = (el.textContent || '').trim()
      return t.length < 40 && /^(full\s+|key\s+)?ingredients?(\s+list)?\s*:?$/i.test(t)
    })
    for (const el of labels.slice(0, 20)) {
      const candidates = [
        el.nextElementSibling,
        el.parentElement?.nextElementSibling,
        el.closest('details,section,[class*="accordion"],[class*="tab"],li,div')
      ]
      const controls = el.getAttribute('aria-controls')
      if (controls) candidates.unshift(document.getElementById(controls))
      for (const c of candidates) {
        const t = findInci(c)
        if (t) {
          ingredientsText = t
          break
        }
      }
      if (ingredientsText) break
    }
  }
  if (!ingredientsText) {
    // inline "Ingredients: Aqua, ..." paragraphs
    for (const el of document.querySelectorAll('p,div,span,li,td')) {
      if (el.children.length > 3) continue
      const m = (el.textContent || '').match(/ingredients?\s*:\s*([^]{20,6000})/i)
      if (m && looksLikeInci(m[1])) {
        ingredientsText = clean(m[1], 6000)
        break
      }
    }
  }

  if (!ingredientsText) {
    // Unlabelled lists (e.g. "AQUA / WATER, GLYCERIN, …" in a collapsed panel). Stricter:
    // a long list that starts with water, so marketing copy can't match.
    let best = null
    for (const el of [...document.querySelectorAll('p,div,span,li,td,dd')].slice(0, 4000)) {
      if (el.children.length > 3) continue
      const t = clean(el.textContent, 6000)
      if (!t || (best && t.length >= best.length)) continue
      const head = t.split(',').slice(0, 3).join(',')
      if (t.split(',').length >= 8 && /\b(aqua|water|eau)\b/i.test(head) && looksLikeInci(t)) best = t
    }
    ingredientsText = best
  }

  // ---------- 5. Heuristic title / price ----------
  const h1 = clean(document.querySelector('h1')?.textContent, 300)
  // Error and block pages often still show a price widget; never call them products.
  const errorPage = /\b(page not found|not found|404|access denied|forbidden|something went wrong)\b/i
  if (!ld?.title && !md?.title && (errorPage.test(document.title) || errorPage.test(h1 || ''))) {
    return { ok: false, reason: 'This looks like an error page, not a product. Open the product page and try again.' }
  }
  let hPrice = null
  for (const el of document.querySelectorAll('[class*="price" i],[id*="price" i],[data-testid*="price" i]')) {
    const t = el.textContent || ''
    if (t.length > 40) continue
    const m = t.match(/(₹|Rs\.?|INR|\$|USD|€|EUR|£|GBP)\s?([\d,]+(?:\.\d{1,2})?)/i)
    if (m) {
      const sym = m[1].toUpperCase()
      hPrice = { price: num(m[2]), currency: sym === '₹' || sym.startsWith('RS') || sym === 'INR' ? 'INR' : sym === '$' || sym === 'USD' ? 'USD' : sym === '€' || sym === 'EUR' ? 'EUR' : 'GBP' }
      break
    }
  }

  const title = ld?.title || md?.title || (og.isProduct ? og.title : null) || (ingredientsText || hPrice ? h1 || og.title : null)
  const method = ld?.title ? 'json-ld' : md?.title ? 'microdata' : og.isProduct && og.title ? 'open-graph' : 'heuristic'
  if (!title) return { ok: false, reason: 'No product information found on this page. It might not be a product page, or it hasn’t finished loading.' }
  const price = ld?.price ?? md?.price ?? og.price ?? hPrice?.price ?? null
  const currency = (ld?.currency || md?.currency || og.currency || hPrice?.currency || null)
  return {
    ok: true,
    product: {
      title,
      brand: ld?.brand || md?.brand || og.brand || null,
      description: ld?.description || md?.description || og.description || null,
      imageUrl: ld?.imageUrl || md?.imageUrl || og.imageUrl || null,
      price: price != null && currency ? price : null,
      currency: price != null && currency ? currency.toUpperCase() : null,
      ingredientsText,
      url: location.href.split('#')[0],
      retailer: clean(meta('meta[property="og:site_name"]'), 120) || location.hostname.replace(/^www\./, ''),
      sizeText: ld?.sizeText || (title.match(/\d+(?:\.\d+)?\s?(ml|mL|fl\.?\s?oz)/)?.[0] ?? null),
      method
    }
  }
}
