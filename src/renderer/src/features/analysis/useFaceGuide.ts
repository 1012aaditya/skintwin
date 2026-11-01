import { useEffect, useRef, useState, type RefObject } from 'react'
import type { FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision'
// Bundled with the app (no CDN at runtime): the WASM runtime and the face model.
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import modelPath from '@renderer/assets/face_landmarker.task?url'
import { coverCrop } from '@renderer/lib/media'
import { allOk, boxInCrop, evaluateFace, faceCrop, measureLight, poseFromMatrix, sharpness, type Check, type FaceMeasure, type LightMeasure, type Rect } from './facecheck'

export const CAPTURE_ASPECT = 4 / 5
/** YouCam needs ≥480px on the short side; leave headroom. */
export const MIN_CAPTURE_SHORT_SIDE = 720
/** How long every check must stay green before the photo is taken. */
const HOLD_MS = 900

type Mode = 'VIDEO' | 'IMAGE'
const landmarkers: Partial<Record<Mode, Promise<FaceLandmarker>>> = {}

/** One face tracker per mode, created on first use and kept for the session. */
function getLandmarker(mode: Mode): Promise<FaceLandmarker> {
  landmarkers[mode] ??= import('@mediapipe/tasks-vision')
    .then(({ FaceLandmarker }) =>
      FaceLandmarker.createFromOptions(
        { wasmLoaderPath, wasmBinaryPath },
        {
          baseOptions: { modelAssetPath: modelPath },
          runningMode: mode,
          numFaces: 2, // two, so "someone else is in the photo" can be detected
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true
        }
      )
    )
    .catch((err: unknown) => {
      delete landmarkers[mode]
      throw err
    })
  return landmarkers[mode]
}

const blend = (r: FaceLandmarkerResult, name: string) => r.faceBlendshapes?.[0]?.categories.find((c) => c.categoryName === name)?.score ?? 0

/** Pixels of a source region scaled into a small scratch canvas. */
function pixels(scratch: HTMLCanvasElement, src: CanvasImageSource, r: Rect, w: number, h: number) {
  scratch.width = w
  scratch.height = h
  const ctx = scratch.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h).data
}

/** Face measurements for one detection result. `crop` is the region YouCam will receive, in source pixels. */
function measure(r: FaceLandmarkerResult, src: CanvasImageSource, srcW: number, srcH: number, crop: Rect, scratch: HTMLCanvasElement, prev: { x: number; y: number }[] | null): FaceMeasure & { points: { x: number; y: number }[] | null; faceRect: Rect | null } {
  const faces = r.faceLandmarks.length
  if (faces !== 1) return { faces, box: null, yaw: 0, pitch: 0, roll: 0, eyesClosed: 0, mouthOpen: 0, smile: 0, light: null, motion: null, points: null, faceRect: null }
  const lms = r.faceLandmarks[0]!
  const box = boxInCrop(lms, srcW, srcH, crop)
  const pose = r.facialTransformationMatrixes?.[0] ? poseFromMatrix(r.facialTransformationMatrixes[0].data) : { yaw: 0, pitch: 0, roll: 0 }
  // Face box in source pixels, clamped to the frame.
  const fx = Math.max(0, crop.x + box.x * crop.w)
  const fy = Math.max(0, crop.y + box.y * crop.h)
  const faceRect = { x: fx, y: fy, w: Math.max(1, Math.min(srcW - fx, box.w * crop.w)), h: Math.max(1, Math.min(srcH - fy, box.h * crop.h)) }
  const light = measureLight(pixels(scratch, src, faceRect, 40, 50), 40, 50)
  // Sample every 8th landmark for the "holding still" check, in crop-normalised units.
  const points = lms.filter((_, i) => i % 8 === 0).map((p) => ({ x: (p.x * srcW) / crop.w, y: (p.y * srcH) / crop.h }))
  // Lips apart (e.g. a toothy smile) with the jaw closed: inner-lip gap (13↔14) over face height (10↔152).
  const lipGap = Math.abs(lms[14]!.y - lms[13]!.y) / Math.max(1e-6, Math.abs(lms[152]!.y - lms[10]!.y))
  const mouthOpen = Math.max(blend(r, 'jawOpen'), Math.min(1, lipGap / 0.1))
  const smile = Math.max(blend(r, 'mouthSmileLeft'), blend(r, 'mouthSmileRight'))
  const motion = prev && prev.length === points.length ? points.reduce((s, p, i) => s + Math.hypot(p.x - prev[i]!.x, p.y - prev[i]!.y), 0) / points.length : null
  return { faces, box, ...pose, eyesClosed: Math.max(blend(r, 'eyeBlinkLeft'), blend(r, 'eyeBlinkRight')), mouthOpen, smile, light, motion, points, faceRect }
}

