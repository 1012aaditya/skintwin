import { describe, expect, it } from 'vitest'
import { currentActivity } from '@shared/activity'
import { sunNotices, sunText, uvPeak, type UvForecast } from '@shared/sun'
import { fresh, run } from './helpers'

// Mumbai-style forecast: place time is UTC+5:30; values as Open-Meteo returned them on 2 Nov
const UV = [0, 0, 0, 0, 0, 0, 0, 0.15, 1.1, 2.95, 3.65, 5.95, 6.8, 6.65, 5.7, 3.65, 1.4, 0.25, 0, 0, 0, 0, 0, 0]
const forecast = (uv = UV, day = '2026-11-02'): UvForecast => ({
  place: 'Mumbai, India',
  fetchedAt: '2026-11-02T00:30:00.000Z',
  utcOffsetSeconds: 19800,
  hours: uv.map((v, h) => ({ time: `${day}T${String(h).padStart(2, '0')}:00`, uv: v }))
})
/** a moment at the given Mumbai hour on 2 Nov */
const mumbai = (h: number, m = 10) => new Date(Date.UTC(2026, 10, 2, h, m) - 19800 * 1000)

describe('sun alerts', () => {
  it('finds the day’s peak from the forecast itself', () => {
    expect(uvPeak(forecast(), mumbai(8))).toEqual({ uv: 6.8, hour: 12 })
  })

  it('gives a morning heads-up when the peak is 3 or more', () => {
    const [n] = sunNotices(forecast(), mumbai(8), {})
    expect(n).toMatchObject({ kind: 'morning', key: 'sun:morning' })
    expect(sunText(n!)).toBe('UV peaks at 7 around noon — wear SPF')
    expect(sunNotices(forecast(UV.map((v) => v / 3)), mumbai(8), {})).toEqual([]) // peak ~2.3: no alert
    expect(sunNotices(forecast(), mumbai(5), {})).toEqual([]) // too early
  })

  it('nudges to reapply around midday when UV is 6 or more, at most once', () => {
    const at12 = sunNotices(forecast(), mumbai(12), {})
    expect(at12.map((n) => n.kind)).toEqual(['reapply', 'morning'])
    expect(sunText(at12[0]!)).toBe('UV is 7 right now — reapply sunscreen if you’re outdoors')
    expect(sunNotices(forecast(), mumbai(14), {})).toEqual([]) // 5.7 at 2 pm, and the peak has passed
    expect(sunNotices(forecast(), mumbai(12), { 'sun:reapply': { dismissedDay: '2026-11-02', snoozedUntil: null }, 'sun:morning': { dismissedDay: '2026-11-02', snoozedUntil: null } })).toEqual([])
  })

  it('says nothing without a forecast for today', () => {
    expect(sunNotices(null, mumbai(8), {})).toEqual([])
    expect(sunNotices(forecast(UV, '2026-11-01'), mumbai(8), {})).toEqual([])
  })

  it('joins the island queue after the routine, and can be turned off', () => {
    const db = fresh()
    expect(currentActivity(db, mumbai(8), forecast())).toMatchObject({ kind: 'sun', notice: { kind: 'morning' } })
    expect(currentActivity(run(db, { type: 'settings.update', patch: { companion: { sunAlerts: false } } }), mumbai(8), forecast())).toBeNull()
  })
})
