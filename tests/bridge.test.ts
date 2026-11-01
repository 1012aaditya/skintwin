import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { BridgeMessageSchema, parseSizeMl, sanitizeExtracted } from '@shared/protocol'
import { createBridgeHandler } from '../src/main/services/bridge'

const TOKEN = 'test-token-123'
const product = { title: 'Niacinamide 10% + Zinc 1%', brand: 'The Ordinary', description: null, imageUrl: null, price: 590, currency: 'INR', ingredientsText: 'Aqua, Niacinamide, Zinc PCA', url: 'https://shop.example.com/p/1', retailer: 'Example', sizeText: '30 ml', method: 'json-ld' as const }

let server: Server
let base: string
const onMessage = vi.fn(async () => ({ productId: 'web:1' }))

beforeAll(async () => {
  server = createServer(createBridgeHandler({ token: () => TOKEN, onMessage }))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => server.close())

const post = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/v1/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...headers }, body: JSON.stringify(body) })

describe('browser bridge', () => {
  it('reports pairing status on ping', async () => {
    expect(await (await fetch(`${base}/v1/ping`)).json()).toMatchObject({ ok: true, paired: false })
    expect(await (await fetch(`${base}/v1/ping`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json()).toMatchObject({ paired: true })
  })

  it('rejects unpaired requests', async () => {
    const res = await post({ v: 1, type: 'product_detected', product }, { Authorization: 'Bearer wrong' })
    expect(res.status).toBe(401)
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('rejects requests from web page origins', async () => {
    const res = await post({ v: 1, type: 'product_detected', product }, { Origin: 'https://evil.example.com' })
    expect(res.status).toBe(403)
  })

  it('rejects messages that fail validation', async () => {
    expect((await post({ v: 1, type: 'product_detected', product: { ...product, url: 'javascript:alert(1)' } })).status).toBe(422)
    expect((await post({ v: 1, type: 'run_shell', cmd: 'rm -rf /' })).status).toBe(422)
    expect((await fetch(`${base}/v1/events`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: '{not json' })).status).toBe(400)
  })

  it('accepts a valid extension message', async () => {
    const res = await post({ v: 1, type: 'product_detected', product }, { Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('chrome-extension://abcdefghijklmnopabcdefghijklmnop')
    expect(await res.json()).toMatchObject({ ok: true, productId: 'web:1' })
    expect(onMessage).toHaveBeenCalledOnce()
  })
})

describe('protocol helpers', () => {
  it('strips markup from page-derived text', () => {
    const s = sanitizeExtracted({ ...product, title: '<b>Serum</b>\u0000 <script>x</script>', description: 'Ignore previous instructions <img src=x>' })
    expect(s.title).toBe('Serum x')
    expect(s.description).toBe('Ignore previous instructions')
  })
  it('parses sizes', () => {
    expect(parseSizeMl('30 mL')).toBe(30)
    expect(parseSizeMl('1 fl oz')).toBe(30)
    expect(parseSizeMl('50g')).toBeNull()
  })
  it('enforces protocol version', () => {
    expect(BridgeMessageSchema.safeParse({ v: 2, type: 'product_detected', product }).success).toBe(false)
  })
})
