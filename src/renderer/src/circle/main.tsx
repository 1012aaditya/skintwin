import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Point } from '@shared/circle'
import { lassoBounds } from '@shared/circle'
import '../styles/app.css'

/**
 * A see-through layer over the live screen that turns the cursor into a pen. Nothing is
 * dimmed or frozen — only the stroke is drawn. Releasing sends the stroke to main, which
 * hides this layer, screenshots the screen and crops to the circle. Esc cancels.
 */
function CirclePen() {
  const [drawing, setDrawing] = useState(false)
  const [hint, setHint] = useState<string | null>('Draw a circle around a product · Esc to cancel')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const points = useRef<Point[]>([])
  const finished = useRef(false)

  const finish = (pts: Point[] | null) => {
    if (finished.current) return
    finished.current = true
    void window.skintwin.circle.done(pts ? { points: pts, width: window.innerWidth, height: window.innerHeight } : null)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish(null)
    window.addEventListener('keydown', onKey)
    const t = setTimeout(() => setHint(null), 2500)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(t)
    }
  }, [])

  const draw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = window.innerWidth
    const h = window.innerHeight
    if (canvas.width !== w * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
    }
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const pts = points.current
    if (pts.length < 2) return
    ctx.beginPath()
    ctx.moveTo(pts[0]!.x, pts[0]!.y)
    for (const p of pts) ctx.lineTo(p.x, p.y)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.shadowColor = 'rgba(143, 107, 255, 0.95)'
    ctx.shadowBlur = 14
    ctx.strokeStyle = '#ddd0ff'
    ctx.lineWidth = 4.5
    ctx.stroke()
  }

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    points.current = [{ x: e.clientX, y: e.clientY }]
    setDrawing(true)
    setHint(null)
    draw()
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drawing) return
    const last = points.current.at(-1)!
    if (Math.hypot(e.clientX - last.x, e.clientY - last.y) < 2) return
    points.current.push({ x: e.clientX, y: e.clientY })
    draw()
  }
  const onUp = () => {
    if (!drawing) return
    setDrawing(false)
    if (lassoBounds(points.current, window.innerWidth, window.innerHeight)) finish(points.current)
    else {
      points.current = []
      setHint('Draw a bigger circle around the product')
      draw()
    }
  }

  return (
    // The faint fill isn't visible, but macOS sends clicks through fully transparent pixels.
    <div className="fixed inset-0 cursor-crosshair bg-black/[0.01] select-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      {hint && (
        <div className="pointer-events-none absolute inset-x-0 top-10 flex justify-center">
          <div className="rounded-full bg-[#2b1f5e]/85 px-4 py-2 text-[13px] font-medium text-white shadow-xl backdrop-blur">{hint}</div>
        </div>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CirclePen />
  </StrictMode>
)
