import { decodeWav } from '@shared/wav'

/**
 * Speech providers. Audio is sent to the configured provider only for the request
 * in flight and is never written to disk or logged. The on-device provider keeps
 * audio on this computer entirely.
 */

export interface SpeechToText {
  readonly name: string
  transcribe(audio: Buffer, mimeType: string, signal: AbortSignal): Promise<string>
}

export interface TextToSpeech {
  readonly name: string
  synthesize(text: string, signal: AbortSignal): Promise<{ audio: Buffer; mimeType: string }>
}

function extFor(mime: string) {
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a'
  if (mime.includes('wav')) return 'wav'
  return 'webm'
}

export class SpeechError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
  }
}

async function failFrom(res: Response, provider: string): Promise<never> {
  const body = await res.text().catch(() => '')
  throw new SpeechError(`${provider} request failed (${res.status})${body ? `: ${body.slice(0, 160)}` : ''}`, res.status)
}

/** OpenAI audio transcription (POST /v1/audio/transcriptions). */
export class OpenAITranscriber implements SpeechToText {
  readonly name = 'openai'
  constructor(
    private apiKey: string,
    private model = 'whisper-1'
  ) {}
  async transcribe(audio: Buffer, mimeType: string, signal: AbortSignal) {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), `speech.${extFor(mimeType)}`)
    form.append('model', this.model)
    form.append('response_format', 'json')
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal
    })
    if (!res.ok) await failFrom(res, 'OpenAI transcription')
    const data = (await res.json()) as { text?: string }
    return (data.text ?? '').trim()
  }
}

type Asr = (audio: Float32Array) => Promise<{ text: string } | { text: string }[]>

/** Whisper's placeholders for silence or noise, e.g. "[BLANK_AUDIO]" or "(music)". */
const NON_SPEECH = /\[[^\]]*\]|\([^)]*\)/g

/**
 * Whisper running on this computer (ONNX via transformers.js). Free, no key, and
 * audio never leaves the machine. The model (~80 MB) downloads once into cacheDir.
 * Expects 16 kHz mono WAV, which the renderer produces.
 */
export class LocalWhisperTranscriber implements SpeechToText {
  readonly name = 'On-device Whisper'
  private loading: Promise<Asr> | null = null
  constructor(
    private cacheDir: string,
    private model = 'onnx-community/whisper-base.en'
  ) {}

  /** Loads the model, downloading it the first time. Safe to call repeatedly. */
  warmUp(): Promise<Asr> {
    this.loading ??= (async () => {
      const { pipeline, env } = await import('@huggingface/transformers')
      env.cacheDir = this.cacheDir
      const asr = await pipeline('automatic-speech-recognition', this.model, { dtype: 'q8', device: 'cpu' })
      return asr as unknown as Asr
    })().catch((err: unknown) => {
      this.loading = null // let the next request retry, e.g. after a network blip
      throw err
    })
    return this.loading
  }

  async transcribe(audio: Buffer, mimeType: string, signal: AbortSignal) {
    if (!mimeType.includes('wav')) throw new SpeechError('On-device transcription needs WAV audio.')
    const { pcm, sampleRate } = decodeWav(audio)
    if (sampleRate !== 16_000) throw new SpeechError(`Expected 16 kHz audio, got ${sampleRate} Hz.`)
    const asr = await this.warmUp()
    signal.throwIfAborted()
    const out = await asr(pcm)
    signal.throwIfAborted()
    const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text
    return text.replace(NON_SPEECH, ' ').replace(/\s+/g, ' ').trim()
  }
}

/** ElevenLabs Speech-to-Text (POST /v1/speech-to-text). */
export class ElevenLabsTranscriber implements SpeechToText {
  readonly name = 'elevenlabs'
  constructor(private apiKey: string) {}
  async transcribe(audio: Buffer, mimeType: string, signal: AbortSignal) {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), `speech.${extFor(mimeType)}`)
    form.append('model_id', 'scribe_v1')
    const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey },
      body: form,
      signal
    })
    if (!res.ok) await failFrom(res, 'ElevenLabs transcription')
    const data = (await res.json()) as { text?: string }
    return (data.text ?? '').trim()
  }
}

/** ElevenLabs Text-to-Speech (POST /v1/text-to-speech/{voice_id}). */
export class ElevenLabsSpeaker implements TextToSpeech {
  readonly name = 'elevenlabs'
  constructor(
    private apiKey: string,
    private voiceId: string
  ) {}
  async synthesize(text: string, signal: AbortSignal) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.voiceId)}`, {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: text.slice(0, 1500), model_id: 'eleven_flash_v2_5' }),
      signal
    })
    if (!res.ok) await failFrom(res, 'ElevenLabs speech')
    return { audio: Buffer.from(await res.arrayBuffer()), mimeType: 'audio/mpeg' }
  }
}
