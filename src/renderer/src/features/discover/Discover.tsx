import { ArrowRight, CalendarCheck, Camera, Check, CheckCircle2, Circle, Globe, Hourglass, MessageCircle, Mic, Moon, ShieldAlert, Sparkles, Sun, TrendingUp } from 'lucide-react'
import { useMemo } from 'react'
import { checkIn, todaysSteps, whatsWorking, whatToAvoid } from '@shared/home'
import { label } from '@shared/models'
import { prettyAccelerator } from '@shared/shortcuts'
import { recommend, routineGaps } from '@shared/scoring'
import { scanSummary } from '@shared/skin'
import { describeSince, sinceStarted } from '@shared/timeline'
import { Orb } from '@renderer/components/Orb'
import { MatchBadge, PriceTag, ProductArt, ProductCard } from '@renderer/components/products'
import { SuspectList } from '@renderer/components/reactions'
import { Badge, Button, Card, CardHeader, ProgressRing } from '@renderer/components/ui'
import { cn } from '@renderer/lib/cn'
import { formatDate, greeting } from '@renderer/lib/format'
import { navigate } from '@renderer/lib/router'
import { mutate, todayKey, useCatalog, useDb, useMatch, useMatchContext, useOwnedIds, useProductMap } from '@renderer/lib/store'

/**
 * Home is "your twin": today's routine, the latest scan, what seems to be working, what to
 * avoid, and when to check in next — all from what the user has recorded.
 */
