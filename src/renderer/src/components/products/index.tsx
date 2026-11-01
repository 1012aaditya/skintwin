import { ArrowLeftRight, BadgeCheck, CalendarPlus, ExternalLink, Heart, Info, PackageCheck, Plus, Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { label, PRODUCT_CATEGORIES, type Product, type ProductCategory, type RoutinePeriod } from '@shared/models'
import type { MatchResult } from '@shared/scoring'
import { cn } from '@renderer/lib/cn'
import { formatPrice } from '@renderer/lib/format'
import { navigate } from '@renderer/lib/router'
import { mutate, useDb, useMatch, useOwnedIds } from '@renderer/lib/store'
import { Badge, Button, Dialog, Field, Input, Select, Tabs, Textarea } from '../ui'

const BOTTLE_TINTS: Record<ProductCategory, [string, string]> = {
  cleanser: ['#9fd8ff', '#e8f6ff'],
  toner: ['#c8f0ff', '#f2fbff'],
  essence: ['#ffe39a', '#fff8e1'],
  serum: ['#f3eaff', '#ffffff'],
  treatment: ['#d9c8ff', '#f6f0ff'],
  moisturizer: ['#bcd8ff', '#f4f8ff'],
  sunscreen: ['#ffc58a', '#fff3e6'],
  exfoliant: ['#ffd0e6', '#fff2f8'],
  mask: ['#c6f2d6', '#f2fff6'],
  eye: ['#e6d6ff', '#fbf7ff'],
  other: ['#e6e0ff', '#ffffff']
}

/** Up to two short lines for the bottle label, breaking on spaces and hyphens. */
function labelLines(text: string, max = 9): string[] {
  const words = text.replace(/-/g, '- ').split(/\s+/).filter(Boolean)
  const lines: string[] = []
  for (const w of words) {
    const last = lines[lines.length - 1]
    if (last !== undefined && (last + (last.endsWith('-') ? '' : ' ') + w).length <= max) lines[lines.length - 1] = last + (last.endsWith('-') ? '' : ' ') + w
    else lines.push(w)
  }
  const out = lines.slice(0, 2).map((l) => (l.length > max ? `${l.slice(0, max - 1)}…` : l))
  if (lines.length > 2) out[1] = `${out[1]!.slice(0, max - 1)}…`
  return out
}

/** Real page image when the browser supplied one; otherwise a stylised illustration (never a fake photo). */
export function ProductArt({ product, size = 96, className }: { product: Product; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false)
  const [a, b] = BOTTLE_TINTS[product.category]
  const tube = product.category === 'sunscreen' || product.category === 'moisturizer' || product.category === 'cleanser'
  return (
    <div className={cn('relative grid shrink-0 place-items-center overflow-hidden rounded-tile', className)} style={{ width: size, height: size, background: 'radial-gradient(circle at 30% 20%, #f7f0ff, #d8c6ff 70%, #b9a0f3)' }}>
      {product.imageUrl && !broken ? (
        <img src={product.imageUrl} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} referrerPolicy="no-referrer" />
      ) : (
        <svg viewBox="0 0 100 100" width={size * 0.82} height={size * 0.82} aria-hidden>
          <defs>
            <linearGradient id={`b-${product.id}`} x1="0" x2="1">
              <stop offset="0" stopColor={a} />
              <stop offset="0.5" stopColor={b} />
              <stop offset="1" stopColor={a} />
            </linearGradient>
          </defs>
          {tube ? (
            <>
              <rect x="30" y="12" width="40" height="70" rx="10" fill={`url(#b-${product.id})`} stroke="#fff" strokeOpacity=".7" />
              <rect x="38" y="80" width="24" height="10" rx="3" fill="#7c5ccf" opacity=".8" />
            </>
          ) : (
            <>
              <rect x="44" y="6" width="12" height="14" rx="3" fill="#5c3fb3" />
              <rect x="40" y="18" width="20" height="8" rx="2" fill="#efe6ff" />
              <rect x="30" y="26" width="40" height="64" rx="9" fill={`url(#b-${product.id})`} stroke="#fff" strokeOpacity=".7" />
            </>
          )}
          <rect x="33" y="46" width="34" height="22" rx="3" fill="#fff" opacity=".88" />
          <text textAnchor="middle" fill="#4b3399" fontFamily="system-ui" fontWeight="700" fontSize="6.2">
            {labelLines(product.brand || product.name).map((line, i, all) => (
              <tspan key={i} x="50" y={(all.length === 1 ? 59.5 : 55.5) + i * 7}>
                {line}
              </tspan>
            ))}
          </text>
          <circle cx="22" cy="78" r="7" fill="#fff" opacity=".35" />
          <circle cx="80" cy="30" r="5" fill="#fff" opacity=".35" />
        </svg>
      )}
    </div>
  )
}

