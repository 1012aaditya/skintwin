import { ArrowDown, ArrowLeft, ArrowUp, Minus, Trash2, TrendingUp } from 'lucide-react'
import type { SkinAnalysis } from '@shared/models'
import { LineChart } from '@renderer/components/LineChart'
import { Badge, Button, Card, CardHeader, EmptyState, SectionTitle } from '@renderer/components/ui'
import { cn } from '@renderer/lib/cn'
import { formatDate } from '@renderer/lib/format'
import { navigate, useRoute } from '@renderer/lib/router'
import { mutate, useDb } from '@renderer/lib/store'
import { AnalysisResult, summaryScore } from '../analysis/Analyze'

/** Change between two analyses for metrics both reported. Nothing is interpolated. */
function delta(current: SkinAnalysis, previous: SkinAnalysis | undefined) {
  if (!previous) return []
  return current.metrics.flatMap((m) => {
    const prev = previous.metrics.find((p) => p.key === m.key)
    if (m.score == null || prev?.score == null) return []
    return [{ key: m.key, label: m.label, now: m.score, change: Math.round((m.score - prev.score) * 10) / 10 }]
  })
}

export function Progress() {
  const db = useDb()
  const { query } = useRoute()
  const selectedId = query.get('analysis')
  const selected = selectedId ? db.analyses.find((a) => a.id === selectedId) : null
  const real = db.analyses.filter((a) => !a.isMock)
  const chrono = [...real].reverse()

  if (selected)
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/progress')}>
          <ArrowLeft className="h-4 w-4" /> All analyses
        </Button>
        <AnalysisResult analysis={selected} />
        <div className="flex justify-end">
          <Button
            variant="danger"
            size="sm"
            onClick={async () => {
              if (confirm('Delete this analysis? This can’t be undone.')) {
                await mutate({ type: 'analysis.delete', id: selected.id }, 'Analysis deleted')
                navigate('/progress')
              }
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete analysis
          </Button>
        </div>
      </div>
    )

  const metricKeys = [...new Set(real.flatMap((a) => a.metrics.map((m) => m.key)))]
  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Skin progress" title="How your skin is trending" body="Built only from analyses you’ve saved. Mock results are excluded. Lighting and camera differences affect scores, so look at trends over several analyses." />
      {real.length === 0 ? (
        <EmptyState icon={<TrendingUp />} title="No analyses yet" body="Run your first YouCam analysis to start tracking." action={<Button variant="primary" onClick={() => navigate('/analyze')}>Analyze my skin</Button>} />
      ) : (
        <>
          <Card strong className="p-6">
            <CardHeader icon={<TrendingUp />} title="Score over time" subtitle={real.length < 2 ? 'You need at least two analyses to see a trend.' : `${real.length} analyses`} />
            {real.length >= 2 && (
              <div className="mt-4">
                <LineChart points={chrono.flatMap((a) => (summaryScore(a).value == null ? [] : [{ x: formatDate(a.createdAt, { month: 'short', day: 'numeric' }), y: summaryScore(a).value! }]))} />
              </div>
            )}
          </Card>
          {real.length >= 2 && (
            <Card className="p-6">
              <CardHeader title="Per-metric trends" subtitle="Each line uses only the analyses that reported that metric." />
              <div className="mt-4 grid grid-cols-3 gap-4 max-[1180px]:grid-cols-2">
                {metricKeys.map((k) => {
                  const pts = chrono.flatMap((a) => {
                    const m = a.metrics.find((x) => x.key === k)
                    return m?.score == null ? [] : [{ x: formatDate(a.createdAt, { month: 'short', day: 'numeric' }), y: m.score }]
                  })
                  const name = real.find((a) => a.metrics.some((m) => m.key === k))?.metrics.find((m) => m.key === k)?.label ?? k
                  return (
                    <div key={k} className="glass-inset rounded-[20px] p-4">
                      <p className="text-sm font-semibold">{name}</p>
                      {pts.length >= 2 ? <LineChart points={pts} height={130} /> : <p className="py-6 text-xs text-ink-faint">Not enough data for this metric.</p>}
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
        </>
      )}
      {db.analyses.length > 0 && (
        <Card className="p-6">
          <CardHeader title="All analyses" />
          <div className="mt-3 divide-y divide-white/8">
            {db.analyses.map((a, i) => {
              const prev = db.analyses.slice(i + 1).find((x) => x.isMock === a.isMock)
              const s = summaryScore(a).value
              const ps = prev ? summaryScore(prev).value : null
              const ch = s != null && ps != null ? Math.round(s - ps) : null
              const top = delta(a, prev).sort((x, y) => Math.abs(y.change) - Math.abs(x.change))[0]
              return (
                <button key={a.id} className="flex w-full items-center gap-4 py-3 text-left hover:bg-white/5" onClick={() => navigate(`/progress?analysis=${encodeURIComponent(a.id)}`)}>
                  <span className="w-36 text-sm">{formatDate(a.createdAt)}</span>
                  <Badge tone={a.isMock ? 'demo' : 'success'}>{s ?? '—'}/100</Badge>
                  {ch != null && (
                    <span className={cn('flex items-center gap-1 text-sm', ch > 0 ? 'text-mint-300' : ch < 0 ? 'text-rose-300' : 'text-ink-soft')}>
                      {ch > 0 ? <ArrowUp className="h-3.5 w-3.5" /> : ch < 0 ? <ArrowDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                      {ch > 0 ? `+${ch}` : ch}
                    </span>
                  )}
                  <span className="flex-1 truncate text-[13px] text-ink-soft">{top ? `Biggest change: ${top.label} ${top.change > 0 ? '+' : ''}${top.change}` : a.isMock ? 'Mock data' : ''}</span>
                </button>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
