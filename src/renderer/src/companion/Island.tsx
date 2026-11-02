import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, CircleAlert, EyeOff, Keyboard, Loader2, MessageCircle, Mic, ScanFace, ScanSearch, ShieldAlert, Square, X } from 'lucide-react'
import type { AssistantReply } from '@shared/assistant'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Orb, type OrbMood } from '@renderer/components/Orb'
import { ReactionChips } from '@renderer/components/reactions'
import { cn } from '@renderer/lib/cn'
import { useSnapshot } from '@renderer/lib/store'
import type { CompanionContext } from './machine'
import { VERDICTS } from './views'

/**
 * The companion as a Dynamic-Island-style pill at the top centre of the screen. On a notched
 * MacBook it is pure black and hangs from the top edge so it merges with the camera notch;
 * elsewhere it floats just below the top edge. The window around it is transparent and
 * click-through, so only the pill itself takes clicks.
 */

export interface IslandInfo {
  notch: boolean
  barHeight: number
  notchWidth: number
}
export const NO_NOTCH: IslandInfo = { notch: false, barHeight: 0, notchWidth: 0 }

type Shape = 'idle' | 'hover' | 'listening' | 'processing' | 'result' | 'react'

/** A fresh answer shown in the pill: the verdict and one line, with the full answer a tap away. */
export interface IslandResult {
  verdict: AssistantReply['verdict']
  summary: string
  aboutProduct: boolean
  /** the product the verdict is about, so a skin reaction can be logged against it */
  productId: string | null
}

/** A skin scan in the pill: YouCam's progress, then the one-line result. */
export type IslandSkin = { kind: 'progress'; title: string; progress: number } | { kind: 'result'; line: string; mock: boolean }

/** Height of the row level with the notch (or the pill's own height without one). */
export const topRow = (info: IslandInfo) => (info.notch ? info.barHeight : 34)
/** Gap above a floating pill on Macs without a notch. */
export const topGap = (info: IslandInfo) => (info.notch ? 0 : 6)

export function islandSize(info: IslandInfo, shape: Shape) {
  const top = topRow(info)
  if (shape === 'idle') return { width: info.notch ? info.notchWidth + 104 : 200, height: top }
  if (shape === 'hover') return { width: 420, height: top + 54 }
  if (shape === 'listening') return { width: 380, height: top + 58 }
  if (shape === 'result') return { width: 420, height: top + 78 }
  if (shape === 'react') return { width: 420, height: top + 118 }
  return { width: 400, height: top + 64 }
}

/** clip-path that cuts the full panel down to the idle pill, for the drop-down animation. */
export function pillClip(info: IslandInfo, w: number, h: number) {
  const { width, height } = islandSize(info, 'idle')
  const side = Math.max(0, (w - width) / 2)
  const gap = topGap(info)
  return `inset(${gap}px ${side}px ${Math.max(0, h - gap - height)}px ${side}px round ${info.notch ? '0px 0px 22px 22px' : '22px 22px 22px 22px'})`
}
export const panelClip = (info: IslandInfo) => `inset(${topGap(info)}px 0px 0px 0px round ${info.notch ? '0px 0px 30px 30px' : '30px 30px 30px 30px'})`

const STAGE_PROGRESS = { transcribing: 0.3, reading: 0.25, researching: 0.55, thinking: 0.85 } as const
const SPRING = { type: 'spring', stiffness: 420, damping: 36 } as const
const RESULT_TIMEOUT_MS = 30_000
const TONE_TEXT = { good: 'text-mint-300', mixed: 'text-amber-200', bad: 'text-rose-300', unknown: 'text-white/70' } as const

