import { ArrowDown, ArrowUp, CheckCircle2, ChevronDown, Circle, GripVertical, Layers, Moon, Plus, Search, Sparkles, Sun, Trash2, TriangleAlert } from 'lucide-react'
import { isDue } from '@shared/home'
import { Reorder, useDragControls } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { FREQUENCIES, label, type Product, type RoutinePeriod, type RoutineStep } from '@shared/models'
import { computeMatch, recommend, routineGaps } from '@shared/scoring'
import { ProductArt, ProductCard, ProductPicker, ProductRow, RoutinePeriodDialog } from '@renderer/components/products'
import { ReactionToggle } from '@renderer/components/reactions'
import { Badge, Button, Card, CardHeader, EmptyState, Input, ProgressRing, SectionTitle, Select, Tabs, Toggle } from '@renderer/components/ui'
import { cn } from '@renderer/lib/cn'
import { navigate } from '@renderer/lib/router'
import { mutate, todayKey, useCatalog, useDb, useOwnedIds, useMatchContext, useProductMap } from '@renderer/lib/store'

const ESSENTIALS = [
  { key: 'cleanser', label: 'Cleansing', cats: ['cleanser'] },
  { key: 'treatment', label: 'Treatment', cats: ['serum', 'treatment', 'exfoliant', 'essence'] },
  { key: 'moisturizer', label: 'Moisturizing', cats: ['moisturizer'] },
  { key: 'sunscreen', label: 'Sun protection (AM)', cats: ['sunscreen'] }
] as const

const dueToday = (step: RoutineStep) => isDue(step, new Date())

export function Routine() {
  const db = useDb()
  const products = useProductMap()
  const [tab, setTab] = useState<'routine' | 'recommendations' | 'today'>('routine')
  const matchCtx = useMatchContext()
  const routineProducts = matchCtx.routineProducts

  const coverage = ESSENTIALS.map((e) => {
    const periods: RoutinePeriod[] = e.key === 'sunscreen' ? ['am'] : ['am', 'pm']
    const covered = periods.some((p) => db.routines[p].steps.some((s) => s.enabled && (e.cats as readonly string[]).includes(products.get(s.productId)?.category ?? '')))
    return { ...e, covered }
  })
  const health = Math.round((coverage.filter((c) => c.covered).length / coverage.length) * 100)
  const cautions = useMemo(() => {
    const out = new Set<string>()
    for (const p of routineProducts) {
      const m = computeMatch(p, db.profile, matchCtx)
      m.cautions.filter((c) => c.includes('alternate nights')).forEach((c) => out.add(c))
      m.mismatches.forEach((x) => out.add(`${p.name}: ${x.text}`))
    }
    return [...out].slice(0, 3)
  }, [routineProducts, matchCtx, db.profile])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-8 max-[1180px]:flex-col">
        <SectionTitle eyebrow="Routine setup" title="Build your skincare routine" body="Add your products, organise morning and evening steps, and track what you’ve done today." />
        <Card strong className="flex min-w-[520px] items-center gap-6 p-5">
          <ProgressRing value={health} size={96} stroke={9} />
          <div className="flex-1">
            <p className="text-lg font-semibold">Routine coverage</p>
            <p className="text-[13px] text-ink-soft">{health === 100 ? 'All the essentials are covered.' : 'Some essential steps are missing.'}</p>
          </div>
          <ul className="space-y-1.5 text-[13.5px]">
            {coverage.map((c) => (
              <li key={c.key} className="flex items-center gap-2">
                {c.covered ? <CheckCircle2 className="h-4 w-4 text-mint-300" /> : <Circle className="h-4 w-4 text-ink-faint" />}
                <span className={c.covered ? '' : 'text-ink-soft'}>{c.label}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'routine', label: 'My routine', icon: <Layers /> },
          { value: 'today', label: 'Today', icon: <CheckCircle2 /> },
          { value: 'recommendations', label: 'Suggestions', icon: <Sparkles /> }
        ]}
      />

      {tab === 'routine' && (
        <div className="grid grid-cols-[340px_minmax(0,1fr)_minmax(0,1fr)] gap-5 max-[1280px]:grid-cols-2">
          <YourProducts />
          <RoutineColumn period="am" />
          <RoutineColumn period="pm" />
        </div>
      )}
      {tab === 'today' && <TodayView />}
      {tab === 'recommendations' && <Suggestions />}

      {(cautions.length > 0 || coverage.some((c) => !c.covered)) && tab === 'routine' && (
        <Card className="flex items-center gap-5 p-5">
          <Sparkles className="h-7 w-7 shrink-0 text-blush-300" />
          <div className="flex-1">
            <p className="font-semibold">SkinTwin suggests</p>
            <p className="text-[12.5px] text-ink-soft">Suggestions never change your routine automatically.</p>
          </div>
          <div className="flex flex-[3] flex-wrap gap-2">
            {coverage
              .filter((c) => !c.covered)
              .map((c) => (
                <span key={c.key} className="glass-inset rounded-2xl px-3 py-2 text-[13px]">Add a {c.label.toLowerCase().replace(' (am)', '')} step</span>
              ))}
            {cautions.map((c) => (
              <span key={c} className="flex items-center gap-1.5 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[13px]">
                <TriangleAlert className="h-3.5 w-3.5 text-amber-300" />
                {c}
              </span>
            ))}
          </div>
          <Button variant="primary" onClick={() => setTab('recommendations')}>
            See suggestions
          </Button>
        </Card>
      )}
    </div>
  )
}

