import { useCallback, useEffect, useRef, useState } from 'react'
import { encodeWav } from '@shared/wav'

export class MicError extends Error {
  constructor(
    message: string,
    readonly kind: 'denied' | 'unavailable'
  ) {
    super(message)
  }
}

const MAX_RECORDING_MS = 30_000

/**
 * Microphone capture. The stream is opened only on start() and every track is
 * stopped on stop()/cancel(), so the OS mic indicator turns off immediately.
 * `level` is a real RMS reading from an AnalyserNode for the waveform.
 */
export function useRecorder(onAutoStop: () => void) {
  const [recording, setRecording] = useState(false)
  const [level, setLevel] = useState(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const stream = useRef<MediaStream | null>(null)
  const raf = useRef(0)
  const audioCtx = useRef<AudioContext | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoStopRef = useRef(onAutoStop)
  autoStopRef.current = onAutoStop

  const teardown = useCallback(() => {
    cancelAnimationFrame(raf.current)
    if (timer.current) clearTimeout(timer.current)
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    void audioCtx.current?.close().catch(() => undefined)
    audioCtx.current = null
    setRecording(false)
    setLevel(0)
  }, [])

  useEffect(() => teardown, [teardown])

  const start = useCallback(async () => {
    const os = await window.skintwin.media.request('microphone')
    if (os === 'denied' || os === 'restricted') throw new MicError('Microphone access is turned off for SkinTwin.', 'denied')
    let s: MediaStream
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch (err) {
      const name = (err as DOMException).name
      throw new MicError(name === 'NotAllowedError' ? 'Microphone access was denied.' : 'No microphone is available.', name === 'NotAllowedError' ? 'denied' : 'unavailable')
    }
    stream.current = s
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
    const rec = new MediaRecorder(s, { mimeType: mime })
    chunks.current = []
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
    rec.start(250)
    recorder.current = rec

    const ctx = new AudioContext()
    audioCtx.current = ctx
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    ctx.createMediaStreamSource(s).connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)
    const tick = () => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (const v of buf) sum += ((v - 128) / 128) ** 2
      setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4))
      raf.current = requestAnimationFrame(tick)
    }
    tick()
    timer.current = setTimeout(() => autoStopRef.current(), MAX_RECORDING_MS)
    setRecording(true)
  }, [])

  const stop = useCallback(async (): Promise<Blob | null> => {
    const rec = recorder.current
    if (!rec || rec.state === 'inactive') {
      teardown()
      return null
    }
    const done = new Promise<void>((r) => (rec.onstop = () => r()))
    rec.stop()
    await done
    teardown()
    recorder.current = null
    return new Blob(chunks.current, { type: rec.mimeType.split(';')[0] })
  }, [teardown])

  const cancel = useCallback(() => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
    recorder.current = null
    chunks.current = []
    teardown()
  }, [teardown])

  return { recording, level, start, stop, cancel }
}

/**
 * Re-encodes a recording as 16 kHz mono WAV: what on-device Whisper needs, and a
 * format the cloud providers accept too. Downmixing and resampling happen in Web Audio.
 */
export async function toWav16k(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
  } finally {
    void ctx.close().catch(() => undefined)
  }
  const rate = 16_000
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()
  return new Blob([encodeWav(rendered.getChannelData(0), rate)], { type: 'audio/wav' })
}

/** Speaks answers via ElevenLabs (if configured) or the on-device system voice. */
export function useSpeaker(opts: { enabled: boolean; voiceName: string | null; rate: number; useCloud: boolean }) {
  const [speaking, setSpeaking] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const audio = useRef<HTMLAudioElement | null>(null)
  const startedAt = useRef(0)
  const interval = useRef<ReturnType<typeof setInterval> | null>(null)
  const generation = useRef(0)

  const stop = useCallback(() => {
    generation.current++
    speechSynthesis.cancel()
    audio.current?.pause()
    audio.current = null
    if (interval.current) clearInterval(interval.current)
    setSpeaking(false)
  }, [])

  useEffect(() => stop, [stop])

  const begin = () => {
    startedAt.current = Date.now()
    setElapsed(0)
    setSpeaking(true)
    if (interval.current) clearInterval(interval.current)
    interval.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 250)
  }
  const end = (gen: number) => {
    if (gen !== generation.current) return
    if (interval.current) clearInterval(interval.current)
    setSpeaking(false)
  }

  const speak = useCallback(
    async (text: string) => {
      stop()
      if (!opts.enabled || !text) return
      const gen = generation.current
      if (opts.useCloud) {
        const res = await window.skintwin.speech.synthesize(text)
        if (gen !== generation.current) return
        if (res.ok) {
          const a = new Audio(`data:${res.data.mimeType};base64,${res.data.audioBase64}`)
          audio.current = a
          a.onended = () => end(gen)
          a.onerror = () => end(gen)
          begin()
          await a.play().catch(() => end(gen))
          return
        }
      }
      const u = new SpeechSynthesisUtterance(text)
      u.rate = opts.rate
      const v = speechSynthesis.getVoices().find((x) => x.name === opts.voiceName)
      if (v) u.voice = v
      u.onend = () => end(gen)
      u.onerror = () => end(gen)
      begin()
      speechSynthesis.speak(u)
    },
    [opts.enabled, opts.rate, opts.voiceName, opts.useCloud, stop]
  )

  return { speaking, elapsed, speak, stop }
}
