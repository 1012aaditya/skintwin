import { z } from 'zod'

// ---------- Enumerations ----------

export const SKIN_TYPES = ['oily', 'dry', 'combination', 'normal'] as const
export const SENSITIVITY = ['low', 'moderate', 'high'] as const
export const SKIN_TONES = ['fair', 'light', 'medium', 'tan', 'deep'] as const
export const AGE_RANGES = ['under_18', '18_24', '25_34', '35_44', '45_54', '55_plus'] as const

export const CONCERNS = [
  'acne',
  'excess_oil',
  'visible_pores',
  'dryness',
  'dark_spots',
  'uneven_tone',
  'texture',
  'redness',
  'fine_lines',
  'dullness',
  'dark_circles',
  'barrier'
] as const

export const GOALS = [
  'clear_skin',
  'oil_balance',
  'hydration',
  'even_tone',
  'smooth_texture',
  'barrier_repair',
  'brightening',
  'anti_aging',
  'calm_redness',
  'sun_protection'
] as const

export const PREFERENCES = [
  'fragrance_free',
  'non_comedogenic',
  'alcohol_free',
  'essential_oil_free',
  'cruelty_free',
  'vegan'
] as const

export const PRODUCT_CATEGORIES = [
  'cleanser',
  'toner',
  'essence',
  'serum',
  'treatment',
  'moisturizer',
  'sunscreen',
  'exfoliant',
  'mask',
  'eye',
  'other'
] as const

export const INVENTORY_STATUS = ['unopened', 'in_use', 'running_low', 'finished', 'paused', 'archived'] as const
export const FREQUENCIES = ['daily', 'alternate_days', '3x_week', '2x_week', 'weekly'] as const
export const PERMISSION_STATES = ['unknown', 'granted', 'denied', 'skipped'] as const

export type SkinType = (typeof SKIN_TYPES)[number]
export type Sensitivity = (typeof SENSITIVITY)[number]
export type Concern = (typeof CONCERNS)[number]
export type Goal = (typeof GOALS)[number]
export type Preference = (typeof PREFERENCES)[number]
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]
export type InventoryStatus = (typeof INVENTORY_STATUS)[number]
export type Frequency = (typeof FREQUENCIES)[number]
export type PermissionState = (typeof PERMISSION_STATES)[number]
export type RoutinePeriod = 'am' | 'pm'

// ---------- Schemas ----------

export const SkinProfileSchema = z.object({
  skinType: z.enum(SKIN_TYPES).nullable(),
  sensitivity: z.enum(SENSITIVITY).nullable(),
  skinTone: z.enum(SKIN_TONES).nullable(),
  ageRange: z.enum(AGE_RANGES).nullable(),
  concerns: z.array(z.enum(CONCERNS)),
  goals: z.array(z.enum(GOALS)),
  preferences: z.array(z.enum(PREFERENCES)),
  avoidIngredients: z.array(z.string().max(80)).max(50),
  budgetNote: z.string().max(200).nullable(),
  updatedAt: z.string()
})
export type SkinProfile = z.infer<typeof SkinProfileSchema>

export const PermissionsSchema = z.object({
  pageAccess: z.enum(PERMISSION_STATES),
  microphone: z.enum(PERMISSION_STATES),
  camera: z.enum(PERMISSION_STATES),
  notifications: z.enum(PERMISSION_STATES)
})
export type Permissions = z.infer<typeof PermissionsSchema>

export const OnboardingSchema = z.object({
  step: z.number().int().min(0),
  completed: z.boolean(),
  permissions: PermissionsSchema
})
export type Onboarding = z.infer<typeof OnboardingSchema>

export const AnalysisMetricSchema = z.object({
  key: z.string(),
  label: z.string(),
  score: z.number().nullable(), // provider UI score, 0–100 where higher = healthier
  raw: z.number().nullable()
})
export type AnalysisMetric = z.infer<typeof AnalysisMetricSchema>

export const SkinAnalysisSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  provider: z.enum(['youcam', 'mock']),
  isMock: z.boolean(),
  overallScore: z.number().nullable(),
  skinAge: z.number().nullable(),
  skinType: z.string().nullable(),
  metrics: z.array(AnalysisMetricSchema),
  taskId: z.string().nullable()
})
export type SkinAnalysis = z.infer<typeof SkinAnalysisSchema>

export const ProvenanceSchema = z.object({
  kind: z.enum(['demo_catalog', 'browser', 'screen', 'manual', 'partner']),
  label: z.string(),
  url: z.string().nullable(),
  fetchedAt: z.string(),
  verified: z.boolean()
})
export type Provenance = z.infer<typeof ProvenanceSchema>

export const PriceSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().max(8),
  verified: z.boolean(),
  note: z.string().nullable()
})
export type Price = z.infer<typeof PriceSchema>

