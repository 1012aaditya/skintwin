/**
 * Photo-quality checks for YouCam skin analysis, measured on-device before anything is sent.
 *
 * YouCam's documented input rules: face wider than 60% of the image, front-facing, eyes open,
 * mouth closed, even lighting, portrait orientation. Lighting and camera processing also move
 * the scores, so these checks aim for the same conditions every time, not just "accepted".
 *
 * Everything here is pure (numbers in, numbers out) so it can be unit-tested; the MediaPipe
 * and canvas plumbing lives in useFaceGuide.ts.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface LightMeasure {
  /** Mean luma of the face, 0–1. */
  mean: number
  /** Darker side ÷ brighter side, 1 = perfectly even. */
  balance: number
  /** Share of face pixels that are blown out / crushed. */
  clipped: number
  dark: number
  /** Coarse luma grid over the face box (NaN outside the face) — drives the heatmap. */
  grid: number[][]
}

export interface FaceMeasure {
  faces: number
  /** Face box in image-normalised coordinates (0–1) of the photo YouCam will receive. */
  box: Rect | null
  yaw: number
  pitch: number
  roll: number
  /** Strongest eye-blink blendshape, 0–1. */
  eyesClosed: number
  /** jawOpen blendshape or lips parted, 0–1. */
  mouthOpen: number
  /** Strongest mouthSmile blendshape, 0–1. A smile changes wrinkle and texture scores. */
  smile: number
  light: LightMeasure | null
  /** Mean landmark movement since the previous frame (normalised); null for stills. */
  motion: number | null
}

export type CheckId = 'face' | 'size' | 'center' | 'angle' | 'expression' | 'level' | 'even' | 'still'

export interface Check {
  id: CheckId
  label: string
  ok: boolean
  hint: string
}

export const LIMITS = {
  // YouCam requires > 60%; aim a little higher so its own face box clears the bar too.
  minFaceWidth: 0.65,
  maxFaceWidth: 0.88,
  edgeMargin: 0.01,
  centerTolX: 0.08,
  centerTolY: 0.1,
  maxYaw: 10,
  maxPitch: 10,
  maxRoll: 8,
  maxEyesClosed: 0.45,
  maxMouthOpen: 0.2,
  maxSmile: 0.4,
  // YouCam rejected photos at the old 0.32 / 6% limits with error_lighting_dark, so aim
  // brighter. Manual capture and "Analyze anyway" still work if this is too strict.
  minMean: 0.4,
  maxMean: 0.8,
  maxClipped: 0.03,
  maxDark: 0.03,
  minBalance: 0.8,
  maxMotion: 0.006
} as const

const LABELS: Record<CheckId, string> = {
  face: 'Just you, in frame',
  size: 'Face fills the oval',
  center: 'Centered',
  angle: 'Facing the camera',
  expression: 'Neutral face, eyes open',
  level: 'Good light level',
  even: 'Even light',
  still: 'Holding still'
}

export function evaluateFace(m: FaceMeasure, opts: { live: boolean }): Check[] {
  const ids: CheckId[] = ['face', 'size', 'center', 'angle', 'expression', 'level', 'even', ...(opts.live ? (['still'] as const) : [])]
  const c = (id: CheckId, ok: boolean, hint: string): Check => ({ id, label: LABELS[id], ok, hint: ok ? '' : hint })

  if (m.faces !== 1 || !m.box) {
    const hint = m.faces > 1 ? 'Only you should be in the photo' : 'Bring your face into the oval'
    return ids.map((id) => c(id, false, id === 'face' ? hint : ''))
  }
  const b = m.box
  const L = LIMITS
  const inside = b.x >= L.edgeMargin && b.y >= L.edgeMargin && b.x + b.w <= 1 - L.edgeMargin && b.y + b.h <= 1 - L.edgeMargin
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const light = m.light
  const tooDark = !!light && (light.mean < L.minMean || light.dark > L.maxDark)
  const tooBright = !!light && (light.mean > L.maxMean || light.clipped > L.maxClipped)

  const out: Check[] = [
    c('face', true, ''),
    c(
      'size',
      b.w >= L.minFaceWidth && b.w <= L.maxFaceWidth && inside,
      b.w < L.minFaceWidth
        ? opts.live ? 'Move closer — your face should fill the oval' : 'Your face is too small in this photo — use a closer selfie'
        : opts.live ? 'Move back a little — keep your whole face in view' : 'Part of your face is cut off — use a photo showing your whole face'
    ),
    c('center', Math.abs(cx - 0.5) <= L.centerTolX && Math.abs(cy - 0.5) <= L.centerTolY, opts.live ? 'Center your face in the oval' : 'Your face isn’t centered in this photo'),
    c(
      'angle',
      Math.abs(m.yaw) <= L.maxYaw && Math.abs(m.pitch) <= L.maxPitch && Math.abs(m.roll) <= L.maxRoll,
      Math.abs(m.roll) > L.maxRoll ? 'Keep your head level' : 'Look straight at the camera'
    ),
    c(
      'expression',
      m.eyesClosed <= L.maxEyesClosed && m.mouthOpen <= L.maxMouthOpen && m.smile <= L.maxSmile,
      m.eyesClosed > L.maxEyesClosed ? 'Keep your eyes open' : 'Relax your face — mouth gently closed, no smile'
    ),
    c('level', !!light && !tooDark && !tooBright, tooBright ? 'Too bright — avoid direct sun or a harsh lamp' : 'Too dark — face a window or a soft light'),
    c('even', !!light && light.balance >= L.minBalance, 'Light is uneven — turn so it falls evenly on both sides of your face')
  ]
  if (opts.live) out.push(c('still', m.motion != null && m.motion <= L.maxMotion, 'Hold still'))
  return out
}

