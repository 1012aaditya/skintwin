import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@renderer/lib/cn'

export type OrbMood = 'idle' | 'listening' | 'thinking' | 'speaking' | 'happy' | 'concerned'

/**
 * SkinTwin's presence: a minimal glass sphere with a light inside it.
 * The light carries state: a slow breath when idle, it follows your voice
 * when listening, swirls when thinking, pulses when speaking, warms when
 * something needs attention. `level` (0–1) is the live microphone level.
 */
export function Orb({ size = 160, mood = 'idle', level = 0, className }: { size?: number; mood?: OrbMood; level?: number; className?: string; ring?: boolean }) {
  const still = !!useReducedMotion()
  const warm = mood === 'concerned'
  const core = warm ? 'rgb(255 190 150)' : 'rgb(236 222 255)'
  const coreMid = warm ? 'rgb(255 140 170 / 0.75)' : 'rgb(178 140 255 / 0.8)'

  const coreAnim =
    mood === 'listening'
      ? { scale: 0.85 + level * 0.55, opacity: 0.75 + level * 0.25 }
      : mood === 'speaking'
        ? { scale: [0.9, 1.08, 0.9], opacity: [0.8, 1, 0.8] }
        : mood === 'thinking'
          ? { scale: [0.88, 1, 0.88], opacity: [0.7, 0.95, 0.7] }
          : { scale: [0.86, 1, 0.86], opacity: [0.7, 0.92, 0.7] }
  const coreTransition =
    mood === 'listening' ? { duration: 0.12 } : { duration: mood === 'speaking' ? 0.9 : mood === 'thinking' ? 1.6 : 4.2, repeat: Infinity, ease: 'easeInOut' as const }

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      {/* outer glow */}
      <motion.div
        className="absolute inset-[-28%] rounded-full"
        style={{ background: `radial-gradient(circle, ${warm ? 'rgb(255 160 170 / 0.5)' : 'rgb(190 160 255 / 0.55)'} 0%, ${warm ? 'rgb(255 140 160 / 0.15)' : 'rgb(140 100 255 / 0.18)'} 40%, transparent 68%)` }}
        animate={still ? undefined : mood === 'listening' ? { scale: 1 + level * 0.3 } : { scale: [0.96, 1.06, 0.96], opacity: [0.8, 1, 0.8] }}
        transition={mood === 'listening' ? { duration: 0.12 } : { duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* listening: ripples leave the sphere */}
      {mood === 'listening' &&
        !still &&
        [0, 0.6, 1.2].map((delay) => (
          <motion.span
            key={delay}
            className="absolute inset-0 rounded-full border border-lilac-200/60"
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 1.7, opacity: 0 }}
            transition={{ duration: 1.8, delay, repeat: Infinity, ease: 'easeOut' }}
          />
        ))}

      {/* the sphere */}
      <motion.div
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{
          background: 'radial-gradient(circle at 35% 28%, rgb(255 255 255 / 0.55) 0%, rgb(214 196 255 / 0.35) 18%, rgb(122 86 232 / 0.55) 55%, rgb(64 36 168 / 0.85) 100%)',
          boxShadow: `inset 0 0 ${size * 0.12}px rgb(255 255 255 / 0.35), inset 0 -${size * 0.08}px ${size * 0.18}px rgb(255 160 220 / 0.35), 0 ${size * 0.08}px ${size * 0.25}px rgb(40 15 110 / 0.35)`
        }}
        animate={still || mood === 'listening' ? undefined : { y: [0, -size * 0.02, 0] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* inner light */}
        <motion.div
          className="absolute inset-[16%] rounded-full"
          style={{ background: `radial-gradient(circle at 50% 55%, ${core} 0%, ${coreMid} 35%, transparent 70%)`, filter: `blur(${Math.max(2, size * 0.04)}px)` }}
          animate={still ? undefined : coreAnim}
          transition={coreTransition}
        />
        {/* thinking: a slow swirl of light */}
        {mood === 'thinking' && (
          <motion.div
            className="absolute inset-[-20%] mix-blend-screen"
            style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgb(255 255 255 / 0.55) 60deg, transparent 140deg, rgb(255 180 235 / 0.4) 220deg, transparent 300deg)', filter: `blur(${Math.max(2, size * 0.05)}px)` }}
            animate={still ? undefined : { rotate: 360 }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
          />
        )}
        {/* soft caustic at the base */}
        <div className="absolute inset-x-[20%] bottom-[6%] h-[22%] rounded-full" style={{ background: 'radial-gradient(ellipse, rgb(255 200 240 / 0.55), transparent 70%)', filter: `blur(${Math.max(1, size * 0.03)}px)` }} />
      </motion.div>

      {/* glass rim + specular highlights (above the light) */}
      <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.45)' }} />
      <div
        className="pointer-events-none absolute rounded-full"
        style={{ left: '18%', top: '12%', width: '36%', height: '20%', transform: 'rotate(-28deg)', background: 'radial-gradient(ellipse, rgb(255 255 255 / 0.9), rgb(255 255 255 / 0) 70%)' }}
      />
      <div className="pointer-events-none absolute rounded-full bg-white/80" style={{ left: '27%', top: '20%', width: '8%', height: '5%', transform: 'rotate(-28deg)' }} />
    </div>
  )
}
