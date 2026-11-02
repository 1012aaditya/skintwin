import { z } from 'zod'
import {
  COMPANION_ACTION_TYPES,
  COMPANION_STYLES,
  CORNERS,
  FREQUENCIES,
  INVENTORY_STATUS,
  OnboardingSchema,
  PermissionsSchema,
  PlaceSchema,
  ProductSchema,
  REACTION_KINDS,
  SettingsSchema,
  SkinProfileSchema,
  type Database,
  type RoutinePeriod
} from './models'

const Period = z.enum(['am', 'pm'])
const Hour = z.number().int().min(0).max(24)
const Hours = z.tuple([Hour, Hour]).refine(([a, b]) => a < b, 'The window must end after it starts')

const ManualProductInput = ProductSchema.pick({
  name: true,
  brand: true,
  category: true,
  sizeMl: true,
  ingredients: true,
  url: true,
  description: true
}).extend({ price: z.number().nonnegative().nullable().optional(), currency: z.string().max(8).optional() })
export type ManualProductInput = z.infer<typeof ManualProductInput>

export const MutationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('profile.update'), patch: SkinProfileSchema.omit({ updatedAt: true }).partial() }),
  z.object({ type: z.literal('user.setName'), name: z.string().max(60).nullable() }),
  z.object({
    type: z.literal('onboarding.update'),
    patch: OnboardingSchema.omit({ permissions: true }).partial().extend({ permissions: PermissionsSchema.partial().optional() })
  }),
  z.object({ type: z.literal('product.createManual'), product: ManualProductInput, id: z.string().optional() }),
  z.object({
    type: z.literal('inventory.add'),
    productId: z.string(),
    status: z.enum(INVENTORY_STATUS).optional(),
    openedAt: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    remainingPct: z.number().min(0).max(100).nullable().optional()
  }),
  z.object({
    type: z.literal('inventory.update'),
    id: z.string(),
    patch: z
      .object({
        status: z.enum(INVENTORY_STATUS),
        openedAt: z.string().nullable(),
        expiresAt: z.string().nullable(),
        remainingPct: z.number().min(0).max(100).nullable(),
        paoMonths: z.number().int().min(1).max(60).nullable(),
        notes: z.string().max(500)
      })
      .partial()
  }),
  z.object({ type: z.literal('inventory.remove'), id: z.string() }),
  z.object({ type: z.literal('routine.addStep'), period: Period, productId: z.string() }),
  z.object({
    type: z.literal('routine.updateStep'),
    period: Period,
    stepId: z.string(),
    patch: z.object({ frequency: z.enum(FREQUENCIES), notes: z.string().max(300), enabled: z.boolean() }).partial()
  }),
  z.object({ type: z.literal('routine.removeStep'), period: Period, stepId: z.string() }),
  z.object({ type: z.literal('routine.reorder'), period: Period, stepIds: z.array(z.string()) }),
  z.object({ type: z.literal('routine.setEnabled'), period: Period, enabled: z.boolean() }),
  z.object({ type: z.literal('routine.toggleComplete'), period: Period, stepId: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({
    type: z.literal('saved.add'),
    productId: z.string(),
    list: z.enum(['wishlist', 'saved']),
    source: z.enum(['companion', 'app', 'marketplace', 'browser']),
    reason: z.string().max(300).nullable().optional(),
    conversationId: z.string().nullable().optional()
  }),
  z.object({ type: z.literal('saved.remove'), id: z.string() }),
  z.object({ type: z.literal('action.log'), action: z.enum(COMPANION_ACTION_TYPES), productId: z.string(), conversationId: z.string().nullable() }),
  z.object({
    type: z.literal('settings.update'),
    patch: z
      .object({
        voice: SettingsSchema.shape.voice.partial(),
        // Explicit (no defaults) so a partial patch never resets other fields.
        companion: z
          .object({
            launchOnStartup: z.boolean(),
            alwaysOnTop: z.boolean(),
            shortcut: z.string().max(60),
            voiceShortcut: z.string().max(60),
            corner: z.enum(CORNERS),
            style: z.enum(COMPANION_STYLES),
            privacyMode: z.boolean(),
            routineReminders: z.boolean(),
            amWindow: Hours,
            pmWindow: Hours,
            sunAlerts: z.boolean(),
            place: PlaceSchema.nullable()
          })
          .partial(),
        privacy: SettingsSchema.shape.privacy.partial()
      })
      .partial()
  }),
  z.object({
    type: z.literal('reaction.add'),
    /** lets the caller undo the reaction it just logged */
    id: z.string().max(80).optional(),
    productId: z.string(),
    kind: z.enum(REACTION_KINDS),
    note: z.string().max(300).optional(),
    at: z.iso.datetime().optional()
  }),
  z.object({ type: z.literal('reaction.delete'), id: z.string() }),
  z.object({ type: z.literal('notice.dismiss'), key: z.string().max(80), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ type: z.literal('notice.snooze'), key: z.string().max(80), until: z.iso.datetime() }),
  z.object({ type: z.literal('analysis.delete'), id: z.string() }),
  z.object({ type: z.literal('analysis.deleteAll') }),
  z.object({ type: z.literal('conversations.deleteAll') }),
  z.object({ type: z.literal('detected.clear') })
])
export type Mutation = z.infer<typeof MutationSchema>

export interface MutationEnv {
  now: () => string
  newId: (prefix: string) => string
}

export class MutationError extends Error {}

