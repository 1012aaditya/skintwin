import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Point } from '@shared/circle'
import { lassoBounds } from '@shared/circle'
import '../styles/app.css'

/**
 * Full-screen overlay showing a frozen screenshot. The user draws around a product; the
 * lasso's inside lights up while the rest dims. Releasing sends the stroke to main, which
 * crops the screenshot and asks Claude what's inside. Esc or a tiny scribble cancels.
 */
function CircleOverlay() {
  const [image, setImage] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [tooSmall, setTooSmall] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const points = useRef<Point[]>([])
  const finished = useRef(false)

  const finish = (pts: Point[] | null) => {
    if (finished.current) return
    finished.current = true
    void window.skintwin.circle.done(pts ? { points: pts, width: window.innerWidth, height: window.innerHeight } : null)
  }

  useEffect(() => {
    void window.skintwin.circle.image().then((src) => (src ? setImage(src) : finish(null)))
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
    // Dim everything, leaving the lasso's inside clear.
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    if (pts.length > 2) {
      ctx.moveTo(pts[0]!.x, pts[0]!.y)
      for (const p of pts) ctx.lineTo(p.x, p.y)
      ctx.closePath()
    }
    ctx.fillStyle = 'rgba(20, 10, 60, 0.5)'
    ctx.fill('evenodd')
    if (pts.length < 2) return
    ctx.beginPath()
    ctx.moveTo(pts[0]!.x, pts[0]!.y)
    for (const p of pts) ctx.lineTo(p.x, p.y)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.shadowColor = 'rgba(169, 139, 255, 0.9)'
    ctx.shadowBlur = 18
    ctx.strokeStyle = '#ddd0ff'
    ctx.lineWidth = 4
    ctx.stroke()
  }

  useEffect(draw, [image])

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    points.current = [{ x: e.clientX, y: e.clientY }]
    setDrawing(true)
    setTooSmall(false)
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
      setTooSmall(true)
      draw()
    }
  }

  return (
    <div className="fixed inset-0 cursor-crosshair overflow-hidden bg-black select-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
      {image && <img src={image} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />}
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-x-0 top-10 flex justify-center">
        <div className="glass-strong flex items-center gap-3 rounded-full px-5 py-2.5 text-[15px] font-medium text-white shadow-2xl">
          <span className="h-2.5 w-2.5 rounded-full bg-lilac-200 shadow-[0_0_12px_#a98bff]" />
          {tooSmall ? 'Draw a bigger circle around the product' : drawing ? 'Let go to check it' : 'Circle a product to check it against your skin'}
          <kbd className="rounded-md bg-white/15 px-2 py-0.5 text-[12px] font-semibold text-white/85">Esc</kbd>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CircleOverlay />
  </StrictMode>
)
