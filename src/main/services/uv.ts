import { z } from 'zod'
import type { Place } from '@shared/models'
import { UvForecastSchema, type UvForecast } from '@shared/sun'

/**
 * Open-Meteo (open-meteo.com): free, no key. The geocoding API turns a city name into
 * coordinates once; the forecast API gives hourly UV for that spot. Only the city name typed
 * in Settings and the chosen coordinates are sent — nothing else about the user.
 */

const UA = 'SkinTwin/0.1 (desktop skincare companion)'
const TIMEOUT_MS = 10_000

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const GeoSchema = z.object({
  results: z
    .array(z.object({ name: z.string(), latitude: z.number(), longitude: z.number(), country: z.string().optional(), admin1: z.string().optional() }))
    .optional()
})

export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim().slice(0, 80)
  if (q.length < 2) return []
  const raw = GeoSchema.parse(await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`))
  return (raw.results ?? []).map((r) => ({ name: r.name.slice(0, 120), region: r.admin1?.slice(0, 120) ?? null, country: r.country?.slice(0, 80) ?? null, latitude: r.latitude, longitude: r.longitude }))
}

const ForecastSchema = z.object({
  utc_offset_seconds: z.number().int(),
  hourly: z.object({ time: z.array(z.string()), uv_index: z.array(z.number().nullable()) })
})

export const placeLabel = (p: Place) => [p.name, p.country].filter(Boolean).join(', ')

export async function fetchUv(place: Place): Promise<UvForecast> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude.toFixed(3)}&longitude=${place.longitude.toFixed(3)}&hourly=uv_index&timezone=auto&forecast_days=1`
  const raw = ForecastSchema.parse(await getJson(url))
  return UvForecastSchema.parse({
    place: placeLabel(place),
    fetchedAt: new Date().toISOString(),
    utcOffsetSeconds: raw.utc_offset_seconds,
    hours: raw.hourly.time.slice(0, 48).map((time, i) => ({ time, uv: raw.hourly.uv_index[i] ?? null }))
  })
}
