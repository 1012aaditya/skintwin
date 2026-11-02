import { ArrowLeftRight, ExternalLink, Heart, Info, Search, ShieldCheck, Sparkles, Store } from 'lucide-react'
import { useMemo, useState } from 'react'
import { label, type ProductCategory } from '@shared/models'
import { recommend, routineGaps } from '@shared/scoring'
import { ProductCard, useProductActions } from '@renderer/components/products'
import { Button, Card, CardHeader, EmptyState, Input, SectionTitle } from '@renderer/components/ui'
import { cn } from '@renderer/lib/cn'
import { navigate } from '@renderer/lib/router'
import { useCatalog, useDb, useOwnedIds, useProductMap, useMatchContext, useProviders } from '@renderer/lib/store'
import type { Product } from '@shared/models'

export function Shop() {
  const db = useDb()
  const providers = useProviders()
  const catalog = useCatalog()
  const products = useProductMap()
  const owned = useOwnedIds()
  const matchCtx = useMatchContext()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<ProductCategory | 'all'>('all')
  const [brand, setBrand] = useState<string | null>(null)
  const gaps = routineGaps(db.routines, products)
  const recs = useMemo(() => recommend({ catalog, profile: db.profile, ownedIds: owned, ...matchCtx, gaps, limit: 3 }), [catalog, db.profile, owned, matchCtx, gaps])
  const brands = [...new Set(catalog.map((p) => p.brand))].sort()
  const cats = [...new Set(catalog.map((p) => p.category))]
  const browse = catalog.filter((p) => (cat === 'all' || p.category === cat) && (!brand || p.brand === brand) && `${p.brand} ${p.name}`.toLowerCase().includes(q.toLowerCase()))
  const hasPartners = db.partners.some((p) => !p.isDemo)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-6 max-[1180px]:flex-col">
        <SectionTitle eyebrow="Marketplace" title="Shop for your skin" body="Products ranked by how well their ingredients fit your profile. Purchases happen on the retailer’s own site." />
        <Card className="flex max-w-md items-start gap-3 p-5">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
          <div className="text-[13px] text-ink-soft">
            {hasPartners ? (
              'Partner listings show their source and last update time.'
            ) : (
              <>
                <p className="font-semibold text-ink">No partner integrations are connected.</p>
                <p className="mt-1">{providers?.demoCatalog ? 'You’re seeing the demo catalog: key ingredients only and illustrative prices. “Visit” opens the brand’s official homepage — there are no partnerships, offers or in-app checkout.' : 'Connect a partner catalog to see products here.'}</p>
              </>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          [<ShieldCheck key="a" />, 'Ingredient-based matching', 'Every match explains its reasons'],
          [<Store key="b" />, 'Buy from the source', 'Checkout happens on the retailer’s site'],
          [<Sparkles key="c" />, 'Fits your routine', 'Prioritises gaps in your routine']
        ].map(([icon, t, b]) => (
          <Card key={t as string} className="flex items-center gap-4 p-4">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-lilac-200 [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
            <div>
              <p className="text-[15px] font-semibold">{t}</p>
              <p className="text-[12.5px] text-ink-soft">{b}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card strong className="p-5">
        <CardHeader icon={<Sparkles />} title="Recommended for your skin" subtitle={db.profile.concerns.length ? `Based on ${label(db.profile.skinType).toLowerCase()} skin and ${db.profile.concerns.map(label).join(', ').toLowerCase()}.` : 'Complete your profile for more personal picks.'} />
        <div className="mt-4 grid grid-cols-3 gap-4 max-[1280px]:grid-cols-2">
          {recs.length === 0 ? <p className="text-sm text-ink-soft">No recommendations yet.</p> : recs.map((r) => <ProductCard key={r.product.id} product={r.product} reason={r.reason} footer={<ShopActions product={r.product} />} />)}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {(['all', ...cats] as const).map((c) => (
          <button key={c} onClick={() => setCat(c)} className={cn('h-9 rounded-pill border px-4 text-[13px]', cat === c ? 'border-lilac-300/60 bg-lilac-400/30' : 'border-white/12 bg-white/6 text-ink-soft')}>
            {c === 'all' ? 'All' : label(c)}
          </button>
        ))}
        <div className="relative ml-auto w-72">
          <Search className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-ink-faint" />
          <Input className="pl-10" placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {browse.length === 0 ? (
        <EmptyState title="No products found" />
      ) : (
        <div className="grid grid-cols-3 gap-4 max-[1280px]:grid-cols-2">
          {browse.map((p) => (
            <ProductCard key={p.id} product={p} footer={<ShopActions product={p} />} />
          ))}
        </div>
      )}

      <Card className="flex flex-wrap items-center gap-3 p-5">
        <div className="mr-4">
          <p className="font-semibold">Shop by brand</p>
          <p className="text-[12.5px] text-ink-soft">Filter the catalog by brand.</p>
        </div>
        {brands.map((b) => (
          <button key={b} onClick={() => setBrand(brand === b ? null : b)} className={cn('h-11 rounded-2xl px-4 text-[15px] font-semibold', brand === b ? 'bg-white text-[#2b1f5e]' : 'bg-white/85 text-[#2b1f5e]/80 hover:bg-white')}>
            {b}
          </button>
        ))}
      </Card>
    </div>
  )
}

function ShopActions({ product }: { product: Product }) {
  const a = useProductActions(product, 'marketplace')
  return (
    <div className="flex gap-1.5">
      <Button size="icon" variant={a.wishlisted ? 'success' : 'glass'} aria-label={a.wishlisted ? 'Remove from wishlist' : 'Save to wishlist'} onClick={() => a.toggleWishlist()}>
        <Heart className={cn('h-4 w-4', a.wishlisted && 'fill-current')} />
      </Button>
      <Button size="icon" aria-label="Compare" onClick={() => navigate(`/compare?ids=${encodeURIComponent(product.id)}`)}>
        <ArrowLeftRight className="h-4 w-4" />
      </Button>
      {product.url && (
        <Button size="sm" variant="primary" onClick={() => window.skintwin.openExternal(product.url!)}>
          Visit <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
