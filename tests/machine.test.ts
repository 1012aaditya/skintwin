import { describe, expect, it } from 'vitest'
import type { AskResponse } from '@shared/assistant'
import { companionReducer as r, initialContext, isExpanded, type CompanionContext } from '../src/renderer/src/companion/machine'

const answer = (requestId: string): AskResponse => ({
  requestId,
  conversationId: 'conv:1',
  provider: 'rules',
  providerNote: null,
  reply: { summary: 'Yes.', answer: 'Yes', verdict: 'good_match', highlights: [], suggestedActions: [], referencedProductIds: [] }
})

describe('companion state machine', () => {
  it('runs the voice flow: listening → processing → responding', () => {
    let c: CompanionContext = r(initialContext, { type: 'LISTEN' })
    expect(c.state).toBe('listening')
    c = r(c, { type: 'STOP_LISTENING', requestId: 'a' })
    expect(c).toMatchObject({ state: 'processing', stage: 'transcribing' })
    c = r(c, { type: 'TRANSCRIBED', requestId: 'a', text: 'Is this serum good?' })
    expect(c).toMatchObject({ stage: 'thinking', question: 'Is this serum good?' })
    c = r(c, { type: 'ANSWERED', requestId: 'a', response: answer('a') })
    expect(c.state).toBe('responding')
    expect(c.conversationId).toBe('conv:1')
  })

  it('ignores stale responses after cancellation', () => {
    let c = r(initialContext, { type: 'SUBMIT_TEXT', requestId: 'a', text: 'hi' })
    c = r(c, { type: 'CANCEL' })
    expect(c.state).toBe('idle')
    c = r(c, { type: 'ANSWERED', requestId: 'a', response: answer('a') })
    expect(c.state).toBe('idle')
  })

  it('ignores responses for a different request', () => {
    let c = r(initialContext, { type: 'SUBMIT_TEXT', requestId: 'b', text: 'hi' })
    c = r(c, { type: 'ANSWERED', requestId: 'a', response: answer('a') })
    expect(c.state).toBe('processing')
    c = r(c, { type: 'FAILED', requestId: 'a', error: { kind: 'network', message: 'x' } })
    expect(c.state).toBe('processing')
  })

  it('prevents duplicate submissions and listening while processing', () => {
    let c = r(initialContext, { type: 'SUBMIT_TEXT', requestId: 'a', text: 'one' })
    c = r(c, { type: 'SUBMIT_TEXT', requestId: 'b', text: 'two' })
    expect(c).toMatchObject({ requestId: 'a', question: 'one' })
    expect(r(c, { type: 'LISTEN' }).state).toBe('processing')
  })

  it('remembers a detected product while busy without interrupting', () => {
    let c = r(initialContext, { type: 'LISTEN' })
    c = r(c, { type: 'PRODUCT_DETECTED', productId: 'p1' })
    expect(c).toMatchObject({ state: 'listening', productId: 'p1' })
    c = r(c, { type: 'CANCEL' })
    expect(c.state).toBe('product_detected')
  })

  it('navigates product views and back', () => {
    let c = r(initialContext, { type: 'PRODUCT_DETECTED', productId: 'p1' })
    c = r(c, { type: 'OPEN_ANALYSIS' })
    expect(c.state).toBe('product_analysis')
    c = r(c, { type: 'OPEN_QUICK_ACTIONS' })
    expect(c.state).toBe('quick_actions')
    c = r(c, { type: 'BACK' })
    expect(c.state).toBe('product_analysis')
    c = r(c, { type: 'BACK' })
    expect(c.state).toBe('product_detected')
    expect(r(c, { type: 'DISMISS_PRODUCT' })).toMatchObject({ state: 'idle', productId: null })
  })

  it('cannot open product views without a product', () => {
    expect(r(initialContext, { type: 'OPEN_ANALYSIS' }).state).toBe('idle')
    expect(r(initialContext, { type: 'OPEN_COMPARISON' }).state).toBe('idle')
  })

  it('permission errors return to where the user was', () => {
    let c = r(initialContext, { type: 'PRODUCT_DETECTED', productId: 'p1' })
    c = r(c, { type: 'PERMISSION_REQUIRED', error: { kind: 'microphone_denied', message: 'no' } })
    expect(c.state).toBe('permission_required')
    expect(r(c, { type: 'BACK' }).state).toBe('product_detected')
  })

  it('uses the compact window only for orb states', () => {
    expect(isExpanded('idle')).toBe(false)
    expect(isExpanded('listening')).toBe(false)
    expect(isExpanded('responding')).toBe(true)
  })
})
