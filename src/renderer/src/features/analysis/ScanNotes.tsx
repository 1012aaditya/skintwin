import { AlertTriangle, Check, Info } from 'lucide-react'
import { useState } from 'react'
import type { CaptureConditions } from '@shared/models'
import { formatDate } from '@renderer/lib/format'
import { useDb } from '@renderer/lib/store'
import type { CameraSession } from './camera'
import { activeEffects, EFFECTS, type EffectState } from './facecheck'
import type { CaptureMeasure } from './useFaceGuide'

/**
 * What it takes to get a trustworthy, comparable skin photo: a one-screen checklist before
 * the camera opens, and a clear notice when a macOS video effect is altering the picture.
 */

const SEEN = 'skintwin.prescan.seen'
const SKIP = 'skintwin.prescan.skip'
const get = (k: string) => {
  try {
    return localStorage.getItem(k) === '1'
  } catch {
    return false
  }
}
const set = (k: string, v: boolean) => {
  try {
    if (v) localStorage.setItem(k, '1')
    else localStorage.removeItem(k)
  } catch {
    /* storage unavailable: the checklist just shows again next time */
  }
}

/** Show the checklist unless the user has seen it and chose to skip it. */
export const preScanNeeded = () => !(get(SEEN) && get(SKIP))

export function PreScanChecklist({ onStart, onCancel }: { onStart: () => void; onCancel?: () => void }) {
  const db = useDb()
  const seen = get(SEEN)
  const [skipNext, setSkipNext] = useState(false)
  const last = db.analyses.find((a) => !a.isMock)
  const items = [
    'Clean, dry face',
    'No makeup or tinted sunscreen',
    'Glasses off, hair pulled back',
    last ? `Same spot and light as last time (${formatDate(last.createdAt)}${last.capture?.camera ? `, ${last.capture.camera}` : ''})` : 'A spot with soft, even light you can come back to',
    'Video effects off: Control Center › Video Effects (Portrait, Studio Light, Center Stage)'
  ]
  return (
    <div className="space-y-3" data-testid="prescan">
      <p className="text-[15px] font-semibold">Before you scan</p>
      <p className="text-[13px] text-ink-soft">YouCam reads fine skin detail, so an unfiltered photo in the same conditions each time gives results you can trust and compare.</p>
      <ul className="space-y-2">
        {items.map((t) => (
          <li key={t} className="flex items-start gap-2.5 text-[13.5px]">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-mint-300" />
            {t}
          </li>
        ))}
      </ul>
      {seen && (
        <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
          <input type="checkbox" checked={skipNext} onChange={(e) => setSkipNext(e.target.checked)} /> Don’t show this before every scan
        </label>
      )}
      <div className="flex justify-center gap-2 pt-1">
        {onCancel && (
          <button onClick={onCancel} className="inline-flex h-10 items-center rounded-pill border border-white/18 bg-white/8 px-4 text-[13.5px] hover:bg-white/15">
            Not now
          </button>
        )}
        <button
          onClick={() => {
            set(SEEN, true)
            set(SKIP, skipNext)
            onStart()
          }}
          className="inline-flex h-10 items-center rounded-pill bg-gradient-to-r from-[#9a74ff] to-[#c48fff] px-5 text-[13.5px] font-medium text-white"
        >
          I’m ready — open the camera
        </button>
      </div>
    </div>
  )
}

/** Effects still altering the picture: auto-capture waits until they're off. */
export function EffectsNotice({ effects, studioLightUnknown }: { effects: EffectState[]; studioLightUnknown: boolean }) {
  const on = activeEffects(effects)
  if (on.length)
    return (
      <div className="rounded-2xl border border-amber-300/40 bg-amber-300/10 p-3 text-[13px]" role="alert" data-testid="effects-on">
        <p className="flex items-center gap-2 font-semibold text-amber-100">
          <AlertTriangle className="h-4 w-4" /> {on.map((e) => EFFECTS[e.key].name).join(' and ')} {on.length > 1 ? 'are' : 'is'} changing your picture
        </p>
        <ul className="mt-1 space-y-0.5 text-ink/85">
          {on.map((e) => (
            <li key={e.key}>{EFFECTS[e.key].fix}</li>
          ))}
        </ul>
        <p className="mt-1 text-[12px] text-ink-soft">SkinTwin won’t take the photo by itself until {on.length > 1 ? 'they’re' : 'it’s'} off.</p>
      </div>
    )
  if (studioLightUnknown)
    return (
      <p className="flex items-start gap-2 text-[12px] text-ink-soft">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> SkinTwin can’t tell whether Studio Light is on. Check Control Center › Video Effects.
      </p>
    )
  return null
}

/** What gets saved with the analysis about how the photo was taken. Never the photo. */
export function liveConditions(session: CameraSession | null, measure: CaptureMeasure, exposureLocked: boolean): CaptureConditions {
  const reported = session?.effects.filter((e) => e.on != null) ?? []
  return {
    source: 'live',
    camera: session?.label?.slice(0, 120) ?? null,
    lightMean: measure.light ? round(measure.light.mean) : null,
    lightBalance: measure.light ? round(measure.light.balance) : null,
    effectsOn: reported.length ? activeEffects(reported).map((e) => e.key) : null,
    exposureLocked,
    skinDetail: measure.detail != null ? round(measure.detail, 4) : null
  }
}

export function uploadConditions(measure: CaptureMeasure | null): CaptureConditions {
  return {
    source: 'upload',
    camera: null,
    lightMean: measure?.light ? round(measure.light.mean) : null,
    lightBalance: measure?.light ? round(measure.light.balance) : null,
    effectsOn: null,
    exposureLocked: false,
    skinDetail: measure?.detail != null ? round(measure.detail, 4) : null
  }
}

const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d
