import { ArrowLeft, Keyboard, LayoutGrid, Loader2, Mic, Minus, Pin, PinOff, Send, Settings, Sparkles, Square, X } from 'lucide-react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { Orb, type OrbMood } from '@renderer/components/Orb'
import { Spinner, Toaster } from '@renderer/components/ui'
import { prettyAccelerator } from '@shared/shortcuts'
import { cn } from '@renderer/lib/cn'
import { blobToBase64 } from '@renderer/lib/media'
import { newRequestId, useProviders, useSnapshot } from '@renderer/lib/store'
import { companionReducer, initialContext, isExpanded, type CompanionContext, type CompanionState } from './machine'
import { MicError, toWav16k, useRecorder, useSpeaker } from './voice'
import { ComparisonView, ErrorView, HomeView, ProcessingSteps, ProductAnalysisView, ProductDetectedView, ProfilePeekView, QuickActionsView, ResponseView } from './views'

export const DEFAULT_PRODUCT_QUESTION = 'Is this product good for my skin?'

type WindowMode = 'orb' | 'compact' | 'expanded'
const RANK: Record<WindowMode, number> = { orb: 0, compact: 1, expanded: 2 }

/** Quartic ease-out — the one curve used for every companion transition. */
export const EASE = [0.25, 1, 0.5, 1] as const
/** Gentle ease-out for the panel bloom — less front-loaded than EASE so the growth is readable. */
const BLOOM_EASE = [0.33, 0.8, 0.3, 1] as const
const MIN_THINKING_MS = 650 // keeps the thinking state from flashing on instant answers

const SUBTITLE: Partial<Record<CompanionState, string>> = {
  responding: 'Here’s what I found for you',
  product_analysis: 'Product analysis',
  comparison: 'Compare alternatives',
  quick_actions: 'Quick actions',
  profile_peek: 'Your skin profile'
}
const SUBVIEWS: CompanionState[] = ['product_analysis', 'comparison', 'quick_actions', 'profile_peek', 'error', 'permission_required']

