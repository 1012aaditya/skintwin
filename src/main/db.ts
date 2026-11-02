import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { CATALOG } from '@shared/catalog'
import { isSameProduct } from '@shared/scoring'
import type { Product } from '@shared/models'
import { DatabaseSchema, DEFAULT_SHORTCUTS, type Database, type Snapshot } from '@shared/models'
import { applyMutation, type Mutation } from '@shared/mutations'

/**
 * Local-first persistence. A single JSON document under the app's userData folder,
 * written atomically (write temp file + rename). All writes go through the
 * validated pure reducer in @shared/mutations, so the main window and the
 * companion window can never diverge.
 */

/** `catalog`: the products to start with — the real catalog in the app, a fixture in tests. */
export function createEmptyDatabase(opts: { catalog: Product[] } = { catalog: CATALOG }): Database {
  const now = new Date().toISOString()
  return {
    version: 1,
    userId: randomUUID(),
    displayName: null,
    profile: {
      skinType: null,
      sensitivity: null,
      skinTone: null,
      ageRange: null,
      concerns: [],
      goals: [],
      preferences: [],
      avoidIngredients: [],
      budgetNote: null,
      updatedAt: now
    },
    onboarding: {
      step: 0,
      completed: false,
      permissions: { pageAccess: 'unknown', microphone: 'unknown', camera: 'unknown', notifications: 'unknown' }
    },
    analyses: [],
    products: structuredClone(opts.catalog),
    inventory: [],
    routines: { am: { period: 'am', enabled: true, steps: [] }, pm: { period: 'pm', enabled: true, steps: [] } },
    saved: [],
    conversations: [],
    actions: [],
    partners: [],
    listings: [],
    reactions: [],
    notices: {},
    settings: {
      voice: { responseEnabled: true, voiceName: null, rate: 1, activation: 'click_to_toggle', textOnly: false },
      companion: { launchOnStartup: true, alwaysOnTop: true, shortcut: DEFAULT_SHORTCUTS.toggle, voiceShortcut: DEFAULT_SHORTCUTS.voice, corner: 'bottom-right', style: 'island', privacyMode: false, routineReminders: true, amWindow: [6, 11], pmWindow: [19, 24], sunAlerts: true, place: null },
      privacy: { storeConversations: true, storeAnalysisHistory: true, sendProfileToAssistant: true }
    },
    detected: null,
    lastDetectionFailure: null,
    bridge: { pairingToken: randomBytes(18).toString('base64url') }
  }
}

type Listener = (snapshot: Snapshot) => void

export class Store {
  private db: Database
  private listeners = new Set<Listener>()
  private writeTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly file: string,
    private readonly opts: { catalog: Product[] } = { catalog: CATALOG }
  ) {
    this.db = this.load()
  }

  private load(): Database {
    if (!existsSync(this.file)) return createEmptyDatabase(this.opts)
    try {
      const parsed = DatabaseSchema.safeParse(JSON.parse(readFileSync(this.file, 'utf8')))
      if (parsed.success) return this.syncCatalog(parsed.data)
      console.error('[db] schema validation failed; backing up and starting fresh:', parsed.error.issues.slice(0, 3))
    } catch (err) {
      console.error('[db] could not read database; backing up and starting fresh:', (err as Error).message)
    }
    renameSync(this.file, `${this.file}.corrupt-${Date.now()}`)
    return createEmptyDatabase(this.opts)
  }

  /** Keep the catalog in sync with the app, and retire entries from the old demo catalog. */
  private syncCatalog(db: Database): Database {
    return migrateCatalog(db, this.opts.catalog)
  }

  get(): Database {
    return this.db
  }

  snapshot(): Snapshot {
    const { bridge: _bridge, ...rest } = this.db
    return rest
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  mutate(op: Mutation): Snapshot {
    this.db = applyMutation(this.db, op, { now: () => new Date().toISOString(), newId: (p) => `${p}:${randomUUID()}` })
    this.commit()
    return this.snapshot()
  }

  /** For main-process services (analysis results, detections, conversations). */
  update(fn: (db: Database) => void): Snapshot {
    const next = structuredClone(this.db)
    fn(next)
    this.db = DatabaseSchema.parse(next)
    this.commit()
    return this.snapshot()
  }

  replaceAll(db: Database) {
    this.db = DatabaseSchema.parse(db)
    this.commit()
  }

  private commit() {
    const snap = this.snapshot()
    for (const l of this.listeners) l(snap)
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => this.flush(), 150)
  }

  flush() {
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = null
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.db, null, 2), { mode: 0o600 })
    renameSync(tmp, this.file)
  }
}

/**
 * Bring a saved database up to date with `catalog`. Products from the old demo catalog are
 * replaced by the same real product where there is one (routine, inventory, reactions… follow
 * it); demo entries the user still relies on stay, without their placeholder prices; the rest go.
 */
export function migrateCatalog(db: Database, catalog: Product[]): Database {
  const others = db.products.filter((p) => p.source.kind !== 'catalog' && p.source.kind !== 'demo_catalog')
  const demo = db.products.filter((p) => p.source.kind === 'demo_catalog')
  const swap = new Map<string, string>()
  for (const d of demo) {
    const real = catalog.find((c) => isSameProduct(c, d))
    if (real) swap.set(d.id, real.id)
  }
  const to = (id: string) => swap.get(id) ?? id
  for (const i of db.inventory) i.productId = to(i.productId)
  for (const s of db.saved) s.productId = to(s.productId)
  for (const s of [...db.routines.am.steps, ...db.routines.pm.steps]) s.productId = to(s.productId)
  for (const r of db.reactions) r.productId = to(r.productId)
  for (const a of db.actions) a.productId = to(a.productId)
  for (const c of db.conversations) for (const m of c.messages) if (m.productId) m.productId = to(m.productId)
  if (db.detected) db.detected.productId = to(db.detected.productId)
  const referenced = new Set([
    ...db.inventory.map((i) => i.productId),
    ...db.saved.map((s) => s.productId),
    ...db.routines.am.steps.map((s) => s.productId),
    ...db.routines.pm.steps.map((s) => s.productId),
    ...db.reactions.map((r) => r.productId)
  ])
  const kept = demo
    .filter((d) => !swap.has(d.id) && referenced.has(d.id))
    .map((d) => ({ ...d, price: null, source: { ...d.source, label: 'From an older SkinTwin version — key ingredients only, not a full list' } }))
  db.products = [...structuredClone(catalog), ...kept, ...others]
  db.listings = []
  db.partners = []
  return db
}