export function MatchBadge({ match, size = 'md' }: { match: MatchResult | null; size?: 'sm' | 'md' }) {
  if (!match || match.score == null)
    return (
      <Badge tone="neutral" size={size} title={match?.headline}>
        {match?.basis === 'no_ingredients' ? 'No ingredient data' : 'Match unknown'}
      </Badge>
    )
  const tone = match.verdict === 'great' || match.verdict === 'good' ? 'success' : match.verdict === 'mixed' ? 'warn' : 'danger'
  return (
    <Badge tone={tone} size={size} title="Rule-based estimate from ingredients and your profile">
      {match.score}% match
    </Badge>
  )
}

export function SourceBadge({ product }: { product: Product }) {
  const s = product.source
  if (s.kind === 'demo_catalog')
    return (
      <Badge tone="demo" size="sm" title={s.label}>
        Demo data
      </Badge>
    )
  if (s.kind === 'browser')
    return (
      <Badge tone="lilac" size="sm" title={s.label}>
        From page
      </Badge>
    )
  if (s.kind === 'manual') return <Badge size="sm">Added by you</Badge>
  return (
    <Badge tone="success" size="sm">
      <BadgeCheck className="h-3 w-3" /> Partner
    </Badge>
  )
}

export function PriceTag({ product, className }: { product: Product; className?: string }) {
  const text = formatPrice(product.price)
  if (!text) return <span className={cn('text-sm text-ink-faint', className)}>Price unknown</span>
  return (
    <span className={cn('inline-flex items-baseline gap-1.5', className)} title={product.price?.note ?? undefined}>
      <span className="text-lg font-semibold">{text}</span>
      {!product.price?.verified && <span className="text-[11px] text-amber-200/80">{product.source.kind === 'demo_catalog' ? 'demo' : 'unverified'}</span>}
    </span>
  )
}

/** All product actions write to the shared store, so both windows update instantly. */
export function useProductActions(product: Product, source: 'app' | 'companion' | 'marketplace' = 'app', conversationId: string | null = null) {
  const db = useDb()
  const owned = useOwnedIds().has(product.id)
  const wishlisted = db.saved.some((s) => s.productId === product.id && s.list === 'wishlist')
  const inRoutine = (p: RoutinePeriod) => db.routines[p].steps.some((s) => s.productId === product.id)
  const log = (action: 'save_wishlist' | 'add_to_routine' | 'mark_owned' | 'compare' | 'open_insights' | 'open_retailer') =>
    source === 'companion' ? mutate({ type: 'action.log', action, productId: product.id, conversationId }) : Promise.resolve(true)
  return {
    owned,
    wishlisted,
    inRoutine,
    async toggleWishlist(reason?: string) {
      const existing = db.saved.find((s) => s.productId === product.id && s.list === 'wishlist')
      if (existing) return mutate({ type: 'saved.remove', id: existing.id }, 'Removed from wishlist')
      const ok = await mutate({ type: 'saved.add', productId: product.id, list: 'wishlist', source, reason: reason ?? null, conversationId }, 'Saved to wishlist')
      if (ok) await log('save_wishlist')
      return ok
    },
    async addToRoutine(period: RoutinePeriod) {
      if (inRoutine(period)) return true
      const ok = await mutate({ type: 'routine.addStep', period, productId: product.id }, `Added to ${period === 'am' ? 'morning' : 'evening'} routine`)
      if (ok) await log('add_to_routine')
      return ok
    },
    async markOwned() {
      if (owned) return true
      const ok = await mutate({ type: 'inventory.add', productId: product.id, status: 'unopened' }, 'Added to your inventory')
      if (ok) await log('mark_owned')
      return ok
    }
  }
}

