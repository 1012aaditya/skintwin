import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, CircleAlert, EyeOff, Keyboard, Loader2, MessageCircle, Mic, Moon, ScanFace, ScanSearch, ShieldAlert, Sun, Check, Circle, AlarmClock, CalendarX, Hourglass, Square, X } from 'lucide-react'
import type { AssistantReply } from '@shared/assistant'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Orb, type OrbMood } from '@renderer/components/Orb'
import { ReactionChips } from '@renderer/components/reactions'
import { cn } from '@renderer/lib/cn'
import { mutate, useProductMap, useSnapshot } from '@renderer/lib/store'
import { activityTitle, localDay, routineTitle, type Activity, type InventoryActivity, type RoutineActivity, type SunActivity } from '@shared/activity'
import { sunText, UV_SOURCE } from '@shared/sun'
import { noticeText } from '@shared/inventory'
import { handleDrop } from './drop'
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

type Shape = 'idle' | 'hover' | 'listening' | 'processing' | 'result' | 'react' | 'activityHover' | 'activityOpen' | 'drop'

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

const ACTIVITY_ROW = 44
const STEP_ROW = 36

/** `rows` = steps listed when a live activity is open. */
export function islandSize(info: IslandInfo, shape: Shape, opts: { rows?: number; activity?: boolean } = {}) {
  const top = topRow(info)
  // without a notch the idle pill has room to say what's due; with one, only the ears do
  if (shape === 'idle') return { width: info.notch ? info.notchWidth + 104 : opts.activity ? 250 : 200, height: top }
  if (shape === 'drop') return { width: 420, height: top + 62 }
  if (shape === 'activityHover') return { width: 420, height: top + ACTIVITY_ROW + 52 }
  if (shape === 'activityOpen') return { width: 420, height: top + ACTIVITY_ROW + (opts.rows ?? 0) * STEP_ROW + 50 }
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
  activity,
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
  /** a live activity (e.g. the due routine) shown while nothing else is happening */
  activity: Activity | null
  onSend: () => void
  onCancel: () => void
  onMenu: () => void
  result: IslandResult | null
  onDetails: () => void
  onDismiss: () => void
}) {
  const [hover, setHover] = useState(false)
  const [reacting, setReacting] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  // drag and drop: a highlight while something is over the pill, then a short message if it can't be used
  const [dragging, setDragging] = useState(false)
  const [dropMsg, setDropMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!dropMsg) return
    const t = setTimeout(() => setDropMsg(null), 4500)
    return () => clearTimeout(t)
  }, [dropMsg])
  // a different activity (or none) starts closed
  useEffect(() => setActivityOpen(false), [activity?.key])
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
    dragging || dropMsg ? 'drop'
    : ctx.state === 'listening' ? 'listening'
    : ctx.state === 'processing' || skinBusy ? 'processing'
    : shownResult ? (reacting && shownResult.productId ? 'react' : 'result')
    : skinResult ? 'result'
    : activity?.kind === 'routine' && activityOpen ? 'activityOpen'
    : activity && hover ? 'activityHover'
    : hover ? 'hover'
    : 'idle'
  // A scan in progress shows in the pill unless the assistant is busy with something else.
  const showSkinProgress = !!skinBusy && ctx.state !== 'processing'
  const { width, height } = islandSize(info, shape, { rows: activity?.kind === 'routine' ? activity.steps.length : 0, activity: !!activity })
  const top = topRow(info)
  // tell main where the solid pill is, so a drag over it isn't let through to the app behind
  useEffect(() => {
    void window.skintwin.companion.setSolidRect({ x: (window.innerWidth - width) / 2, y: topGap(info), w: width, h: height })
  }, [width, height, info])

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
      onDragEnter={(e) => {
        e.preventDefault()
        setDropMsg(null)
        setDragging(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(e) => {
        // leaving for a child element isn't leaving the pill
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void handleDrop(e.dataTransfer).then(setDropMsg)
      }}
      data-testid="island"
    >
      {/* Level with the notch: only the two "ears" carry content; the middle stays empty. */}
      <button aria-label="Open SkinTwin" onClick={shownResult ? onDetails : skinResult ? onSkinDetails : onOpen} className="absolute inset-x-0 top-0 flex items-center justify-between px-3.5 outline-none" style={{ height: top }}>
        <Orb size={18} mood={mood} level={level} />
        {shape === 'idle' && activity && !info.notch && <span className="min-w-0 flex-1 truncate px-2 text-center text-[12.5px] font-medium text-white/85">{activityTitle(activity)}</span>}
        <Ear ctx={ctx} result={shownResult} privacy={privacy} activity={shape === 'idle' ? activity : null} />
      </button>

      <AnimatePresence initial={false} mode="popLayout">
        {shape !== 'idle' && (
          <motion.div key={shape} className="absolute inset-x-0 flex items-center gap-2.5 px-4" style={{ top, height: height - top }} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.08, duration: 0.2 } }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
            {shape === 'activityHover' && activity && (
              <div className="flex w-full flex-col gap-2 self-start pt-1">
                {activity.kind === 'routine' ? <RoutineRow activity={activity} onOpen={() => setActivityOpen(true)} /> : activity.kind === 'sun' ? <SunRow activity={activity} /> : <NoticeRow activity={activity} privacy={privacy} />}
                <div className="flex gap-2.5">
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
                </div>
              </div>
            )}
            {shape === 'drop' && (
              <div className={cn('flex min-h-10 w-full items-center gap-2.5 rounded-[20px] px-3 py-1.5 text-[13px]', dropMsg ? 'bg-rose-400/15 text-rose-100' : 'bg-lilac-500/30 text-white ring-2 ring-lilac-300/70 ring-inset')} data-testid="drop-zone">
                {dropMsg ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <ScanSearch className="h-4 w-4 shrink-0" />}
                <span className="line-clamp-2 min-w-0 flex-1 leading-snug" title={dropMsg ?? undefined}>{dropMsg ?? 'Drop a product photo or page link to check it'}</span>
              </div>
            )}
            {shape === 'activityOpen' && activity?.kind === 'routine' && <RoutineList activity={activity} onClose={() => setActivityOpen(false)} />}
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

/** The routine at a glance; tapping opens the steps. */
function RoutineRow({ activity, onOpen }: { activity: RoutineActivity; onOpen: () => void }) {
  const done = activity.steps.length - activity.remaining
  return (
    <button onClick={onOpen} className="flex h-9 w-full items-center gap-2.5 rounded-full bg-white/8 px-3 text-left transition-colors hover:bg-white/14" data-testid="activity-row">
      {activity.period === 'am' ? <Sun className="h-4 w-4 shrink-0 text-amber-200" /> : <Moon className="h-4 w-4 shrink-0 text-amber-200" />}
      <span className="flex-1 text-[13.5px] font-medium">{routineTitle(activity)}</span>
      <span className="flex gap-1" aria-hidden>
        {activity.steps.map((s, i) => (
          <span key={s.step.id} className={cn('h-1.5 w-1.5 rounded-full', i < done ? 'bg-mint-300' : 'bg-white/30')} />
        ))}
      </span>
      <ChevronDown className="h-3.5 w-3.5 text-white/60" />
    </button>
  )
}

/** A product that's expiring or running low: what, plus Open (in SkinTwin) and Got it (for today). */
function NoticeRow({ activity, privacy }: { activity: InventoryActivity; privacy: boolean }) {
  const loaded = !!useSnapshot()
  const products = useProductMap()
  if (!loaded) return null
  const n = activity.notice
  const name = privacy ? 'A product' : (products.get(n.productId)?.name ?? 'A product')
  return (
    <div className="flex min-h-9 w-full items-center gap-2.5 rounded-[18px] bg-white/8 py-1 pr-1 pl-3" data-testid="notice-row">
      {n.kind === 'low' ? <Hourglass className="h-4 w-4 shrink-0 text-amber-200" /> : <CalendarX className={cn('h-4 w-4 shrink-0', n.value < 0 ? 'text-rose-300' : 'text-amber-200')} />}
      <span className="line-clamp-2 min-w-0 flex-1 text-[12.5px] leading-tight" title={noticeText(n, name)}>{noticeText(n, name)}</span>
      <button onClick={() => void window.skintwin.app.open('/inventory')} className="h-7 shrink-0 rounded-full px-2.5 text-[12px] text-white/80 hover:bg-white/12">
        Open
      </button>
      <button onClick={() => void mutate({ type: 'notice.dismiss', key: activity.key, day: localDay(new Date()) })} className="h-7 shrink-0 rounded-full bg-white/12 px-2.5 text-[12px] hover:bg-white/20">
        Got it
      </button>
    </div>
  )
}

/** Today's UV from the real forecast, with its source. */
function SunRow({ activity }: { activity: SunActivity }) {
  const n = activity.notice
  return (
    <div className="flex min-h-9 w-full items-center gap-2.5 rounded-[18px] bg-white/8 py-1 pr-1 pl-3" data-testid="sun-row">
      <Sun className="h-4 w-4 shrink-0 text-orange-300" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[12.5px]">{sunText(n)}</span>
        <span className="block truncate text-[10.5px] text-white/50">
          {UV_SOURCE} forecast · {n.place}
        </span>
      </span>
      <button onClick={() => void mutate({ type: 'notice.dismiss', key: activity.key, day: localDay(new Date()) })} className="h-7 shrink-0 rounded-full bg-white/12 px-2.5 text-[12px] hover:bg-white/20">
        Got it
      </button>
    </div>
  )
}

/** Tick each due step — the same completions the Routine screen and the timeline use. */
function RoutineList({ activity, onClose }: { activity: RoutineActivity; onClose: () => void }) {
  const loaded = !!useSnapshot()
  const products = useProductMap()
  if (!loaded) return null
  const today = localDay(new Date())
  return (
    <div className="flex w-full flex-col gap-1 self-start pt-1.5" data-testid="activity-list">
      <div className="flex items-center gap-2 px-1 pb-1">
        {activity.period === 'am' ? <Sun className="h-4 w-4 text-amber-200" /> : <Moon className="h-4 w-4 text-amber-200" />}
        <p className="flex-1 text-[13.5px] font-semibold">{routineTitle(activity)}</p>
        <Round label="Close" onClick={onClose}>
          <ChevronDown className="rotate-180" />
        </Round>
      </div>
      {activity.steps.map(({ step, done, period }) => (
        <button
          key={step.id}
          onClick={() => void mutate({ type: 'routine.toggleComplete', period, stepId: step.id, date: today })}
          className="flex h-8 items-center gap-2.5 rounded-xl px-2 text-left transition-colors hover:bg-white/10"
          aria-pressed={done}
        >
          {done ? <Check className="h-4 w-4 shrink-0 text-mint-300" strokeWidth={3} /> : <Circle className="h-4 w-4 shrink-0 text-white/50" />}
          <span className={cn('min-w-0 flex-1 truncate text-[13px]', done && 'text-white/50 line-through')}>{products.get(step.productId)?.name ?? 'Product'}</span>
        </button>
      ))}
      <div className="mt-1 flex gap-2">
        <button onClick={() => void mutate({ type: 'notice.snooze', key: activity.key, until: new Date(Date.now() + 3_600_000).toISOString() })} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full bg-white/10 text-[12.5px] hover:bg-white/18">
          <AlarmClock className="h-3.5 w-3.5" /> Snooze 1 hour
        </button>
        <button onClick={() => void mutate({ type: 'notice.dismiss', key: activity.key, day: today })} className="flex h-8 flex-1 items-center justify-center rounded-full bg-white/10 text-[12.5px] hover:bg-white/18">
          Not today
        </button>
      </div>
    </div>
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
function Ear({ ctx, result, privacy, activity }: { ctx: CompanionContext; result: IslandResult | null; privacy: boolean; activity: Activity | null }) {
  if (activity?.kind === 'sun' && ctx.state === 'idle')
    return (
      <span className="flex items-center gap-1 text-[12px] font-semibold text-orange-300" aria-label={activityTitle(activity)} data-testid="activity-ear">
        <Sun className="h-3.5 w-3.5" />
        {Math.round(activity.notice.uv)}
      </span>
    )
  if (activity?.kind === 'inventory' && ctx.state === 'idle') {
    const Icon = activity.notice.kind === 'low' ? Hourglass : CalendarX
    return <Icon className={cn('h-3.5 w-3.5', activity.notice.kind === 'expiry' && activity.notice.value < 0 ? 'text-rose-300' : 'text-amber-200')} aria-label={activityTitle(activity)} data-testid="activity-ear" />
  }
  if (activity?.kind === 'routine' && ctx.state === 'idle')
    return (
      <span className="flex items-center gap-1 text-[12px] font-semibold text-amber-200" aria-label={routineTitle(activity)} data-testid="activity-ear">
        {activity.period === 'am' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        {activity.remaining}
      </span>
    )
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
