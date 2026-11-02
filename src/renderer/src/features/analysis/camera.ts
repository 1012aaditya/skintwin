import { activeEffects, cameraEffects, type EffectState } from './facecheck'

/**
 * Opens the camera for a skin photo and asks it for an unprocessed picture: macOS video
 * effects are switched off where the browser allows it, and exposure / white balance are
 * held once auto has settled, so scans taken in the same spot look alike.
 */

export interface CameraSession {
  stream: MediaStream
  label: string | null
  /** every effect the browser reports, after trying to switch them off */
  effects: EffectState[]
  /** true when the browser exposes nothing about lighting correction (Studio Light) */
  studioLightUnknown: boolean
  /** call once auto exposure has settled; returns whether anything could be held */
  lockExposure: () => Promise<boolean>
}

const read = (t: MediaStreamTrack) => ({
  caps: ((t.getCapabilities?.() ?? {}) as unknown as Record<string, unknown>),
  settings: ((t.getSettings?.() ?? {}) as unknown as Record<string, unknown>)
})

export async function openCamera(): Promise<CameraSession> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'user' } })
  const track = stream.getVideoTracks()[0]!
  let { caps, settings } = read(track)
  const before = cameraEffects(caps, settings)
  const off = before.filter((e) => e.on && e.adjustable).map((e) => ({ [e.key]: false }))
  if (off.length) {
    await track.applyConstraints({ advanced: off as MediaTrackConstraintSet[] }).catch(() => undefined)
    ;({ caps, settings } = read(track))
  }
  const effects = cameraEffects(caps, settings)
  // Field names and values only — never frames.
  console.info('[camera] effects', JSON.stringify(effects.map((e) => [e.key, e.on, e.adjustable])), 'exposure', JSON.stringify({ modes: caps.exposureMode ?? null, wb: caps.whiteBalanceMode ?? null }))

  const lockExposure = async () => {
    const { caps: c, settings: s } = read(track)
    const set: Record<string, unknown> = {}
    if (Array.isArray(c.exposureMode) && c.exposureMode.includes('manual') && typeof s.exposureTime === 'number') Object.assign(set, { exposureMode: 'manual', exposureTime: s.exposureTime })
    if (Array.isArray(c.whiteBalanceMode) && c.whiteBalanceMode.includes('manual') && typeof s.colorTemperature === 'number') Object.assign(set, { whiteBalanceMode: 'manual', colorTemperature: s.colorTemperature })
    if (!Object.keys(set).length) return false
    return track.applyConstraints({ advanced: [set as MediaTrackConstraintSet] }).then(
      () => true,
      () => false
    )
  }

  return { stream, label: track.label || null, effects, studioLightUnknown: effects.find((e) => e.key === 'lightingCorrection')?.on == null, lockExposure }
}

export { activeEffects }