export function ProductActionBar({ product, compact }: { product: Product; compact?: boolean }) {
  const a = useProductActions(product)
  const [routineOpen, setRoutineOpen] = useState(false)
  return (
    <div className="flex flex-wrap gap-2">
      <Button size={compact ? 'sm' : 'md'} variant={a.wishlisted ? 'success' : 'glass'} onClick={() => a.toggleWishlist()}>
        <Heart className={cn('h-4 w-4', a.wishlisted && 'fill-current')} /> {a.wishlisted ? 'Wishlisted' : 'Wishlist'}
      </Button>
      <Button size={compact ? 'sm' : 'md'} onClick={() => setRoutineOpen(true)}>
        <CalendarPlus className="h-4 w-4" /> Add to routine
      </Button>
      <Button size={compact ? 'sm' : 'md'} onClick={() => navigate(`/compare?ids=${encodeURIComponent(product.id)}`)}>
        <ArrowLeftRight className="h-4 w-4" /> Compare
      </Button>
      <Button size={compact ? 'sm' : 'md'} variant={a.owned ? 'success' : 'glass'} onClick={() => a.markOwned()} disabled={a.owned}>
        <PackageCheck className="h-4 w-4" /> {a.owned ? 'Owned' : 'Mark owned'}
      </Button>
      {product.url && (
        <Button size={compact ? 'sm' : 'md'} variant="ghost" onClick={() => window.skintwin.openExternal(product.url!)}>
          <ExternalLink className="h-4 w-4" /> {product.source.kind === 'browser' ? 'Open page' : 'Brand site'}
        </Button>
      )}
      <RoutinePeriodDialog open={routineOpen} onClose={() => setRoutineOpen(false)} product={product} />
    </div>
  )
}

export function RoutinePeriodDialog({ open, onClose, product }: { open: boolean; onClose: () => void; product: Product }) {
  const a = useProductActions(product)
  return (
    <Dialog open={open} onClose={onClose} title={`Add ${product.name} to…`}>
      <p className="mb-4 text-sm text-ink-soft">SkinTwin won’t change anything else in your routine. You can reorder steps later.</p>
      <div className="grid grid-cols-2 gap-3">
        {(['am', 'pm'] as const).map((p) => (
          <Button
            key={p}
            size="lg"
            variant={a.inRoutine(p) ? 'success' : 'glass'}
            onClick={async () => {
              if (await a.addToRoutine(p)) onClose()
            }}
          >
            {a.inRoutine(p) ? '✓ ' : ''}
            {p === 'am' ? 'Morning' : 'Evening'}
          </Button>
        ))}
      </div>
    </Dialog>
  )
}

export function ProductRow({ product, right, onClick, sub }: { product: Product; right?: ReactNode; onClick?: () => void; sub?: ReactNode }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-tile p-2 transition-colors', onClick && 'hover:bg-white/8')} onClick={onClick} role={onClick ? 'button' : undefined}>
      <ProductArt product={product} size={56} className="rounded-2xl" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold">{product.name}</p>
        <p className="truncate text-[12.5px] text-ink-soft">{sub ?? `${label(product.category)}${product.brand ? ` · ${product.brand}` : ''}`}</p>
      </div>
      {right}
    </div>
  )
}

export function ProductCard({ product, footer, reason }: { product: Product; footer?: ReactNode; reason?: string }) {
  const match = useMatch(product)
  return (
    <div className="glass flex flex-col gap-3 rounded-[24px] p-4">
      <div className="flex gap-3">
        <ProductArt product={product} size={88} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-ink-soft">{product.brand}</p>
          <button className="line-clamp-2 text-left text-[15px] leading-snug font-semibold hover:underline" onClick={() => navigate(`/product/${encodeURIComponent(product.id)}`)}>
            {product.name}
          </button>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <MatchBadge match={match} size="sm" />
            <SourceBadge product={product} />
          </div>
        </div>
      </div>
      {reason && <p className="text-[12.5px] leading-snug text-ink-soft">{reason}</p>}
      <div className="mt-auto flex items-center justify-between gap-2">
        <PriceTag product={product} />
        {footer}
      </div>
    </div>
  )
}

