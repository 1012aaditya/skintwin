import { extractProductFromPage } from './extractor.js'

const BRIDGE = 'http://127.0.0.1:47821'
const $ = (id) => document.getElementById(id)
let token = null
let lastProduct = null
let pageAccess = true

function setStatus(text, kind) {
  const el = $('status')
  el.textContent = text
  el.className = `pill ${kind ?? ''}`
}
function message(text, error = false) {
  const el = $('message')
  el.hidden = !text
  el.textContent = text ?? ''
  el.className = `message${error ? ' error' : ''}`
}

async function ping() {
  try {
    const res = await fetch(`${BRIDGE}/v1/ping`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    const data = await res.json()
    if (!data.paired) {
      setStatus('Not paired', 'bad')
      $('pair').hidden = false
      return false
    }
    $('pair').hidden = true
    pageAccess = data.pageAccess !== false
    if (!pageAccess) {
      setStatus('Page access off', 'bad')
      message('Page access is turned off in SkinTwin. Turn it on in Settings › Browser extension, then try again.', true)
      return false
    }
    setStatus('Connected', 'ok')
    return true
  } catch {
    setStatus('App not running', 'bad')
    message('Open the SkinTwin desktop app, then try again.', true)
    return false
  }
}

async function send(payload) {
  const res = await fetch(`${BRIDGE}/v1/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ v: 1, ...payload })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) throw new Error(data.error || `SkinTwin returned ${res.status}`)
  return data
}

async function check() {
  message(null)
  $('check').disabled = true
  $('check').textContent = 'Reading page…'
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  try {
    // Re-check right before reading: the setting may have changed since the popup opened.
    if (!(await ping())) return
    if (!tab?.id || !/^https?:/.test(tab.url ?? '')) throw new Error('SkinTwin can only read regular web pages (not browser or extension pages).')
    const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractProductFromPage })
    const result = injection?.result
    if (!result?.ok) {
      const reason = result?.reason ?? 'Couldn’t read product details from this page.'
      message(reason, true)
      await send({ type: 'product_detection_failed', url: tab.url, reason }).catch(() => {})
      return
    }
    lastProduct = result.product
    renderProduct(lastProduct)
    await send({ type: 'product_detected', product: lastProduct })
    message(lastProduct.ingredientsText ? 'Sent to SkinTwin ✨ — check your companion.' : 'Sent to SkinTwin. No ingredient list was found on this page, so the match will be limited.')
  } catch (err) {
    message(err.message, true)
  } finally {
    $('check').disabled = false
    $('check').textContent = 'Check this product'
  }
}

function renderProduct(p) {
  $('result').hidden = false
  $('brand').textContent = p.brand ?? p.retailer ?? ''
  $('title').textContent = p.title
  const price = p.price != null ? `${p.currency} ${p.price}` : 'No price found'
  $('meta').textContent = `${price} · ${p.ingredientsText ? 'Ingredients found' : 'No ingredients found'} · via ${p.method}`
  if (p.imageUrl) {
    $('img').src = p.imageUrl
    $('img').hidden = false
  }
}

async function action(type) {
  if (!lastProduct) return
  try {
    await send({ type, product: lastProduct })
    message(type === 'analysis_requested' ? 'Asking SkinTwin — see the companion.' : 'Opening comparison in SkinTwin.')
  } catch (err) {
    message(err.message, true)
  }
}

$('check').addEventListener('click', check)
$('analyze').addEventListener('click', () => action('analysis_requested'))
$('compare').addEventListener('click', () => action('comparison_requested'))
$('repair').addEventListener('click', () => ($('pair').hidden = false))
$('pairForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  token = $('token').value.trim()
  await chrome.storage.local.set({ pairingToken: token })
  message(null)
  if (await ping()) message('Paired with SkinTwin.')
  else if ($('status').textContent === 'Not paired') message('That code didn’t match. Copy it again from SkinTwin settings.', true)
})

;(async () => {
  token = (await chrome.storage.local.get('pairingToken')).pairingToken ?? null
  await ping()
})()
