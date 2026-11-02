import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DEMO_CATALOG, DEMO_LISTINGS, DEMO_PARTNERS } from '@shared/catalog'
import { DatabaseSchema, DEFAULT_SHORTCUTS, type Database, type Snapshot } from '@shared/models'
import { applyMutation, type Mutation } from '@shared/mutations'

/**
 * Local-first persistence. A single JSON document under the app's userData folder,
 * written atomically (write temp file + rename). All writes go through the
 * validated pure reducer in @shared/mutations, so the main window and the
 * companion window can never diverge.
 */

export function createEmptyDatabase(opts: { demoCatalog: boolean }): Database {
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
    products: opts.demoCatalog ? structuredClone(DEMO_CATALOG) : [],
    inventory: [],
    routines: { am: { period: 'am', enabled: true, steps: [] }, pm: { period: 'pm', enabled: true, steps: [] } },
    saved: [],
    conversations: [],
    actions: [],
    partners: opts.demoCatalog ? structuredClone(DEMO_PARTNERS) : [],
    listings: opts.demoCatalog ? structuredClone(DEMO_LISTINGS) : [],
    reactions: [],
    settings: {
      voice: { responseEnabled: true, voiceName: null, rate: 1, activation: 'click_to_toggle', textOnly: false },
      companion: { launchOnStartup: true, alwaysOnTop: true, shortcut: DEFAULT_SHORTCUTS.toggle, voiceShortcut: DEFAULT_SHORTCUTS.voice, corner: 'bottom-right', style: 'island' },
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
    private readonly opts: { demoCatalog: boolean }
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

  /** Keep demo products in sync with code, or remove them when demo mode is off. */
  private syncCatalog(db: Database): Database {
    const nonDemo = db.products.filter((p) => p.source.kind !== 'demo_catalog')
    const referenced = new Set([
      ...db.inventory.map((i) => i.productId),
      ...db.saved.map((s) => s.productId),
      ...db.routines.am.steps.map((s) => s.productId),
      ...db.routines.pm.steps.map((s) => s.productId)
    ])
    const demo = this.opts.demoCatalog
      ? DEMO_CATALOG
      : DEMO_CATALOG.filter((p) => referenced.has(p.id)) // keep anything the user already relies on
    db.products = [...structuredClone(demo), ...nonDemo]
    db.listings = this.opts.demoCatalog ? structuredClone(DEMO_LISTINGS) : []
    return db
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