export function IslandBar({
  info,
  ctx,
  mood,
  level,
  stageTitle,
  onOpen,
  onTalk,
  onType,
  onCircle,
  onSkin,
  skin,
  onSkinCancel,
  onSkinDetails,
  onSkinDismiss,
  privacy,
  onSend,
  onCancel,
  onMenu,
  result,
  onDetails,
  onDismiss
}: {
  info: IslandInfo
  ctx: CompanionContext
  mood: OrbMood
  level: number
  stageTitle: string
  onOpen: () => void
  onTalk: () => void
  onType: () => void
  onCircle: () => void
  onSkin: () => void
  skin: IslandSkin | null
  onSkinCancel: () => void
  onSkinDetails: () => void
  onSkinDismiss: () => void
  /** Privacy mode: the pill never shows verdicts or skin details, e.g. while presenting */
  privacy: boolean
  onSend: () => void
  onCancel: () => void
  onMenu: () => void
  result: IslandResult | null
  onDetails: () => void
  onDismiss: () => void
}) {
  const [hover, setHover] = useState(false)
  const [reacting, setReacting] = useState(false)
  // a new answer (the result object itself is rebuilt on every render) closes the reaction row
  useEffect(() => setReacting(false), [result?.summary, result?.productId])
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(leaveTimer.current), [])
  // A result tucks itself away after a while, unless the pointer is resting on it.
  const skinResult = skin?.kind === 'result' && !privacy ? skin : null
  const shownResult = privacy ? null : result
  useEffect(() => {
    if (!(result || skinResult) || hover || reacting) return
    const t = setTimeout(skinResult && !result ? onSkinDismiss : onDismiss, RESULT_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [result, skinResult, hover, reacting, onDismiss, onSkinDismiss])
  const skinBusy = skin?.kind === 'progress' ? skin : null
  const shape: Shape =
    ctx.state === 'listening' ? 'listening'
    : ctx.state === 'processing' || skinBusy ? 'processing'
    : shownResult ? (reacting && shownResult.productId ? 'react' : 'result')
    : skinResult ? 'result'
    : hover ? 'hover'
    : 'idle'
  // A scan in progress shows in the pill unless the assistant is busy with something else.
  const showSkinProgress = !!skinBusy && ctx.state !== 'processing'
  const { width, height } = islandSize(info, shape)
  const top = topRow(info)

  return (
    <motion.div
      data-solid
      role="group"
      aria-label="SkinTwin"
      className="absolute left-1/2 -translate-x-1/2 overflow-hidden bg-black text-white shadow-[0_8px_24px_rgb(0_0_0/0.35)]"
      style={{ top: topGap(info), borderRadius: info.notch ? '0 0 22px 22px' : 22 }}
      initial={false}
      animate={{ width, height }}
      transition={SPRING}
      onMouseEnter={() => {
        clearTimeout(leaveTimer.current)
        setHover(true)
      }}
      onMouseLeave={() => {
        leaveTimer.current = setTimeout(() => setHover(false), 280)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu()
      }}
    >
      {/* Level with the notch: only the two "ears" carry content; the middle stays empty. */}
      <button aria-label="Open SkinTwin" onClick={shownResult ? onDetails : skinResult ? onSkinDetails : onOpen} className="absolute inset-x-0 top-0 flex items-center justify-between px-3.5 outline-none" style={{ height: top }}>
        <Orb size={18} mood={mood} level={level} />
        <Ear ctx={ctx} result={shownResult} privacy={privacy} />
      </button>

      <AnimatePresence initial={false} mode="popLayout">
        {shape !== 'idle' && (
          <motion.div key={shape} className="absolute inset-x-0 flex items-center gap-2.5 px-4" style={{ top, height: height - top }} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.08, duration: 0.2 } }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
            {shape === 'hover' && (
              <>
                <Action onClick={onTalk} label="Talk">
                  <Mic />
                </Action>
                <Action onClick={onType} label="Ask">
                  <Keyboard />
                </Action>
                <Action onClick={onCircle} label="Circle" accent>
                  <ScanSearch />
                </Action>
                <Action onClick={onSkin} label="Skin">
                  <ScanFace />
                </Action>
              </>
            )}
            {shape === 'listening' && (
              <>
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inset-0 animate-ping rounded-full bg-rose-400/70" />
                  <span className="relative h-2.5 w-2.5 rounded-full bg-rose-400" />
                </span>
                <p className="flex-1 text-[14px] font-medium">Listening…</p>
                <Bars level={level} />
                <Round label="Cancel" onClick={onCancel}>
                  <X />
                </Round>
                <Round label="Stop and send" onClick={onSend} primary>
                  <Square className="fill-current" />
                </Round>
              </>
            )}
            {shape === 'result' && !shownResult && skinResult && <SkinResultRow skin={skinResult} onDetails={onSkinDetails} onDismiss={onSkinDismiss} />}
            {shape === 'result' && shownResult && <ResultRow result={shownResult} onDetails={onDetails} onDismiss={onDismiss} onReact={shownResult.productId ? () => setReacting(true) : undefined} />}
            {shape === 'react' && shownResult?.productId && <ReactRow productId={shownResult.productId} onBack={() => setReacting(false)} />}
            {shape === 'processing' && (
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <p className="min-w-0 flex-1 truncate text-[14px] font-medium">{privacy ? 'Working…' : showSkinProgress ? skinBusy!.title : stageTitle}</p>
                  <Round label="Cancel" onClick={showSkinProgress ? onSkinCancel : onCancel}>
                    <X />
                  </Round>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-white/12">
                  <motion.div className="h-full rounded-full bg-lilac-300" initial={false} animate={{ width: `${(showSkinProgress ? skinBusy!.progress : (STAGE_PROGRESS[ctx.stage ?? 'thinking'] ?? 0.5)) * 100}%` }} transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }} />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function ResultRow({ result, onDetails, onDismiss, onReact }: { result: IslandResult; onDetails: () => void; onDismiss: () => void; onReact?: () => void }) {
  const v = VERDICTS[result.verdict]
  const Icon = !result.aboutProduct ? MessageCircle : v.tone === 'good' ? CheckCircle2 : v.tone === 'unknown' ? CircleAlert : AlertTriangle
  return (
    <>
      <Icon className={cn('h-5 w-5 shrink-0', result.aboutProduct ? TONE_TEXT[v.tone] : 'text-lilac-200')} />
      <div className="min-w-0 flex-1">
        {result.aboutProduct && <p className={cn('text-[14px] font-semibold', TONE_TEXT[v.tone])}>{v.title.replace(' — read the notes', '')}</p>}
        <p className={cn('line-clamp-2 leading-snug', result.aboutProduct ? 'text-[12.5px] text-white/80' : 'text-[13.5px] text-white')}>{result.summary}</p>
      </div>
      <button onClick={onDetails} className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-white/12 px-3 text-[12.5px] font-medium transition-colors hover:bg-white/20">
        Details <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {onReact && (
        <Round label="My skin reacted to this" onClick={onReact}>
          <ShieldAlert />
        </Round>
      )}
      <Round label="Dismiss" onClick={onDismiss}>
        <X />
      </Round>
    </>
  )
}

function SkinResultRow({ skin, onDetails, onDismiss }: { skin: Extract<IslandSkin, { kind: 'result' }>; onDetails: () => void; onDismiss: () => void }) {
  return (
    <>
      <ScanFace className={cn('h-5 w-5 shrink-0', skin.mock ? 'text-amber-200' : 'text-lilac-200')} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">{skin.mock ? 'Mock skin scan' : 'Skin scan'}</p>
        <p className="line-clamp-2 text-[12.5px] leading-snug text-white/80">{skin.line}</p>
      </div>
      <button onClick={onDetails} className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-white/12 px-3 text-[12.5px] font-medium transition-colors hover:bg-white/20">
        Details <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <Round label="Dismiss" onClick={onDismiss}>
        <X />
      </Round>
    </>
  )
}

/** One tap logs what the skin did; the pill folds back to the verdict a moment later. */
function ReactRow({ productId, onBack }: { productId: string; onBack: () => void }) {
  const loaded = !!useSnapshot()
  const back = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(back.current), [])
  if (!loaded) return null
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 self-start pt-1" data-testid="island-react">
      <div className="flex items-center gap-2">
        <Round label="Back" onClick={onBack}>
          <ArrowLeft />
        </Round>
        <p className="text-[13px] font-medium">What did your skin do?</p>
      </div>
      <ReactionChips
        productId={productId}
        dense
        history={false}
        onLogged={() => {
          clearTimeout(back.current)
          back.current = setTimeout(onBack, 1400)
        }}
      />
    </div>
  )
}

/** Right-hand ear: what the companion is doing, at a glance. */
function Ear({ ctx, result, privacy }: { ctx: CompanionContext; result: IslandResult | null; privacy: boolean }) {
  if (privacy && ctx.state !== 'listening' && ctx.state !== 'processing') return <EyeOff className="h-3.5 w-3.5 text-white/45" aria-label="Privacy mode on" data-testid="privacy-on" />
  if (result && result.aboutProduct) {
    const tone = VERDICTS[result.verdict].tone
    return <span className={cn('h-2 w-2 rounded-full', tone === 'good' ? 'bg-mint-300' : tone === 'bad' ? 'bg-rose-300' : tone === 'mixed' ? 'bg-amber-200' : 'bg-white/60')} />
  }
  if (ctx.state === 'listening') return <span className="h-2 w-2 rounded-full bg-rose-400" />
  if (ctx.state === 'processing') return <Loader2 className="h-4 w-4 animate-spin text-lilac-200" />
  if (ctx.productId) return <span className="h-2 w-2 rounded-full bg-lilac-300 shadow-[0_0_8px_#a98bff]" title="A product is ready to check" />
  return <span className="h-2 w-2" />
}

function Action({ onClick, label, accent, children }: { onClick: () => void; label: string; accent?: boolean; children: ReactNode }) {
  return (
    <button onClick={onClick} className={cn('flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium transition-colors [&_svg]:h-4 [&_svg]:w-4', accent ? 'bg-lilac-500/35 hover:bg-lilac-500/50' : 'bg-white/10 hover:bg-white/18')}>
      {children}
      {label}
    </button>
  )
}

function Round({ onClick, label, primary, children }: { onClick: () => void; label: string; primary?: boolean; children: ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5', primary ? 'bg-lilac-500 hover:bg-lilac-400' : 'bg-white/12 hover:bg-white/20')}>
      {children}
    </button>
  )
}

function Bars({ level }: { level: number }) {
  return (
    <div className="flex h-5 items-center gap-[3px]" aria-hidden>
      {[3, 7, 11, 7, 3].map((h, i) => (
        <span key={i} className="w-[3px] rounded-full bg-lilac-50 transition-[height] duration-75" style={{ height: `${Math.max(3, h * (0.3 + level * 1.6))}px` }} />
      ))}
    </div>
  )
}