export const SOURCE_KINDS = ['peer_reviewed', 'dermatology_body', 'regulatory', 'brand', 'retailer', 'other'] as const

/** A source link SkinTwin saw come back from a real web search — never one the model wrote itself. */
export const ResearchSourceSchema = z.object({ url: z.string().max(2048), title: z.string().max(300) })
export type ResearchSource = z.infer<typeof ResearchSourceSchema>

/** Web research behind a product verdict. Every URL is checked against the search results before it is stored. */
export const ProductResearchSchema = z.object({
  at: z.string(),
  /** where the full ingredient list came from, if one was found */
  ingredientSource: ResearchSourceSchema.nullable(),
  /** how the found list compares with what was read from the user's screen */
  ingredientsCheck: z.enum(['match', 'differs', 'not_compared', 'not_found']),
  differences: z.array(z.string().max(300)).max(6),
  findings: z
    .array(
      z.object({
        ingredient: z.string().max(160),
        finding: z.string().max(400),
        kind: z.enum(SOURCE_KINDS),
        source: ResearchSourceSchema
      })
    )
    .max(8)
})
export type ProductResearch = z.infer<typeof ProductResearchSchema>

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  brand: z.string().max(120),
  category: z.enum(PRODUCT_CATEGORIES),
  sizeMl: z.number().positive().nullable(),
  description: z.string().max(2000).nullable(),
  imageUrl: z.string().nullable(),
  ingredients: z.array(z.string().max(160)).max(120), // INCI names; empty = unknown
  price: PriceSchema.nullable(),
  url: z.string().nullable(),
  retailer: z.string().nullable(),
  claims: z.array(z.string().max(80)).max(10), // marketing claims reported by the source, e.g. "fragrance-free"
  source: ProvenanceSchema,
  research: ProductResearchSchema.optional(),
  createdAt: z.string()
})
export type Product = z.infer<typeof ProductSchema>

export const InventoryItemSchema = z.object({
  id: z.string(),
  productId: z.string(),
  status: z.enum(INVENTORY_STATUS),
  openedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  remainingPct: z.number().min(0).max(100).nullable(), // user estimate, never measured
  notes: z.string().max(500),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type InventoryItem = z.infer<typeof InventoryItemSchema>

export const RoutineStepSchema = z.object({
  id: z.string(),
  productId: z.string(),
  frequency: z.enum(FREQUENCIES),
  notes: z.string().max(300),
  enabled: z.boolean(),
  completions: z.array(z.string()) // YYYY-MM-DD dates
})
export type RoutineStep = z.infer<typeof RoutineStepSchema>

export const RoutineSchema = z.object({
  period: z.enum(['am', 'pm']),
  enabled: z.boolean(),
  steps: z.array(RoutineStepSchema)
})
export type Routine = z.infer<typeof RoutineSchema>

export const SavedProductSchema = z.object({
  id: z.string(),
  productId: z.string(),
  list: z.enum(['wishlist', 'saved']),
  source: z.enum(['companion', 'app', 'marketplace', 'browser']),
  reason: z.string().max(300).nullable(),
  conversationId: z.string().nullable(),
  createdAt: z.string()
})
export type SavedProduct = z.infer<typeof SavedProductSchema>

export const COMPANION_ACTION_TYPES = [
  'save_wishlist',
  'add_to_routine',
  'compare',
  'mark_owned',
  'open_insights',
  'open_retailer'
] as const
export type CompanionActionType = (typeof COMPANION_ACTION_TYPES)[number]

export const ConversationMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  createdAt: z.string(),
  productId: z.string().nullable(),
  provider: z.string().nullable(),
  suggestedActions: z.array(z.enum(COMPANION_ACTION_TYPES))
})
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>

export const ConversationSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messages: z.array(ConversationMessageSchema)
})
export type Conversation = z.infer<typeof ConversationSchema>

export const CompanionActionSchema = z.object({
  id: z.string(),
  type: z.enum(COMPANION_ACTION_TYPES),
  productId: z.string(),
  conversationId: z.string().nullable(),
  createdAt: z.string()
})
export type CompanionAction = z.infer<typeof CompanionActionSchema>

export const PartnerSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  isDemo: z.boolean(),
  note: z.string()
})
export type Partner = z.infer<typeof PartnerSchema>

export const MarketplaceListingSchema = z.object({
  id: z.string(),
  productId: z.string(),
  partnerId: z.string(),
  url: z.string(),
  isDemo: z.boolean(),
  fetchedAt: z.string()
})
export type MarketplaceListing = z.infer<typeof MarketplaceListingSchema>

export const CORNERS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const
export type Corner = (typeof CORNERS)[number]
export const DEFAULT_SHORTCUTS = { toggle: 'Alt+Space', voice: 'Alt+Shift+Space' } as const

