import { Check, ShieldAlert, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { label, REACTION_KINDS, type ReactionKind } from '@shared/models'
import { onAvoidList, SUSPECT_DISCLAIMER, type Suspect } from '@shared/reactions'
import { cn } from '@renderer/lib/cn'
import { mutate, newRequestId, useDb, useProductMap, useSuspects } from '@renderer/lib/store'

/**
 * One-tap "my skin reacted" logging. Reactions are what the user reports — SkinTwin
 * only looks for patterns across them and never claims an ingredient caused one.
 */

const EMOJI: Record<ReactionKind, string> = { stinging: '⚡', redness: '🔴', breakout: '💥', itching: '🪶', dryness: '🏜️', other: '•' }

const daysAgo = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`
}

/** Row of reaction chips. One tap logs it; tapping the same chip again (this session) undoes it. */
export function ReactionChips({ productId, dense, history = true, onLogged }: { productId: string; dense?: boolean; history?: boolean; onLogged?: (kind: ReactionKind) => void }) {
  const db = useDb()
  const [logged, setLogged] = useState<Partial<Record<ReactionKind, string>>>({})
  const past = db.reactions.filter((r) => r.productId === productId)
  const tap = async (kind: ReactionKind) => {
    const id = logged[kind]
    if (id) {
      if (await mutate({ type: 'reaction.delete', id }, 'Reaction removed')) setLogged(({ [kind]: _gone, ...rest }) => rest)
      return
    }
    const newId = `react:${newRequestId()}`
    if (!(await mutate({ type: 'reaction.add', id: newId, productId, kind }, `Logged ${label(kind).toLowerCase()} — SkinTwin will keep it in mind`))) return
    setLogged((l) => ({ ...l, [kind]: newId }))
    onLogged?.(kind)
  }
  return (
    <div data-testid="reaction-chips">
      <div className="flex flex-wrap gap-1.5">
        {REACTION_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => void tap(k)}
            aria-pressed={!!logged[k]}
            title={logged[k] ? 'Tap again to undo' : `Log ${label(k).toLowerCase()} after using this`}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-pill font-medium transition-colors',
              dense ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[12.5px]',
              logged[k] ? 'bg-rose-400/25 text-rose-100 ring-1 ring-rose-300/50' : 'bg-white/8 text-ink/90 ring-1 ring-white/14 hover:bg-white/15'
            )}
          >
            {logged[k] ? <Undo2 className="h-3 w-3" /> : <span aria-hidden>{EMOJI[k]}</span>}
            {label(k)}
          </button>
        ))}
      </div>
      {history && past.length > 0 && (
        <p className="mt-2 text-[12px] text-ink/65">
          You’ve logged {past.length === 1 ? 'one reaction' : `${past.length} reactions`} to this — last: {label(past[0]!.kind).toLowerCase()}, {daysAgo(past[0]!.at)}.
        </p>
      )}
    </div>
  )
}

/** Labelled block for product screens. */
export function ReactionPanel({ productId, className }: { productId: string; className?: string }) {
  return (
    <section className={cn('rounded-[22px] bg-white/[0.06] p-4 ring-1 ring-white/10', className)} data-testid="reaction-panel">
      <p className="text-[14px] font-semibold">Did your skin react to this?</p>
      <p className="mb-3 text-[12.5px] text-ink/65">One tap logs it. SkinTwin looks for patterns across your reactions.</p>
      <ReactionChips productId={productId} />
    </section>
  )
}

/** Ingredients shared by products the user reacted to, with a confirm-first "add to avoid list". */
export function SuspectList({ suspects: given, max = 6, className }: { suspects?: Suspect[]; max?: number; className?: string }) {
  const db = useDb()
  const all = useSuspects()
  const suspects = (given ?? all).slice(0, max)
  const products = useProductMap()
  const [confirming, setConfirming] = useState<string | null>(null)
  if (!suspects.length) return null
  const add = async (s: Suspect) => {
    setConfirming(null)
    await mutate({ type: 'profile.update', patch: { avoidIngredients: [...db.profile.avoidIngredients, s.inci].slice(0, 50) } }, `Added ${s.inci} to your avoid list`)
  }
  return (
    <section className={cn('rounded-[22px] bg-amber-300/[0.07] p-4 ring-1 ring-amber-300/20', className)} data-testid="suspect-list">
      <p className="flex items-center gap-2 text-[14px] font-semibold">
        <ShieldAlert className="h-4 w-4 text-amber-300" /> Possible triggers
      </p>
      <p className="mt-0.5 mb-3 text-[12.5px] text-ink/70">{SUSPECT_DISCLAIMER}</p>
      <ul className="space-y-2">
        {suspects.map((s) => {
          const avoided = onAvoidList(s, db.profile.avoidIngredients)
          const names = s.productIds.map((id) => products.get(id)?.name).filter(Boolean)
          return (
            <li key={s.key} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium">{s.name}</p>
                <p className="truncate text-[12px] text-ink/60">In {names.join(', ')}</p>
              </div>
              {avoided ? (
                <span className="inline-flex items-center gap-1 text-[12px] text-mint-300">
                  <Check className="h-3.5 w-3.5" /> On avoid list
                </span>
              ) : confirming === s.key ? (
                <span className="flex items-center gap-1.5">
                  <button onClick={() => void add(s)} className="h-7 rounded-pill bg-amber-300/25 px-2.5 text-[12px] font-medium hover:bg-amber-300/35">
                    Yes, avoid {s.inci}
                  </button>
                  <button onClick={() => setConfirming(null)} className="h-7 rounded-pill px-2 text-[12px] text-ink/70 hover:text-ink">
                    Cancel
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirming(s.key)} className="h-7 shrink-0 rounded-pill bg-white/8 px-2.5 text-[12px] ring-1 ring-white/14 hover:bg-white/15">
                  Add to avoid list…
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Compact "Skin reacted?" link for list items; opens the chips in place. */
export function ReactionToggle({ productId, className }: { productId: string; className?: string }) {
  const db = useDb()
  const [open, setOpen] = useState(false)
  const count = db.reactions.filter((r) => r.productId === productId).length
  return (
    <div className={className}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-soft hover:text-ink" data-testid="reaction-toggle">
        <ShieldAlert className="h-3.5 w-3.5" />
        {open ? 'Done' : 'Skin reacted?'}
        {count > 0 && !open && <span className="rounded-pill bg-rose-400/20 px-1.5 text-[11px] text-rose-200">{count} logged</span>}
      </button>
      {open && (
        <div className="mt-2">
          <ReactionChips productId={productId} dense />
        </div>
      )}
    </div>
  )
}