function YourProducts() {
  const db = useDb()
  const products = useProductMap()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [routineFor, setRoutineFor] = useState<Product | null>(null)
  const owned = db.inventory.filter((i) => i.status !== 'archived').map((i) => products.get(i.productId)).filter((p): p is Product => !!p)
  const cats = [...new Set(owned.map((p) => p.category))]
  const shown = owned.filter((p) => (filter === 'all' || p.category === filter) && `${p.brand} ${p.name}`.toLowerCase().includes(q.toLowerCase()))
  const inRoutine = (id: string) => db.routines.am.steps.some((s) => s.productId === id) || db.routines.pm.steps.some((s) => s.productId === id)
  return (
    <Card className="flex max-h-[720px] flex-col p-5 max-[1280px]:col-span-2">
      <CardHeader
        icon={<Layers />}
        title={`Your products (${owned.length})`}
        action={
          <Button size="icon" variant="primary" aria-label="Add product you own" onClick={() => setPickerOpen(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        }
      />
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-ink-faint" />
        <Input className="pl-10" placeholder="Search your products…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {cats.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {['all', ...cats].map((c) => (
            <button key={c} onClick={() => setFilter(c)} className={cn('h-7 rounded-pill px-3 text-xs', filter === c ? 'bg-lilac-400/40 text-white' : 'bg-white/8 text-ink-soft')}>
              {c === 'all' ? 'All' : label(c)}
            </button>
          ))}
        </div>
      )}
      <div className="scroll-area mt-3 -mx-2 flex-1 space-y-1 px-2">
        {owned.length === 0 ? (
          <EmptyState title="No products yet" body="Add products you own to build your routine." action={<Button size="sm" variant="primary" onClick={() => setPickerOpen(true)}>Add a product</Button>} />
        ) : (
          shown.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              onClick={() => navigate(`/product/${encodeURIComponent(p.id)}`)}
              right={
                inRoutine(p.id) ? (
                  <CheckCircle2 className="h-5 w-5 text-mint-300" aria-label="In routine" />
                ) : (
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setRoutineFor(p)
                    }}
                  >
                    Add
                  </Button>
                )
              }
            />
          ))
        )}
      </div>
      <ProductPicker open={pickerOpen} onClose={() => setPickerOpen(false)} title="Add a product you own" onPick={async (id) => void (await mutate({ type: 'inventory.add', productId: id, status: 'in_use' }, 'Added to your products'))} />
      {routineFor && <RoutinePeriodDialog open onClose={() => setRoutineFor(null)} product={routineFor} />}
    </Card>
  )
}

