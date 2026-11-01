import { Bookmark, CalendarPlus, ChevronRight, ExternalLink, Heart, MessageCircle, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { Product, SavedProduct } from '@shared/models'
import { MatchBadge, ProductArt, RoutinePeriodDialog, SourceBadge } from '@renderer/components/products'
import { Button, Card, CardHeader, EmptyState, Input, SectionTitle, Tabs } from '@renderer/components/ui'
import { formatDate } from '@renderer/lib/format'
import { navigate } from '@renderer/lib/router'
import { mutate, useDb, useMatch, useOwnedIds, useProductMap } from '@renderer/lib/store'

export function Saved() {
  const db = useDb()
  const products = useProductMap()
  const [tab, setTab] = useState<'all' | 'wishlist' | 'chats'>('all')
  const [q, setQ] = useState('')
  const items = db.saved.map((s) => ({ saved: s, product: products.get(s.productId) })).filter((x): x is { saved: SavedProduct; product: Product } => !!x.product)
  const fromChats = items.filter((i) => i.saved.source === 'companion')
  const shown = (tab === 'wishlist' ? items.filter((i) => i.saved.list === 'wishlist') : tab === 'chats' ? fromChats : items).filter((i) => `${i.product.brand} ${i.product.name}`.toLowerCase().includes(q.toLowerCase()))

  const questionFor = (s: SavedProduct) => {
    const conv = s.conversationId ? db.conversations.find((c) => c.id === s.conversationId) : null
    return conv?.messages.filter((m) => m.role === 'user' && (m.productId === s.productId || !m.productId)).at(-1)?.text ?? s.reason
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6 max-[1280px]:flex-col">
        <SectionTitle eyebrow="Saved products" title={<>Your skincare<br />collection</>} body="Everything you’ve saved, wishlisted, or found while talking with SkinTwin." />
        <div className="grid flex-1 grid-cols-3 gap-4">
          {[
            [<Bookmark key="a" />, items.length, 'Saved products'],
            [<Heart key="b" />, items.filter((i) => i.saved.list === 'wishlist').length, 'In wishlist'],
            [<MessageCircle key="c" />, fromChats.length, 'From conversations']
          ].map(([icon, n, t]) => (
            <Card key={t as string} className="flex items-center gap-4 p-5">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-white/10 text-lilac-200 [&_svg]:h-6 [&_svg]:w-6">{icon}</span>
              <div>
                <p className="text-3xl font-semibold">{n as number}</p>
                <p className="text-sm text-ink-soft">{t}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: `All saved (${items.length})`, icon: <Bookmark /> }, { value: 'wishlist', label: 'Wishlist', icon: <Heart /> }, { value: 'chats', label: 'From chats', icon: <MessageCircle /> }]} />
        <div className="relative ml-auto w-72">
          <Search className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-ink-faint" />
          <Input className="pl-10" placeholder="Search saved products…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-5 max-[1280px]:grid-cols-1">
        {shown.length === 0 ? (
          <EmptyState icon={<Heart />} title="Nothing saved yet" body="Tap the heart on any product, or say “save this” to the companion." action={<Button onClick={() => navigate('/shop')}>Browse products</Button>} />
        ) : (
          <div className="grid grid-cols-2 gap-4 self-start max-[1500px]:grid-cols-1">
            {shown.map(({ saved, product }) => (
              <SavedCard key={saved.id} saved={saved} product={product} question={questionFor(saved)} />
            ))}
          </div>
        )}
        <Card className="self-start p-5">
          <CardHeader icon={<MessageCircle />} title="Saved from conversations" />
          <div className="mt-3 space-y-2">
            {fromChats.length === 0 && <p className="text-sm text-ink-soft">Products you save in the companion appear here with the question you asked.</p>}
            {fromChats.slice(0, 5).map(({ saved, product }) => (
              <button key={saved.id} className="glass-inset flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-white/10" onClick={() => window.skintwin.companion.show({ type: 'analyze-product', productId: product.id })}>
                <ProductArt product={product} size={48} className="rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{product.name}</span>
                  {questionFor(saved) && <span className="line-clamp-2 text-[12.5px] text-ink-soft italic">“{questionFor(saved)}”</span>}
                </span>
                <ChevronRight className="h-4 w-4 text-ink-faint" />
              </button>
            ))}
          </div>
          <Button variant="primary" className="mt-4 w-full" onClick={() => window.skintwin.companion.show()}>
            Continue with SkinTwin
          </Button>
        </Card>
      </div>
    </div>
  )
}

function SavedCard({ saved, product, question }: { saved: SavedProduct; product: Product; question: string | null }) {
  const match = useMatch(product)
  const owned = useOwnedIds().has(product.id)
  const [routineOpen, setRoutineOpen] = useState(false)
  return (
    <div className="glass rounded-[24px] p-4">
      <div className="flex gap-3">
        <ProductArt product={product} size={96} />
        <div className="min-w-0 flex-1">
          <button className="line-clamp-2 text-left text-[15px] font-semibold hover:underline" onClick={() => navigate(`/product/${encodeURIComponent(product.id)}`)}>
            {product.brand} {product.name}
          </button>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <MatchBadge match={match} size="sm" />
            <SourceBadge product={product} />
          </div>
          <p className="mt-2 text-[12px] text-ink-soft">
            {saved.list === 'wishlist' ? 'Wishlist' : 'Saved'} · {saved.source === 'companion' ? 'from chat' : saved.source} · {formatDate(saved.createdAt)}
          </p>
          {question && <p className="mt-1 line-clamp-2 text-[12px] text-ink-soft italic">“{question}”</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setRoutineOpen(true)}>
          <CalendarPlus className="h-4 w-4" /> Add to routine
        </Button>
        <Button size="sm" onClick={() => navigate(`/compare?ids=${encodeURIComponent(product.id)}`)}>Compare</Button>
        <Button size="sm" variant={owned ? 'success' : 'glass'} disabled={owned} onClick={() => mutate({ type: 'inventory.add', productId: product.id, status: 'unopened' }, 'Marked as owned')}>
          {owned ? 'Owned' : 'Mark owned'}
        </Button>
        {product.url && (
          <Button size="sm" variant="ghost" onClick={() => window.skintwin.openExternal(product.url!)}>
            <ExternalLink className="h-4 w-4" /> Shop
          </Button>
        )}
        <Button size="icon" variant="ghost" className="ml-auto" aria-label="Remove from saved" onClick={() => mutate({ type: 'saved.remove', id: saved.id }, 'Removed')}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <RoutinePeriodDialog open={routineOpen} onClose={() => setRoutineOpen(false)} product={product} />
    </div>
  )
}
