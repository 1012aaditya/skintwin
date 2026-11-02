import { AlertTriangle, ArrowLeftRight, ArrowRight, BookOpen, CalendarPlus, Check, CheckCircle2, CircleAlert, Crown, Droplet, Droplets, ExternalLink, Globe, Heart, Keyboard, Layers, Leaf, Loader2, MessageCircle, Mic, MicOff, PackageCheck, Pause, Play, RefreshCcw, ScanFace, ScanSearch, Settings, Sparkles, Sun, WifiOff, Zap } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { label, type Product, type ProductResearch, type ResearchSource, type RoutinePeriod } from '@shared/models'
import type { AssistantReply } from '@shared/assistant'
import { suspectsIn } from '@shared/reactions'
import { alternativesFor, pricePerMl, type MatchResult } from '@shared/scoring'
import { Orb } from '@renderer/components/Orb'
import { MatchBadge, PriceTag, ProductArt, SourceBadge, useProductActions } from '@renderer/components/products'
import { ReactionChips, SuspectList } from '@renderer/components/reactions'
import { ProgressRing } from '@renderer/components/ui'
import { cn } from '@renderer/lib/cn'
import { formatPrice } from '@renderer/lib/format'
import { useCatalog, useDb, useMatch, useMatchContext, useProductMap, useSuspects } from '@renderer/lib/store'
import type { CompanionContext, CompanionError, CompanionEvent } from './machine'

type Send = (e: CompanionEvent) => void
const NONE = { id: '__none__' } as Product // keeps hook order stable when a product is missing

function useCurrentProduct(ctx: CompanionContext): Product | null {
  const products = useProductMap()
  return ctx.productId ? (products.get(ctx.productId) ?? null) : null
}

// ---------- Shared pieces ----------

/** Pill buttons inside the panel. One vocabulary: primary, quiet, done. */
function Action({ children, onClick, tone = 'quiet', disabled, className }: { children: ReactNode; onClick: () => void; tone?: 'primary' | 'quiet' | 'done'; disabled?: boolean; className?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-pill px-4 text-[13.5px] font-medium whitespace-nowrap transition-[background,transform] active:scale-[0.97] disabled:cursor-default [&_svg]:h-4 [&_svg]:w-4',
        tone === 'primary' && 'bg-gradient-to-r from-[#9a74ff] to-[#c48fff] text-white shadow-[0_6px_22px_-6px_rgb(170_120_255/0.9)] hover:brightness-110',
        tone === 'quiet' && 'border border-white/18 bg-white/8 text-ink hover:bg-white/15',
        tone === 'done' && 'border border-mint-300/40 bg-emerald-400/15 text-mint-300',
        className
      )}
    >
      {children}
    </button>
  )
}

function SectionHead({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <h3 className="mb-2.5 flex items-center gap-2 text-[14px] font-semibold text-ink [&_svg]:h-4 [&_svg]:w-4">{icon}{children}</h3>
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-white/10 pt-4">
      <SectionHead icon={icon}>{title}</SectionHead>
      {children}
    </section>
  )
}

function topicIcon(topic: string) {
  const t = topic.toLowerCase()
  if (t.includes('oil')) return <Droplet />
  if (t.includes('hydrat') || t.includes('dry')) return <Droplets />
  if (t.includes('pore')) return <ScanFace />
  if (t.includes('fragrance')) return <Leaf />
  if (t.includes('sun')) return <Sun />
  return <Sparkles />
}

function topics(m: MatchResult | null): string[] {
  return m ? [...new Set(m.positives.map((p) => p.topic).filter((t): t is string => !!t))] : []
}

function TopicChips({ match, max = 3 }: { match: MatchResult | null; max?: number }) {
  const list = topics(match).slice(0, max)
  if (!list.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((t) => (
        <span key={t} className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-lilac-300/30 bg-lilac-400/18 px-3 text-[12.5px] text-ink [&_svg]:h-3.5 [&_svg]:w-3.5">
          {topicIcon(t)}
          {t}
        </span>
      ))}
    </div>
  )
}

function PeriodPicker({ product, conversationId, onDone }: { product: Product; conversationId: string | null; onDone: () => void }) {
  const a = useProductActions(product, 'companion', conversationId)
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 flex items-center gap-2 rounded-pill bg-white/8 p-1.5 pl-4">
      <span className="text-[12.5px] text-ink/80">Add to</span>
      {(['am', 'pm'] as RoutinePeriod[]).map((p) => (
        <Action key={p} tone={a.inRoutine(p) ? 'done' : 'quiet'} onClick={async () => void ((await a.addToRoutine(p)) && onDone())} className="h-8 flex-1">
          {a.inRoutine(p) ? <Check /> : p === 'am' ? <Sun /> : null}
          {p === 'am' ? 'Morning' : 'Evening'}
        </Action>
      ))}
    </motion.div>
  )
}

function ProductRow({ product, match, onClick, aside, selected }: { product: Product; match: MatchResult | null; onClick?: () => void; aside?: ReactNode; selected?: boolean }) {
  return (
    <button onClick={onClick} className={cn('flex w-full items-center gap-3 rounded-[20px] p-2.5 text-left transition-colors', selected ? 'bg-lilac-400/25 ring-1 ring-lilac-200/60' : 'hover:bg-white/8')}>
      <ProductArt product={product} size={52} className="rounded-2xl" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{product.brand} {product.name}</span>
        <span className="block truncate text-[12.5px] text-ink/75">{aside ?? label(product.category)}</span>
      </span>
      <MatchBadge match={match} size="sm" />
    </button>
  )
}