/**
 * Lighting heatmap over the face: blue where it's too dark, orange where it's blown out,
 * a faint green where it's right. Drawn in crop space; the canvas is mirrored by CSS like the video.
 */
function drawOverlay(canvas: HTMLCanvasElement, box: Rect | null, light: LightMeasure | null, ready: boolean) {
  const ctx = canvas.getContext('2d')!
  const { width: W, height: H } = canvas
  ctx.clearRect(0, 0, W, H)
  if (!box || !light) return
  const bx = box.x * W
  const by = box.y * H
  const bw = box.w * W
  const bh = box.h * H
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(bx + bw / 2, by + bh / 2, bw * 0.47, bh * 0.5, 0, 0, Math.PI * 2)
  ctx.clip()
  ctx.filter = `blur(${Math.round(bw / 14)}px)`
  const rows = light.grid.length
  const cols = light.grid[0]?.length ?? 0
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const l = light.grid[gy]![gx]!
      if (Number.isNaN(l)) continue
      ctx.fillStyle =
        l < 0.3 ? `rgb(70 140 255 / ${Math.min(0.55, (0.3 - l) * 2.5 + 0.2)})`
        : l > 0.82 ? `rgb(255 140 70 / ${Math.min(0.55, (l - 0.82) * 3 + 0.2)})`
        : `rgb(120 240 190 / ${ready ? 0.16 : 0.08})`
      ctx.fillRect(bx + (gx / cols) * bw - 2, by + (gy / rows) * bh - 2, bw / cols + 4, bh / rows + 4)
    }
  }
  ctx.restore()
}

export type GuideStatus = 'loading' | 'ready' | 'unavailable'

/**
 * Live photo guide for the camera: checks each frame against YouCam's rules, paints the
 * lighting heatmap into `overlayRef`, and once every check has held for HOLD_MS calls
 * `onCapture` with the sharpest good frame (mirrored, 4:5, ≥720px).
 */
