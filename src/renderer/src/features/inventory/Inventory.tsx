import { AlertTriangle, Archive, Box, CheckCircle2, History, Hourglass, MoreHorizontal, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { INVENTORY_STATUS, label, type InventoryItem, type InventoryStatus, type Product } from '@shared/models'
import { alternativesFor } from '@shared/scoring'
import { MatchBadge, ProductArt, ProductPicker } from '@renderer/components/products'
import { ReactionToggle, SuspectList } from '@renderer/components/reactions'
import { Badge, Bar, Button, Card, CardHeader, Dialog, EmptyState, Field, Input, SectionTitle, Select, Tabs, Textarea } from '@renderer/components/ui'
import { cn } from '@renderer/lib/cn'
import { daysUntil, formatDate } from '@renderer/lib/format'
import { navigate } from '@renderer/lib/router'
import { mutate, useCatalog, useDb, useMatch, useMatchContext, useProductMap } from '@renderer/lib/store'

const STATUS_TONE: Record<InventoryStatus, 'success' | 'warn' | 'danger' | 'neutral' | 'lilac'> = {
  in_use: 'success',
  unopened: 'lilac',
  running_low: 'warn',
  finished: 'neutral',
  paused: 'neutral',
  archived: 'neutral'
}

function isExpired(i: InventoryItem) {
  const d = daysUntil(i.expiresAt)
  return d != null && d < 0
}

export function Inventory() {
  const db = useDb()
  const products = useProductMap()
  const [tab, setTab] = useState<'products' | 'restock' | 'history'>('products')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<InventoryItem | null>(null)

  const active = db.inventory.filter((i) => i.status !== 'archived' && i.status !== 'finished')
  const counts = {
    total: active.length,
    inUse: active.filter((i) => i.status === 'in_use').length,
    low: active.filter((i) => i.status === 'running_low').length,
    expired: active.filter((i) => isExpired(i) || i.status === 'paused').length
  }
  const withProduct = (list: InventoryItem[]) => list.map((i) => ({ item: i, product: products.get(i.productId) })).filter((x): x is { item: InventoryItem; product: Product } => !!x.product)
  const shown = withProduct(active).filter(({ product }) => (cat === 'all' || product.category === cat) && `${product.brand} ${product.name}`.toLowerCase().includes(q.toLowerCase()))
  const cats = [...new Set(withProduct(active).map((x) => x.product.category))]

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6 max-[1280px]:flex-col">
        <SectionTitle eyebrow="Product inventory" title={<>Your skincare<br />inventory</>} body="Keep track of what you own, when you opened it, and when to restock." />
        <div className="grid flex-1 grid-cols-4 gap-4">
          <Stat icon={<Box />} value={counts.total} label="Products" />
          <Stat icon={<CheckCircle2 />} value={counts.inUse} label="In use" tone="text-mint-300" />
          <Stat icon={<Hourglass />} value={counts.low} label="Running low" tone="text-amber-300" />
          <Stat icon={<AlertTriangle />} value={counts.expired} label="Expired / paused" tone="text-rose-300" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'products', label: 'My products', icon: <Box /> },
            { value: 'restock', label: `Restock${counts.low ? ` (${counts.low})` : ''}`, icon: <ShoppingCart /> },
            { value: 'history', label: 'History', icon: <History /> }
          ]}
        />
        <div className="relative ml-auto w-72">
          <Search className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-ink-faint" />
          <Input className="pl-10" placeholder="Search your products…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add product
        </Button>
      </div>

      {tab === 'products' && (
        <>
          <SuspectList />
          {cats.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {['all', ...cats].map((c) => (
                <button key={c} onClick={() => setCat(c)} className={cn('h-9 rounded-pill border px-4 text-[13px]', cat === c ? 'border-lilac-300/60 bg-lilac-400/30' : 'border-white/12 bg-white/6 text-ink-soft')}>
                  {c === 'all' ? `All (${active.length})` : `${label(c)} (${withProduct(active).filter((x) => x.product.category === c).length})`}
                </button>
              ))}
            </div>
          )}
          {shown.length === 0 ? (
            <EmptyState icon={<Box />} title={active.length ? 'No matches' : 'Your inventory is empty'} body="Add products you own to track usage and get restock reminders." action={<Button variant="primary" onClick={() => setAdding(true)}>Add a product</Button>} />
          ) : (
            <div className="grid grid-cols-3 gap-4 max-[1280px]:grid-cols-2">
              {shown.map(({ item, product }) => (
                <InventoryCard key={item.id} item={item} product={product} onEdit={() => setEditing(item)} />
              ))}
            </div>
          )}
          <p className="text-xs text-ink-faint">Remaining amounts and expiry dates are your own estimates — SkinTwin can’t measure what’s left in a bottle.</p>
        </>
      )}
      {tab === 'restock' && <Restock />}
      {tab === 'history' && (
        <Card className="p-5">
          <CardHeader icon={<History />} title="Finished & archived" />
          <div className="mt-3 divide-y divide-white/8">
            {withProduct(db.inventory.filter((i) => i.status === 'finished' || i.status === 'archived')).map(({ item, product }) => (
              <div key={item.id} className="flex items-center gap-3 py-2.5">
                <ProductArt product={product} size={44} className="rounded-xl" />
                <span className="flex-1 text-sm">{product.brand} {product.name}</span>
                <Badge size="sm">{label(item.status)}</Badge>
                <span className="w-28 text-xs text-ink-soft">{formatDate(item.updatedAt)}</span>
                <Button size="sm" onClick={() => mutate({ type: 'inventory.update', id: item.id, patch: { status: 'in_use', remainingPct: null } }, 'Restored')}>
                  Restore
                </Button>
              </div>
            ))}
            {!db.inventory.some((i) => i.status === 'finished' || i.status === 'archived') && <p className="py-6 text-center text-sm text-ink-soft">Nothing here yet.</p>}
          </div>
        </Card>
      )}

      <ProductPicker open={adding} onClose={() => setAdding(false)} title="Add a product you own" onPick={async (id) => void (await mutate({ type: 'inventory.add', productId: id, status: 'in_use' }, 'Added to inventory'))} />
      {editing && <EditItemDialog item={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function Stat({ icon, value, label: text, tone }: { icon: React.ReactNode; value: number; label: string; tone?: string }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className={cn('grid h-12 w-12 place-items-center rounded-full bg-white/10 [&_svg]:h-6 [&_svg]:w-6', tone ?? 'text-lilac-200')}>{icon}</span>
      <div>
        <p className="text-3xl font-semibold">{value}</p>
        <p className="text-[13px] text-ink-soft">{text}</p>
      </div>
    </Card>
  )
}

function InventoryCard({ item, product, onEdit }: { item: InventoryItem; product: Product; onEdit: () => void }) {
  const expired = isExpired(item)
  const days = daysUntil(item.expiresAt)
  const pct = item.remainingPct
  return (
    <div className={cn('glass rounded-[24px] p-4', item.status === 'running_low' && 'border-amber-300/50 shadow-[0_0_30px_rgb(251_191_36/0.18)]', expired && 'border-rose-300/50 shadow-[0_0_30px_rgb(251_113_148/0.2)]')}>
      <div className="flex gap-3">
        <ProductArt product={product} size={92} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button className="line-clamp-2 text-left text-[15px] leading-snug font-semibold hover:underline" onClick={() => navigate(`/product/${encodeURIComponent(product.id)}`)}>
              {product.brand} {product.name}
            </button>
            <Button size="icon" variant="ghost" aria-label="Edit item" onClick={onEdit} className="-mt-1 -mr-1 shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[13px] text-ink-soft">{label(product.category)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={expired ? 'danger' : STATUS_TONE[item.status]} size="sm">
              {expired ? 'Expired' : label(item.status)}
            </Badge>
          </div>
        </div>
      </div>
      <div className="mt-4">
        {pct != null ? (
          <>
            <Bar value={pct} tone={pct <= 20 ? 'amber' : expired ? 'rose' : pct <= 40 ? 'lilac' : 'mint'} />
            <div className="mt-1.5 flex justify-between text-[12.5px] text-ink-soft">
              <span>{days != null ? (days < 0 ? `Expired ${-days} days ago` : `Expires in ${days} days`) : item.openedAt ? `Opened ${formatDate(item.openedAt)}` : ' '}</span>
              <span title="Your estimate">~{pct}% left (your estimate)</span>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between text-[12.5px] text-ink-soft">
            <span>{days != null ? (days < 0 ? `Expired ${-days} days ago` : `Expires in ${days} days`) : 'No expiry date set'}</span>
            <button className="underline" onClick={onEdit}>
              Add details
            </button>
          </div>
        )}
      </div>
      <ReactionToggle productId={product.id} className="mt-3 border-t border-white/8 pt-2.5" />
    </div>
  )
}

function EditItemDialog({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const products = useProductMap()
  const product = products.get(item.productId)
  const [form, setForm] = useState({
    status: item.status,
    openedAt: item.openedAt?.slice(0, 10) ?? '',
    expiresAt: item.expiresAt?.slice(0, 10) ?? '',
    remainingPct: item.remainingPct ?? 100,
    trackRemaining: item.remainingPct != null,
    notes: item.notes
  })
  const save = async () => {
    const ok = await mutate(
      {
        type: 'inventory.update',
        id: item.id,
        patch: {
          status: form.status,
          openedAt: form.openedAt ? new Date(form.openedAt).toISOString() : null,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
          remainingPct: form.trackRemaining ? form.remainingPct : null,
          notes: form.notes
        }
      },
      'Saved'
    )
    if (ok) onClose()
  }
  return (
    <Dialog open onClose={onClose} title={product ? `${product.brand} ${product.name}` : 'Edit product'}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Status">
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as InventoryStatus })}>
            {INVENTORY_STATUS.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Opened on">
          <Input type="date" value={form.openedAt} onChange={(e) => setForm({ ...form, openedAt: e.target.value })} />
        </Field>
        <Field label="Use by / expiry date" hint="Check the jar icon (e.g. 12M) or the printed date.">
          <Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
        </Field>
        <Field label={form.trackRemaining ? `Estimated remaining: ${form.remainingPct}%` : 'Estimated remaining'}>
          {form.trackRemaining ? (
            <input type="range" min={0} max={100} step={5} value={form.remainingPct} onChange={(e) => setForm({ ...form, remainingPct: Number(e.target.value) })} className="mt-3 w-full accent-[#a98bff]" />
          ) : (
            <Button size="sm" onClick={() => setForm({ ...form, trackRemaining: true })}>
              Track my estimate
            </Button>
          )}
        </Field>
        <Field label="Notes" className="col-span-2">
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="success" onClick={async () => (await mutate({ type: 'inventory.update', id: item.id, patch: { status: 'finished' } }, 'Marked finished')) && onClose()}>
          <CheckCircle2 className="h-4 w-4" /> Finished
        </Button>
        <Button size="sm" onClick={async () => (await mutate({ type: 'inventory.update', id: item.id, patch: { status: 'archived' } }, 'Archived')) && onClose()}>
          <Archive className="h-4 w-4" /> Archive
        </Button>
        <Button size="sm" variant="danger" onClick={async () => confirm('Delete this product from your inventory?') && (await mutate({ type: 'inventory.remove', id: item.id }, 'Deleted')) && onClose()}>
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
        <Button variant="primary" className="ml-auto" onClick={save}>
          Save
        </Button>
      </div>
    </Dialog>
  )
}

function Restock() {
  const db = useDb()
  const products = useProductMap()
  const catalog = useCatalog()
  const matchCtx = useMatchContext()
  const low = db.inventory
    .filter((i) => i.status === 'running_low' || isExpired(i) || (i.remainingPct != null && i.remainingPct <= 20 && i.status !== 'finished' && i.status !== 'archived'))
    .map((i) => ({ item: i, product: products.get(i.productId) }))
    .filter((x): x is { item: InventoryItem; product: Product } => !!x.product)
  if (low.length === 0) return <EmptyState icon={<ShoppingCart />} title="Nothing to restock" body="Mark a product as “Running low” (or estimate ≤ 20% left) to see restock options here." />
  return (
    <div className="space-y-4">
      {low.map(({ item, product }) => (
        <RestockRow key={item.id} item={item} product={product} alternatives={alternativesFor(product, catalog, db.profile, matchCtx).slice(0, 3)} />
      ))}
    </div>
  )
}

function RestockRow({ item, product, alternatives }: { item: InventoryItem; product: Product; alternatives: { product: Product }[] }) {
  const match = useMatch(product)
  return (
    <Card className="flex items-center gap-5 p-5 max-[1180px]:flex-col max-[1180px]:items-start">
      <ProductArt product={product} size={72} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{product.brand} {product.name}</p>
        <p className="text-[13px] text-ink-soft">{isExpired(item) ? 'Expired' : item.remainingPct != null ? `~${item.remainingPct}% left (your estimate)` : 'Marked running low'}</p>
        <div className="mt-2 flex gap-2">
          <MatchBadge match={match} size="sm" />
          {product.url && (
            <Button size="sm" variant="primary" onClick={() => window.skintwin.openExternal(product.url!)}>
              Restock same
            </Button>
          )}
        </div>
      </div>
      {alternatives.length > 0 && (
        <div className="flex-[1.4]">
          <p className="mb-2 text-xs text-ink-soft">Or consider</p>
          <div className="flex gap-2">
            {alternatives.map((a) => (
              <button key={a.product.id} className="glass-inset flex min-w-0 flex-1 items-center gap-2 rounded-2xl p-2 text-left hover:bg-white/10" onClick={() => navigate(`/product/${encodeURIComponent(a.product.id)}`)}>
                <ProductArt product={a.product} size={40} className="rounded-xl" />
                <span className="line-clamp-2 text-[12.5px]">{a.product.brand} {a.product.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
