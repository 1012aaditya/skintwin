import { useId } from 'react'

/** Minimal SVG line chart. Plots only the points given — no smoothing or interpolation of missing data. */
export function LineChart({ points, height = 180 }: { points: { x: string; y: number }[]; height?: number }) {
  const id = useId().replace(/:/g, '')
  const W = 640
  const H = height
  const pad = { l: 34, r: 16, t: 14, b: 26 }
  const ys = points.map((p) => p.y)
  const min = Math.max(0, Math.floor((Math.min(...ys) - 8) / 10) * 10)
  const max = Math.min(100, Math.ceil((Math.max(...ys) + 4) / 10) * 10)
  const sx = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (W - pad.l - pad.r))
  const sy = (v: number) => pad.t + (1 - (v - min) / Math.max(1, max - min)) * (H - pad.t - pad.b)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(i)},${sy(p.y)}`).join(' ')
  const area = `${path} L${sx(points.length - 1)},${H - pad.b} L${sx(0)},${H - pad.b} Z`
  const ticks = [min, (min + max) / 2, max]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Score history chart">
      <defs>
        <linearGradient id={`a-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#b18cff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#b18cff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="#fff" strokeOpacity="0.08" />
          <text x={pad.l - 8} y={sy(t) + 4} textAnchor="end" fontSize="11" fill="#e9defe" opacity="0.6">
            {Math.round(t)}
          </text>
        </g>
      ))}
      {points.length > 1 && <path d={area} fill={`url(#a-${id})`} />}
      <path d={path} fill="none" stroke="#d3bfff" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={sx(i)} cy={sy(p.y)} r={i === points.length - 1 ? 6 : 4} fill="#fff" stroke="#a78bfa" strokeWidth="2" />
          <text x={sx(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="#e9defe" opacity="0.65">
            {p.x}
          </text>
        </g>
      ))}
    </svg>
  )
}
