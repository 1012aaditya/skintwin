import { randomUUID } from 'node:crypto'
import type { AnalysisMetric, SkinAnalysis } from '@shared/models'

/**
 * YouCam (Perfect Corp) AI Skin Analysis — server-to-server API.
 * Docs: https://docs.makeupar.com/reference/ai_skin_analysis/v2.1
 *
 *   1. POST {base}/s2s/v2.0/file                      → presigned upload URL + file_id
 *   2. PUT  <presigned url> (exact headers returned)  → upload bytes
 *   3. POST {base}/s2s/v2.1/task/skin-analysis        → task_id
 *   4. GET  {base}/s2s/v2.1/task/skin-analysis/{id}   → poll until success | error
 *
 * Auth: `Authorization: Bearer <YOUCAM_API_KEY>`. Units are charged only on success.
 * The selfie is held in memory for the request and never written to disk.
 */

export const DEFAULT_SD_ACTIONS = [
  'acne',
  'moisture',
  'oiliness',
  'pore',
  'texture',
  'redness',
  'radiance',
  'wrinkle',
  'dark_circle_v2',
  'age_spot',
  // 11 actions stays in the same unit tier as 10 (9–12 → 14 units), so skin type is free.
  'skin_type'
] as const

const METRIC_LABELS: Record<string, string> = {
  acne: 'Acne',
  moisture: 'Hydration',
  oiliness: 'Oil control',
  pore: 'Pores',
  texture: 'Texture',
  redness: 'Redness',
  radiance: 'Radiance',
  wrinkle: 'Wrinkles',
  dark_circle_v2: 'Dark circles',
  age_spot: 'Spots',
  eye_bag: 'Eye bags',
  firmness: 'Firmness',
  tear_trough: 'Tear trough',
  droopy_upper_eyelid: 'Upper eyelid',
  droopy_lower_eyelid: 'Lower eyelid'
}

export const YOUCAM_ERROR_HINTS: Record<string, string> = {
  error_below_min_image_size: 'The photo is too small. Use an image at least 480px on its short side.',
  error_exceed_max_image_size: 'The photo is too large. Try a smaller image.',
  error_src_face_too_small: 'Your face is too small in the frame. Move closer so your face fills most of the photo.',
  error_src_face_out_of_bound: 'Part of your face is outside the frame. Center your face and try again.',
  error_lighting_dark: 'The lighting is too dark. Face a window or a soft light and retake.',
  error_no_face: 'No face was detected. Use a clear, front-facing selfie.',
  error_large_face_angle: 'Your face is turned too far. Look straight at the camera.',
  error_multiple_people: 'More than one person is in the photo. Use a selfie with just you.',
  error_download_image: 'YouCam could not read the uploaded image. Please retry.',
  error_decode_image: 'The image format could not be read. Use a JPG or PNG.',
  exceed_max_filesize: 'The image is over 10 MB.',
  InvalidAccessToken: 'The YouCam API key was rejected. Check YOUCAM_API_KEY.'
}

export class YouCamError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number
  ) {
    super(message)
  }
}

export interface SkinAnalysisProvider {
  readonly name: 'youcam' | 'mock'
  analyze(image: Buffer, mimeType: string, signal: AbortSignal, onProgress: (stage: AnalysisStage) => void): Promise<SkinAnalysis>
}

export type AnalysisStage = 'uploading' | 'queued' | 'analyzing' | 'finalizing'

interface OutputEntry {
  type?: string
  ui_score?: number
  raw_score?: number
  score?: number
  skin_type?: unknown
  value?: unknown
  result?: unknown
  region?: string
}

/**
 * Live v2.1 responses (checked 2026-11-01) send one entry per region:
 * { type: 'skin_type', region: 'whole' | 't_zone' | 'u_zone', skin_type: 'Normal' }.
 * The docs don't pin this down, so other plausible spellings are accepted too and
 * mapped onto our four types; anything unrecognised is dropped rather than guessed.
 */
export function normalizeSkinType(v: unknown): 'oily' | 'dry' | 'combination' | 'normal' | null {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return normalizeSkinType(o['whole'] ?? o['skin_type'] ?? o['type'] ?? o['value'] ?? null)
  }
  if (typeof v !== 'string') return null
  const t = v.toLowerCase()
  if (/combin|mixed/.test(t)) return 'combination'
  if (/oil/.test(t)) return 'oily'
  if (/dry/.test(t)) return 'dry'
  if (/normal/.test(t)) return 'normal'
  return null
}

/** Map a documented JSON-format task result to our model. Only fields present are used. */
export function parseYouCamResult(results: unknown, taskId: string, now: string): SkinAnalysis {
  const output = (results as { output?: OutputEntry[] } | undefined)?.output
  if (!Array.isArray(output)) throw new YouCamError('YouCam returned an unexpected result format.', 'invalid_response')
  const metrics: AnalysisMetric[] = []
  let overall: number | null = null
  let skinAge: number | null = null
  let skinType: string | null = null
  for (const e of output) {
    if (!e || typeof e.type !== 'string') continue
    if (e.type === 'all') overall = num(e.score ?? e.ui_score)
    else if (e.type === 'skin_age') skinAge = num(e.score ?? e.ui_score)
    else if (e.type === 'skin_type' || e.type === 'hd_skin_type') {
      // Prefer the whole-face answer over T-zone / U-zone ones.
      const found = normalizeSkinType(e.skin_type ?? e.value ?? e.result)
      if (found && (!e.region || e.region === 'whole' || !skinType)) skinType = found
    } else if (e.type in METRIC_LABELS || e.type.startsWith('hd_')) {
      const key = e.type.replace(/^hd_/, '')
      metrics.push({ key, label: METRIC_LABELS[key] ?? key, score: num(e.ui_score), raw: num(e.raw_score) })
    }
  }
  if (metrics.length === 0 && overall === null) throw new YouCamError('YouCam returned no skin metrics.', 'invalid_response')
  return { id: `analysis:${randomUUID()}`, createdAt: now, provider: 'youcam', isMock: false, overallScore: overall, skinAge, skinType, metrics, taskId }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null)

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new YouCamError('Analysis cancelled.', 'cancelled'))
    })
  })