// ---------- Home (typing with no context yet) ----------

export function HomeView({ hasProduct, onPick }: { hasProduct: boolean; onPick: (q: string) => void }) {
  const prompts = hasProduct
    ? ['Is this product good for my skin?', 'How should I use it in my routine?', 'Is there a cheaper alternative?']
    : ['What should I use for oily, acne-prone skin?', 'Is my routine missing anything?', 'Can I use niacinamide with retinol?']
  return (
    <div className="flex flex-col items-center pt-6 text-center">
      <Orb size={104} mood="happy" />
      <p className="mt-4 text-[17px] font-semibold">What would you like to know?</p>
      <p className="mt-1 max-w-[30ch] text-[13.5px] text-ink/80">I’ll answer using your skin profile and routine.</p>
      <div className="mt-6 flex w-full flex-col gap-2">
        {prompts.map((q, i) => (
          <motion.button key={q} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} onClick={() => onPick(q)} className="flex items-center gap-3 rounded-[18px] border border-white/12 bg-white/6 px-4 py-3 text-left text-[14px] text-ink transition-colors hover:bg-white/12">
            <MessageCircle className="h-4 w-4 shrink-0 text-lilac-200" />
            {q}
          </motion.button>
        ))}
        <motion.button initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * prompts.length }} onClick={() => void window.skintwin.circle.start()} className="flex items-center gap-3 rounded-[18px] border border-lilac-200/30 bg-lilac-400/15 px-4 py-3 text-left text-[14px] text-ink transition-colors hover:bg-lilac-400/25">
          <ScanSearch className="h-4 w-4 shrink-0 text-lilac-200" />
          <span className="flex-1">Circle a product on screen</span>
          <kbd className="rounded-md bg-white/12 px-1.5 py-0.5 text-[11px] font-semibold text-ink/80">⌥⇧C</kbd>
        </motion.button>
      </div>
    </div>
  )
}

// ---------- Verdict ----------

export const VERDICTS: Record<AssistantReply['verdict'], { title: string; tone: 'good' | 'mixed' | 'bad' | 'unknown' }> = {
  good_match: { title: 'Good for your skin', tone: 'good' },
  mixed: { title: 'Mixed fit — read the notes', tone: 'mixed' },
  not_recommended: { title: 'Not a good fit for you', tone: 'bad' },
  not_applicable: { title: 'Can’t tell yet', tone: 'unknown' }
}

/** The answer in one line, plus the profile it was judged against, so the user can see it's about them. */
function VerdictBanner({ verdict }: { verdict: AssistantReply['verdict'] }) {
  const db = useDb()
  const v = VERDICTS[verdict]
  const p = db.profile
  const shared = db.settings.privacy.sendProfileToAssistant
  const basis = [p.skinType && `${label(p.skinType)} skin`, p.sensitivity && `${label(p.sensitivity).toLowerCase()} sensitivity`, ...p.concerns.slice(0, 3).map((c) => label(c).toLowerCase())].filter(Boolean).join(' · ')
  const Icon = v.tone === 'good' ? CheckCircle2 : v.tone === 'unknown' ? CircleAlert : AlertTriangle
  return (
    <div className={cn('mt-3.5 rounded-[18px] px-3.5 py-3', v.tone === 'good' ? 'bg-emerald-400/15 ring-1 ring-mint-300/30' : v.tone === 'bad' ? 'bg-rose-400/15 ring-1 ring-rose-300/30' : v.tone === 'mixed' ? 'bg-amber-300/12 ring-1 ring-amber-300/30' : 'bg-white/[0.07]')}>
      <p className="flex items-center gap-2 text-[16px] font-semibold">
        <Icon className={cn('h-5 w-5 shrink-0', v.tone === 'good' ? 'text-mint-300' : v.tone === 'bad' ? 'text-rose-300' : v.tone === 'mixed' ? 'text-amber-200' : 'text-ink/70')} />
        {v.title}
      </p>
      <p className="mt-1 pl-7 text-[12.5px] text-ink/75">
        {!shared ? 'Your profile isn’t shared with the assistant (Settings › Privacy), so this is general.' : basis ? `Checked against your profile: ${basis}` : 'Add your skin type and concerns for a personal verdict.'}
      </p>
    </div>
  )
}

// ---------- Research sources ----------

const KIND_LABEL: Record<ProductResearch['findings'][number]['kind'], string> = {
  peer_reviewed: 'Study',
  dermatology_body: 'Dermatology body',
  regulatory: 'Regulator',
  brand: 'Brand',
  retailer: 'Retailer',
  other: 'Web'
}

const host = (url: string) => new URL(url).hostname.replace(/^www\./, '')

function SourceLink({ source }: { source: ResearchSource }) {
  return (
    <button onClick={() => window.skintwin.openExternal(source.url)} title={source.url} className="inline-flex max-w-full items-center gap-1 text-left text-[12px] text-lilac-200 hover:text-white hover:underline">
      <span className="truncate">{source.title || host(source.url)}</span>
      <span className="shrink-0 text-ink/55">· {host(source.url)}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </button>
  )
}

