import { ArrowDown, ArrowUp, CalendarRange, Minus, Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import { label } from '@shared/models'
import { dayKey, describeSince, productUses, realScans, sinceStarted } from '@shared/timeline'
import { scanScore } from '@shared/skin'
import { Card, CardHeader, EmptyState } from '@renderer/components/ui'
import { cn } from '@renderer/lib/cn'
import { navigate } from '@renderer/lib/router'
import { todayKey, useDb, useProductMap } from '@renderer/lib/store'

/**
 * Scans, products and reactions on one time axis, plus "since you started X" patterns.
 * Built only from what the user recorded; mock scans are left out.
 */

const DAY = 86_400_000
const t = (day: string) => Date.parse(`${day}T12:00:00`)
const short = (day: string) => new Date(t(day)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export function SkinTimeline() {
  const db = useDb()
  const products = useProductMap()
  const today = todayKey()
  const uses = useMemo(() => productUses(db, today), [db, today])
  const scans = useMemo(() => realScans(db.analyses), [db.analyses])
  const insights = useMemo(() => sinceStarted(db, today), [db, today])
  const name = (id: string) => products.get(id)?.name ?? 'A product you removed'

  const days = [...uses.map((u) => u.start), ...scans.map((a) => dayKey(a.createdAt)), ...db.reactions.map((r) => dayKey(r.at)), today]
  if (uses.length === 0 && scans.length === 0 && db.reactions.length === 0)
    return (
      <EmptyState
        icon={<CalendarRange />}
        title="Your timeline starts with your first scan or routine tick"
        body="Tick off routine steps, log reactions and scan every week or two — SkinTwin then shows what changed after you started each product."
      />
    )

  const lo = Math.min(...days.map(t)) - 2 * DAY
  const hi = t(today) + 2 * DAY
  const W = 1000
  const left = 190
  const x = (ms: number) => left + ((ms - lo) / Math.max(DAY, hi - lo)) * (W - left - 16)
  const lanes = uses.slice(0, 10)
  const laneH = 30
  const top = 64
  const H = top + Math.max(1, lanes.length) * laneH + 34
  // whole days, at most ~7 labels, so short spans don't repeat a date
  const step = Math.max(1, Math.ceil((hi - lo) / DAY / 7)) * DAY
  const ticks: number[] = []
  for (let ms = t(dayKey(new Date(lo + DAY).toISOString())); ms < hi; ms += step) ticks.push(ms)

  return (
    <div className="space-y-5" data-testid="timeline">
      <Card strong className="p-6">
        <CardHeader icon={<CalendarRange />} title="Your skin timeline" subtitle="Scans, the products you started and stopped, and reactions you logged — on one axis." />
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label="Skin timeline">
          {ticks.map((ms) => (
            <g key={ms}>
              <line x1={x(ms)} x2={x(ms)} y1={18} y2={H - 26} stroke="#fff" strokeOpacity="0.07" />
              <text x={x(ms)} y={H - 8} textAnchor="middle" fontSize="12" fill="#e9defe" opacity="0.6">
                {new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </text>
            </g>
          ))}
          <line x1={x(t(today))} x2={x(t(today))} y1={14} y2={H - 26} stroke="#b18cff" strokeOpacity="0.5" strokeDasharray="3 4" />
          <text x={16} y={38} fontSize="13" fontWeight="600" fill="#f3edff">Scans</text>
          {scans.length === 0 && (
            <text x={left} y={38} fontSize="12" fill="#e9defe" opacity="0.6">
              No real scans yet — mock results aren’t shown
            </text>
          )}
          {scans.map((a) => {
            const s = scanScore(a).value
            const cx = x(Date.parse(a.createdAt))
            return (
              <g key={a.id} className="cursor-pointer" onClick={() => navigate(`/progress?analysis=${encodeURIComponent(a.id)}`)}>
                <title>{`Scan ${short(dayKey(a.createdAt))}: ${s ?? '—'}/100`}</title>
                <circle cx={cx} cy={34} r={13} fill="#7ef0be" fillOpacity="0.2" stroke="#7ef0be" />
                <text x={cx} y={38.5} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#e8fff5">
                  {s ?? '—'}
                </text>
              </g>
            )
          })}
          {lanes.map((u, i) => {
            const y = top + i * laneH + laneH / 2
            const x0 = x(t(u.start))
            const x1 = x(t(u.stop ?? today))
            const reactions = db.reactions.filter((r) => r.productId === u.productId)
            return (
              <g key={u.productId}>
                <text x={16} y={y + 4} fontSize="12.5" fill="#e9defe">
                  {name(u.productId).length > 24 ? `${name(u.productId).slice(0, 23)}…` : name(u.productId)}
                </text>
                <rect x={x0} y={y - 6} width={Math.max(4, x1 - x0)} height={12} rx={6} fill="#b18cff" fillOpacity={u.stop ? 0.3 : 0.6}>
                  <title>{`${name(u.productId)}: started ${short(u.start)} (${u.startBasis === 'routine' ? 'first routine tick' : 'opened'})${u.stop ? `, stopped ${short(u.stop)} (${u.stopBasis === 'no_recent_use' ? 'no use logged since' : label(u.stopBasis ?? '')})` : ', still in use'}`}</title>
                </rect>
                {reactions.map((r) => (
                  <g key={r.id}>
                    <title>{`${label(r.kind)} on ${short(dayKey(r.at))}${r.note ? ` — ${r.note}` : ''}`}</title>
                    <circle cx={x(Date.parse(r.at))} cy={y} r={6} fill="#fb7194" stroke="#1d1546" strokeWidth="2" />
                  </g>
                ))}
              </g>
            )
          })}
          {/* reactions to products with no recorded use still belong on the axis */}
          {db.reactions
            .filter((r) => !lanes.some((u) => u.productId === r.productId))
            .map((r) => (
              <g key={r.id}>
                <title>{`${label(r.kind)} after ${name(r.productId)}, ${short(dayKey(r.at))}`}</title>
                <circle cx={x(Date.parse(r.at))} cy={H - 34} r={5} fill="#fb7194" />
              </g>
            ))}
        </svg>
        <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-ink-soft">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-mint-300 bg-mint-300/20" /> Scan (score)</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-full bg-lilac-300/60" /> In use (from routine ticks / opened date)</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> Reaction</span>
          {uses.length > lanes.length && <span>+{uses.length - lanes.length} more products not shown</span>}
        </div>
      </Card>

      <Card className="p-6" data-testid="since-started">
        <CardHeader icon={<Sparkles />} title="Since you started…" subtitle="Needs a scan before you started a product and one after, in similar light. Skin changes for many reasons — read these as patterns, not proof." />
        {insights.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-ink-soft">Nothing to compare yet. Scan before you start something new, then again a couple of weeks later.</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {insights.map((s) => (
              <li key={s.productId} className="glass-inset flex items-start gap-3 rounded-2xl p-3.5 text-[13.5px]">
                {s.direction === 'better' ? <ArrowUp className="mt-0.5 h-4 w-4 shrink-0 text-mint-300" /> : s.direction === 'worse' ? <ArrowDown className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" /> : <Minus className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />}
                <span className={cn('flex-1', s.early && 'text-ink-soft')}>{describeSince(s, name(s.productId))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
