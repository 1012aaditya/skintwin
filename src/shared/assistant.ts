import { z } from 'zod'
import { COMPANION_ACTION_TYPES } from './models'

export const AssistantReplySchema = z.object({
  summary: z.string().describe('The bottom line in one short sentence (at most ~15 words) — the verdict for this user when a product is involved. Spoken aloud and shown in the compact view.'),
  answer: z.string().describe('The fuller answer with the reasons, at most ~80 words, plain text, no markdown. Shown when the user opens details.'),
  verdict: z.enum(['good_match', 'mixed', 'not_recommended', 'not_applicable']),
  highlights: z.array(z.string()).describe('Up to 3 short chips, e.g. "Supports hydration".'),
  suggestedActions: z.array(z.enum(COMPANION_ACTION_TYPES)),
  referencedProductIds: z.array(z.string()).describe('IDs of catalog products mentioned, from the provided list only.')
})
export type AssistantReply = z.infer<typeof AssistantReplySchema>

export interface AskRequest {
  requestId: string
  text: string
  productId: string | null
  conversationId: string | null
}

export interface AskResponse {
  requestId: string
  conversationId: string | null
  reply: AssistantReply
  provider: 'anthropic' | 'rules'
  providerNote: string | null
}

export interface ProviderStatus {
  llm: { configured: boolean; provider: string; model: string | null }
  stt: { configured: boolean; provider: string | null }
  tts: { configured: boolean; provider: string }
  youcam: { configured: boolean; mockAllowed: boolean }
  bridge: { running: boolean; port: number; error: string | null }
  demoCatalog: boolean
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string }
