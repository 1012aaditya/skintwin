import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { BridgeMessageSchema, PROTOCOL_VERSION, type BridgeMessage } from '@shared/protocol'

/**
 * Local HTTP bridge for the browser extension.
 *  - Binds to 127.0.0.1 only (not reachable from the network).
 *  - Only chrome-extension:// origins pass CORS; web pages cannot call it.
 *  - Every event requires the pairing token shown in SkinTwin › Settings.
 *  - Bodies are size-capped and validated against the typed protocol.
 */

const MAX_BODY = 64 * 1024

export interface BridgeHandlers {
  token: () => string
  onMessage: (msg: BridgeMessage) => Promise<{ productId?: string }>
}

function tokenOk(given: string | undefined, expected: string) {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function send(res: ServerResponse, status: number, body: unknown, origin?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    headers['Vary'] = 'Origin'
  }
  res.writeHead(status, headers)
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('Body too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  // Extension background/popup requests carry chrome-extension:// origins.
  // Requests with no Origin (curl, tests) are allowed but still need the token.
  if (!origin) return true
  return /^chrome-extension:\/\/[a-p]{32}$/.test(origin) || /^moz-extension:\/\//.test(origin)
}

export function createBridgeHandler(h: BridgeHandlers) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin
    if (!isAllowedOrigin(origin)) return send(res, 403, { ok: false, error: 'Origin not allowed' })
    const corsOrigin = origin ?? undefined
    if (req.method === 'OPTIONS') return send(res, 204, {}, corsOrigin)

    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.method === 'GET' && url.pathname === '/v1/ping') {
      const auth = req.headers.authorization?.replace(/^Bearer /, '')
      return send(res, 200, { ok: true, app: 'skintwin', protocol: PROTOCOL_VERSION, paired: tokenOk(auth, h.token()) }, corsOrigin)
    }
    if (req.method === 'POST' && url.pathname === '/v1/events') {
      const auth = req.headers.authorization?.replace(/^Bearer /, '')
      if (!tokenOk(auth, h.token())) return send(res, 401, { ok: false, error: 'Not paired — paste the pairing code from SkinTwin settings.' }, corsOrigin)
      let json: unknown
      try {
        json = JSON.parse(await readBody(req))
      } catch {
        return send(res, 400, { ok: false, error: 'Invalid JSON' }, corsOrigin)
      }
      const parsed = BridgeMessageSchema.safeParse(json)
      if (!parsed.success) return send(res, 422, { ok: false, error: 'Message failed validation', issues: parsed.error.issues.slice(0, 5).map((i) => i.path.join('.') + ': ' + i.message) }, corsOrigin)
      try {
        const result = await h.onMessage(parsed.data)
        return send(res, 200, { ok: true, ...result }, corsOrigin)
      } catch (err) {
        return send(res, 500, { ok: false, error: (err as Error).message }, corsOrigin)
      }
    }
    send(res, 404, { ok: false, error: 'Not found' }, corsOrigin)
  }
}

export function startBridge(port: number, h: BridgeHandlers): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      createBridgeHandler(h)(req, res).catch(() => send(res, 500, { ok: false, error: 'Internal error' }))
    })
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}
