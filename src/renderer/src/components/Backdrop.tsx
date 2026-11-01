import { useMemo } from 'react'

/** Dusk sky, distant mountain and drifting petals — pure CSS/SVG, no image assets. */
export function Backdrop() {
  const petals = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => ({
        left: (i * 37) % 100,
        delay: (i * 1.7) % 12,
        duration: 14 + ((i * 5) % 10),
        size: 8 + ((i * 7) % 10),
        drift: ((i % 2 ? 1 : -1) * (40 + ((i * 13) % 80))).toFixed(0)
      })),
    []
  )
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #3a2a86 0%, #5b3fae 30%, #8a5cc6 58%, #c97fb8 78%, #e6a0a8 100%)' }} />
      <div className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-50 blur-3xl" style={{ background: 'radial-gradient(circle, #f6a6d8 0%, transparent 70%)' }} />
      <div className="absolute top-10 right-[-10%] h-[600px] w-[600px] rounded-full opacity-40 blur-3xl" style={{ background: 'radial-gradient(circle, #8f7bff 0%, transparent 70%)' }} />
      <svg className="absolute bottom-0 left-0 h-[48%] w-full" viewBox="0 0 1440 420" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="mtn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#efe4ff" stopOpacity="0.9" />
            <stop offset="0.25" stopColor="#a68ae0" stopOpacity="0.85" />
            <stop offset="1" stopColor="#4b3394" />
          </linearGradient>
          <linearGradient id="hills" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4a3192" />
            <stop offset="1" stopColor="#24184f" />
          </linearGradient>
        </defs>
        <path d="M380 420 L700 110 Q720 92 742 108 L1080 420 Z" fill="url(#mtn)" opacity="0.75" />
        <path d="M640 168 L700 112 Q720 94 742 110 L800 160 L770 150 L745 170 L720 150 L690 172 Z" fill="#fff" opacity="0.65" />
        <path d="M0 330 Q200 270 420 310 T860 300 T1440 290 L1440 420 L0 420 Z" fill="url(#hills)" opacity="0.92" />
        <path d="M0 370 Q300 330 620 362 T1440 350 L1440 420 L0 420 Z" fill="#1d1444" opacity="0.95" />
      </svg>
      <style>{`@keyframes petal { 0% { transform: translate3d(0,-10vh,0) rotate(0deg); opacity:0 } 10% { opacity:.85 } 100% { transform: translate3d(var(--drift),110vh,0) rotate(540deg); opacity:0 } }`}</style>
      {petals.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 block rounded-[60%_10%_60%_10%]"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.8,
            background: 'linear-gradient(135deg, #ffd1ea, #f59ac9)',
            animation: `petal ${p.duration}s linear -${p.delay}s infinite`,
            ['--drift' as string]: `${p.drift}px`
          }}
        />
      ))}
    </div>
  )
}