export function Companion() {
  const snap = useSnapshot()
  const providers = useProviders()
  const [ctx, dispatch] = useReducer(companionReducer, initialContext)
  const ctxRef = useRef<CompanionContext>(ctx)
  ctxRef.current = ctx
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const [voiceNotice, setVoiceNotice] = useState(false)

  const voice = snap?.settings.voice
  const sttReady = !!providers?.stt.configured && !voice?.textOnly
  const speaker = useSpeaker({ enabled: !!voice?.responseEnabled && !voice?.textOnly, voiceName: voice?.voiceName ?? null, rate: voice?.rate ?? 1, useCloud: providers?.tts.provider === 'elevenlabs' })

  // ----- ask the assistant -----
  const ask = useCallback(async (requestId: string, question: string, productId?: string) => {
    const started = Date.now()
    const c = ctxRef.current
    const res = await window.skintwin.assistant.ask({ requestId, text: question, productId: productId ?? c.productId, conversationId: c.conversationId })
    const wait = MIN_THINKING_MS - (Date.now() - started)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    if (res.ok) dispatch({ type: 'ANSWERED', requestId, response: res.data })
    else if (res.code !== 'cancelled') dispatch({ type: 'FAILED', requestId, error: { kind: res.code === 'network' ? 'network' : 'provider', message: res.error } })
  }, [])

  const submitText = useCallback(
    (q: string) => {
      if (ctxRef.current.state === 'processing' || !q.trim()) return
      const requestId = newRequestId()
      dispatch({ type: 'SUBMIT_TEXT', requestId, text: q })
      setText('')
      setTyping(false)
      void ask(requestId, q.trim())
    },
    [ask]
  )

  // ----- voice capture -----
  const finishListening = useCallback(async () => {
    if (ctxRef.current.state !== 'listening') return
    const requestId = newRequestId()
    dispatch({ type: 'STOP_LISTENING', requestId })
    const blob = await recorder.stop()
    if (!blob || blob.size < 2000) return dispatch({ type: 'FAILED', requestId, error: { kind: 'unknown', message: 'I didn’t catch that — the recording was too short. Try again, or type your question.' } })
    const wav = await toWav16k(blob).catch(() => null)
    if (!wav) {
      dispatch({ type: 'FAILED', requestId, error: { kind: 'provider', message: 'I couldn’t read that recording. Try again.' } })
      return
    }
    const stt = await window.skintwin.speech.transcribe({ requestId, audioBase64: await blobToBase64(wav), mimeType: wav.type })
    if (!stt.ok) {
      if (stt.code !== 'cancelled') dispatch({ type: 'FAILED', requestId, error: { kind: stt.code === 'not_configured' ? 'stt_not_configured' : 'provider', message: stt.error } })
      return
    }
    dispatch({ type: 'TRANSCRIBED', requestId, text: stt.data.text })
    void ask(requestId, stt.data.text)
  }, [ask]) // eslint-disable-line react-hooks/exhaustive-deps

  const recorder = useRecorder(() => void finishListening())

  const listen = useCallback(async () => {
    const c = ctxRef.current
    if (c.state === 'processing' || c.state === 'listening') return
    speaker.stop()
    // A shortcut can arrive before provider status has loaded (e.g. the first press
    // that opens the companion), so ask main directly rather than assume "off".
    const status = providers ?? (await window.skintwin.providers.status())
    if (!status.stt.configured || voice?.textOnly) {
      // No speech-to-text yet: open the keyboard and say why, instead of failing.
      setVoiceNotice(!voice?.textOnly)
      setTyping(true)
      return
    }
    try {
      await recorder.start()
      dispatch({ type: 'LISTEN' })
    } catch (err) {
      const e = err as MicError
      dispatch({ type: 'PERMISSION_REQUIRED', error: { kind: e.kind === 'denied' ? 'microphone_denied' : 'microphone_unavailable', message: e.message } })
    }
  }, [recorder, speaker, providers, voice?.textOnly])

  const cancel = useCallback(() => {
    const c = ctxRef.current
    if (c.state === 'listening') recorder.cancel()
    if (c.requestId) void window.skintwin.cancel(c.requestId)
    dispatch({ type: 'CANCEL' })
  }, [recorder])

  // speak new answers
  const spokenFor = useRef<string | null>(null)
  useEffect(() => {
    if (ctx.state === 'responding' && ctx.response && spokenFor.current !== ctx.response.requestId) {
      spokenFor.current = ctx.response.requestId
      void speaker.speak(ctx.response.reply.answer)
    }
  }, [ctx.state, ctx.response, speaker])

  // Once the panel is open it stays open while listening/thinking, so the window doesn't jump.
  const [panel, setPanel] = useState(false)
  useEffect(() => {
    if (isExpanded(ctx.state) || typing) setPanel(true)
    else if (ctx.state === 'idle') setPanel(false)
  }, [ctx.state, typing])
  const expanded = isExpanded(ctx.state) || typing || (panel && (ctx.state === 'listening' || ctx.state === 'processing'))

  // Window size follows state. The window is transparent, so it resizes instantly and the
  // content does the animating: growing → enlarge the window first, then bloom the panel out
  // of the orb; shrinking → collapse the panel into the orb first, then shrink the window.
  const target: WindowMode = expanded ? 'expanded' : ctx.state === 'idle' ? 'orb' : 'compact'
  const [shown, setShown] = useState<WindowMode>('orb')
  const targetRef = useRef(target)
  targetRef.current = target
  useEffect(() => {
    let cancelled = false
    if (RANK[target] > RANK[shown]) void window.skintwin.companion.setMode(target).then(() => !cancelled && setShown(target))
    else if (target !== shown) {
      setShown(target)
      if (shown !== 'expanded') void window.skintwin.companion.setMode(target) // nothing to animate out
    }
    return () => {
      cancelled = true
    }
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps
  const showPanel = shown === 'expanded'
  useClickThrough(!expanded)

  // commands from main (shortcut, browser extension, main window)
  useEffect(
    () =>
      window.skintwin.companion.onCommand((cmd) => {
        // the voice shortcut toggles: first press starts listening, second press sends
        if (cmd.type === 'listen') void (ctxRef.current.state === 'listening' ? finishListening() : listen())
        else if (cmd.type === 'menu') {
          if (cmd.action === 'type' || cmd.action === 'panel') setTyping(true)
          else if (cmd.action === 'quick-actions') dispatch({ type: 'OPEN_QUICK_ACTIONS' })
          else dispatch({ type: 'OPEN_PROFILE' })
        }
        else if (cmd.type === 'product-detected') dispatch({ type: 'PRODUCT_DETECTED', productId: cmd.productId })
        else if (cmd.type === 'compare-product') {
          dispatch({ type: 'PRODUCT_DETECTED', productId: cmd.productId })
          dispatch({ type: 'OPEN_COMPARISON', productId: cmd.productId })
        } else if (cmd.type === 'analyze-product') {
          dispatch({ type: 'PRODUCT_DETECTED', productId: cmd.productId })
          if (ctxRef.current.state !== 'processing' && ctxRef.current.state !== 'listening') {
            const requestId = newRequestId()
            dispatch({ type: 'SUBMIT_TEXT', requestId, text: DEFAULT_PRODUCT_QUESTION })
            void ask(requestId, DEFAULT_PRODUCT_QUESTION)
          }
        } else if (cmd.type === 'circle-reading') dispatch({ type: 'READING_SCREEN', requestId: cmd.requestId })
        else if (cmd.type === 'circle-result') {
          if (ctxRef.current.requestId !== cmd.requestId) return // cancelled while reading
          const nextRequestId = newRequestId()
          dispatch({ type: 'SCREEN_READ', requestId: cmd.requestId, productId: cmd.productId, nextRequestId, question: DEFAULT_PRODUCT_QUESTION })
          void ask(nextRequestId, DEFAULT_PRODUCT_QUESTION, cmd.productId)
        } else if (cmd.type === 'circle-failed') {
          const error = { kind: cmd.kind, message: cmd.message }
          if (cmd.kind === 'screen_denied') dispatch({ type: 'PERMISSION_REQUIRED', error })
          else dispatch({ type: 'FAILED', requestId: cmd.requestId, error })
        } else if (cmd.type === 'detection-failed') dispatch({ type: 'FAILED', requestId: null, error: { kind: 'page_unreadable', message: cmd.reason } })
      }),
    [listen, ask, finishListening]
  )

  // keyboard: Esc cancels/back, ⌘↵ sends recording
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (ctxRef.current.state === 'listening' || ctxRef.current.state === 'processing') cancel()
        else if (typing) setTyping(false)
        else dispatch({ type: 'BACK' })
      } else if (e.key === 'Enter' && e.metaKey && ctxRef.current.state === 'listening') void finishListening()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel, finishListening, typing])

  if (!snap) return <div className="grid h-full place-items-center"><Spinner /></div>

  const mood: OrbMood = ctx.state === 'listening' ? 'listening' : ctx.state === 'processing' ? 'thinking' : speaker.speaking ? 'speaking' : ctx.state === 'error' || ctx.state === 'permission_required' ? 'concerned' : 'idle'
  const { alwaysOnTop: pinned, corner, shortcut, voiceShortcut } = snap.settings.companion
  const bottom = corner.startsWith('bottom')
  const right = corner.endsWith('right')
  // orb centre inside the panel: 12px window padding + 20px handle padding + 48px radius, minus the panel's own 12px inset
  // Grow exactly to the farthest panel corner, so the whole duration is visible (an oversized circle
  // finishes covering the panel in the first few frames and reads as a snap).
  const bloomRadius = () => Math.ceil(Math.hypot(window.innerWidth - 24 - 68, window.innerHeight - 24 - 68)) + 4
  const bloom = (r: number) => `circle(${r}px at ${right ? 'calc(100% - 68px)' : '68px'} ${bottom ? 'calc(100% - 68px)' : '68px'})`
  const pushToTalk = voice?.activation === 'push_to_talk' && sttReady
  const mic = (size: 'md' | 'lg') => (
    <MicButton size={size} state={ctx.state} pushToTalk={pushToTalk} onStart={() => void listen()} onStop={() => void finishListening()} />
  )

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.24, ease: EASE }}>
      <div className="relative h-full w-full select-none">
        <AnimatePresence initial={false} onExitComplete={() => targetRef.current !== 'expanded' && void window.skintwin.companion.setMode(targetRef.current)}>
          {!showPanel ? (
            <motion.div key="compact" className={cn('absolute inset-3 flex gap-2', bottom ? 'flex-col-reverse' : 'flex-col', right ? 'items-end' : 'items-start')} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1, transition: { duration: 0.32, ease: EASE, delay: 0.12 } }} exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }} style={{ transformOrigin: `${bottom ? 'bottom' : 'top'} ${right ? 'right' : 'left'}` }}>
              <OrbHandle
                label={ctx.state === 'listening' ? 'Stop and send' : 'Talk to SkinTwin'}
                hint={`Click to talk · ${prettyAccelerator(shortcut)} to show or hide · right-click for more`}
                onClick={() => (ctx.state === 'listening' ? void finishListening() : ctx.state === 'idle' ? void listen() : undefined)}
                onMenu={() => void window.skintwin.companion.menu({ hasProduct: !!ctx.productId })}
              >
                <Orb size={96} mood={mood} level={recorder.level} />
              </OrbHandle>
              <AnimatePresence mode="wait">
                {ctx.state === 'listening' && (
                  <motion.div key="listen" data-solid className="w-full max-w-[300px]" initial={{ opacity: 0, y: bottom ? 10 : -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <div className="glass-strong rounded-[24px] px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="absolute inset-0 animate-ping rounded-full bg-rose-400/70" />
                          <span className="relative h-2.5 w-2.5 rounded-full bg-rose-400" />
                        </span>
                        <p className="flex-1 text-[15px] font-semibold">Listening…</p>
                        <LiveBars level={recorder.level} />
                      </div>
                      <p className="mt-1.5 text-[13px] text-ink/85">Speak naturally. I’ll transcribe when you stop.</p>
                    </div>
                    <div className={cn('mt-2 flex gap-2', right ? 'justify-end' : 'justify-start')}>
                      <Hint k="Esc" t="cancel" onClick={cancel} />
                      <Hint k={voiceShortcut ? prettyAccelerator(voiceShortcut) : '⌘↵'} t="send" onClick={() => void finishListening()} />
                    </div>
                  </motion.div>
                )}
                {ctx.state === 'processing' && (
                  <motion.div key="think" data-solid className="w-full max-w-[300px]" initial={{ opacity: 0, y: bottom ? 10 : -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <p className={cn('mb-2 px-1 text-[15px] font-semibold [text-shadow:0_1px_8px_rgb(40_20_100/0.6)]', right ? 'text-right' : 'text-left')}>{ctx.stage === 'transcribing' ? 'Catching that…' : ctx.stage === 'reading' ? 'Looking at what you circled…' : 'Analyzing for you…'}</p>
                    <ProcessingSteps ctx={ctx} hasProduct={!!ctx.productId} />
                    <div className={cn('mt-2 flex', right ? 'justify-end' : 'justify-start')}>
                      <Hint k="Esc" t="cancel" onClick={cancel} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div
              key="expanded"
              data-solid
              className="glass-strong absolute inset-3 flex flex-col overflow-hidden rounded-[30px]"
              // Bloom out of the orb: a circle the size of the orb, centred on it, grows to fill the panel.
              initial={{ clipPath: bloom(44) }}
              animate={{ clipPath: bloom(bloomRadius()), transition: { duration: 0.52, ease: BLOOM_EASE } }}
              exit={{ clipPath: bloom(44), transition: { duration: 0.32, ease: [0.55, 0, 0.8, 0.2] } }}
            >
              <motion.div className="flex min-h-0 flex-1 flex-col" initial={{ opacity: 0, y: bottom ? 10 : -10 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.3, delay: 0.16, ease: EASE } }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
              <PanelHeader
                ctx={ctx}
                typing={typing}
                pinned={pinned}
                onBack={SUBVIEWS.includes(ctx.state) ? () => dispatch({ type: 'BACK' }) : undefined}
                onCollapse={() => {
                  if (ctx.state === 'listening' || ctx.state === 'processing') cancel()
                  setTyping(false)
                  setVoiceNotice(false)
                  setPanel(false)
                  dispatch({ type: 'RESET' })
                }}
              />
              <div className="no-drag scroll-area min-h-0 flex-1 px-5 pt-1 pb-4">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={isExpanded(ctx.state) || ctx.state === 'listening' || ctx.state === 'processing' ? ctx.state : 'home'} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2, ease: EASE }}>
                    {ctx.state === 'responding' && ctx.response && <ResponseView ctx={ctx} speaker={speaker} onReplay={() => speaker.speak(ctx.response!.reply.answer)} send={dispatch} />}
                    {ctx.state === 'product_detected' && <ProductDetectedView ctx={ctx} send={dispatch} onAsk={() => submitText(DEFAULT_PRODUCT_QUESTION)} />}
                    {ctx.state === 'product_analysis' && <ProductAnalysisView ctx={ctx} send={dispatch} onAsk={submitText} />}
                    {ctx.state === 'comparison' && <ComparisonView ctx={ctx} send={dispatch} onAsk={submitText} />}
                    {ctx.state === 'quick_actions' && <QuickActionsView ctx={ctx} send={dispatch} />}
                    {ctx.state === 'profile_peek' && <ProfilePeekView ctx={ctx} />}
                    {(ctx.state === 'error' || ctx.state === 'permission_required') && ctx.error && <ErrorView error={ctx.error} send={dispatch} onRetry={() => (ctx.question ? submitText(ctx.question) : void listen())} onType={() => setTyping(true)} />}
                    {ctx.state === 'listening' && (
                      <div className="flex flex-col items-center pt-10 text-center">
                        <Orb size={132} mood="listening" level={recorder.level} />
                        <p className="mt-6 text-[17px] font-semibold">I’m listening…</p>
                        <p className="mt-1 text-[13.5px] text-ink/80">Speak naturally — I’ll transcribe when you stop.</p>
                        <div className="mt-5"><LiveBars level={recorder.level} /></div>
                        <div className="mt-6 flex gap-3">
                          <Hint k="Esc" t="to cancel" onClick={cancel} />
                          <Hint k="⌘↵" t="to send" onClick={() => void finishListening()} />
                        </div>
                      </div>
                    )}
                    {ctx.state === 'processing' && (
                      <div className="flex flex-col items-center pt-8">
                        <Orb size={120} mood="thinking" />
                        <p className="mt-6 mb-4 text-[17px] font-semibold">{ctx.stage === 'transcribing' ? 'Catching that…' : ctx.stage === 'reading' ? 'Looking at what you circled…' : 'Analyzing for you…'}</p>
                        <ProcessingSteps ctx={ctx} hasProduct={!!ctx.productId} inPanel />
                        <div className="mt-4"><Hint k="Esc" t="to cancel" onClick={cancel} /></div>
                      </div>
                    )}
                    {!isExpanded(ctx.state) && ctx.state !== 'listening' && ctx.state !== 'processing' && <HomeView hasProduct={!!ctx.productId} onPick={submitText} />}
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="no-drag border-t border-white/10 px-4 pt-3 pb-4">
                {typing ? (
                  <>
                    {voiceNotice && (
                      <p className="mb-2 flex items-center gap-2 px-1 text-[12.5px] text-lilac-200">
                        <Mic className="h-3.5 w-3.5 shrink-0" />
                        Voice input is off — type for now.
                        <button className="ml-auto underline underline-offset-2 hover:text-ink" onClick={() => window.skintwin.app.open('/settings')}>
                          Set up
                        </button>
                      </p>
                    )}
                    <form className="flex items-center gap-2" onSubmit={(e) => (e.preventDefault(), submitText(text))}>
                      <input autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} aria-label="Your question" placeholder={ctx.productId ? 'Ask about this product…' : 'Ask SkinTwin…'} className="h-12 min-w-0 flex-1 rounded-pill border border-white/20 bg-white/10 px-5 text-[14px] text-ink placeholder:text-ink-soft focus:border-lilac-300/80 focus:bg-white/14 focus:outline-none focus-visible:shadow-none" />
                      <button type="submit" disabled={!text.trim()} aria-label="Send" className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-b from-[#b48cff] to-[#7a4ff0] text-white shadow-[0_0_20px_rgb(170_120_255/0.6)] transition-opacity disabled:opacity-40">
                        <Send className="h-[18px] w-[18px]" />
                      </button>
                      {sttReady && (
                        <DockButton label="Use voice" onClick={() => (setTyping(false), void listen())}>
                          <Mic className="h-[18px] w-[18px]" />
                        </DockButton>
                      )}
                    </form>
                  </>
                ) : (
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center">
                    <div>
                      <DockButton label="Type a question" onClick={() => setTyping(true)}>
                        <Keyboard className="h-[18px] w-[18px]" />
                      </DockButton>
                    </div>
                    {mic('lg')}
                    <div className="flex justify-end gap-2">
                      {ctx.productId && ctx.state !== 'quick_actions' && (
                        <DockButton label="Quick actions" onClick={() => dispatch({ type: 'OPEN_QUICK_ACTIONS' })}>
                          <LayoutGrid className="h-[18px] w-[18px]" />
                        </DockButton>
                      )}
                      <DockButton label="Settings" onClick={() => window.skintwin.app.open('/settings')}>
                        <Settings className="h-[18px] w-[18px]" />
                      </DockButton>
                    </div>
                  </div>
                )}
              </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <Toaster />
      </div>
    </MotionConfig>
  )
}

/** Lets clicks pass through transparent pixels; anything marked data-solid stays interactive. */
function useClickThrough(active: boolean) {
  useEffect(() => {
    if (!active) {
      void window.skintwin.companion.setClickThrough(false)
      return
    }
    let last: boolean | null = null
    const set = (through: boolean) => {
      if (through === last) return
      last = through
      void window.skintwin.companion.setClickThrough(through)
    }
    const onMove = (e: MouseEvent) => set(!(document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-solid]'))
    set(true)
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      void window.skintwin.companion.setClickThrough(false)
    }
  }, [active])
}

/**
 * The idle orb: click to talk, drag to move (snaps to the nearest corner on release),
 * right-click for the menu. A native drag region would swallow the click, so dragging is manual.
 */
function OrbHandle({ children, label, hint, onClick, onMenu }: { children: ReactNode; label: string; hint: string; onClick: () => void; onMenu: () => void }) {
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  return (
    <div
      data-solid
      role="button"
      tabIndex={0}
      aria-label={label}
      title={hint}
      className="shrink-0 rounded-full p-5 outline-none focus-visible:shadow-[var(--focus-ring)]"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { x: e.screenX, y: e.screenY, moved: false }
        void window.skintwin.companion.dragStart()
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const dx = e.screenX - d.x
        const dy = e.screenY - d.y
        if (!d.moved && Math.hypot(dx, dy) < 5) return
        d.moved = true
        void window.skintwin.companion.dragMove(dx, dy)
      }}
      onPointerUp={() => {
        const d = drag.current
        drag.current = null
        if (d?.moved) void window.skintwin.companion.dragEnd()
        else if (d) onClick()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      {children}
    </div>
  )
}

function LiveBars({ level }: { level: number }) {
  const shape = [3, 6, 10, 14, 18, 14, 10, 6, 3]
  return (
    <div className="flex h-6 items-center gap-[3px]" aria-hidden>
      {shape.map((h, i) => (
        <span key={i} className="w-[3px] rounded-full bg-lilac-50 transition-[height] duration-75" style={{ height: `${Math.max(3, h * (0.25 + level * 1.4))}px` }} />
      ))}
    </div>
  )
}

function MicButton({ size, state, pushToTalk, onStart, onStop }: { size: 'md' | 'lg'; state: CompanionState; pushToTalk: boolean; onStart: () => void; onStop: () => void }) {
  const listening = state === 'listening'
  const busy = state === 'processing'
  return (
    <motion.button
      aria-label={listening ? 'Stop and send' : 'Ask with your voice'}
      disabled={busy}
      whileHover={{ scale: busy ? 1 : 1.04 }}
      whileTap={{ scale: 0.94 }}
      className={cn(
        'no-drag relative grid shrink-0 place-items-center rounded-full border-2 border-white/75 bg-gradient-to-b from-[#b893ff] to-[#7448ee] text-white shadow-[0_0_28px_rgb(170_120_255/0.75),inset_0_1px_0_rgb(255_255_255/0.4)] disabled:opacity-60',
        size === 'lg' ? 'h-[68px] w-[68px]' : 'h-14 w-14'
      )}
      onClick={() => (pushToTalk ? undefined : listening ? onStop() : onStart())}
      onPointerDown={() => pushToTalk && !listening && onStart()}
      onPointerUp={() => pushToTalk && listening && onStop()}
    >
      {listening && <motion.span className="absolute inset-[-6px] rounded-full border-2 border-lilac-200/60" animate={{ scale: [1, 1.18], opacity: [0.8, 0] }} transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }} />}
      {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : listening ? <Square className="h-5 w-5 fill-current" /> : <Mic className={size === 'lg' ? 'h-7 w-7' : 'h-6 w-6'} />}
    </motion.button>
  )
}

function DockButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-white/8 text-ink transition-colors hover:bg-white/16 active:scale-95">
      {children}
    </button>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className="no-drag grid h-8 w-8 place-items-center rounded-full text-ink/80 transition-colors hover:bg-white/14 hover:text-ink">
      {children}
    </button>
  )
}

function PanelHeader({ ctx, typing, pinned, onBack, onCollapse }: { ctx: CompanionContext; typing: boolean; pinned: boolean; onBack?: () => void; onCollapse: () => void }) {
  const subtitle = SUBTITLE[ctx.state] ?? (typing && !isExpanded(ctx.state) ? 'Ask me anything about your skin' : null)
  return (
    <div className="drag flex items-center gap-2.5 px-4 pt-4 pb-3">
      {onBack ? (
        <IconButton label="Back" onClick={onBack}>
          <ArrowLeft className="h-[18px] w-[18px]" />
        </IconButton>
      ) : (
        <Sparkles className="ml-1 h-5 w-5 text-lilac-200" />
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[19px] leading-tight font-semibold tracking-tight">
          SkinTwin
          {ctx.state === 'product_detected' && <span className="rounded-pill border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11.5px] font-medium">Page detected</span>}
        </p>
        <AnimatePresence mode="wait" initial={false}>
          {subtitle && (
            <motion.p key={subtitle} className="truncate text-[13px] text-ink/80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {subtitle}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      <IconButton label={pinned ? 'Unpin (stop floating on top)' : 'Pin on top'} onClick={() => window.skintwin.companion.setPinned(!pinned)}>
        {pinned ? <Pin className="h-4 w-4 fill-current" /> : <PinOff className="h-4 w-4" />}
      </IconButton>
      <IconButton label="Shrink to orb" onClick={onCollapse}>
        <Minus className="h-4 w-4" />
      </IconButton>
      <IconButton label="Hide companion" onClick={() => window.skintwin.companion.hide()}>
        <X className="h-4 w-4" />
      </IconButton>
    </div>
  )
}

function Hint({ k, t, onClick }: { k: string; t: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="glass flex h-9 items-center gap-1.5 rounded-pill px-3 text-[12.5px] text-ink transition-colors hover:bg-white/16">
      <kbd className="rounded-md border border-white/35 px-1.5 text-[11px] font-medium">{k}</kbd> {t}
    </button>
  )
}