export function Discover() {
  const db = useDb()
  const products = useProductMap()
  const today = todayKey()
  const latest = db.analyses.find((a) => !a.isMock) ?? null
  const nudge = checkIn(db.analyses, new Date())
  const detected = db.detected ? products.get(db.detected.productId) : undefined

  return (
    <div className="space-y-6" data-testid="home">
      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-6 max-[1180px]:grid-cols-1">
        <Card strong className="relative flex items-center gap-8 overflow-hidden p-8">
          <Orb size={150} mood="happy" />
          <div className="min-w-0">
            <p className="text-[13px] tracking-[0.25em] text-ink-soft uppercase">{greeting()}{db.displayName ? `, ${db.displayName}` : ''}</p>
            <h1 className="mt-2 text-[34px] leading-tight font-semibold text-gradient">Your skin twin</h1>
            <p className="mt-2 max-w-md text-ink-soft">SkinTwin learns what actually works for your skin — from your scans, your routine and how your skin reacts.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="primary" size="lg" onClick={() => window.skintwin.companion.show({ type: 'listen' })}>
                <Mic className="h-4 w-4" /> Ask SkinTwin
              </Button>
              <Button size="lg" onClick={() => navigate('/analyze')}>
                <Camera className="h-4 w-4" /> Scan my skin
              </Button>
            </div>
            <p className="mt-3 text-xs text-ink-faint">From any app: {prettyAccelerator(db.settings.companion.shortcut)} shows SkinTwin · {prettyAccelerator(db.settings.companion.voiceShortcut)} to talk</p>
          </div>
        </Card>
        <LatestScan />
      </div>

      {/* with no real scan yet, the Latest scan card already asks for the first one */}
      {nudge.due && latest && (
        <div className="flex items-center gap-4 rounded-[24px] border border-lilac-300/40 bg-lilac-400/15 p-4" data-testid="checkin-nudge">
          <CalendarCheck className="h-6 w-6 shrink-0 text-lilac-200" />
          <p className="flex-1 text-[14px]">{nudge.text}</p>
          <Button variant="primary" onClick={() => navigate('/analyze')}>
            <Camera className="h-4 w-4" /> Check in now
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 items-start gap-5 max-[1180px]:grid-cols-1">
        <TodaysRoutine today={today} />
        <WhatsWorking />
      </div>

      <WhatToAvoid />

      {detected && <DetectedProduct />}
      <Picks />
      {!latest && <p className="text-center text-xs text-ink-faint">Mock scans never count towards your timeline or what’s working.</p>}
    </div>
  )
}

function LatestScan() {
  const db = useDb()
  const latest = db.analyses.find((a) => !a.isMock) ?? null
  const nudge = checkIn(db.analyses, new Date())
  if (!latest)
    return (
      <Card className="flex flex-col justify-between p-6" data-testid="home-scan">
        <CardHeader icon={<Camera />} title="No real scan yet" subtitle="Your first YouCam scan is the starting point every change is measured from." />
        <Button className="mt-4 self-start" variant="primary" onClick={() => navigate('/analyze')}>
          Take your first scan
        </Button>
      </Card>
    )
  const s = scanSummary(latest, db.analyses)
  return (
    <Card className="flex flex-col gap-4 p-6" role="button" onClick={() => navigate('/progress')} data-testid="home-scan">
      <CardHeader icon={<Camera />} title="Latest scan" subtitle={formatDate(latest.createdAt, { dateStyle: 'medium', timeStyle: 'short' } as Intl.DateTimeFormatOptions)} />
      <div className="flex items-center gap-5">
        <ProgressRing value={s.score} size={96} stroke={8} label={s.score ?? '—'} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[14.5px] font-medium">{s.line}</p>
          {!nudge.due && <p className="text-[12.5px] text-ink-soft">{nudge.text}</p>}
        </div>
      </div>
      <span className="inline-flex items-center gap-1 self-start text-[13px] text-lilac-200">
        Open your timeline <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Card>
  )
}

function TodaysRoutine({ today }: { today: string }) {
  const db = useDb()
  const products = useProductMap()
  const due = todaysSteps(db.routines, new Date(), today)
  const done = due.filter((d) => d.done).length
  const hasSteps = db.routines.am.steps.length + db.routines.pm.steps.length > 0
  return (
    <Card className="p-5" data-testid="home-routine">
      <CardHeader
        icon={<CheckCircle2 />}
        title="Today’s routine"
        subtitle={due.length ? `${done} of ${due.length} done — each tick feeds your timeline` : hasSteps ? 'Nothing due today' : 'No routine yet'}
        action={
          <Button size="sm" variant="ghost" onClick={() => navigate('/routine')}>
            Edit <ArrowRight className="h-4 w-4" />
          </Button>
        }
      />
      {!hasSteps ? (
        <Button className="mt-4" onClick={() => navigate('/routine')}>
          Build your routine
        </Button>
      ) : (
        <div className="mt-3 space-y-1.5">
          {due.map(({ period, step, done: isDone }) => {
            const p = products.get(step.productId)
            if (!p) return null
            return (
              <button key={step.id} className="glass-inset flex w-full items-center gap-3 rounded-2xl p-2.5 text-left" onClick={() => mutate({ type: 'routine.toggleComplete', period, stepId: step.id, date: today })}>
                {isDone ? <CheckCircle2 className="h-5 w-5 shrink-0 text-mint-300" /> : <Circle className="h-5 w-5 shrink-0 text-ink-faint" />}
                {period === 'am' ? <Sun className="h-4 w-4 shrink-0 text-amber-300" /> : <Moon className="h-4 w-4 shrink-0 text-amber-200" />}
                <span className={cn('min-w-0 flex-1 truncate text-[14px]', isDone && 'text-ink-soft line-through')}>{p.name}</span>
                <span className="text-[12px] text-ink-faint">{label(p.category)}</span>
              </button>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function WhatsWorking() {
  const db = useDb()
  const products = useProductMap()
  const today = todayKey()
  const insights = useMemo(() => sinceStarted(db, today), [db, today])
  const working = whatsWorking(insights)
  const early = insights.filter((s) => s.early)
  return (
    <Card className="p-5" data-testid="home-working">
      <CardHeader icon={<TrendingUp />} title="What’s working" subtitle="From scans before and after you started each product — patterns, not proof." />
      <div className="mt-3 space-y-2">
        {working.length === 0 ? (
          <p className="text-[13.5px] text-ink-soft">
            {early.length ? `Too early to tell for ${early.length === 1 ? (products.get(early[0]!.productId)?.name ?? 'one product') : `${early.length} products`} — scan again after two weeks of use.` : 'Nothing clear yet. Scan before starting something new and again two weeks later, and SkinTwin will show what changed.'}
          </p>
        ) : (
          working.slice(0, 3).map((s) => (
            <p key={s.productId} className="glass-inset flex gap-2.5 rounded-2xl p-3 text-[13.5px]">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-mint-300" />
              {describeSince(s, products.get(s.productId)?.name ?? 'A product you removed')}
            </p>
          ))
        )}
      </div>
    </Card>
  )
}

function WhatToAvoid() {
  const db = useDb()
  const products = useProductMap()
  const a = whatToAvoid(db)
  if (!a.suspects.length && !a.avoidList.length && !a.reactedInRoutine.length)
    return (
      <Card className="flex items-center gap-4 p-5" data-testid="home-avoid">
        <ShieldAlert className="h-5 w-5 shrink-0 text-ink-soft" />
        <p className="flex-1 text-[13.5px] text-ink-soft">Nothing to avoid yet. If a product stings or breaks you out, log it with one tap and SkinTwin will look for the ingredient they share.</p>
      </Card>
    )
  return (
    <Card className="space-y-4 p-5" data-testid="home-avoid">
      <CardHeader icon={<ShieldAlert />} title="What to avoid" subtitle="From reactions you logged and your avoid list." />
      {a.reactedInRoutine.length > 0 && (
        <div className="space-y-1.5">
          {a.reactedInRoutine.map((r) => (
            <button key={r.productId} className="glass-inset flex w-full items-center gap-3 rounded-2xl p-2.5 text-left text-[13.5px]" onClick={() => navigate(`/product/${encodeURIComponent(r.productId)}`)}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-400" />
              <span className="flex-1">
                <b>{products.get(r.productId)?.name ?? 'A product'}</b> is still in your routine — you logged {r.count === 1 ? 'a reaction' : `${r.count} reactions`} to it.
              </span>
              <ArrowRight className="h-4 w-4 text-ink-faint" />
            </button>
          ))}
        </div>
      )}
      <SuspectList suspects={a.suspects} />
      {a.avoidList.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className="text-ink-soft">Avoid list:</span>
          {a.avoidList.map((x) => (
            <Badge key={x} size="sm" tone="danger">
              {x}
            </Badge>
          ))}
          <button className="ml-1 text-[12.5px] text-lilac-200 underline" onClick={() => navigate('/profile')}>
            Edit
          </button>
        </div>
      )}
    </Card>
  )
}

function DetectedProduct() {
  const db = useDb()
  const products = useProductMap()
  const detected = products.get(db.detected!.productId)!
  const match = useMatch(detected)
  return (
    <Card className="p-6">
      <CardHeader icon={<Globe />} title="Product detected in your browser" subtitle={`${db.detected!.retailer ?? ''} · ${formatDate(db.detected!.detectedAt, { hour: 'numeric', minute: '2-digit' })}`} />
      <div className="mt-4 flex gap-4">
        <ProductArt product={detected} size={96} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-ink-soft">{detected.brand}</p>
          <p className="line-clamp-2 text-lg font-semibold">{detected.name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <MatchBadge match={match} />
            <PriceTag product={detected} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="primary" onClick={() => navigate(`/product/${encodeURIComponent(detected.id)}`)}>
            Details <ArrowRight className="h-4 w-4" />
          </Button>
          <Button onClick={() => window.skintwin.companion.show({ type: 'analyze-product', productId: detected.id })}>
            <MessageCircle className="h-4 w-4" /> Ask
          </Button>
        </div>
      </div>
    </Card>
  )
}

function Picks() {
  const db = useDb()
  const products = useProductMap()
  const catalog = useCatalog()
  const owned = useOwnedIds()
  const matchCtx = useMatchContext()
  const low = db.inventory.filter((i) => i.status === 'running_low')
  const recs = recommend({ catalog, profile: db.profile, ownedIds: owned, ...matchCtx, gaps: routineGaps(db.routines, products), limit: 3 })
  if (!recs.length && !low.length) return null
  return (
    <Card className="p-5">
      <CardHeader
        icon={<Sparkles />}
        title="Picked for your skin"
        subtitle={low.length ? `${low.length} product${low.length > 1 ? 's' : ''} running low` : db.profile.skinType ? `For ${label(db.profile.skinType).toLowerCase()} skin` : undefined}
        action={
          <div className="flex gap-1">
            {low.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => navigate('/inventory')}>
                <Hourglass className="h-4 w-4" /> Restock
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => navigate('/shop')}>
              View all <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />
      <div className="mt-4 grid grid-cols-3 gap-4 max-[1500px]:grid-cols-2">
        {recs.map((r) => (
          <ProductCard key={r.product.id} product={r.product} reason={r.reason} />
        ))}
      </div>
    </Card>
  )
}
