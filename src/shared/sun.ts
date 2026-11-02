import { z } from 'zod'
import type { Database } from './models'
import { silenced } from './notices'

/**
 * Sun alerts from a real UV forecast (Open-Meteo), for the city the user set. Nothing is
 * estimated: no forecast, or a stale one, means no alert. Pure, so the rules are tested.
 */

export const UV_SOURCE = 'Open-Meteo.com'
export const UV_SOURCE_URL = 'https://open-meteo.com/'

export const UvForecastSchema = z.object({
  place: z.string().max(200),
  fetchedAt: z.string(),
  /** the place's offset from UTC; hour strings below are in the place's local time */
  utcOffsetSeconds: z.number().int(),
  hours: z.array(z.object({ time: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), uv: z.number().min(0).max(30).nullable() })).max(48)
})
export type UvForecast = z.infer<typeof UvForecastSchema>

/** Sunscreen advice usually starts at UV 3 (moderate); 6+ is high. */
export const UV_MODERATE = 3
export const UV_HIGH = 6
/** Morning heads-up from 6:00 until 13:00; reapply nudge from 11:00 until 15:00 (place time). */
const MORNING = [6, 13] as const
const MIDDAY = [11, 15] as const

/** Date and hour at the forecast's place right now. */
function placeNow(f: UvForecast, now: Date): { day: string; hour: number } {
  const t = new Date(now.getTime() + f.utcOffsetSeconds * 1000)
  return { day: t.toISOString().slice(0, 10), hour: t.getUTCHours() }
}

export interface SunNotice {
  kind: 'morning' | 'reapply'
  key: string
  uv: number
  /** hour (0–23, place time) of the day's peak, for the morning notice */
  peakHour: number
  place: string
}

const fmtHour = (h: number) => (h === 0 ? 'midnight' : h === 12 ? 'noon' : h < 12 ? `${h} am` : `${h - 12} pm`)

/** Today's peak UV at the place, from the forecast's own hours. */
export function uvPeak(f: UvForecast, now: Date): { uv: number; hour: number } | null {
  const { day } = placeNow(f, now)
  let best: { uv: number; hour: number } | null = null
  for (const h of f.hours) {
    if (!h.time.startsWith(day) || h.uv == null) continue
    if (!best || h.uv > best.uv) best = { uv: h.uv, hour: Number(h.time.slice(11, 13)) }
  }
  return best
}

/** At most two alerts a day — a morning heads-up and one midday reapply nudge — each dismissable. */
export function sunNotices(f: UvForecast | null, now: Date, notices: Database['notices']): SunNotice[] {
  if (!f) return []
  const { day, hour } = placeNow(f, now)
  const peak = uvPeak(f, now)
  if (!peak) return [] // forecast isn't for today: say nothing rather than guess
  const out: SunNotice[] = []
  const current = f.hours.find((h) => h.time === `${day}T${String(hour).padStart(2, '0')}:00`)?.uv ?? null
  if (hour >= MIDDAY[0] && hour < MIDDAY[1] && current != null && current >= UV_HIGH) out.push({ kind: 'reapply', key: 'sun:reapply', uv: current, peakHour: peak.hour, place: f.place })
  if (hour >= MORNING[0] && hour < MORNING[1] && peak.uv >= UV_MODERATE && hour <= peak.hour) out.push({ kind: 'morning', key: 'sun:morning', uv: peak.uv, peakHour: peak.hour, place: f.place })
  return out.filter((n) => !silenced(notices, n.key, now))
}

export function sunText(n: SunNotice): string {
  const uv = Math.round(n.uv)
  return n.kind === 'morning' ? `UV peaks at ${uv} around ${fmtHour(n.peakHour)} — wear SPF` : `UV is ${uv} right now — reapply sunscreen if you’re outdoors`
}