/** Pure reducer: returns a new Database (structuredClone'd input is never mutated). */
export function applyMutation(input: Database, op: Mutation, env: MutationEnv): Database {
  const db = structuredClone(input)
  const now = env.now()
  const productExists = (id: string) => db.products.some((p) => p.id === id)
  const routine = (p: RoutinePeriod) => db.routines[p]

  switch (op.type) {
    case 'profile.update':
      db.profile = { ...db.profile, ...op.patch, updatedAt: now }
      break
    case 'user.setName':
      db.displayName = op.name?.trim() || null
      break
    case 'onboarding.update':
      db.onboarding = {
        ...db.onboarding,
        ...op.patch,
        permissions: { ...db.onboarding.permissions, ...(op.patch.permissions ?? {}) }
      }
      break
    case 'product.createManual': {
      const { price, currency, ...rest } = op.product
      db.products.push({
        ...rest,
        id: op.id ?? env.newId('manual'),
        imageUrl: null,
        price: price != null ? { amount: price, currency: currency ?? 'INR', verified: false, note: 'Entered by you' } : null,
        retailer: null,
        claims: [],
        source: { kind: 'manual', label: 'Added manually by you', url: rest.url ?? null, fetchedAt: now, verified: false },
        createdAt: now
      })
      break
    }
    case 'inventory.add': {
      if (!productExists(op.productId)) throw new MutationError('Unknown product')
      const existing = db.inventory.find((i) => i.productId === op.productId && i.status !== 'archived' && i.status !== 'finished')
      if (existing) break // idempotent: already owned
      db.inventory.push({
        id: env.newId('inv'),
        productId: op.productId,
        status: op.status ?? 'in_use',
        openedAt: op.openedAt ?? null,
        expiresAt: op.expiresAt ?? null,
        remainingPct: op.remainingPct ?? null,
        paoMonths: null,
        notes: '',
        createdAt: now,
        updatedAt: now
      })
      break
    }
    case 'inventory.update': {
      const item = db.inventory.find((i) => i.id === op.id)
      if (!item) throw new MutationError('Inventory item not found')
      Object.assign(item, op.patch, { updatedAt: now })
      if (op.patch.status === 'finished') item.remainingPct = 0
      break
    }
    case 'inventory.remove':
      db.inventory = db.inventory.filter((i) => i.id !== op.id)
      break
    case 'routine.addStep': {
      if (!productExists(op.productId)) throw new MutationError('Unknown product')
      const r = routine(op.period)
      if (r.steps.some((s) => s.productId === op.productId)) break
      r.steps.push({ id: env.newId('step'), productId: op.productId, frequency: 'daily', notes: '', enabled: true, completions: [] })
      break
    }
    case 'routine.updateStep': {
      const step = routine(op.period).steps.find((s) => s.id === op.stepId)
      if (!step) throw new MutationError('Step not found')
      Object.assign(step, op.patch)
      break
    }
    case 'routine.removeStep':
      routine(op.period).steps = routine(op.period).steps.filter((s) => s.id !== op.stepId)
      break
    case 'routine.reorder': {
      const r = routine(op.period)
      const byId = new Map(r.steps.map((s) => [s.id, s]))
      if (op.stepIds.length !== r.steps.length || op.stepIds.some((id) => !byId.has(id)))
        throw new MutationError('Reorder must include every step exactly once')
      r.steps = op.stepIds.map((id) => byId.get(id)!)
      break
    }
    case 'routine.setEnabled':
      routine(op.period).enabled = op.enabled
      break
    case 'routine.toggleComplete': {
      const step = routine(op.period).steps.find((s) => s.id === op.stepId)
      if (!step) throw new MutationError('Step not found')
      step.completions = step.completions.includes(op.date)
        ? step.completions.filter((d) => d !== op.date)
        : [...step.completions, op.date].slice(-120)
      break
    }
    case 'saved.add': {
      if (!productExists(op.productId)) throw new MutationError('Unknown product')
      if (db.saved.some((s) => s.productId === op.productId && s.list === op.list)) break
      db.saved.unshift({
        id: env.newId('saved'),
        productId: op.productId,
        list: op.list,
        source: op.source,
        reason: op.reason ?? null,
        conversationId: op.conversationId ?? null,
        createdAt: now
      })
      break
    }
    case 'saved.remove':
      db.saved = db.saved.filter((s) => s.id !== op.id)
      break
    case 'action.log':
      db.actions.unshift({ id: env.newId('act'), type: op.action, productId: op.productId, conversationId: op.conversationId, createdAt: now })
      db.actions = db.actions.slice(0, 500)
      break
    case 'settings.update':
      db.settings = {
        voice: { ...db.settings.voice, ...op.patch.voice },
        companion: { ...db.settings.companion, ...op.patch.companion },
        privacy: { ...db.settings.privacy, ...op.patch.privacy }
      }
      if (op.patch.privacy?.storeConversations === false) db.conversations = []
      break
    case 'reaction.add':
      if (!productExists(op.productId)) throw new MutationError('Unknown product')
      if (op.id && db.reactions.some((r) => r.id === op.id)) break
      db.reactions.unshift({ id: op.id ?? env.newId('react'), productId: op.productId, kind: op.kind, note: op.note?.trim() ?? '', at: op.at ?? now })
      db.reactions = db.reactions.slice(0, 500)
      break
    case 'reaction.delete':
      db.reactions = db.reactions.filter((r) => r.id !== op.id)
      break
    case 'notice.dismiss':
      db.notices[op.key] = { dismissedDay: op.day, snoozedUntil: null }
      break
    case 'notice.snooze':
      db.notices[op.key] = { dismissedDay: db.notices[op.key]?.dismissedDay ?? null, snoozedUntil: op.until }
      break
    case 'analysis.delete':
      db.analyses = db.analyses.filter((a) => a.id !== op.id)
      break
    case 'analysis.deleteAll':
      db.analyses = []
      break
    case 'conversations.deleteAll':
      db.conversations = []
      db.actions = []
      break
    case 'detected.clear':
      db.detected = null
      db.lastDetectionFailure = null
      break
  }
  return db
}
