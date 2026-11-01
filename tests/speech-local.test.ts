import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/main/config'
import { decodeWav, encodeWav } from '../src/shared/wav'

describe('WAV encoding', () => {
  it('round-trips 16 kHz mono samples', () => {
    const pcm = Float32Array.from({ length: 1600 }, (_, i) => Math.sin(i / 10) * 0.5)
    const { pcm: back, sampleRate } = decodeWav(new Uint8Array(encodeWav(pcm, 16_000)))
    expect(sampleRate).toBe(16_000)
    expect(back.length).toBe(pcm.length)
    for (let i = 0; i < pcm.length; i += 97) expect(back[i]).toBeCloseTo(pcm[i]!, 3)
  })

  it('clamps out-of-range samples instead of wrapping', () => {
    const { pcm } = decodeWav(new Uint8Array(encodeWav(Float32Array.from([2, -2]), 16_000)))
    expect(pcm[0]).toBeGreaterThan(0.99)
    expect(pcm[1]).toBeLessThanOrEqual(-0.99)
  })

  it('rejects anything that is not PCM WAV', () => {
    expect(() => decodeWav(new TextEncoder().encode('definitely not audio, just some text here...'))).toThrow()
  })
})

describe('speech-to-text provider selection', () => {
  const withEnv = (vars: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), 'skintwin-env-'))
    writeFileSync(join(dir, '.env'), Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n'))
    // process.env wins over .env, so make sure the real environment can't leak in.
    const saved = { ...process.env }
    for (const k of ['STT_PROVIDER', 'OPENAI_API_KEY', 'ELEVENLABS_API_KEY']) delete process.env[k]
    try {
      return loadConfig([dir], false)
    } finally {
      process.env = saved
    }
  }

  it('defaults to free on-device Whisper when no speech key is set', () => {
    const c = withEnv({})
    expect(c.sttProvider).toBe('local')
    expect(c.sttLocalModel).toBe('onnx-community/whisper-base.en')
  })
  it('uses a cloud key when it is the only one present', () => expect(withEnv({ OPENAI_API_KEY: 'x' }).sttProvider).toBe('openai'))
  it('prefers on-device when asked, even with a cloud key', () => expect(withEnv({ STT_PROVIDER: 'local', OPENAI_API_KEY: 'x' }).sttProvider).toBe('local'))
  it('falls back to on-device when the chosen cloud provider has no key', () => expect(withEnv({ STT_PROVIDER: 'elevenlabs' }).sttProvider).toBe('local'))
  it('can be turned off', () => expect(withEnv({ STT_PROVIDER: 'off', OPENAI_API_KEY: 'x' }).sttProvider).toBeNull())
})
