/**
 * Minimal PCM WAV helpers. Recordings are re-encoded as 16 kHz mono 16-bit WAV in
 * the renderer (the format Whisper expects) and decoded back to samples in main.
 */

export function encodeWav(pcm: Float32Array, sampleRate: number): ArrayBuffer {
  const out = new ArrayBuffer(44 + pcm.length * 2)
  const v = new DataView(out)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + pcm.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, pcm.length * 2, true)
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]!))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return out
}

/** Decodes 16-bit PCM WAV (any channel count, downmixed to mono) into float samples. */
export function decodeWav(bytes: Uint8Array): { pcm: Float32Array; sampleRate: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4))
  if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file')
  let channels = 0
  let sampleRate = 0
  let bits = 0
  let o = 12
  while (o + 8 <= bytes.length) {
    const id = tag(o)
    const size = v.getUint32(o + 4, true)
    if (id === 'fmt ') {
      if (v.getUint16(o + 8, true) !== 1) throw new Error('Only PCM WAV is supported')
      channels = v.getUint16(o + 10, true)
      sampleRate = v.getUint32(o + 12, true)
      bits = v.getUint16(o + 22, true)
    } else if (id === 'data') {
      if (bits !== 16 || !channels) throw new Error('Only 16-bit PCM WAV is supported')
      const frames = Math.floor(Math.min(size, bytes.length - o - 8) / (2 * channels))
      const pcm = new Float32Array(frames)
      for (let f = 0; f < frames; f++) {
        let sum = 0
        for (let c = 0; c < channels; c++) sum += v.getInt16(o + 8 + (f * channels + c) * 2, true)
        pcm[f] = sum / channels / 0x8000
      }
      return { pcm, sampleRate }
    }
    o += 8 + size + (size % 2)
  }
  throw new Error('WAV file has no audio data')
}