/** Where the verdict's facts came from. Every link here came back from a real web search. */
export function ResearchSources({ product, research }: { product: Product; research: ProductResearch }) {
  const fromScreen = product.source.kind === 'screen' && !product.source.label.includes('ingredients from')
  const list =
    research.ingredientsCheck === 'not_found'
      ? { tone: 'warn', text: product.ingredients.length ? 'Couldn’t find the official ingredient list online to double-check what was read.' : 'Couldn’t find the ingredient list online.' }
      : research.ingredientsCheck === 'differs'
        ? { tone: 'warn', text: `The list online differs from what was read on screen${research.differences.length ? `: ${research.differences.join('; ')}` : '.'}` }
        : research.ingredientsCheck === 'match'
          ? { tone: 'ok', text: `The ${product.ingredients.length} ingredients read from your screen match the list online.` }
          : { tone: 'ok', text: `${product.ingredients.length} ingredients from the list online${fromScreen ? '' : ' (none were readable on screen)'}.` }
  return (
    <div>
      <SectionHead icon={<BookOpen className="text-lilac-200" />}>Sources</SectionHead>
      <div className="space-y-2">
        <div className={cn('rounded-[18px] px-3.5 py-3 text-[13px] leading-relaxed', list.tone === 'warn' ? 'bg-amber-300/12 text-amber-50' : 'bg-white/[0.07]')}>
          <p className="flex items-start gap-2">
            {list.tone === 'warn' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint-300" />}
            {list.text}
          </p>
          {research.ingredientSource && <div className="mt-1.5 pl-6"><SourceLink source={research.ingredientSource} /></div>}
        </div>
        {research.findings.map((f) => (
          <div key={`${f.ingredient}${f.source.url}`} className="rounded-[18px] bg-white/[0.07] px-3.5 py-3">
            <div className="flex items-center gap-2">
              <p className="flex-1 text-[13.5px] font-semibold">{f.ingredient}</p>
              <span className="rounded-pill bg-white/10 px-2 py-0.5 text-[11px] text-ink/80">{KIND_LABEL[f.kind]}</span>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink/90">{f.finding}</p>
            <div className="mt-1.5"><SourceLink source={f.source} /></div>
          </div>
        ))}
        {!research.findings.length && <p className="px-1 text-[12.5px] text-ink/70">No research with a source was found for this product’s key ingredients.</p>}
      </div>
    </div>
  )
}

// ---------- Thinking ----------

export function ProcessingSteps({ ctx, hasProduct, inPanel }: { ctx: CompanionContext; hasProduct: boolean; inPanel?: boolean }) {
  const thinking = ctx.stage === 'thinking'
  const steps: { label: string; state: 'done' | 'active' | 'todo' }[] = []
  if (ctx.viaVoice) steps.push({ label: 'Understanding your question', state: thinking ? 'done' : 'active' })
  if (ctx.stage === 'reading' || ctx.stage === 'researching') {
    steps.push({ label: 'Reading what you circled', state: ctx.stage === 'reading' ? 'active' : 'done' })
    steps.push({ label: 'Finding the ingredient list and research', state: ctx.stage === 'researching' ? 'active' : 'todo' })
  } else if (hasProduct) steps.push({ label: 'Reading the product details', state: thinking ? 'done' : 'todo' })
  steps.push({ label: 'Checking against your skin profile', state: thinking ? 'done' : 'todo' })
  steps.push({ label: 'Preparing a recommendation', state: thinking ? 'active' : 'todo' })
  return (
    <div className={cn('w-full rounded-[26px] p-2.5', inPanel ? 'bg-white/[0.07]' : 'glass-strong')}>
      {ctx.question && !inPanel && <p className="mb-1 line-clamp-2 px-3 pt-1 text-center text-[13px] text-ink/80 italic">“{ctx.question}”</p>}
      {steps.map((s, i) => (
        <motion.div key={s.label} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.06 * i }} className={cn('flex items-center gap-3 rounded-[16px] px-3 py-2 text-[13.5px] transition-colors', s.state === 'active' && 'bg-lilac-400/30')}>
          {s.state === 'done' ? (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-lilac-500 text-white">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
          ) : s.state === 'active' ? (
            <Loader2 className="h-6 w-6 animate-spin text-lilac-200" />
          ) : (
            <span className="h-6 w-6 rounded-full border-2 border-white/25" />
          )}
          <span className={s.state === 'todo' ? 'text-ink/55' : 'text-ink'}>{s.label}</span>
        </motion.div>
      ))}
    </div>
  )
}

// ---------- Responding ----------