export function useFaceGuide(videoRef: RefObject<HTMLVideoElement | null>, overlayRef: RefObject<HTMLCanvasElement | null>, active: boolean, onCapture: (photo: HTMLCanvasElement) => void) {
  const [status, setStatus] = useState<GuideStatus>('loading')
  const [checks, setChecks] = useState<Check[]>([])
  const [hold, setHold] = useState(0)
  const captureRef = useRef(onCapture)
  captureRef.current = onCapture

  useEffect(() => {
    if (!active) return
    let stopped = false
    let raf = 0
    let lastTs = -1
    let prev: { x: number; y: number }[] | null = null
    let goodSince: number | null = null
    let best: { canvas: HTMLCanvasElement; score: number } | null = null
    const scratch = document.createElement('canvas')
    let lastUi = 0

    const snapshot = (v: HTMLVideoElement, crop: Rect) => {
      const scale = Math.max(1, MIN_CAPTURE_SHORT_SIDE / crop.w)
      const c = document.createElement('canvas')
      c.width = Math.round(crop.w * scale)
      c.height = Math.round(crop.h * scale)
      const ctx = c.getContext('2d')!
      ctx.translate(c.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(v, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height)
      return c
    }

    setStatus('loading')
    getLandmarker('VIDEO')
      .then((lm) => {
        if (stopped) return
        setStatus('ready')
        const tick = () => {
          if (stopped) return
          raf = requestAnimationFrame(tick)
          const v = videoRef.current
          const overlay = overlayRef.current
          if (!v || v.readyState < 2 || !v.videoWidth) return
          const now = performance.now()
          if (now <= lastTs) return
          lastTs = now
          const crop = coverCrop(v.videoWidth, v.videoHeight, CAPTURE_ASPECT)
          const r = lm.detectForVideo(v, now)
          const m = measure(r, v, v.videoWidth, v.videoHeight, crop, scratch, prev)
          prev = m.points
          const cs = evaluateFace(m, { live: true })
          const ok = allOk(cs)
          if (overlay) {
            if (overlay.width !== Math.round(crop.w / 2)) {
              overlay.width = Math.round(crop.w / 2)
              overlay.height = Math.round(crop.h / 2)
            }
            drawOverlay(overlay, m.box, m.light, ok)
          }

          if (ok && m.faceRect) {
            goodSince ??= now
            // Keep only the sharpest good frame of this streak.
            const score = sharpness(pixels(scratch, v, m.faceRect, 160, 200), 160, 200)
            if (!best || score > best.score) best = { canvas: snapshot(v, crop), score }
            if (now - goodSince >= HOLD_MS && best) {
              const photo = best.canvas
              stopped = true
              cancelAnimationFrame(raf)
              captureRef.current(photo)
              return
            }
          } else {
            goodSince = null
            best = null
          }
          // React state at ~10 fps is plenty for the checklist.
          if (now - lastUi > 100) {
            lastUi = now
            setChecks(cs)
            setHold(goodSince == null ? 0 : Math.min(1, (now - goodSince) / HOLD_MS))
          }
        }
        tick()
      })
      .catch((err: unknown) => {
        console.warn('[face-guide] unavailable:', (err as Error).message)
        if (!stopped) setStatus('unavailable')
      })

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      setChecks([])
      setHold(0)
    }
  }, [active, videoRef, overlayRef])

  return { status, checks, hold }
}

export interface StillCheck {
  checks: Check[]
  /** Set when the photo was cropped around the face to make it big enough for YouCam. */
  cropped: boolean
  blob: Blob
}

/**
 * The same checks for a still photo (an upload, or a manual capture). A face that's too
 * small is fixed by cropping around it when the photo has the resolution for it.
 * Returns null if the face tracker can't load; the photo can still be analysed.
 */
export async function checkStill(blob: Blob): Promise<StillCheck | null> {
  let lm: FaceLandmarker
  try {
    lm = await getLandmarker('IMAGE')
  } catch {
    return null
  }
  const scratch = document.createElement('canvas')
  const run = async (b: Blob) => {
    const bmp = await createImageBitmap(b)
    const full = { x: 0, y: 0, w: bmp.width, h: bmp.height }
    const m = measure(lm.detect(bmp), bmp, bmp.width, bmp.height, full, scratch, null)
    return { bmp, m }
  }
  let { bmp, m } = await run(blob)
  let cropped = false
  if (m.faces === 1 && m.box && m.box.w < 0.65) {
    const crop = faceCrop(m.box, bmp.width, bmp.height)
    if (crop) {
      const c = document.createElement('canvas')
      c.width = crop.w
      c.height = crop.h
      c.getContext('2d')!.drawImage(bmp, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h)
      bmp.close()
      blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.92))
      ;({ bmp, m } = await run(blob))
      cropped = true
    }
  }
  bmp.close()
  return { checks: evaluateFace(m, { live: false }), cropped, blob }
}
