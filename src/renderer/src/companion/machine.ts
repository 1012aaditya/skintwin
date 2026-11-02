import type { AskResponse } from '@shared/assistant'

export type CompanionState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'responding'
  | 'product_detected'
  | 'product_analysis'
  | 'comparison'
  | 'quick_actions'
  | 'profile_peek'
  | 'permission_required'
  | 'error'

export type ErrorKind = 'microphone_denied' | 'microphone_unavailable' | 'stt_not_configured' | 'page_unreadable' | 'screen_denied' | 'screen_unreadable' | 'product_unavailable' | 'network' | 'provider' | 'unknown'

export interface CompanionError {
  kind: ErrorKind
  message: string
}

export interface CompanionContext {
  state: CompanionState
  /** product the conversation is about (detected or selected) */
  productId: string | null
  /** id of the single request allowed to resolve the current processing step */
  requestId: string | null
  stage: 'transcribing' | 'reading' | 'thinking' | null
  question: string | null
  viaVoice: boolean
  response: AskResponse | null
  conversationId: string | null
  error: CompanionError | null
  /** state to return to from a side panel (quick actions, profile peek, error) */
  returnTo: CompanionState
}

export type CompanionEvent =
  | { type: 'LISTEN' }
  | { type: 'CANCEL' }
  | { type: 'STOP_LISTENING'; requestId: string }
  | { type: 'TRANSCRIBED'; requestId: string; text: string }
  | { type: 'SUBMIT_TEXT'; requestId: string; text: string }
  | { type: 'ANSWERED'; requestId: string; response: AskResponse }
  | { type: 'FAILED'; requestId: string | null; error: CompanionError }
  | { type: 'PERMISSION_REQUIRED'; error: CompanionError }
  | { type: 'PRODUCT_DETECTED'; productId: string }
  /** Main is reading a region the user circled on screen. */
  | { type: 'READING_SCREEN'; requestId: string }
  /** The circled product was read; go straight on to asking about it. */
  | { type: 'SCREEN_READ'; requestId: string; productId: string; nextRequestId: string; question: string }
  | { type: 'OPEN_ANALYSIS'; productId?: string }
  | { type: 'OPEN_COMPARISON'; productId?: string }
  | { type: 'OPEN_QUICK_ACTIONS'; productId?: string }
  | { type: 'OPEN_PROFILE' }
  | { type: 'DISMISS_PRODUCT' }
  | { type: 'BACK' }
  | { type: 'RESET' }

export const initialContext: CompanionContext = {
  state: 'idle',
  productId: null,
  requestId: null,
  stage: null,
  question: null,
  viaVoice: false,
  response: null,
  conversationId: null,
  error: null,
  returnTo: 'idle'
}

const BUSY: CompanionState[] = ['listening', 'processing']

/** Which states use the larger window. */
export const isExpanded = (s: CompanionState) => !['idle', 'listening', 'processing'].includes(s)

function home(ctx: CompanionContext): CompanionState {
  if (ctx.response) return 'responding'
  return ctx.productId ? 'product_detected' : 'idle'
}