export function ResponseView({ ctx, speaker, onReplay, send }: { ctx: CompanionContext; speaker: { speaking: boolean; elapsed: number; stop: () => void }; onReplay: () => void; send: Send }) {
  const product = useCurrentProduct(ctx)
  const products = useProductMap()
  const r = ctx.response!.reply
  const referenced = r.referencedProductIds.map((id) => products.get(id)).filter((p): p is Product => !!p && p.id !== product?.id)
  const a = useProductActions(product ?? NONE, 'companion', ctx.conversationId)
  const [picking, setPicking] = useState(false)
  return (
    <div className="space-y-4">
      {ctx.question && (
        <div className="ml-auto flex w-fit max-w-[88%] items-center gap-2.5 rounded-[22px] rounded-br-md border border-white/20 bg-white/10 px-4 py-2.5 text-[14px]">
          {ctx.viaVoice && <Mic className="h-4 w-4 shrink-0 text-lilac-200" />}
          {ctx.question}
        </div>
      )}
      <div className="rounded-[24px] bg-white/[0.07] p-4">
        <div className="flex items-center gap-3">
          <Orb size={46} ring={false} mood={speaker.speaking ? 'speaking' : 'happy'} />
          <button aria-label={speaker.speaking ? 'Stop speaking' : 'Play answer'} onClick={() => (speaker.speaking ? speaker.stop() : onReplay())} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/14 transition-colors hover:bg-white/22">
            {speaker.speaking ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
          </button>
          <div className="flex h-8 min-w-0 flex-1 items-center gap-[3px]" aria-hidden>
            {Array.from({ length: 24 }).map((_, i) => {
              const h = 5 + Math.abs(Math.sin(i * 1.3)) * 20
              return speaker.speaking ? (
                <motion.span key={i} className="w-[3px] rounded-full bg-lilac-200" animate={{ height: [h * 0.4, h, h * 0.55] }} transition={{ duration: 0.55 + (i % 4) * 0.1, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }} />
              ) : (
                <span key={i} className="w-[3px] rounded-full bg-lilac-200/35" style={{ height: h * 0.6 }} />
              )
            })}
          </div>
          <span className="rounded-pill bg-white/10 px-2.5 py-1 text-xs tabular-nums">{Math.floor(speaker.elapsed / 60)}:{String(speaker.elapsed % 60).padStart(2, '0')}</span>
        </div>
        {product && <VerdictBanner verdict={r.verdict} />}
        <div className="mt-3.5 flex gap-3">
          <p className="flex-1 text-[14.5px] leading-[1.6] text-pretty">{r.answer}</p>
          {product && <ProductArt product={product} size={88} />}
        </div>
        {r.highlights.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {r.highlights.map((h) => (
              <span key={h} className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-lilac-300/30 bg-lilac-400/18 px-3 text-[12.5px] [&_svg]:h-3.5 [&_svg]:w-3.5">
                <Check strokeWidth={3} /> {h}
              </span>
            ))}
          </div>
        )}
        {ctx.response!.providerNote && <p className="mt-3 text-[12px] text-amber-200">{ctx.response!.providerNote}</p>}
      </div>
      {product?.research && <ResearchSources product={product} research={product.research} />}
      {referenced.length > 0 && (
        <div>
          <SectionHead icon={<Sparkles className="text-lilac-200" />}>Mentioned</SectionHead>
          {referenced.slice(0, 2).map((p) => (
            <ReferencedRow key={p.id} product={p} onClick={() => send({ type: 'OPEN_ANALYSIS', productId: p.id })} />
          ))}
        </div>
      )}
      {product && (
        <div>
          <SectionHead icon={<Sparkles className="text-lilac-200" />}>Next steps</SectionHead>
          <div className="grid grid-cols-2 gap-2">
            <Action onClick={() => setPicking((x) => !x)}>
              <CalendarPlus /> Add to routine
            </Action>
            <Action onClick={() => send({ type: 'OPEN_COMPARISON' })}>
              <ArrowLeftRight /> Compare
            </Action>
            <Action onClick={() => send({ type: 'OPEN_ANALYSIS' })}>
              <Layers /> Full analysis
            </Action>
            <Action tone={a.wishlisted ? 'done' : 'quiet'} onClick={() => a.toggleWishlist(ctx.question ?? undefined)}>
              <Heart className={cn(a.wishlisted && 'fill-current')} /> {a.wishlisted ? 'Saved' : 'Save'}
            </Action>
          </div>
          {picking && <PeriodPicker product={product} conversationId={ctx.conversationId} onDone={() => setPicking(false)} />}
        </div>
      )}
      {product && <ReactionSection product={product} />}
    </div>
  )
}

function ReferencedRow({ product, onClick }: { product: Product; onClick: () => void }) {
  const match = useMatch(product)
  return <ProductRow product={product} match={match} onClick={onClick} />
}

/** "My skin reacted" — one tap, inside the companion. */
function ReactionSection({ product }: { product: Product }) {
  return (
    <Section icon={<CircleAlert className="text-rose-300" />} title="Skin reacted after using it?">
      <ReactionChips productId={product.id} dense />
    </Section>
  )
}

// ---------- Product detected ----------

function matchSentence(m: MatchResult | null, skin: string | null): string {
  if (!m) return ''
  if (m.basis === 'no_ingredients') return 'I couldn’t find an ingredient list on this page, so I can’t judge the formula yet.'
  if (m.basis === 'no_profile') return 'Tell me about your skin and I’ll check how well this fits.'
  const t = topics(m).map((x) => x.replace(/^(Helps with|Supports) /, '').toLowerCase()).slice(0, 3)
  if (m.mismatches[0]) return m.mismatches[0].text
  return t.length ? `Fits your ${skin ? `${skin.toLowerCase()} ` : ''}skin — it targets ${t.length > 1 ? `${t.slice(0, -1).join(', ')} and ${t.at(-1)}` : t[0]}.` : m.headline
}