// ---------- Product picker (search catalog / your products / manual entry) ----------

export function ProductPicker({ open, onClose, onPick, title = 'Add a product' }: { open: boolean; onClose: () => void; onPick: (productId: string) => void | Promise<void>; title?: string }) {
  const db = useDb()
  const [tab, setTab] = useState<'search' | 'manual'>('search')
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    return db.products.filter((p) => !t || `${p.brand} ${p.name} ${p.category}`.toLowerCase().includes(t)).slice(0, 40)
  }, [db.products, q])
  return (
    <Dialog open={open} onClose={onClose} title={title} wide>
      <Tabs
        size="sm"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'search', label: 'Search products', icon: <Search /> },
          { value: 'manual', label: 'Enter manually', icon: <Plus /> }
        ]}
      />
      {tab === 'search' ? (
        <div className="mt-4">
          <Input autoFocus placeholder="Search by brand, name or type…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-3 max-h-[46vh] space-y-1 overflow-y-auto">
            {results.length === 0 && <p className="py-6 text-center text-sm text-ink-soft">No matches. Try “Enter manually”.</p>}
            {results.map((p) => (
              <ProductRow
                key={p.id}
                product={p}
                onClick={async () => {
                  await onPick(p.id)
                  onClose()
                }}
                right={<SourceBadge product={p} />}
              />
            ))}
          </div>
        </div>
      ) : (
        <ManualProductForm
          onCreated={async (id) => {
            await onPick(id)
            onClose()
          }}
        />
      )}
    </Dialog>
  )
}

function ManualProductForm({ onCreated }: { onCreated: (id: string) => void | Promise<void> }) {
  const [form, setForm] = useState({ brand: '', name: '', category: 'serum' as ProductCategory, size: '', ingredients: '', url: '', price: '' })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const urlOk = !form.url || /^https?:\/\//.test(form.url)
  return (
    <form
      className="mt-4 grid grid-cols-2 gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!form.name.trim() || !urlOk) return
        setSaving(true)
        const id = `manual:${crypto.randomUUID()}`
        const ok = await mutate(
          {
            type: 'product.createManual',
            id,
            product: {
              name: form.name.trim(),
              brand: form.brand.trim(),
              category: form.category,
              sizeMl: form.size ? Number(form.size) || null : null,
              ingredients: form.ingredients.split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean).slice(0, 120),
              url: form.url.trim() || null,
              description: null,
              price: form.price ? Number(form.price) : null,
              currency: 'INR'
            }
          },
          'Product added'
        )
        setSaving(false)
        if (ok) await onCreated(id)
      }}
    >
      <Field label="Brand">
        <Input value={form.brand} onChange={set('brand')} placeholder="e.g. CeraVe" />
      </Field>
      <Field label="Product name *">
        <Input value={form.name} onChange={set('name')} required placeholder="e.g. Hydrating Cleanser" />
      </Field>
      <Field label="Type">
        <Select value={form.category} onChange={set('category')}>
          {PRODUCT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {label(c)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Size (mL)">
        <Input type="number" min="0" value={form.size} onChange={set('size')} />
      </Field>
      <Field label="Ingredients (comma-separated)" hint="Copy from the packaging or brand page. Needed for match estimates." className="col-span-2">
        <Textarea value={form.ingredients} onChange={set('ingredients')} placeholder="Aqua, Glycerin, Niacinamide, …" />
      </Field>
      <Field label="Product page URL" hint={urlOk ? undefined : 'Must start with http:// or https://'}>
        <Input value={form.url} onChange={set('url')} placeholder="https://" />
      </Field>
      <Field label="Price you paid (₹, optional)">
        <Input type="number" min="0" value={form.price} onChange={set('price')} />
      </Field>
      <div className="col-span-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs text-ink-faint">
          <Info className="h-3.5 w-3.5" /> Stored only on this device.
        </p>
        <Button type="submit" variant="primary" loading={saving} disabled={!form.name.trim() || !urlOk}>
          Add product
        </Button>
      </div>
    </form>
  )
}
