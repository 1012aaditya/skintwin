import { ArrowRight, Box, Camera, Globe, Hourglass, MessageCircle, Mic, Moon, Sparkles, Sun } from 'lucide-react'
import { label } from '@shared/models'
import { prettyAccelerator } from '@shared/shortcuts'
import { recommend, routineGaps } from '@shared/scoring'
import { Orb } from '@renderer/components/Orb'
import { MatchBadge, PriceTag, ProductArt, ProductCard } from '@renderer/components/products'
import { Badge, Button, Card, CardHeader, ProgressRing } from '@renderer/components/ui'
import { formatDate, greeting } from '@renderer/lib/format'
import { navigate } from '@renderer/lib/router'
import { todayKey, useCatalog, useDb, useMatch, useOwnedIds, useMatchContext, useProductMap } from '@renderer/lib/store'
import { summaryScore } from '../analysis/Analyze'
import { profileCompleteness } from '../profile/fields'

export function Discover() {
  const db = useDb()
  const products = useProductMap()
  const catalog = useCatalog()
  const owned = useOwnedIds()
  const matchCtx = useMatchContext()
  const detected = db.detected ? products.get(db.detected.productId) : undefined
  const detectedMatch = useMatch(detected)
  const latest = db.analyses[0]
  const today = todayKey()
  const routineStat = (['am', 'pm'] as const).map((p) => {
    const steps = db.routines[p].steps.filter((s) => s.enabled)
    return { p, total: steps.length, done: steps.filter((s) => s.completions.includes(today)).length }
  })
  const low = db.inventory.filter((i) => i.status === 'running_low')
  const recs = recommend({ catalog, profile: db.profile, ownedIds: owned, ...matchCtx, gaps: routineGaps(db.routines, products), limit: 3 })
  const completeness = profileCompleteness(db.profile)
  const lastConv = db.conversations[0]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-6 max-[1180px]:grid-cols-1">
        <Card strong className="relative flex items-center gap-8 overflow-hidden p-8">
          <Orb size={170} mood="happy" />
          <div className="min-w-0">
            <p className="text-[13px] tracking-[0.25em] text-ink-soft uppercase">{greeting()}{db.displayName ? `, ${db.displayName}` : ''}</p>
            <h1 className="mt-2 text-[38px] leading-tight font-semibold text-gradient">Here when you need me ✨</h1>
            <p className="mt-2 max-w-md text-ink-soft">Ask about any product, check what you’re browsing, or keep your routine on track.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="primary" size="lg" onClick={() => window.skintwin.companion.show({ type: 'listen' })}>
                <Mic className="h-4 w-4" /> Ask SkinTwin
              </Button>
              <Button size="lg" onClick={() => navigate('/analyze')}>
                <Camera className="h-4 w-4" /> Analyze skin
              </Button>
            </div>
            <p className="mt-3 text-xs text-ink-faint">From any app: {prettyAccelerator(db.settings.companion.shortcut)} shows SkinTwin · {prettyAccelerator(db.settings.companion.voiceShortcut)} to talk</p>
          </div>
        </Card>

        {detected ? (
          <Card className="p-6">
            <CardHeader icon={<Globe />} title="Product detected in your browser" subtitle={`${db.detected!.retailer ?? ''} · ${formatDate(db.detected!.detectedAt, { hour: 'numeric', minute: '2-digit' })}`} />
            <div className="mt-4 flex gap-4">
              <ProductArt product={detected} size={110} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-ink-soft">{detected.brand}</p>
                <p className="line-clamp-2 text-lg font-semibold">{detected.name}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <MatchBadge match={detectedMatch} />
                  <PriceTag product={detected} />
                </div>
                <p className="mt-2 line-clamp-2 text-[13px] text-ink-soft">{detectedMatch?.headline}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="primary" onClick={() => navigate(`/product/${encodeURIComponent(detected.id)}`)}>
                See detailed analysis <ArrowRight className="h-4 w-4" />
              </Button>
              <Button onClick={() => window.skintwin.companion.show({ type: 'analyze-product', productId: detected.id })}>
                <MessageCircle className="h-4 w-4" /> Ask about it
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="flex flex-col justify-between p-6">
            <CardHeader icon={<Globe />} title="Shopping for skincare?" subtitle="Click the SkinTwin browser extension on any product page and the companion will check it against your profile." />
            <Button className="mt-4 self-start" onClick={() => navigate('/settings?tab=browser')}>
              Set up browser extension
            </Button>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-4 gap-5 max-[1280px]:grid-cols-2">
        {routineStat.map((r) => (
          <Card key={r.p} className="flex items-center gap-4 p-5" role="button" onClick={() => navigate('/routine')}>
            <ProgressRing value={r.total ? (r.done / r.total) * 100 : null} size={72} stroke={7} label={`${r.done}/${r.total}`} tone="lilac" />
            <div>
              <p className="flex items-center gap-1.5 font-semibold">{r.p === 'am' ? <Sun className="h-4 w-4 text-amber-300" /> : <Moon className="h-4 w-4 text-amber-200" />} {r.p === 'am' ? 'Morning' : 'Evening'}</p>
              <p className="text-[13px] text-ink-soft">{r.total ? 'steps done today' : 'No steps yet'}</p>
            </div>
          </Card>
        ))}
        <Card className="flex items-center gap-4 p-5" role="button" onClick={() => navigate(latest ? '/progress' : '/analyze')}>
          <ProgressRing value={latest ? summaryScore(latest).value : null} size={72} stroke={7} label={latest ? summaryScore(latest).value ?? '—' : '—'} />
          <div>
            <p className="font-semibold">Skin analysis</p>
            <p className="text-[13px] text-ink-soft">{latest ? `${formatDate(latest.createdAt)}${latest.isMock ? ' · mock' : ''}` : 'Not analysed yet'}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 p-5" role="button" onClick={() => navigate(low.length ? '/inventory' : '/profile')}>
          {low.length ? (
            <>
              <span className="grid h-[72px] w-[72px] place-items-center rounded-full bg-amber-300/15 text-amber-300">
                <Hourglass className="h-7 w-7" />
              </span>
              <div>
                <p className="font-semibold">{low.length} running low</p>
                <p className="text-[13px] text-ink-soft">See restock options</p>
              </div>
            </>
          ) : (
            <>
              <ProgressRing value={completeness} size={72} stroke={7} />
              <div>
                <p className="font-semibold">Profile</p>
                <p className="text-[13px] text-ink-soft">{completeness === 100 ? 'Complete' : 'Add more details'}</p>
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-5 max-[1280px]:grid-cols-1">
        <Card className="p-5">
          <CardHeader icon={<Sparkles />} title="Picked for your skin" subtitle={db.profile.skinType ? `For ${label(db.profile.skinType).toLowerCase()} skin` : undefined} action={<Button size="sm" variant="ghost" onClick={() => navigate('/shop')}>View all <ArrowRight className="h-4 w-4" /></Button>} />
          <div className="mt-4 grid grid-cols-3 gap-4 max-[1500px]:grid-cols-2">
            {recs.map((r) => (
              <ProductCard key={r.product.id} product={r.product} reason={r.reason} />
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <CardHeader icon={<MessageCircle />} title="Recent with SkinTwin" />
          {lastConv ? (
            <div className="mt-3 space-y-2">
              {lastConv.messages.slice(-4).map((m) => (
                <p key={m.id} className={m.role === 'user' ? 'ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-lilac-400/30 px-3 py-2 text-[13px]' : 'glass-inset w-fit max-w-[90%] rounded-2xl rounded-bl-md px-3 py-2 text-[13px]'}>
                  {m.text}
                </p>
              ))}
              {lastConv.messages.some((m) => m.provider === 'rules') && <Badge size="sm">Offline rule-based answers</Badge>}
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">Conversations appear here. Try asking “What should I use for oily skin?”</p>
          )}
          <div className="mt-4 flex items-center gap-2 text-[13px] text-ink-soft">
            <Box className="h-4 w-4" /> {owned.size} products owned · {db.saved.length} saved
          </div>
        </Card>
      </div>
    </div>
  )
}