export function ProductDetectedView({ ctx, send, onAsk }: { ctx: CompanionContext; send: Send; onAsk: () => void }) {
  const db = useDb()
  const product = useCurrentProduct(ctx)
  const match = useMatch(product)
  const a = useProductActions(product ?? NONE, 'companion', ctx.conversationId)
  if (!product) return <ErrorView error={{ kind: 'product_unavailable', message: 'That product is no longer available.' }} send={send} />
  const fromPage = db.detected?.productId === product.id
  const good = match?.verdict === 'great' || match?.verdict === 'good'
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Orb size={54} mood="happy" />
        <p className="rounded-[20px] rounded-tl-md border border-white/18 bg-white/10 px-4 py-2.5 text-[14px]">{fromPage ? 'I found a product on this page ✨' : 'Let’s look at this one ✨'}</p>
      </div>

      <div className="flex gap-4 rounded-[24px] bg-white/[0.07] p-3.5">
        <ProductArt product={product} size={108} />
        <div className="min-w-0 flex-1 py-0.5">
          <p className="text-[12.5px] text-ink/75">{product.brand}</p>
          <p className="line-clamp-2 text-[16px] leading-snug font-semibold text-balance">{product.name}</p>
          <p className="mt-1 text-[12.5px] text-ink/75">
            {label(product.category)}
            {product.sizeMl ? ` · ${product.sizeMl} mL` : ''}
            {product.retailer ? ` · ${product.retailer}` : ''}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <PriceTag product={product} />
            <SourceBadge product={product} />
            {product.url && (
              <button aria-label="Open product page" onClick={() => window.skintwin.openExternal(product.url!)} className="ml-auto grid h-8 w-8 place-items-center rounded-full text-ink/80 hover:bg-white/12">
                <ExternalLink className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={cn('rounded-[24px] p-4', good ? 'bg-emerald-400/12 ring-1 ring-mint-300/25' : match?.score == null ? 'bg-white/[0.07]' : 'bg-amber-300/10 ring-1 ring-amber-300/25')}>
        <div className="flex items-center gap-2.5">
          {good ? <CheckCircle2 className="h-5 w-5 shrink-0 text-mint-300" /> : <CircleAlert className="h-5 w-5 shrink-0 text-amber-300" />}
          <p className="flex-1 text-[15px] font-semibold">{match?.headline}</p>
          <MatchBadge match={match} size="sm" />
        </div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink/85">{matchSentence(match, db.profile.skinType)}</p>
        <div className="mt-3">
          <TopicChips match={match} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Action tone="primary" onClick={() => send({ type: 'OPEN_ANALYSIS' })} className="col-span-2 h-11">
          See detailed analysis <ArrowRight />
        </Action>
        <Action tone={a.wishlisted ? 'done' : 'quiet'} onClick={() => a.toggleWishlist('Detected while browsing')}>
          <Heart className={cn(a.wishlisted && 'fill-current')} /> {a.wishlisted ? 'Saved' : 'Save'}
        </Action>
        <Action onClick={() => send({ type: 'OPEN_COMPARISON' })}>
          <ArrowLeftRight /> Compare
        </Action>
      </div>
      <div className="flex items-center justify-between px-1 text-[13px]">
        <button onClick={onAsk} className="inline-flex items-center gap-1.5 text-lilac-200 hover:text-ink">
          <MessageCircle className="h-4 w-4" /> Ask “Is this good for my skin?”
        </button>
        <button onClick={() => send({ type: 'DISMISS_PRODUCT' })} className="text-ink/70 hover:text-ink">
          Dismiss
        </button>
      </div>
      <ReactionSection product={product} />
    </div>
  )
}

// ---------- Product analysis ----------

export function ProductAnalysisView({ ctx, send, onAsk }: { ctx: CompanionContext; send: Send; onAsk: (q: string) => void }) {
  const db = useDb()
  const product = useCurrentProduct(ctx)
  const match = useMatch(product)
  const catalog = useCatalog()
  const matchCtx = useMatchContext()
  const suspects = useSuspects()
  if (!product || !match) return <ErrorView error={{ kind: 'product_unavailable', message: 'Product details are unavailable.' }} send={send} />
  const alts = alternativesFor(product, catalog, db.profile, matchCtx).slice(0, 3)
  const cautions = [...match.mismatches.map((m) => m.text), ...match.cautions]
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <ProgressRing value={match.score} size={76} stroke={7} label={match.score == null ? '—' : `${match.score}%`} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[15.5px] leading-snug font-semibold">{product.brand} {product.name}</p>
          <p className="mt-0.5 text-[13px] text-ink/80">{match.headline}</p>
        </div>
      </div>
      {product.description && <p className="line-clamp-3 text-[13.5px] leading-relaxed text-ink/85">{product.description}</p>}
      <TopicChips match={match} max={4} />

      <Section icon={<Sparkles className="text-lilac-200" />} title="What’s inside">
        {match.identified.length ? (
          <ul className="space-y-2.5">
            {match.identified.slice(0, 5).map((i) => (
              <li key={i.id} className="text-[13.5px] leading-snug">
                <span className="font-semibold">{i.name}</span>
                <span className="ml-1.5 text-[11.5px] text-lilac-200">{i.role}</span>
                <p className="text-ink/80">{i.description}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-ink/80">{product.ingredients.length ? 'None of the listed ingredients are in my reference yet.' : 'No ingredient list available for this product.'}</p>
        )}
      </Section>

      {cautions.length > 0 && (
        <Section icon={<AlertTriangle className="text-amber-300" />} title="Worth knowing">
          <ul className="space-y-1.5 text-[13.5px] leading-snug text-ink/90">
            {cautions.slice(0, 4).map((t) => (
              <li key={t} className="flex gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
                {t}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <SuspectList suspects={suspectsIn(product, suspects)} />
      <ReactionSection product={product} />

      <Section icon={<Layers className="text-lilac-200" />} title="In your routine">
        <p className="text-[13.5px] text-ink/85">{match.routineOverlap[0]?.text ?? 'Doesn’t duplicate anything you already use.'}</p>
      </Section>

      {alts.length > 0 && (
        <Section icon={<ArrowLeftRight className="text-lilac-200" />} title="Alternatives">
          <div className="-mx-2.5">
            {alts.map((x) => (
              <ProductRow key={x.product.id} product={x.product} match={x.match} onClick={() => send({ type: 'OPEN_ANALYSIS', productId: x.product.id })} />
            ))}
          </div>
        </Section>
      )}

      <section className="border-t border-white/10 pt-4">
        <ProductActions product={product} ctx={ctx} send={send} />
        <div className="mt-3 flex items-center justify-between px-1 text-[13px]">
          <button onClick={() => onAsk(`Is ${product.name} good for my skin?`)} className="inline-flex items-center gap-1.5 text-lilac-200 hover:text-ink">
            <MessageCircle className="h-4 w-4" /> Ask about it
          </button>
          <button onClick={() => window.skintwin.app.open(`/product/${encodeURIComponent(product.id)}`)} className="inline-flex items-center gap-1.5 text-ink/75 hover:text-ink">
            Open in SkinTwin <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>
    </div>
  )
}

function ProductActions({ product, ctx, send }: { product: Product; ctx: CompanionContext; send: Send }) {
  const a = useProductActions(product, 'companion', ctx.conversationId)
  const [picking, setPicking] = useState(false)
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Action tone={a.wishlisted ? 'done' : 'quiet'} onClick={() => a.toggleWishlist(ctx.question ?? undefined)}>
          <Heart className={cn(a.wishlisted && 'fill-current')} /> {a.wishlisted ? 'Saved' : 'Save'}
        </Action>
        <Action onClick={() => setPicking((x) => !x)}>
          <CalendarPlus /> Add to routine
        </Action>
        <Action onClick={() => send({ type: 'OPEN_COMPARISON', productId: product.id })}>
          <ArrowLeftRight /> Compare
        </Action>
        <Action tone={a.owned ? 'done' : 'quiet'} disabled={a.owned} onClick={() => a.markOwned()}>
          <PackageCheck /> {a.owned ? 'Owned' : 'Mark owned'}
        </Action>
      </div>
      {picking && <PeriodPicker product={product} conversationId={ctx.conversationId} onDone={() => setPicking(false)} />}
    </div>
  )
}

// ---------- Comparison ----------

function differentiator(p: Product, m: MatchResult): ReactNode {
  if (m.mismatches[0]) return <span className="text-rose-200">{m.mismatches[0].text.replace(/ — .*/, '')}</span>
  const actives = m.identified.filter((i) => i.activeGroup || i.helps.length).slice(0, 2).map((i) => i.name)
  const ppm = pricePerMl(p)
  return [actives.join(' + '), ppm != null && p.price ? `${formatPrice({ ...p.price, amount: ppm })}/mL` : null].filter(Boolean).join(' · ') || label(p.category)
}

export function ComparisonView({ ctx, send, onAsk }: { ctx: CompanionContext; send: Send; onAsk: (q: string) => void }) {
  const db = useDb()
  const product = useCurrentProduct(ctx)
  const catalog = useCatalog()
  const matchCtx = useMatchContext()
  const baseMatch = useMatch(product)
  const [selected, setSelected] = useState<string | null>(null)
  const products = useProductMap()
  if (!product || !baseMatch) return <ErrorView error={{ kind: 'product_unavailable', message: 'Nothing to compare.' }} send={send} />
  const alts = alternativesFor(product, catalog, db.profile, matchCtx).slice(0, 3)
  const rows = [{ product, match: baseMatch }, ...alts]
  // Best = highest match; ties go to the lower price per mL.
  const best = [...rows].sort((a, b) => (b.match.score ?? -1) - (a.match.score ?? -1) || (pricePerMl(a.product) ?? Infinity) - (pricePerMl(b.product) ?? Infinity))[0]
  const sel = selected ? products.get(selected) : null
  return (
    <div className="space-y-4">
      <p className="text-[13.5px] text-ink/85">Ranked against your profile. Tap one to save it or add it to your routine.</p>
      {alts.length === 0 && <p className="text-[13.5px] text-ink/80">No similar products in the catalog to compare with yet.</p>}
      <div className="-mx-2.5 space-y-1">
        {rows.map((r, i) => (
          <div key={r.product.id}>
            {(i === 0 || best?.product.id === r.product.id) && (
              <p className={cn('mb-0.5 flex items-center gap-1.5 px-2.5 text-[11.5px] font-medium text-ink/70', i > 0 && 'mt-2')}>
                {i === 0 && 'Current product'}
                {best?.product.id === r.product.id && rows.length > 1 && (
                  <span className="inline-flex items-center gap-1 text-amber-200">
                    {i === 0 && '·'} <Crown className="h-3 w-3" /> Best for you
                  </span>
                )}
              </p>
            )}
            {i === 1 && best?.product.id !== r.product.id && <p className="mt-2 mb-0.5 px-2.5 text-[11.5px] font-medium text-ink/70">Alternatives</p>}
            <ProductRow product={r.product} match={r.match} aside={differentiator(r.product, r.match)} selected={selected === r.product.id} onClick={() => setSelected(selected === r.product.id ? null : r.product.id)} />
          </div>
        ))}
      </div>
      {sel && (
        <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="border-t border-white/10 pt-4">
          <p className="mb-2.5 text-[13.5px]">
            <span className="text-ink/75">Selected:</span> <span className="font-semibold">{sel.brand} {sel.name}</span>
          </p>
          <ProductActions product={sel} ctx={ctx} send={send} />
        </motion.section>
      )}
      <div className="flex items-center justify-between px-1 text-[13px]">
        <button onClick={() => onAsk(`Which of these is best for my skin: ${rows.map((r) => r.product.name).join(', ')}?`)} className="inline-flex items-center gap-1.5 text-lilac-200 hover:text-ink">
          <MessageCircle className="h-4 w-4" /> Ask which is best
        </button>
        <button onClick={() => window.skintwin.app.open(`/compare?ids=${rows.map((r) => encodeURIComponent(r.product.id)).join(',')}`)} className="inline-flex items-center gap-1.5 text-ink/75 hover:text-ink">
          Side-by-side <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ---------- Quick actions ----------

export function QuickActionsView({ ctx, send }: { ctx: CompanionContext; send: Send }) {
  const product = useCurrentProduct(ctx)
  const match = useMatch(product)
  const a = useProductActions(product ?? NONE, 'companion', ctx.conversationId)
  const [picking, setPicking] = useState(false)
  if (!product) return <ErrorView error={{ kind: 'product_unavailable', message: 'No product selected.' }} send={send} />
  const inRoutine = a.inRoutine('am') || a.inRoutine('pm')
  const Tile = ({ icon, title, onClick, done, accent }: { icon: ReactNode; title: string; onClick: () => void; done?: boolean; accent?: boolean }) => (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-[22px] px-2 py-4 text-center text-[13px] leading-tight font-medium transition-colors [&_svg]:h-6 [&_svg]:w-6',
        done ? 'bg-emerald-400/15 text-mint-300 ring-1 ring-mint-300/35' : accent ? 'bg-lilac-400/30 ring-1 ring-lilac-200/50 hover:bg-lilac-400/40' : 'bg-white/8 ring-1 ring-white/12 hover:bg-white/14'
      )}
    >
      {icon}
      {title}
    </motion.button>
  )
  return (
    <div className="space-y-4">
      <div className="flex gap-3.5 rounded-[24px] bg-white/[0.07] p-3.5">
        <ProductArt product={product} size={88} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[15px] leading-snug font-semibold">{product.brand} {product.name}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <PriceTag product={product} />
            <MatchBadge match={match} size="sm" />
          </div>
          <ul className="mt-2 space-y-1 text-[12.5px] text-ink/85">
            {topics(match).slice(0, 3).map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-lilac-200" strokeWidth={3} /> {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <SectionHead icon={<Zap className="text-amber-300" />}>Quick actions</SectionHead>
      <div className="grid grid-cols-2 gap-2.5">
        <Tile icon={<Heart className={cn(a.wishlisted && 'fill-current')} />} title={a.wishlisted ? 'In wishlist' : 'Save to wishlist'} done={a.wishlisted} onClick={() => a.toggleWishlist(ctx.question ?? undefined)} />
        <Tile icon={<CalendarPlus />} title={inRoutine ? 'In your routine' : 'Add to routine'} done={inRoutine} accent={!inRoutine} onClick={() => setPicking(true)} />
        <Tile icon={<ArrowLeftRight />} title="Compare products" onClick={() => send({ type: 'OPEN_COMPARISON' })} />
        <Tile icon={<PackageCheck />} title={a.owned ? 'Owned' : 'Mark as owned'} done={a.owned} onClick={() => a.markOwned()} />
      </div>
      {picking && <PeriodPicker product={product} conversationId={ctx.conversationId} onDone={() => setPicking(false)} />}
      <ReactionSection product={product} />
      <div className="flex items-center justify-between px-1 text-[13px]">
        <button onClick={() => window.skintwin.app.open(`/product/${encodeURIComponent(product.id)}`)} className="inline-flex items-center gap-1.5 text-ink/75 hover:text-ink">
          Product insights <ExternalLink className="h-3.5 w-3.5" />
        </button>
        {product.url && (
          <button onClick={() => window.skintwin.openExternal(product.url!)} className="inline-flex items-center gap-1.5 text-ink/75 hover:text-ink">
            {product.source.kind === 'browser' ? 'Retailer page' : 'Brand site'} <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

// ---------- Profile peek ----------

export function ProfilePeekView({ ctx }: { ctx: CompanionContext }) {
  const db = useDb()
  const product = useCurrentProduct(ctx)
  const match = useMatch(product)
  const products = useProductMap()
  const p = db.profile
  // With a product in focus, show only the concerns it touches.
  const concerns = product && match?.identified.length ? p.concerns.filter((c) => match.identified.some((i) => i.helps.includes(c))) : p.concerns
  const routine = (k: 'am' | 'pm') => db.routines[k].steps.map((s) => products.get(s.productId)?.name).filter(Boolean)
  const Chips = ({ items, empty }: { items: string[]; empty: string }) =>
    items.length ? (
      <div className="flex flex-wrap gap-1.5">
        {items.map((t) => (
          <span key={t} className="rounded-pill border border-white/15 bg-white/8 px-3 py-1 text-[12.5px]">{t}</span>
        ))}
      </div>
    ) : (
      <p className="text-[13px] text-ink/70">{empty}</p>
    )
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {[
          ['Skin type', label(p.skinType)],
          ['Sensitivity', label(p.sensitivity)]
        ].map(([k, v]) => (
          <div key={k} className="rounded-[18px] bg-white/[0.07] px-4 py-3">
            <p className="text-[12px] text-ink/70">{k}</p>
            <p className="text-[15px] font-semibold">{v}</p>
          </div>
        ))}
      </div>
      <Section icon={<CircleAlert className="text-lilac-200" />} title={product ? 'Concerns this product touches' : 'Concerns'}>
        <Chips items={concerns.map(label)} empty="None set" />
      </Section>
      <Section icon={<Sparkles className="text-lilac-200" />} title="Goals">
        <Chips items={p.goals.map(label)} empty="None set" />
      </Section>
      <Section icon={<Leaf className="text-lilac-200" />} title="Preferences">
        <Chips items={[...p.preferences.map(label), ...p.avoidIngredients.map((x) => `No ${x}`)]} empty="None set" />
      </Section>
      <Section icon={<Layers className="text-lilac-200" />} title="Current routine">
        <p className="text-[13px] leading-relaxed text-ink/85">
          <span className="text-ink/65">AM</span> {routine('am').join(' → ') || 'empty'}
          <br />
          <span className="text-ink/65">PM</span> {routine('pm').join(' → ') || 'empty'}
        </p>
      </Section>
      <Action tone="primary" className="w-full" onClick={() => window.skintwin.app.open('/profile')}>
        View full profile <ArrowRight />
      </Action>
    </div>
  )
}

// ---------- Permission / error ----------

const ERROR_COPY: Record<CompanionError['kind'], { title: string; icon: ReactNode; steps?: string[]; tips?: string[] }> = {
  microphone_denied: {
    title: 'Enable microphone?',
    icon: <MicOff />,
    steps: ['Open System Settings › Privacy & Security › Microphone', 'Turn on SkinTwin (or Electron while developing)', 'Come back and tap the mic again']
  },
  microphone_unavailable: { title: 'No microphone found', icon: <MicOff /> },
  stt_not_configured: { title: 'Voice input isn’t set up', icon: <Keyboard /> },
  screen_denied: {
    title: 'Allow screen access?',
    icon: <ScanSearch />,
    steps: ['Open System Settings › Privacy & Security › Screen & System Audio Recording', 'Turn on SkinTwin (or Electron while developing)', 'Quit and reopen SkinTwin, then circle again']
  },
  screen_unreadable: { title: 'Couldn’t spot a product', icon: <ScanSearch />, tips: ['Circle just one product, including its name', 'Zoom in if the text is tiny', 'To judge the formula, also circle its ingredient list'] },
  page_unreadable: { title: 'Couldn’t read this page', icon: <Globe />, tips: ['The page might not be a product page', 'Try again once it has fully loaded', 'Or add the product manually in SkinTwin'] },
  product_unavailable: { title: 'Product details unavailable', icon: <CircleAlert /> },
  network: { title: 'Connection problem', icon: <WifiOff /> },
  provider: { title: 'Something went wrong', icon: <AlertTriangle /> },
  unknown: { title: 'Let’s try that again', icon: <AlertTriangle /> }
}

export function ErrorView({ error, send, onRetry, onType }: { error: CompanionError; send: Send; onRetry?: () => void; onType?: () => void }) {
  const copy = ERROR_COPY[error.kind]
  const canType = (error.kind === 'microphone_denied' || error.kind === 'microphone_unavailable' || error.kind === 'stt_not_configured') && onType
  const canRetry = onRetry && ['network', 'provider', 'unknown', 'microphone_denied'].includes(error.kind)
  return (
    <div className="flex flex-col items-center pt-4 text-center">
      <div className="relative">
        <Orb size={96} mood="concerned" />
        <span className="absolute -right-2 -bottom-1 grid h-10 w-10 place-items-center rounded-full border-2 border-white/70 bg-[#3d2a8f] text-amber-200 [&_svg]:h-5 [&_svg]:w-5">{copy.icon}</span>
      </div>
      <h2 className="mt-5 text-[20px] font-semibold text-balance">{copy.title}</h2>
      <p className="mt-1.5 max-w-[34ch] text-[14px] leading-relaxed text-ink/85">{error.message}</p>
      {copy.steps && (
        <ol className="mt-5 w-full space-y-2 text-left text-[13.5px]">
          {copy.steps.map((s, i) => (
            <li key={s} className="flex items-start gap-3 rounded-[16px] bg-white/[0.07] px-3.5 py-2.5">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/15 text-[11px] font-semibold">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      )}
      {copy.tips && (
        <ul className="mt-5 w-full space-y-1 rounded-[18px] bg-white/[0.07] px-4 py-3 text-left text-[13.5px] text-ink/90">
          {copy.tips.map((t) => (
            <li key={t} className="flex items-start gap-2.5 py-1">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-lilac-200" />
              {t}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 flex w-full flex-col gap-2">
        {canRetry && (
          <Action tone="primary" onClick={onRetry!}>
            <RefreshCcw /> Try again
          </Action>
        )}
        {canType && (
          <Action tone={canRetry ? 'quiet' : 'primary'} onClick={() => (send({ type: 'BACK' }), onType!())}>
            <Keyboard /> Type instead
          </Action>
        )}
        {error.kind === 'stt_not_configured' && (
          <Action onClick={() => window.skintwin.app.open('/settings')}>
            <Settings /> Voice settings
          </Action>
        )}
        {error.kind === 'screen_denied' && (
          <Action tone="primary" onClick={() => void window.skintwin.circle.openSettings()}>
            <Settings /> Open Screen Recording settings
          </Action>
        )}
        {error.kind === 'screen_unreadable' && (
          <Action tone="primary" onClick={() => void window.skintwin.circle.start()}>
            <ScanSearch /> Circle again
          </Action>
        )}
        {error.kind === 'page_unreadable' && <Action onClick={() => window.skintwin.app.open('/inventory')}>Add product manually</Action>}
        <button onClick={() => send({ type: 'BACK' })} className="mt-1 h-9 text-[13.5px] text-ink/75 hover:text-ink">
          Not now
        </button>
      </div>
    </div>
  )
}