function RoutineColumn({ period }: { period: RoutinePeriod }) {
  const db = useDb()
  const products = useProductMap()
  const routine = db.routines[period]
  const [order, setOrder] = useState(routine.steps.map((s) => s.id))
  const [pickerOpen, setPickerOpen] = useState(false)
  useEffect(() => setOrder(routine.steps.map((s) => s.id)), [routine.steps])
  const byId = new Map(routine.steps.map((s) => [s.id, s]))
  const commit = (ids: string[]) => {
    if (ids.join() !== routine.steps.map((s) => s.id).join()) void mutate({ type: 'routine.reorder', period, stepIds: ids })
  }
  const move = (id: string, dir: -1 | 1) => {
    const i = order.indexOf(id)
    const j = i + dir
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    setOrder(next)
    commit(next)
  }
  return (
    <Card className={cn('flex flex-col p-5', !routine.enabled && 'opacity-60')}>
      <CardHeader
        icon={period === 'am' ? <Sun className="text-amber-300" /> : <Moon className="text-amber-200" />}
        title={period === 'am' ? 'Morning routine' : 'Evening routine'}
        subtitle={period === 'am' ? 'Protect and prep your skin for the day.' : 'Repair and recover overnight.'}
        action={<Toggle checked={routine.enabled} onChange={(v) => mutate({ type: 'routine.setEnabled', period, enabled: v })} />}
      />
      <Reorder.Group axis="y" values={order} onReorder={setOrder} className="mt-4 space-y-2">
        {order.map((id, i) => {
          const step = byId.get(id)
          const product = step && products.get(step.productId)
          if (!step || !product) return null
          return <StepItem key={id} index={i} step={step} product={product} period={period} onDragEnd={() => commit(order)} onMove={(d) => move(id, d)} isFirst={i === 0} isLast={i === order.length - 1} />
        })}
      </Reorder.Group>
      {routine.steps.length === 0 && <EmptyState className="mt-4" title="No steps yet" body="Add products in the order you apply them." />}
      <Button className="mt-3 self-start" size="sm" onClick={() => setPickerOpen(true)}>
        <Plus className="h-4 w-4" /> Add step
      </Button>
      <ProductPicker open={pickerOpen} onClose={() => setPickerOpen(false)} title={`Add to ${period === 'am' ? 'morning' : 'evening'} routine`} onPick={async (id) => void (await mutate({ type: 'routine.addStep', period, productId: id }, 'Step added'))} />
    </Card>
  )
}

function StepItem({ index, step, product, period, onDragEnd, onMove, isFirst, isLast }: { index: number; step: RoutineStep; product: Product; period: RoutinePeriod; onDragEnd: () => void; onMove: (d: -1 | 1) => void; isFirst: boolean; isLast: boolean }) {
  const controls = useDragControls()
  const [open, setOpen] = useState(false)
  const done = step.completions.includes(todayKey())
  return (
    <Reorder.Item value={step.id} dragListener={false} dragControls={controls} onDragEnd={onDragEnd} className={cn('glass-inset rounded-[20px] p-2.5', !step.enabled && 'opacity-55')}>
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-semibold">{index + 1}</span>
        <ProductArt product={product} size={48} className="rounded-xl" />
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <p className="truncate text-[14px] font-semibold">{product.name}</p>
          <p className="truncate text-[12px] text-ink-soft">
            {label(product.category)} · {label(step.frequency)}
            {step.notes && ` · ${step.notes}`}
          </p>
        </button>
        <button aria-label={done ? 'Mark not done today' : 'Mark done today'} onClick={() => mutate({ type: 'routine.toggleComplete', period, stepId: step.id, date: todayKey() })}>
          {done ? <CheckCircle2 className="h-5 w-5 text-mint-300" /> : <Circle className="h-5 w-5 text-ink-faint" />}
        </button>
        <ChevronDown className={cn('h-4 w-4 text-ink-faint transition-transform', open && 'rotate-180')} onClick={() => setOpen((o) => !o)} />
        <span className="cursor-grab touch-none text-ink-faint active:cursor-grabbing" onPointerDown={(e) => controls.start(e)} aria-hidden>
          <GripVertical className="h-5 w-5" />
        </span>
      </div>
      {open && (
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/10 px-1 pt-3">
          <Select value={step.frequency} onChange={(e) => mutate({ type: 'routine.updateStep', period, stepId: step.id, patch: { frequency: e.target.value as RoutineStep['frequency'] } })} aria-label="Frequency">
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {label(f)}
              </option>
            ))}
          </Select>
          <Input defaultValue={step.notes} placeholder="Notes, e.g. pea-sized amount" aria-label="Notes" onBlur={(e) => e.target.value !== step.notes && mutate({ type: 'routine.updateStep', period, stepId: step.id, patch: { notes: e.target.value } })} />
          <ReactionToggle productId={product.id} className="col-span-2" />
          <div className="col-span-2 flex items-center justify-between">
            <Toggle checked={step.enabled} onChange={(v) => mutate({ type: 'routine.updateStep', period, stepId: step.id, patch: { enabled: v } })} label="Step enabled" />
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" aria-label="Move up" disabled={isFirst} onClick={() => onMove(-1)}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" aria-label="Move down" disabled={isLast} onClick={() => onMove(1)}>
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="danger" onClick={() => mutate({ type: 'routine.removeStep', period, stepId: step.id }, 'Step removed')}>
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </Reorder.Item>
  )
}

