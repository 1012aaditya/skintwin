import { describe, expect, it } from 'vitest'
import type { SkinAnalysis } from '@shared/models'
import { comparable, metricDeltas, previousRealScan, scanScore, scanSummary } from '@shared/skin'

const scan = (id: string, day: number, scores: Record<string, number>, extra: Partial<SkinAnalysis> = {}): SkinAnalysis => ({
  id,
  createdAt: `2026-10-${String(day).padStart(2, '0')}T09:00:00.000Z`,
  provider: 'youcam',
  isMock: false,
  overallScore: null,
  skinAge: null,
  skinType: null,
  metrics: Object.entries(scores).map(([key, score]) => ({ key, label: key[0]!.toUpperCase() + key.slice(1), score, raw: null })),
  taskId: null,
  ...extra
})

describe('skin scan summary', () => {
  const old = scan('old', 1, { moisture: 60, redness: 50 })
  const mock = scan('mock', 10, { moisture: 99, redness: 99 }, { isMock: true, provider: 'mock' })
  const now = scan('now', 20, { moisture: 70, redness: 54 })
  const all = [now, mock, old] // newest first, as stored

  it('scores with YouCam’s overall score, else the metric average', () => {
    expect(scanScore(now).value).toBe(62)
    expect(scanScore({ ...now, overallScore: 81 }).value).toBe(81)
  })

  it('compares against the previous real scan, skipping mocks', () => {
    expect(previousRealScan(all, now)?.id).toBe('old')
    const s = scanSummary(now, all)
    expect(s.change).toBe(7)
    expect(s.lowest?.key).toBe('redness')
    expect(s.line).toBe('Skin score 62 · lowest redness 54 · up 7 since 1 Oct')
  })

  it('says when there is nothing to compare with', () => {
    expect(scanSummary(old, all).line).toBe('Skin score 55 · lowest redness 50 · first real scan')
  })

  it('labels mock results and never compares them', () => {
    const s = scanSummary(mock, all)
    expect(s.change).toBeNull()
    expect(s.line).toMatch(/^Mock result, not real · /)
    expect(metricDeltas(mock, old)).toEqual([])
  })

  it('lists per-metric changes, biggest first', () => {
    expect(metricDeltas(now, old).map((d) => [d.key, d.delta])).toEqual([['moisture', 10], ['redness', 4]])
  })

  it('only compares scans taken in similar conditions', () => {
    const cap = (c: Partial<NonNullable<SkinAnalysis['capture']>> = {}) => ({ source: 'live' as const, camera: 'FaceTime HD Camera', lightMean: 0.5, lightBalance: 0.9, effectsOn: [], exposureLocked: false, skinDetail: 0.05, ...c })
    const a = scan('a', 1, { moisture: 60 }, { capture: cap() })
    const dim = scan('dim', 5, { moisture: 40 }, { capture: cap({ lightMean: 0.3 }) })
    const effect = scan('fx', 8, { moisture: 90 }, { capture: cap({ effectsOn: ['lightingCorrection'] }) })
    const b = scan('b', 12, { moisture: 66 }, { capture: cap({ lightMean: 0.55 }) })
    expect(comparable(b, dim)).toMatchObject({ ok: false, reason: 'very different light' })
    expect(comparable(b, effect)).toMatchObject({ ok: false, reason: 'a camera effect was on' })
    expect(comparable(b, scan('up', 2, {}, { capture: cap({ source: 'upload' }) })).ok).toBe(false)
    expect(comparable(b, old)).toEqual({ ok: true, known: false, reason: null }) // saved before conditions were recorded
    expect(previousRealScan([b, effect, dim, a], b)?.id).toBe('a')
    expect(scanSummary(b, [b, dim]).line).toMatch(/no earlier scan in similar light to compare$/)
  })

  it('rounds changes so floating-point noise never shows', () => {
    const a = scan('a', 1, {}, { overallScore: 91.6 })
    const b = scan('b', 2, { moisture: 70.1 }, { overallScore: 89.3 })
    const s = scanSummary(b, [b, a])
    expect(s.change).toBe(-2.3)
    expect(s.line).toBe('Skin score 89.3 · lowest moisture 70.1 · down 2.3 since 1 Oct')
    expect(metricDeltas(scan('c', 3, { moisture: 0.3 }), scan('d', 1, { moisture: 0.1 }))[0]!.delta).toBe(0.2)
  })
})