/** The first thing to fix, in priority order — what the camera overlay tells the user. */
export const firstIssue = (checks: Check[]) => checks.find((x) => !x.ok && x.hint) ?? null
export const allOk = (checks: Check[]) => checks.length > 0 && checks.every((x) => x.ok)

/** Head angles in degrees from MediaPipe's 4×4 column-major facial transformation matrix. */
export function poseFromMatrix(d: ArrayLike<number>): { yaw: number; pitch: number; roll: number } {
  const deg = 180 / Math.PI
  return {
    pitch: Math.atan2(d[6]!, d[10]!) * deg,
    yaw: Math.asin(Math.max(-1, Math.min(1, -d[2]!))) * deg,
    roll: Math.atan2(d[1]!, d[0]!) * deg
  }
}

/** Bounding box of landmarks (normalised to the full frame) re-expressed in a crop's coordinates. */
export function boxInCrop(points: ArrayLike<{ x: number; y: number }>, frameW: number, frameH: number, crop: Rect): Rect {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    x0 = Math.min(x0, p.x)
    x1 = Math.max(x1, p.x)
    y0 = Math.min(y0, p.y)
    y1 = Math.max(y1, p.y)
  }
  return {
    x: (x0 * frameW - crop.x) / crop.w,
    y: (y0 * frameH - crop.y) / crop.h,
    w: ((x1 - x0) * frameW) / crop.w,
    h: ((y1 - y0) * frameH) / crop.h
  }
}

/**
 * Lighting over the face from RGBA pixels of the face box (any size). Only pixels inside an
 * ellipse inscribed in the box count, so hair and background don't skew it.
 */
export function measureLight(rgba: Uint8ClampedArray, w: number, h: number, gridCols = 5, gridRows = 6): LightMeasure {
  const sums = Array.from({ length: gridRows }, () => new Array<number>(gridCols).fill(0))
  const counts = Array.from({ length: gridRows }, () => new Array<number>(gridCols).fill(0))
  let total = 0
  let n = 0
  let clipped = 0
  let dark = 0
  let left = 0
  let leftN = 0
  let right = 0
  let rightN = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5) / w - 0.5
      const ny = (y + 0.5) / h - 0.5
      if ((nx / 0.45) ** 2 + (ny / 0.48) ** 2 > 1) continue
      const i = (y * w + x) * 4
      const l = (0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!) / 255
      total += l
      n++
      if (l > 0.96) clipped++
      if (l < 0.12) dark++
      // Cheeks only (skip the nose bridge) for the left/right comparison.
      if (nx < -0.08) {
        left += l
        leftN++
      } else if (nx > 0.08) {
        right += l
        rightN++
      }
      const gx = Math.min(gridCols - 1, Math.floor(((x + 0.5) / w) * gridCols))
      const gy = Math.min(gridRows - 1, Math.floor(((y + 0.5) / h) * gridRows))
      sums[gy]![gx]! += l
      counts[gy]![gx]!++
    }
  }
  const lm = leftN ? left / leftN : 0
  const rm = rightN ? right / rightN : 0
  return {
    mean: n ? total / n : 0,
    balance: Math.max(lm, rm) > 0 ? Math.min(lm, rm) / Math.max(lm, rm) : 0,
    clipped: n ? clipped / n : 0,
    dark: n ? dark / n : 0,
    grid: sums.map((row, gy) => row.map((s, gx) => (counts[gy]![gx]! ? s / counts[gy]![gx]! : NaN)))
  }
}

/** Variance of the Laplacian over grayscale RGBA pixels — higher means sharper. */
export function sharpness(rgba: Uint8ClampedArray, w: number, h: number): number {
  const g = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!
  let sum = 0
  let sq = 0
  let n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const v = g[i - 1]! + g[i + 1]! + g[i - w]! + g[i + w]! - 4 * g[i]!
      sum += v
      sq += v * v
      n++
    }
  }
  return n ? sq / n - (sum / n) ** 2 : 0
}

/**
 * For an uploaded photo whose face is too small: a 4:5 crop around the face so it fills
 * ~72% of the width, kept inside the image. Null if the face already fits or if the crop
 * would fall below YouCam's 480px minimum.
 */
export function faceCrop(face: Rect, imgW: number, imgH: number, aspect = 4 / 5, target = 0.72, minShort = 480): Rect | null {
  const fw = face.w * imgW
  let cw = fw / target
  let ch = cw / aspect
  if (cw > imgW) {
    cw = imgW
    ch = cw / aspect
  }
  if (ch > imgH) {
    ch = imgH
    cw = ch * aspect
  }
  if (Math.min(cw, ch) < minShort) return null
  if (cw >= imgW * 0.98 && ch >= imgH * 0.98) return null
  const cx = (face.x + face.w / 2) * imgW
  const cy = (face.y + face.h / 2) * imgH
  const x = Math.max(0, Math.min(imgW - cw, cx - cw / 2))
  const y = Math.max(0, Math.min(imgH - ch, cy - ch / 2))
  return { x: Math.round(x), y: Math.round(y), w: Math.round(cw), h: Math.round(ch) }
}
