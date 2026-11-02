import type { AnalysisMetric, SkinAnalysis } from './models'

/**
 * Plain-language summaries of a skin scan, and how it compares with the last real one.
 * Mock analyses are placeholders, so they are never compared against.
 */

/** YouCam's overall score, or the average of its metric scores when it gives none. */
export function scanScore(a: SkinAnalysis): { value: number | null; label: string } {
  if (a.overallScore != null) return { value: a.overallScore, label: 'Overall score' }
  const scores = a.metrics.map((m) => m.score).filter((s): s is number => s != null)
  if (!scores.length) return { value: null, label: 'No score' }
  return { value: Math.round(scores.reduce((x, y) => x + y, 0) / scores.length), label: `Average of ${scores.length} scores` }
}

/** Face-light difference beyond which two scans' scores aren't worth comparing. */
export const LIGHT_TOLERANCE = 0.12

/**
 * Were two scans taken in similar enough conditions to compare? Scans saved before conditions
 * were recorded can't be judged, so they count as comparable (`known: false`).
 */
export function comparable(a: SkinAnalysis, b: SkinAnalysis): { ok: boolean; known: boolean; reason: string | null } {
  const x = a.capture
  const y = b.capture
  if (!x || !y) return { ok: true, known: false, reason: null }
  if ((x.effectsOn?.length ?? 0) > 0 || (y.effectsOn?.length ?? 0) > 0) return { ok: false, known: true, reason: 'a camera effect was on' }
  if (x.source !== y.source) return { ok: false, known: true, reason: 'one was an upload, one a live photo' }
  if (x.camera && y.camera && x.camera !== y.camera) return { ok: false, known: true, reason: 'different cameras' }
  if (x.lightMean != null && y.lightMean != null && Math.abs(x.lightMean - y.lightMean) > LIGHT_TOLERANCE) return { ok: false, known: true, reason: 'very different light' }
  return { ok: true, known: true, reason: null }
}

/** The most recent real (non-mock) scan before `current` taken in comparable conditions. `analyses` is newest first. */
export function previousRealScan(analyses: SkinAnalysis[], current: SkinAnalysis): SkinAnalysis | null {
  const t = Date.parse(current.createdAt)
  return analyses.find((a) => a.id !== current.id && !a.isMock && Date.parse(a.createdAt) < t && comparable(current, a).ok) ?? null
}

export function lowestMetric(a: SkinAnalysis): AnalysisMetric | null {
  return a.metrics.filter((m) => m.score != null).sort((x, y) => x.score! - y.score!)[0] ?? null
}

export interface MetricDelta {
  key: string
  label: string
  before: number
  after: number
  delta: number
}

/** Per-metric change between two scans, biggest moves first. Only metrics both scans scored. */
export function metricDeltas(current: SkinAnalysis, previous: SkinAnalysis | null): MetricDelta[] {
  if (!previous || current.isMock || previous.isMock) return []
  const before = new Map(previous.metrics.filter((m) => m.score != null).map((m) => [m.key, m.score!]))
  return current.metrics
    .filter((m) => m.score != null && before.has(m.key))
    .map((m) => ({ key: m.key, label: m.label, before: before.get(m.key)!, after: m.score!, delta: m.score! - before.get(m.key)! }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.label.localeCompare(b.label))
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export interface ScanSummary {
  score: number | null
  lowest: AnalysisMetric | null
  /** change in the summary score since the previous real scan */
  change: number | null
  previousAt: string | null
  /** the one line shown in the island and spoken aloud */
  line: string
}

export function scanSummary(current: SkinAnalysis, analyses: SkinAnalysis[]): ScanSummary {
  const score = scanScore(current).value
  const lowest = lowestMetric(current)
  const prev = current.isMock ? null : previousRealScan(analyses, current)
  const t = Date.parse(current.createdAt)
  const hadEarlier = analyses.some((a) => a.id !== current.id && !a.isMock && Date.parse(a.createdAt) < t)
  const prevScore = prev ? scanScore(prev).value : null
  const change = score != null && prevScore != null ? score - prevScore : null
  const parts = [
    current.isMock ? 'Mock result, not real' : null,
    score != null ? `Skin score ${score}` : 'No overall score',
    lowest ? `lowest ${lowest.label.toLowerCase()} ${lowest.score}` : null,
    change != null && prev ? (change === 0 ? `same as ${shortDate(prev.createdAt)}` : `${change > 0 ? 'up' : 'down'} ${Math.abs(change)} since ${shortDate(prev.createdAt)}`) : current.isMock || prev ? null : hadEarlier ? 'no earlier scan in similar light to compare' : 'first real scan'
  ]
  return { score, lowest, change, previousAt: prev?.createdAt ?? null, line: parts.filter(Boolean).join(' · ') }
}
