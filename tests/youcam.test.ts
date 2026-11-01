import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SD_ACTIONS, MockSkinAnalysis, normalizeSkinType, parseYouCamResult, YouCamError, YouCamProvider } from '../src/main/services/youcam'

const RESULTS = {
  output: [
    { type: 'moisture', ui_score: 89, raw_score: 71.2, mask_urls: [] },
    { type: 'oiliness', ui_score: 83, raw_score: 60.1 },
    { type: 'pore', ui_score: 87, raw_score: 55 },
    { type: 'all', score: 75.76 },
    { type: 'skin_age', score: 27 },
    { type: 'skin_type', region: 'whole', skin_type: 'combination' },
    { type: 'skin_type', region: 't_zone', skin_type: 'oily' }
  ]
}

describe('YouCam result parsing', () => {
  it('maps documented fields only', () => {
    const a = parseYouCamResult(RESULTS, 'task-1', '2026-11-01T00:00:00Z')
    expect(a).toMatchObject({ provider: 'youcam', isMock: false, overallScore: 75.8, skinAge: 27, skinType: 'combination', taskId: 'task-1' })
    expect(a.metrics.map((m) => [m.key, m.label, m.score])).toEqual([
      ['moisture', 'Hydration', 89],
      ['oiliness', 'Oil control', 83],
      ['pore', 'Pores', 87]
    ])
  })
  it('leaves the overall score empty when YouCam does not report one', () => {
    expect(parseYouCamResult({ output: [{ type: 'acne', ui_score: 70 }] }, 't', '').overallScore).toBeNull()
  })
  it('rejects unexpected shapes', () => {
    expect(() => parseYouCamResult({}, 't', '')).toThrow(YouCamError)
    expect(() => parseYouCamResult({ output: [] }, 't', '')).toThrow(/no skin metrics/)
  })
})

describe('YouCam provider flow', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uploads, creates a task, polls, and parses', async () => {
    const calls: string[] = []
    let polls = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url}`)
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 })
      if (url.endsWith('/s2s/v2.0/file')) {
        expect(JSON.parse(init.body as string).files[0]).toMatchObject({ content_type: 'image/jpeg', file_size: 4 })
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer KEY')
        return json({ status: 200, data: { files: [{ file_id: 'f1', requests: [{ method: 'PUT', url: 'https://upload.example/x', headers: { 'Content-Type': 'image/jpeg' } }] }] } })
      }
      if (url === 'https://upload.example/x') return new Response(null, { status: 200 })
      if (url.endsWith('/s2s/v2.1/task/skin-analysis')) {
        expect(JSON.parse(init.body as string)).toMatchObject({ src_file_id: 'f1', format: 'json' })
        return json({ status: 200, data: { task_id: 't1' } })
      }
      if (url.endsWith('/s2s/v2.1/task/skin-analysis/t1')) {
        polls++
        return json({ status: 200, data: polls < 2 ? { task_status: 'running' } : { task_status: 'success', results: RESULTS } })
      }
      throw new Error(`unexpected ${url}`)
    }))
    const stages: string[] = []
    const p = new YouCamProvider('KEY', 'https://api.example', ['moisture'], 1, 5000)
    const a = await p.analyze(Buffer.from([1, 2, 3, 4]), 'image/jpeg', new AbortController().signal, (s) => stages.push(s))
    expect(a.metrics).toHaveLength(3)
    expect(stages).toEqual(['uploading', 'queued', 'analyzing', 'finalizing'])
    expect(calls[1]).toBe('PUT https://upload.example/x')
  })

  it('turns documented error codes into friendly messages', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/file')) return new Response(JSON.stringify({ status: 200, data: { files: [{ file_id: 'f', requests: [{ method: 'PUT', url: 'https://u/x', headers: {} }] }] } }))
      if (url === 'https://u/x') return new Response(null)
      if (url.endsWith('/skin-analysis')) return new Response(JSON.stringify({ status: 200, data: { task_id: 't' } }))
      return new Response(JSON.stringify({ status: 200, data: { task_status: 'error', error_code: 'error_lighting_dark' } }))
    }))
    const p = new YouCamProvider('KEY', 'https://api.example', ['moisture'], 1, 5000)
    await expect(p.analyze(Buffer.from([1]), 'image/png', new AbortController().signal, () => {})).rejects.toThrow(/too dark/)
  })

  it('rejects non-JPG/PNG before any network call', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    await expect(new YouCamProvider('K', 'https://x').analyze(Buffer.from([1]), 'image/gif', new AbortController().signal, () => {})).rejects.toThrow(/JPG or PNG/)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('YouCam skin type', () => {
  it('is requested, staying within the 9–12 action unit tier', () => {
    expect(DEFAULT_SD_ACTIONS).toContain('skin_type')
    expect(DEFAULT_SD_ACTIONS.length).toBeLessThanOrEqual(12)
  })
  it('maps the spellings YouCam might use onto our four types', () => {
    expect(normalizeSkinType('Combination')).toBe('combination')
    expect(normalizeSkinType('oily_skin')).toBe('oily')
    expect(normalizeSkinType('DRY')).toBe('dry')
    expect(normalizeSkinType({ whole: 'Normal', t_zone: 'oily' })).toBe('normal')
    expect(normalizeSkinType('sensitive')).toBeNull()
    expect(normalizeSkinType(42)).toBeNull()
  })
  it('prefers the whole-face answer even when a zone comes first', () => {
    const a = parseYouCamResult({ output: [{ type: 'all', score: 80 }, { type: 'skin_type', region: 't_zone', skin_type: 'oily' }, { type: 'skin_type', region: 'whole', skin_type: 'Dry' }] }, 't', '')
    expect(a.skinType).toBe('dry')
  })
  it('reads the shape a live v2.1 response used (2026-11-01)', () => {
    const live = { output: [
      { type: 'all', score: 89.4 },
      { mask_urls: ['https://example.com/skin_type_output.png'], type: 'skin_type', region: 'whole', skin_type: 'Normal', url: null },
      { mask_urls: ['https://example.com/skin_type_t_zone_output.png'], type: 'skin_type', region: 't_zone', skin_type: 'Normal', url: null },
      { mask_urls: ['https://example.com/skin_type_u_zone_output.png'], type: 'skin_type', region: 'u_zone', skin_type: 'Normal', url: null }
    ] }
    const a = parseYouCamResult(live, 't', '')
    expect(a.skinType).toBe('normal')
    expect(a.metrics).toEqual([]) // skin type is not a scored metric
  })
  it('uses a zone answer only when there is no whole-face one', () => {
    expect(parseYouCamResult({ output: [{ type: 'all', score: 80 }, { type: 'skin_type', region: 'u_zone', value: 'normal' }] }, 't', '').skinType).toBe('normal')
  })
})

describe('mock analysis', () => {
  it('produces only labelled, scored metrics (no skin_type score)', async () => {
    const a = await new MockSkinAnalysis().analyze(Buffer.alloc(5000), 'image/jpeg', new AbortController().signal, () => {})
    expect(a.isMock).toBe(true)
    expect(a.metrics.map((m) => m.key)).not.toContain('skin_type')
    expect(a.metrics.every((m) => typeof m.label === 'string' && m.label.length > 0)).toBe(true)
  })
})