function TodayView() {
  const db = useDb()
  const products = useProductMap()
  const today = todayKey()
  return (
    <div className="grid grid-cols-2 gap-5">
      {(['am', 'pm'] as const).map((period) => {
        const r = db.routines[period]
        const due = r.steps.filter((s) => s.enabled && dueToday(s))
        const done = due.filter((s) => s.completions.includes(today)).length
        return (
          <Card key={period} className="p-6">
            <div className="flex items-center gap-5">
              <ProgressRing value={due.length ? (done / due.length) * 100 : null} size={84} stroke={8} label={`${done}/${due.length}`} tone="lilac" />
              <div>
                <p className="text-lg font-semibold">{period === 'am' ? 'Morning' : 'Evening'}</p>
                <p className="text-[13px] text-ink-soft">{!r.enabled ? 'Routine paused' : due.length ? `${due.length} steps due today` : 'Nothing due today'}</p>
              </div>
            </div>
            <div className="mt-5 space-y-2">
              {due.map((s) => {
                const p = products.get(s.productId)
                if (!p) return null
                const isDone = s.completions.includes(today)
                return (
                  <button key={s.id} className="glass-inset flex w-full items-center gap-3 rounded-2xl p-3 text-left" onClick={() => mutate({ type: 'routine.toggleComplete', period, stepId: s.id, date: today })}>
                    {isDone ? <CheckCircle2 className="h-5 w-5 text-mint-300" /> : <Circle className="h-5 w-5 text-ink-faint" />}
                    <span className={cn('flex-1 text-[14px]', isDone && 'text-ink-soft line-through')}>{p.name}</span>
                    <Badge size="sm">{label(s.frequency)}</Badge>
                  </button>
                )
              })}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function Suggestions() {
  const db = useDb()
  const products = useProductMap()
  const catalog = useCatalog()
  const owned = useOwnedIds()
  const matchCtx = useMatchContext()
  const gaps = routineGaps(db.routines, products)
  const recs = recommend({ catalog, profile: db.profile, ownedIds: owned, ...matchCtx, gaps, limit: 6 })
  if (catalog.length === 0) return <EmptyState title="No catalog available" body="Recommendations need a product catalog. Enable the demo catalog or connect a partner catalog." />
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">Based on your profile, routine gaps and what you already own. Adding a product is always your choice.</p>
      <div className="grid grid-cols-3 gap-4 max-[1280px]:grid-cols-2">
        {recs.map((r) => (
          <ProductCard key={r.product.id} product={r.product} reason={r.reason} footer={<Button size="sm" onClick={() => navigate(`/product/${encodeURIComponent(r.product.id)}`)}>Details</Button>} />
        ))}
      </div>
    </div>
  )
}