export function companionReducer(ctx: CompanionContext, ev: CompanionEvent): CompanionContext {
  switch (ev.type) {
    case 'LISTEN':
      if (ctx.state === 'processing') return ctx // no new input while a request is in flight
      return { ...ctx, state: 'listening', error: null, requestId: null, stage: null }

    case 'CANCEL':
      if (ctx.state === 'listening' || ctx.state === 'processing')
        return { ...ctx, state: ctx.productId ? 'product_detected' : 'idle', requestId: null, stage: null, response: null }
      return ctx

    case 'STOP_LISTENING':
      if (ctx.state !== 'listening') return ctx
      return { ...ctx, state: 'processing', stage: 'transcribing', requestId: ev.requestId, viaVoice: true, question: null }

    case 'TRANSCRIBED':
      if (ctx.state !== 'processing' || ctx.requestId !== ev.requestId) return ctx // stale
      return { ...ctx, stage: 'thinking', question: ev.text }

    case 'SUBMIT_TEXT': {
      if (ctx.state === 'processing') return ctx // duplicate submission
      const text = ev.text.trim()
      if (!text) return ctx
      return { ...ctx, state: 'processing', stage: 'thinking', requestId: ev.requestId, question: text, viaVoice: false, error: null }
    }

    case 'ANSWERED':
      if (ctx.state !== 'processing' || ctx.requestId !== ev.requestId) return ctx // stale or cancelled
      return {
        ...ctx,
        state: 'responding',
        stage: null,
        requestId: null,
        response: ev.response,
        conversationId: ev.response.conversationId ?? ctx.conversationId
      }

    case 'FAILED':
      if (ev.requestId !== null && ctx.requestId !== ev.requestId) return ctx
      return { ...ctx, state: 'error', stage: null, requestId: null, error: ev.error, returnTo: home({ ...ctx, response: ctx.response }) }

    case 'PERMISSION_REQUIRED':
      return { ...ctx, state: 'permission_required', stage: null, requestId: null, error: ev.error, returnTo: home(ctx) }

    case 'PRODUCT_DETECTED':
      // Don't interrupt listening/thinking; just remember the product.
      if (BUSY.includes(ctx.state)) return { ...ctx, productId: ev.productId }
      return { ...ctx, state: 'product_detected', productId: ev.productId, response: null, error: null }

    case 'READING_SCREEN':
      if (ctx.state === 'processing') return ctx
      return { ...ctx, state: 'processing', stage: 'reading', requestId: ev.requestId, question: null, viaVoice: false, response: null, error: null }

    case 'SCREEN_READ':
      if (ctx.state !== 'processing' || ctx.requestId !== ev.requestId) return ctx // cancelled
      return { ...ctx, state: 'processing', stage: 'thinking', requestId: ev.nextRequestId, productId: ev.productId, question: ev.question, response: null }

    case 'OPEN_ANALYSIS': {
      const productId = ev.productId ?? ctx.productId
      if (!productId || BUSY.includes(ctx.state)) return ctx
      return { ...ctx, state: 'product_analysis', productId, error: null }
    }

    case 'OPEN_COMPARISON': {
      const productId = ev.productId ?? ctx.productId
      if (!productId || BUSY.includes(ctx.state)) return ctx
      return { ...ctx, state: 'comparison', productId, error: null }
    }

    case 'OPEN_QUICK_ACTIONS': {
      const productId = ev.productId ?? ctx.productId
      if (!productId || BUSY.includes(ctx.state)) return ctx
      return { ...ctx, state: 'quick_actions', productId, returnTo: ctx.state }
    }

    case 'OPEN_PROFILE':
      if (BUSY.includes(ctx.state)) return ctx
      return { ...ctx, state: 'profile_peek', returnTo: ctx.state === 'profile_peek' ? ctx.returnTo : ctx.state }

    case 'DISMISS_PRODUCT':
      if (BUSY.includes(ctx.state)) return ctx
      return { ...initialContext, conversationId: ctx.conversationId }

    case 'BACK':
      if (BUSY.includes(ctx.state)) return ctx
      if (ctx.state === 'quick_actions' || ctx.state === 'profile_peek' || ctx.state === 'error' || ctx.state === 'permission_required')
        return { ...ctx, state: ctx.returnTo === ctx.state ? home(ctx) : ctx.returnTo, error: null }
      if (ctx.state === 'product_analysis' || ctx.state === 'comparison') return { ...ctx, state: ctx.response ? 'responding' : 'product_detected' }
      if (ctx.state === 'responding') return { ...ctx, state: ctx.productId ? 'product_detected' : 'idle', response: null }
      return { ...ctx, state: 'idle' }

    case 'RESET':
      return { ...initialContext, conversationId: ctx.conversationId }
  }
}
