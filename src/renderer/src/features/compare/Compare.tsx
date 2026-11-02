import { ArrowLeft, CheckCircle2, Crown, FlaskConical, Grid2x2, ListChecks, Plus, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { INGREDIENTS } from '@shared/ingredients'
import { label, type Product } from '@shared/models'
import { alternativesFor, computeMatch, pricePerMl, type MatchResult } from '@shared/scoring'
import { Orb } from '@renderer/components/Orb'
import { MatchBadge, PriceTag, ProductArt, ProductPicker, RoutinePeriodDialog, SourceBadge } from '@renderer/components/products'
import { Badge, Button, Card, EmptyState } from '@renderer/components/ui'
import { cn } from '@renderer/lib/cn'
import { formatPrice } from '@renderer/lib/format'
import { navigate, useRoute } from '@renderer/lib/router'
import { useCatalog, useDb, useMatchContext, useProductMap } from '@renderer/lib/store'

type View = 'side' | 'differences' | 'ingredients' | 'recommendation'

export function Compare() {
  const db = useDb()
  const { query } = useRoute()
  const products = useProductMap()
  const catalog = useCatalog()
  const matchCtx = useMatchContext()
  const [view, setView] = useState<View>('side')
  const [adding, setAdding] = useState(false)
  const [useFor, setUseFor] = useState<Product | null>(null)

  const ids = (query.get('ids') ?? '').split(',').map(decodeURIComponent).filter((id) => products.has(id))
  // A single product → auto-fill with its two best alternatives.
  useEffect(() => {
    if (ids.length === 1) {
      const base = products.get(ids[0]!)!
      const alts = alternativesFor(base, catalog, db.profile, matchCtx).slice(0, 2)
      if (alts.length) navigate(`/compare?ids=${[base.id, ...alts.map((a) => a.product.id)].map(encodeURIComponent).join(',')}`)
    }
  }, [ids.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => ids.map((id) => products.get(id)!).map((p) => ({ product: p, match: computeMatch(p, db.profile, matchCtx) })), [ids.join(','), products, db.profile, matchCtx]) // eslint-disable-line react-hooks/exhaustive-deps
  const setIds = (next: string[]) => navigate(`/compare?ids=${next.map(encodeURIComponent).join(',')}`)
  const best = [...rows].filter((r) => r.match.score != null).sort((a, b) => b.match.score! - a.match.score!)[0]
  const bestValue = [...rows].filter((r) => pricePerMl(r.product) != null).sort((a, b) => pricePerMl(a.product)! - pricePerMl(b.product)!)[0]

  return (
    <div className="grid grid-cols-[260px_minmax(0,1fr)] gap-6 max-[1180px]:grid-cols-1">
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => history.back()}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div>
          <h1 className="text-[28px] font-semibold">Product comparison</h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">Compare products against your skin profile and routine.</p>
        </div>
        <nav className="space-y-1.5">
          {(
            [
              ['side', 'Side-by-side', <Grid2x2 key="s" />],
              ['differences', 'Key differences', <ListChecks key="d" />],
              ['ingredients', 'Ingredient focus', <FlaskConical key="i" />],
              ['recommendation', 'Our recommendation', <Sparkles key="r" />]
            ] as const
          ).map(([v, t, icon]) => (
            <button key={v} onClick={() => setView(v)} className={cn('flex h-12 w-full items-center gap-3 rounded-2xl px-4 text-[14.5px] transition-colors [&_svg]:h-5 [&_svg]:w-5', view === v ? 'bg-gradient-to-r from-lilac-500/80 to-[#b88cff]/70 text-white shadow-glow' : 'glass-inset text-ink-soft hover:text-ink')}>
              {icon}
              {t}
            </button>
          ))}
        </nav>
        {rows.length < 4 && (
          <Button className="w-full" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add product
          </Button>
        )}
      </div>

      <div className="space-y-5">
        {rows.length === 0 ? (
          <EmptyState title="Nothing to compare yet" body="Add two or more products." action={<Button variant="primary" onClick={() => setAdding(true)}>Add product</Button>} />
        ) : (
          <>
            <Card className="overflow-x-auto p-4">
              <div className="grid min-w-[720px] gap-3" style={{ gridTemplateColumns: `170px repeat(${rows.length}, minmax(0,1fr))` }}>
                <div />
                {rows.map(({ product, match }, i) => (
                  <div key={product.id} className={cn('relative rounded-[22px] p-3', i === 0 ? 'border border-lilac-300/60 bg-lilac-400/12 shadow-glow-soft' : 'glass-inset')}>
                    <button aria-label="Remove from comparison" className="absolute top-2 right-2 grid h-6 w-6 place-items-center rounded-full hover:bg-white/15" onClick={() => setIds(ids.filter((x) => x !== product.id))}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <Badge tone={i === 0 ? 'lilac' : 'neutral'} size="sm">
                      {i === 0 ? 'Current product' : best?.product.id === product.id ? 'Best match' : 'Alternative'}
                    </Badge>
                    <div className="mt-2 flex gap-3">
                      <ProductArt product={product} size={72} className="rounded-xl" />
                      <div className="min-w-0">
                        <button className="line-clamp-3 text-left text-[14px] leading-snug font-semibold hover:underline" onClick={() => navigate(`/product/${encodeURIComponent(product.id)}`)}>
                          {product.brand} {product.name}
                        </button>
                        <p className="text-[12px] text-ink-soft">
                          {label(product.category)}
                          {product.sizeMl ? ` · ${product.sizeMl} mL` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <PriceTag product={product} />
                      <SourceBadge product={product} />
                    </div>
                    <Button size="sm" className="mt-2 w-full" onClick={() => setUseFor(product)}>
                      Add to routine
                    </Button>
                    {match.basis === 'no_ingredients' && <p className="mt-1 text-[11px] text-amber-200">No ingredient data</p>}
                  </div>
                ))}
                {view === 'side' && <SideBySide rows={rows} bestId={best?.product.id} bestValueId={bestValue?.product.id} />}
                {view === 'differences' && <Differences rows={rows} />}
                {view === 'ingredients' && <IngredientFocus rows={rows} />}
              </div>
            </Card>
            {(view === 'recommendation' || view === 'side') && best && (
              <Card strong className="flex items-center gap-5 p-5">
                <Orb size={84} mood="happy" />
                <div className="flex-1">
                  <p className="flex items-center gap-2 text-lg font-semibold">
                    <Sparkles className="h-4 w-4 text-blush-300" /> SkinTwin’s take
                  </p>
                  <p className="mt-1 text-[14px] text-ink-soft">{recommendationText(rows, best, bestValue)}</p>
                </div>
                <Button variant="primary" size="lg" onClick={() => setUseFor(best.product)}>
                  Use this recommendation
                </Button>
              </Card>
            )}
          </>
        )}
      </div>
      <ProductPicker open={adding} onClose={() => setAdding(false)} title="Add to comparison" onPick={(id) => setIds([...new Set([...ids, id])])} />
      {useFor && <RoutinePeriodDialog open onClose={() => setUseFor(null)} product={useFor} />}
    </div>
  )
}

type Row = { product: Product; match: MatchResult }

function recommendationText(rows: Row[], best: Row, bestValue?: Row) {
  const close = rows.filter((r) => r !== best && r.match.score != null && best.match.score! - r.match.score! <= 3)
  const reason = best.match.positives[0]?.text ?? 'it has the fewest conflicts with your preferences'
  let t = `${best.product.brand} ${best.product.name} has the highest rule-based match (${best.match.score}%) — ${reason.charAt(0).toLowerCase()}${reason.slice(1)}.`
  if (close.length) t += ` ${close.map((c) => c.product.name).join(' and ')} ${close.length > 1 ? 'are' : 'is'} within a few points, so personal preference matters here.`
  if (bestValue && bestValue !== best) t += ` ${bestValue.product.name} has the lowest listed price per mL${bestValue.product.price?.verified ? '' : ' (prices unverified)'}.`
  return t
}

function Cell({ children, highlight }: { children: ReactNode; highlight?: boolean }) {
  return <div className={cn('flex items-center justify-center rounded-xl px-2 py-2.5 text-center text-[13.5px]', highlight && 'text-mint-300 font-semibold')}>{children}</div>
}
function RowLabel({ children }: { children: ReactNode }) {
  return <div className="flex items-center border-t border-white/8 py-2.5 text-[13.5px] font-medium text-ink-soft">{children}</div>
}

function SideBySide({ rows, bestId, bestValueId }: { rows: Row[]; bestId?: string; bestValueId?: string }) {
  const line = (title: string, render: (r: Row) => ReactNode, hl?: (r: Row) => boolean) => (
    <>
      <RowLabel>{title}</RowLabel>
      {rows.map((r) => (
        <div key={r.product.id} className="border-t border-white/8">
          <Cell highlight={hl?.(r)}>{render(r)}</Cell>
        </div>
      ))}
    </>
  )
  return (
    <>
      {line('Skin match', (r) => (
        <span className="flex items-center gap-1.5">
          {r.product.id === bestId && <Crown className="h-4 w-4 text-amber-300" />}
          <MatchBadge match={r.match} size="sm" />
        </span>
      ))}
      {line('Key actives', (r) => r.match.identified.filter((i) => i.activeGroup || i.helps.length).slice(0, 3).map((i) => i.name).join(', ') || '—')}
      {line('Best for', (r) => r.match.positives.slice(0, 2).map((p) => p.text.split(' — ')[0]).join('; ') || '—')}
      {line('Preference conflicts', (r) => (r.match.mismatches.length ? <span className="text-rose-200">{r.match.mismatches.map((m) => m.text.split(' — ')[0]).join('; ')}</span> : <span className="flex items-center gap-1 text-mint-300"><CheckCircle2 className="h-4 w-4" /> None</span>))}
      {line('Fragrance', (r) => (r.product.ingredients.length === 0 ? 'Unknown' : r.match.identified.some((i) => i.flags.includes('fragrance')) ? 'Contains fragrance' : 'None listed'))}
      {line('Routine overlap', (r) => (r.match.routineOverlap.length ? 'Duplicates an active you use' : 'No overlap'))}
      {line('Price', (r) => formatPrice(r.product.price) ?? 'Unknown')}
      {line('Price / mL', (r) => (pricePerMl(r.product) != null ? `${formatPrice({ ...r.product.price!, amount: pricePerMl(r.product)! })?.replace(/\.00$/, '')} / mL` : '—'), (r) => r.product.id === bestValueId && rows.length > 1)}
      {line('Source', (r) => (r.product.source.kind === 'demo_catalog' ? 'Demo catalog' : r.product.source.label))}
    </>
  )
}

function Differences({ rows }: { rows: Row[] }) {
  const sets = rows.map((r) => new Set(r.match.identified.map((i) => i.id)))
  return (
    <>
      <RowLabel>Unique actives</RowLabel>
      {rows.map((r, idx) => {
        const unique = r.match.identified.filter((i) => sets.every((s, j) => j === idx || !s.has(i.id)))
        return (
          <div key={r.product.id} className="border-t border-white/8 py-2.5 text-center text-[13.5px]">
            {unique.length ? unique.map((u) => u.name).join(', ') : 'None'}
          </div>
        )
      })}
      <RowLabel>Mismatches</RowLabel>
      {rows.map((r) => (
        <div key={r.product.id} className="border-t border-white/8 py-2.5 text-center text-[13px] text-ink-soft">
          {r.match.mismatches.map((m) => m.text).join(' ') || '—'}
        </div>
      ))}
      <RowLabel>Cautions</RowLabel>
      {rows.map((r) => (
        <div key={r.product.id} className="border-t border-white/8 py-2.5 text-center text-[12.5px] text-ink-soft">
          {r.match.cautions.slice(0, 2).join(' ') || '—'}
        </div>
      ))}
    </>
  )
}

function IngredientFocus({ rows }: { rows: Row[] }) {
  const ids = [...new Set(rows.flatMap((r) => r.match.identified.map((i) => i.id)))]
  return (
    <>
      {ids.map((id) => {
        const info = INGREDIENTS.find((i) => i.id === id)!
        return (
          <div key={id} className="contents">
            <RowLabel>
              <span title={info.description}>{info.name}</span>
            </RowLabel>
            {rows.map((r) => (
              <div key={r.product.id} className="border-t border-white/8">
                <Cell>{r.match.identified.some((i) => i.id === id) ? <CheckCircle2 className={cn('h-5 w-5', info.flags.length ? 'text-amber-300' : 'text-mint-300')} /> : <span className="text-ink-faint">—</span>}</Cell>
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}
