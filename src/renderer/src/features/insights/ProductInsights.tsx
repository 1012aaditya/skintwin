import { ArrowLeftRight, CheckCircle2, ChevronRight, CircleAlert, FlaskConical, Layers, Lightbulb, MessageCircle, Plus, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { analyzeIngredients } from '@shared/ingredients'
import { label, type Product, type ProductCategory } from '@shared/models'
import { alternativesFor, type MatchResult } from '@shared/scoring'
import { MatchBadge, PriceTag, ProductActionBar, ProductArt, SourceBadge } from '@renderer/components/products'
import { Badge, Button, Card, CardHeader, EmptyState, ProgressRing, SectionTitle, Tabs } from '@renderer/components/ui'
import { cn } from '@renderer/lib/cn'
import { formatDate } from '@renderer/lib/format'
import { navigate } from '@renderer/lib/router'
import { useCatalog, useDb, useMatch, useOwnedIds, useRoutineProducts } from '@renderer/lib/store'

const ROUTINE_ORDER: ProductCategory[] = ['cleanser', 'toner', 'essence', 'serum', 'treatment', 'exfoliant', 'eye', 'moisturizer', 'sunscreen']

export function ProductInsights({ productId }: { productId: string }) {
  const db = useDb()
  const product = db.products.find((p) => p.id === productId)
  const match = useMatch(product)
  const [tab, setTab] = useState<'overview' | 'ingredients' | 'compatibility' | 'alternatives'>('overview')
  if (!product || !match) return <EmptyState title="Product not found" body="It may have been removed." action={<Button onClick={() => navigate('/discover')}>Back to Discover</Button>} />
  return (
    <div className="grid grid-cols-[380px_minmax(0,1fr)] gap-6 max-[1180px]:grid-cols-1">
      <div className="space-y-5">
        <SectionTitle eyebrow="Product insights" title={<>Deep dive into<br />your product</>} />
        <ProductHero product={product} />
      </div>
      <div className="space-y-5">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'overview', label: 'Overview', icon: <Layers /> },
            { value: 'ingredients', label: 'Ingredients', icon: <FlaskConical /> },
            { value: 'compatibility', label: 'Compatibility', icon: <ShieldCheck /> },
            { value: 'alternatives', label: 'Alternatives', icon: <Sparkles /> }
          ]}
        />
        {tab === 'overview' && <Overview product={product} match={match} onTab={setTab} />}
        {tab === 'ingredients' && <IngredientsTab product={product} />}
        {tab === 'compatibility' && <CompatibilityTab match={match} />}
        {tab === 'alternatives' && <AlternativesTab product={product} />}
      </div>
    </div>
  )
}

function ProductHero({ product }: { product: Product }) {
  const owned = useOwnedIds().has(product.id)
  return (
    <Card strong className="overflow-hidden p-5">
      <ProductArt product={product} size={340} className="mx-auto w-full rounded-[22px]" />
      <h2 className="mt-4 text-[24px] leading-tight font-semibold">{product.brand ? `${product.brand} ` : ''}{product.name}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {label(product.category)}
        {product.sizeMl ? ` · ${product.sizeMl} mL` : ''}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PriceTag product={product} />
        <SourceBadge product={product} />
        {owned && <Badge tone="success" size="sm"><CheckCircle2 className="h-3 w-3" /> In your inventory</Badge>}
      </div>
      <p className="mt-2 text-[11.5px] text-ink-faint">
        Source: {product.source.label} · {formatDate(product.source.fetchedAt)}
      </p>
      <div className="mt-4">
        <ProductActionBar product={product} compact />
      </div>
      <Button className="mt-3 w-full" variant="primary" onClick={() => window.skintwin.companion.show({ type: 'analyze-product', productId: product.id })}>
        <MessageCircle className="h-4 w-4" /> Ask SkinTwin about this
      </Button>
    </Card>
  )
}