export const SettingsSchema = z.object({
  voice: z.object({
    responseEnabled: z.boolean(),
    voiceName: z.string().nullable(),
    rate: z.number().min(0.5).max(2),
    activation: z.enum(['push_to_talk', 'click_to_toggle']),
    textOnly: z.boolean()
  }),
  // New fields carry defaults so databases saved by older versions still load.
  companion: z.object({
    launchOnStartup: z.boolean(),
    alwaysOnTop: z.boolean(),
    shortcut: z.string().max(60).default(DEFAULT_SHORTCUTS.toggle),
    voiceShortcut: z.string().max(60).default(DEFAULT_SHORTCUTS.voice),
    corner: z.enum(CORNERS).default('bottom-right')
  }),
  privacy: z.object({
    storeConversations: z.boolean(),
    storeAnalysisHistory: z.boolean(),
    sendProfileToAssistant: z.boolean()
  })
})
export type Settings = z.infer<typeof SettingsSchema>

export const DetectedProductSchema = z.object({
  productId: z.string(),
  tabUrl: z.string(),
  retailer: z.string().nullable(),
  detectedAt: z.string(),
  method: z.string()
})
export type DetectedProduct = z.infer<typeof DetectedProductSchema>

export const DetectionFailureSchema = z.object({
  tabUrl: z.string(),
  reason: z.string(),
  at: z.string()
})

export const DatabaseSchema = z.object({
  version: z.literal(1),
  userId: z.string(),
  displayName: z.string().nullable(),
  profile: SkinProfileSchema,
  onboarding: OnboardingSchema,
  analyses: z.array(SkinAnalysisSchema),
  products: z.array(ProductSchema),
  inventory: z.array(InventoryItemSchema),
  routines: z.object({ am: RoutineSchema, pm: RoutineSchema }),
  saved: z.array(SavedProductSchema),
  conversations: z.array(ConversationSchema),
  actions: z.array(CompanionActionSchema),
  partners: z.array(PartnerSchema),
  listings: z.array(MarketplaceListingSchema),
  settings: SettingsSchema,
  detected: DetectedProductSchema.nullable(),
  lastDetectionFailure: DetectionFailureSchema.nullable(),
  bridge: z.object({ pairingToken: z.string() })
})
export type Database = z.infer<typeof DatabaseSchema>

/** What the renderer receives: the DB minus secrets. */
export type Snapshot = Omit<Database, 'bridge'>

// ---------- Display labels ----------

export const LABELS: Record<string, string> = {
  oily: 'Oily',
  dry: 'Dry',
  combination: 'Combination',
  normal: 'Normal',
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  fair: 'Fair',
  light: 'Light',
  medium: 'Medium',
  tan: 'Tan',
  deep: 'Deep',
  under_18: 'Under 18',
  '18_24': '18–24',
  '25_34': '25–34',
  '35_44': '35–44',
  '45_54': '45–54',
  '55_plus': '55+',
  acne: 'Acne & breakouts',
  excess_oil: 'Excess oil',
  visible_pores: 'Visible pores',
  dryness: 'Dryness',
  dark_spots: 'Dark spots',
  uneven_tone: 'Uneven tone',
  texture: 'Uneven texture',
  redness: 'Redness',
  fine_lines: 'Fine lines',
  dullness: 'Dullness',
  dark_circles: 'Dark circles',
  barrier: 'Weak barrier',
  clear_skin: 'Clearer skin',
  oil_balance: 'Balanced oil',
  hydration: 'Hydration',
  even_tone: 'Even tone',
  smooth_texture: 'Smoother texture',
  barrier_repair: 'Barrier repair',
  brightening: 'Brightening',
  anti_aging: 'Firmness & lines',
  calm_redness: 'Calm redness',
  sun_protection: 'Sun protection',
  fragrance_free: 'Fragrance-free',
  non_comedogenic: 'Non-comedogenic',
  alcohol_free: 'Drying-alcohol-free',
  essential_oil_free: 'Essential-oil-free',
  cruelty_free: 'Cruelty-free',
  vegan: 'Vegan',
  cleanser: 'Cleanser',
  toner: 'Toner',
  essence: 'Essence',
  serum: 'Serum',
  treatment: 'Treatment',
  moisturizer: 'Moisturizer',
  sunscreen: 'Sunscreen',
  exfoliant: 'Exfoliant',
  mask: 'Mask',
  eye: 'Eye care',
  other: 'Other',
  unopened: 'Unopened',
  in_use: 'In use',
  running_low: 'Running low',
  finished: 'Finished',
  paused: 'Paused',
  archived: 'Archived',
  daily: 'Daily',
  alternate_days: 'Alternate days',
  '3x_week': '3× / week',
  '2x_week': '2× / week',
  weekly: 'Weekly'
}

export const label = (key: string | null | undefined): string =>
  key ? (LABELS[key] ?? key.replace(/_/g, ' ')) : '—'
