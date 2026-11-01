// Captures each companion state over a stand-in wallpaper for visual review.
// Usage: npm run build && node scripts/companion-shots.mjs [outDir]
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = resolve(process.argv[2] ?? join(ROOT, 'dist/companion'))
mkdirSync(OUT, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'skintwin-shots-'))
const PORT = 47896
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const app = await electron.launch({
  executablePath: join(ROOT, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: [ROOT],
  env: { ...process.env, SKINTWIN_USER_DATA: userData, SKINTWIN_DEMO_CATALOG: '1', SKINTWIN_ENABLE_MOCKS: '1', SKINTWIN_BRIDGE_PORT: String(PORT), ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', ELEVENLABS_API_KEY: '', STT_PROVIDER: 'off' }
})
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
// Skip onboarding with a realistic profile.
await main.evaluate(async () => {
  const m = window.skintwin.db.mutate
  await m({ type: 'profile.update', patch: { skinType: 'oily', sensitivity: 'moderate', concerns: ['acne', 'excess_oil', 'visible_pores'], goals: ['clear_skin', 'oil_balance', 'hydration'], preferences: ['fragrance_free', 'non_comedogenic'] } })
  await m({ type: 'onboarding.update', patch: { completed: true } })
  for (const id of ['demo:cerave-hydrating-cleanser', 'demo:cerave-moisturizing-cream', 'demo:lrp-anthelios']) {
    await m({ type: 'inventory.add', productId: id })
    await m({ type: 'routine.addStep', period: 'am', productId: id })
  }
})
await main.evaluate(() => window.skintwin.companion.show())
let c
while (!c) {
  c = app.windows().find((w) => w.url().includes('companion.html'))
  await sleep(200)
}
await c.waitForSelector('[aria-label="Talk to SkinTwin"]')
// Keep the main window out of the way so the desktop shows through.
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => !w.webContents.getURL().includes('companion') && w.minimize()))

// Screen Recording permission is usually missing for terminals, so paint a stand-in
// wallpaper behind the (transparent) companion page instead of grabbing the real desktop.
const WALLPAPER = 'linear-gradient(180deg,#3a2a86 0%,#6a4bbb 40%,#9b6cc8 70%,#d98fb0 100%)'
const shot = async (name, settle = 900) => {
  await sleep(settle)
  await c.evaluate((bg) => (document.documentElement.style.background = bg), WALLPAPER)
  await c.screenshot({ path: join(OUT, `${name}.png`) })
  await c.evaluate(() => (document.documentElement.style.background = ''))
  console.log('•', name)
}
const send = (cmd) => main.evaluate((x) => window.skintwin.companion.show(x), cmd)
const click = (text) =>
  c.evaluate((t) => {
    const el = [...document.querySelectorAll('button')].find((e) => e.textContent?.trim() === t) ?? [...document.querySelectorAll('button')].find((e) => e.textContent?.includes(t))
    el?.click()
    return !!el
  }, text)

const aria = async (l) => {
  await c.evaluate((x) => document.querySelector(`[aria-label="${x}"]`)?.click(), l)
  await sleep(450) // let the outgoing view finish its exit animation
}
await shot('1-idle', 1500)
await c.evaluate((bg) => (document.documentElement.style.background = bg), WALLPAPER)
await send({ type: 'menu', action: 'type' })
for (const ms of [120, 200, 280, 380]) {
  await sleep(ms === 120 ? 120 : 80)
  await c.screenshot({ path: join(OUT, `anim-open-${ms}.png`) })
}
await shot('1b-home-typing')
await c.evaluate((bg) => (document.documentElement.style.background = bg), WALLPAPER)
await c.evaluate(() => document.querySelector('[aria-label="Shrink to orb"]')?.click())
for (const ms of [60, 160]) {
  await sleep(ms === 60 ? 60 : 100)
  await c.screenshot({ path: join(OUT, `anim-close-${ms}.png`) })
}
await sleep(600)
const token = JSON.parse(readFileSync(join(userData, 'skintwin-db.json'), 'utf8')).bridge.pairingToken
const product = { title: 'Niacinamide 10% + Zinc 1%', brand: 'The Ordinary', description: 'High-strength vitamin and mineral blemish formula.', imageUrl: null, price: 590, currency: 'INR', ingredientsText: 'Aqua (Water), Niacinamide, Pentylene Glycol, Zinc PCA, Dimethyl Isosorbide, Tamarindus Indica Seed Gum, Xanthan Gum, Isoceteth-20, Ethoxydiglycol, Phenoxyethanol, Chlorphenesin', url: 'https://shop.example.com/products/niacinamide', retailer: 'Nykaa', sizeText: '30ml', method: 'json-ld' }
await fetch(`http://127.0.0.1:${PORT}/v1/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ v: 1, type: 'product_detected', product }) })
await shot('2-product-detected', 1500)
await click('See detailed analysis')
await shot('3-product-analysis')
await aria('Back')
await click('Compare')
await shot('4-comparison')
await aria('Back')
await click('Ask “Is this')
await shot('5-thinking', 250)
await c.waitForSelector('text=Here’s what I found for you')
await shot('6-response')
await c.evaluate(() => document.querySelector('[aria-label="Quick actions"]')?.click())
await shot('7-quick-actions')
await aria('Back')
await aria('Shrink to orb')
await sleep(500)
await send({ type: 'menu', action: 'profile' })
await shot('7b-profile-peek')
await aria('Back')
await send({ type: 'detection-failed', reason: 'No product information found on this page.' })
await shot('8-error')
await click('Not now')
await aria('Shrink to orb')
await shot('9-back-to-idle', 1200)
await app.close()
console.log('saved to', OUT)