export class YouCamProvider implements SkinAnalysisProvider {
  readonly name = 'youcam' as const
  constructor(
    private apiKey: string,
    private base: string,
    private actions: readonly string[] = DEFAULT_SD_ACTIONS,
    private pollMs = 4000,
    private timeoutMs = 180_000
  ) {}

  private async call<T>(path: string, init: RequestInit, signal: AbortSignal, attempt = 0): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      signal,
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    })
    if (res.status === 429 && attempt < 3) {
      await sleep(2000 * 2 ** attempt, signal)
      return this.call<T>(path, init, signal, attempt + 1)
    }
    const body = (await res.json().catch(() => ({}))) as { status?: number; data?: T; error?: string; error_code?: string }
    if (!res.ok || (body.status && body.status >= 400)) {
      const code = body.error_code ?? body.error ?? `http_${res.status}`
      throw new YouCamError(YOUCAM_ERROR_HINTS[code] ?? body.error ?? `YouCam request failed (${res.status}).`, code, res.status)
    }
    return body.data as T
  }

  async analyze(image: Buffer, mimeType: string, signal: AbortSignal, onProgress: (s: AnalysisStage) => void) {
    if (!/^image\/(jpeg|png)$/.test(mimeType)) throw new YouCamError('Use a JPG or PNG image.', 'invalid_type')
    if (image.length > 10 * 1024 * 1024) throw new YouCamError(YOUCAM_ERROR_HINTS.exceed_max_filesize!, 'exceed_max_filesize')

    onProgress('uploading')
    const ext = mimeType === 'image/png' ? 'png' : 'jpg'
    const upload = await this.call<{
      files: { file_id: string; requests: { method: string; url: string; headers: Record<string, string> }[] }[]
    }>(
      '/s2s/v2.0/file',
      { method: 'POST', body: JSON.stringify({ files: [{ content_type: mimeType, file_name: `selfie.${ext}`, file_size: image.length }] }) },
      signal
    )
    const file = upload.files?.[0]
    const put = file?.requests?.[0]
    if (!file || !put) throw new YouCamError('YouCam did not return an upload URL.', 'invalid_response')
    const putRes = await fetch(put.url, { method: put.method || 'PUT', headers: put.headers, body: new Uint8Array(image), signal })
    if (!putRes.ok) throw new YouCamError(`Image upload failed (${putRes.status}).`, 'upload_failed', putRes.status)

    onProgress('queued')
    const task = await this.call<{ task_id: string }>(
      '/s2s/v2.1/task/skin-analysis',
      { method: 'POST', body: JSON.stringify({ src_file_id: file.file_id, dst_actions: this.actions, format: 'json' }) },
      signal
    )
    if (!task?.task_id) throw new YouCamError('YouCam did not return a task id.', 'invalid_response')

    onProgress('analyzing')
    const deadline = Date.now() + this.timeoutMs
    while (Date.now() < deadline) {
      await sleep(this.pollMs, signal)
      const status = await this.call<{ task_status: string; results?: unknown; error?: string; error_code?: string }>(
        `/s2s/v2.1/task/skin-analysis/${encodeURIComponent(task.task_id)}`,
        { method: 'GET' },
        signal
      )
      if (status.task_status === 'success') {
        onProgress('finalizing')
        return parseYouCamResult(status.results, task.task_id, new Date().toISOString())
      }
      if (status.task_status === 'error') {
        const code = status.error_code ?? status.error ?? 'error_inference'
        throw new YouCamError(YOUCAM_ERROR_HINTS[code] ?? 'YouCam could not analyse this photo. Try a clearer, well-lit selfie.', code)
      }
    }
    throw new YouCamError('Analysis timed out. Please try again.', 'timeout')
  }
}

/**
 * DEVELOPMENT MOCK — enabled only with SKINTWIN_ENABLE_MOCKS=1 and no YouCam key.
 * Results are flagged isMock and shown with a "Mock data" badge; they are not an
 * analysis of the photo and are excluded from progress trends.
 */
export class MockSkinAnalysis implements SkinAnalysisProvider {
  readonly name = 'mock' as const
  async analyze(image: Buffer, _mime: string, signal: AbortSignal, onProgress: (s: AnalysisStage) => void) {
    onProgress('uploading')
    await sleep(500, signal)
    onProgress('analyzing')
    await sleep(1200, signal)
    // Deterministic pseudo-values from the image bytes so retakes vary but nothing is "measured".
    let seed = image.length
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
    // Only scored concerns; skin_type is a category, not a score.
    const metrics = DEFAULT_SD_ACTIONS.filter((k) => k in METRIC_LABELS).map((k) => ({ key: k, label: METRIC_LABELS[k]!, score: Math.round(60 + rand() * 35), raw: null }))
    return {
      id: `analysis:${randomUUID()}`,
      createdAt: new Date().toISOString(),
      provider: 'mock' as const,
      isMock: true,
      overallScore: null,
      skinAge: null,
      skinType: null,
      metrics,
      taskId: null
    }
  }
}
