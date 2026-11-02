import { EyeOff, ScanFace } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AnalysisMask, AnalysisMetric } from '@shared/models'
import { cn } from '@renderer/lib/cn'

/**
 * "Where it shows up": YouCam's own detection masks drawn over the photo that was analysed.
 * Shown only right after an analysis — the photo and masks live in memory on this screen
 * and are never saved.
 *
 * Masks may come as transparent PNGs (drawn areas opaque) or as black-and-white images
 * (white = detected); both are turned into a soft tint.
 */

const TINT = [255, 92, 140] as const

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('mask unreadable'))
    img.src = src
  })

/** Alpha 0–1 per pixel: the mask's own transparency if it has any, otherwise its brightness. */
function maskAlpha(data: Uint8ClampedArray): Float32Array {
  const n = data.length / 4
  let transparent = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 250) transparent++
  const useAlpha = transparent / n > 0.05
  const out = new Float32Array(n)
  for (let p = 0, i = 0; p < n; p++, i += 4) out[p] = useAlpha ? data[i + 3]! / 255 : (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) / 255
  return out
}

export function Heatmap({ photo, masks, metrics }: { photo: string; masks: AnalysisMask[]; metrics: AnalysisMetric[] }) {
  const scores = useMemo(() => new Map(metrics.map((m) => [m.key, m.score])), [metrics])
  // Start on the concern that scored lowest — the one most worth seeing.
  const first = useMemo(() => [...masks].sort((a, b) => (scores.get(a.key) ?? 100) - (scores.get(b.key) ?? 100))[0]?.key ?? null, [masks, scores])
  const [selected, setSelected] = useState<string | null>(first)
  const [hidden, setHidden] = useState(false)
  const [failed, setFailed] = useState(false)
  const photoRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const mask = masks.find((m) => m.key === selected)
    const canvas = canvasRef.current
    if (!mask || !canvas) return
    let cancelled = false
    void (async () => {
      const base = photoRef.current?.complete ? photoRef.current : await loadImage(photo)
      const w = base.naturalWidth
      const h = base.naturalHeight
      const imgs = await Promise.all(mask.images.map(loadImage)).catch(() => null)
      if (cancelled) return
      if (!imgs) return setFailed(true)
      const work = document.createElement('canvas')
      work.width = w
      work.height = h
      const wctx = work.getContext('2d', { willReadFrequently: true })!
      const total = new Float32Array(w * h)
      for (const img of imgs) {
        wctx.clearRect(0, 0, w, h)
        wctx.drawImage(img, 0, 0, w, h) // masks are in the analysed photo's frame
        const a = maskAlpha(wctx.getImageData(0, 0, w, h).data)
        for (let i = 0; i < a.length; i++) total[i] = Math.max(total[i]!, a[i]!)
      }
      canvas.width = w
      canvas.height = h
      const out = new ImageData(w, h)
      for (let p = 0, i = 0; p < total.length; p++, i += 4) {
        out.data[i] = TINT[0]
        out.data[i + 1] = TINT[1]
        out.data[i + 2] = TINT[2]
        out.data[i + 3] = Math.round(total[p]! * 0.72 * 255)
      }
      canvas.getContext('2d')!.putImageData(out, 0, 0)
      setFailed(false)
    })()
    return () => {
      cancelled = true
    }
  }, [selected, masks, photo])

  if (!masks.length) return null
  const current = masks.find((m) => m.key === selected)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ScanFace className="h-5 w-5 text-lilac-200" />
        <h3 className="flex-1 text-lg font-semibold">Where it shows up</h3>
        <button onPointerDown={() => setHidden(true)} onPointerUp={() => setHidden(false)} onPointerLeave={() => setHidden(false)} className="inline-flex items-center gap-1.5 rounded-pill bg-white/8 px-3 py-1.5 text-xs text-ink-soft hover:bg-white/14">
          <EyeOff className="h-3.5 w-3.5" /> Hold to compare
        </button>
      </div>
      <div className="relative mx-auto w-fit overflow-hidden rounded-[22px] bg-black/30">
        <img ref={photoRef} src={photo} alt="The photo that was analysed" className="block max-h-[420px] w-auto" />
        <canvas ref={canvasRef} aria-hidden className={cn('pointer-events-none absolute inset-0 h-full w-full mix-blend-screen transition-opacity duration-200', hidden && 'opacity-0')} />
      </div>
      <div className="flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-label="Show areas for">
        {masks.map((m) => (
          <button key={m.key} role="radio" aria-checked={m.key === selected} onClick={() => setSelected(m.key)} className={cn('rounded-pill border px-3 py-1.5 text-[13px] transition-colors', m.key === selected ? 'border-lilac-200 bg-lilac-400/30 text-ink' : 'border-white/12 bg-white/5 text-ink-soft hover:bg-white/10')}>
            {m.label}
            {scores.get(m.key) != null && <span className="ml-1.5 text-ink-faint">{scores.get(m.key)}</span>}
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-ink-faint">
        {failed ? 'This map couldn’t be drawn.' : `Highlighted where YouCam detected ${current?.label.toLowerCase() ?? 'this'}.`} The photo and maps are shown only now and aren’t saved.
      </p>
    </div>
  )
}