function Overview({ product, match, onTab }: { product: Product; match: MatchResult; onTab: (t: 'ingredients' | 'alternatives') => void }) {
  const db = useDb()
  const catalog = useCatalog()
  const routineProducts = useRoutineProducts()
  const alts = alternativesFor(product, catalog, db.profile, routineProducts).filter((a) => (a.match.score ?? 0) > (match.score ?? 0)).slice(0, 3)
  return (
    <div className="grid grid-cols-2 gap-5 max-[1400px]:grid-cols-1">
      <Card className="p-5">
        <CardHeader icon={<Sparkles />} title="Product summary" />
        <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">{product.description ?? 'No description available from the source.'}</p>
        {product.claims.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {product.claims.map((c) => (
              <Badge key={c} tone="lilac" size="sm" title="Claim reported by the brand/source">
                {c}
              </Badge>
            ))}
          </div>
        )}
      </Card>
      <Card strong className="p-5">
        <CardHeader icon={<ShieldCheck />} title="Your compatibility" subtitle="Rule-based estimate from ingredients + your profile" />
        <div className="mt-4 flex items-center gap-5">
          <ProgressRing value={match.score} size={118} label={match.score == null ? '—' : `${match.score}%`} sublabel="Match" />
          <ul className="flex-1 space-y-2 text-[13.5px]">
            <li className="font-semibold">{match.headline}</li>
            {match.positives.slice(0, 3).map((p) => (
              <li key={p.text} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint-300" />
                {p.text}
              </li>
            ))}
            {match.mismatches.slice(0, 2).map((p) => (
              <li key={p.text} className="flex gap-2">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                {p.text}
              </li>
            ))}
          </ul>
        </div>
      </Card>
      <Card className="p-5">
        <CardHeader
          icon={<FlaskConical />}
          title={`Key ingredients (${match.identified.length})`}
          action={
            <Button size="sm" variant="ghost" onClick={() => onTab('ingredients')}>
              Full list <ChevronRight className="h-4 w-4" />
            </Button>
          }
        />
        <div className="mt-3 space-y-2">
          {match.identified.length === 0 && <p className="text-sm text-ink-soft">{product.ingredients.length ? 'None of the listed ingredients are in SkinTwin’s reference yet.' : 'No ingredient list available.'}</p>}
          {match.identified.slice(0, 4).map((i) => (
            <div key={i.id} className="glass-inset rounded-2xl p-3">
              <p className="flex items-center gap-2 text-[14px] font-semibold">
                {i.name}
                <Badge size="sm" tone={i.flags.length ? 'warn' : 'lilac'}>
                  {i.role}
                </Badge>
              </p>
              <p className="mt-1 text-[12.5px] text-ink-soft">{i.description}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <CardHeader icon={<Sparkles />} title="Better for your goals" subtitle="Higher rule-based match in the same category or with the same active." />
        <div className="mt-3 space-y-2">
          {alts.length === 0 ? (
            <p className="text-sm text-ink-soft">No higher-matching alternatives in the catalog.</p>
          ) : (
            alts.map((a) => (
              <button key={a.product.id} className="glass-inset flex w-full items-center gap-3 rounded-2xl p-2.5 text-left hover:bg-white/10" onClick={() => navigate(`/product/${encodeURIComponent(a.product.id)}`)}>
                <ProductArt product={a.product} size={48} className="rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{a.product.brand} {a.product.name}</span>
                  <span className="block truncate text-[12px] text-ink-soft">{a.match.positives[0]?.text ?? label(a.product.category)}</span>
                </span>
                <MatchBadge match={a.match} size="sm" />
              </button>
            ))
          )}
          {alts.length > 0 && (
            <Button size="sm" className="mt-1" onClick={() => navigate(`/compare?ids=${[product.id, ...alts.map((a) => a.product.id)].map(encodeURIComponent).join(',')}`)}>
              <ArrowLeftRight className="h-4 w-4" /> Compare side-by-side
            </Button>
          )}
        </div>
      </Card>
      <RoutineFit product={product} />
    </div>
  )
}

function RoutineFit({ product }: { product: Product }) {
  const steps = ROUTINE_ORDER.filter((c) => ['cleanser', 'serum', 'treatment', 'moisturizer', 'sunscreen'].includes(c) || c === product.category)
  const inOrder = ROUTINE_ORDER.includes(product.category)
  return (
    <Card className="col-span-full flex items-center gap-6 p-5 max-[1180px]:flex-col max-[1180px]:items-start">
      <div className="max-w-xs">
        <CardHeader icon={<Lightbulb />} title="How it fits your routine" />
        <p className="mt-2 text-[13px] text-ink-soft">
          {inOrder ? `Usually applied as the ${label(product.category).toLowerCase()} step, thinnest to thickest.` : 'This product type doesn’t have a standard position.'}
          {product.category === 'sunscreen' && ' Morning only, as the last step.'}
        </p>
      </div>
      <div className="flex flex-1 items-center gap-2">
        {steps.map((c, i) => (
          <div key={c} className="flex flex-1 items-center gap-2">
            <div className={cn('flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-3 text-center text-[12.5px]', c === product.category ? 'border border-mint-300/60 bg-mint-400/15 text-mint-300' : 'glass-inset text-ink-soft')}>
              {label(c)}
              {c === product.category && <span className="text-[11px]">(this product)</span>}
            </div>
            {i < steps.length - 1 && <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />}
          </div>
        ))}
      </div>
    </Card>
  )
}

function IngredientsTab({ product }: { product: Product }) {
  const rows = analyzeIngredients(product.ingredients)
  if (!rows.length)
    return <EmptyState icon={<FlaskConical />} title="No ingredient list" body="SkinTwin couldn’t find ingredients for this product. Check the packaging or brand page. Without them, compatibility can’t be estimated." />
  return (
    <Card className="p-5">
      <CardHeader icon={<FlaskConical />} title={`Ingredient list (${rows.length})`} subtitle={product.source.verified ? 'Verified source' : product.source.kind === 'demo_catalog' ? 'Demo catalog — key ingredients only, not the full INCI list.' : 'As read from the source — unverified.'} />
      <ol className="mt-4 divide-y divide-white/8">
        {rows.map((r, i) => (
          <li key={`${r.inci}-${i}`} className="flex items-start gap-4 py-2.5">
            <span className="w-6 pt-0.5 text-right text-xs text-ink-faint">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className={cn('text-[14px]', r.info && 'font-semibold')}>{r.inci}</p>
              {r.info && <p className="text-[12.5px] text-ink-soft">{r.info.description}</p>}
            </div>
            {r.info && (
              <div className="flex flex-wrap justify-end gap-1">
                <Badge size="sm" tone="lilac">{r.info.role}</Badge>
                {r.info.flags.includes('fragrance') && <Badge size="sm" tone="warn">Fragrance</Badge>}
                {r.info.flags.includes('drying_alcohol') && <Badge size="sm" tone="warn">Drying alcohol</Badge>}
                {r.info.flags.includes('potentially_comedogenic') && <Badge size="sm" tone="warn">Heavier emollient</Badge>}
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-ink-faint">Ingredients are listed in descending concentration down to 1%; explanations describe common cosmetic uses, not guaranteed effects.</p>
    </Card>
  )
}

function CompatibilityTab({ match }: { match: MatchResult }) {
  const db = useDb()
  return (
    <div className="grid grid-cols-2 gap-5 max-[1280px]:grid-cols-1">
      <Card strong className="col-span-full flex items-center gap-6 p-6">
        <ProgressRing value={match.score} size={130} label={match.score == null ? '—' : `${match.score}%`} sublabel="Match" />
        <div>
          <p className="text-xl font-semibold">{match.headline}</p>
          <p className="mt-1 max-w-xl text-[13.5px] text-ink-soft">
            SkinTwin compares the ingredient list with the profile you entered ({label(db.profile.skinType)} skin{db.profile.concerns.length ? `, ${db.profile.concerns.map(label).join(', ').toLowerCase()}` : ''}). It’s a transparent rule-based estimate, not a clinical test — every point is explained below.
          </p>
        </div>
      </Card>
      <ReasonList title="Why it may suit you" icon={<CheckCircle2 className="text-mint-300" />} items={match.positives.map((p) => p.text)} empty="No specific matches with your concerns or goals." />
      <ReasonList title="Preference mismatches" icon={<CircleAlert className="text-rose-300" />} items={match.mismatches.map((p) => p.text)} empty="No conflicts with your preferences." />
      <ReasonList title="Things to know" icon={<TriangleAlert className="text-amber-300" />} items={match.cautions} empty="No cautions." />
      <ReasonList title="Routine overlap" icon={<Layers className="text-lilac-200" />} items={match.routineOverlap.map((o) => o.text)} empty="Doesn’t duplicate an active already in your routine." />
    </div>
  )
}

function ReasonList({ title, icon, items, empty }: { title: string; icon: React.ReactNode; items: string[]; empty: string }) {
  return (
    <Card className="p-5">
      <CardHeader icon={icon} title={title} />
      <ul className="mt-3 space-y-2 text-[13.5px]">
        {items.length ? items.map((t) => <li key={t} className="glass-inset rounded-2xl px-3 py-2">{t}</li>) : <li className="text-ink-soft">{empty}</li>}
      </ul>
    </Card>
  )
}

function AlternativesTab({ product }: { product: Product }) {
  const db = useDb()
  const catalog = useCatalog()
  const routineProducts = useRoutineProducts()
  const alts = alternativesFor(product, catalog, db.profile, routineProducts)
  if (!alts.length) return <EmptyState title="No alternatives found" body="There are no similar products in the catalog yet." />
  return (
    <Card className="p-5">
      <CardHeader icon={<Sparkles />} title="Alternatives" subtitle="Same category or same key active, ranked by your rule-based match." />
      <div className="mt-3 space-y-2">
        {alts.map((a) => (
          <div key={a.product.id} className="glass-inset flex items-center gap-3 rounded-2xl p-3">
            <ProductArt product={a.product} size={56} className="rounded-xl" />
            <button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/product/${encodeURIComponent(a.product.id)}`)}>
              <p className="truncate font-semibold">{a.product.brand} {a.product.name}</p>
              <p className="truncate text-[12.5px] text-ink-soft">{a.match.positives[0]?.text ?? a.match.headline}</p>
            </button>
            <PriceTag product={a.product} />
            <MatchBadge match={a.match} size="sm" />
            <Button size="sm" onClick={() => navigate(`/compare?ids=${[product.id, a.product.id].map(encodeURIComponent).join(',')}`)}>
              <ArrowLeftRight className="h-4 w-4" /> Compare
            </Button>
          </div>
        ))}
      </div>
      <Button className="mt-4" variant="primary" onClick={() => navigate(`/compare?ids=${[product.id, ...alts.slice(0, 2).map((a) => a.product.id)].map(encodeURIComponent).join(',')}`)}>
        <Plus className="h-4 w-4" /> Compare top alternatives
      </Button>
    </Card>
  )
}
