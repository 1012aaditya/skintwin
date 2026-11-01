import { X } from 'lucide-react'
import { useState } from 'react'
import { AGE_RANGES, CONCERNS, GOALS, label, PREFERENCES, SENSITIVITY, SKIN_TONES, SKIN_TYPES, type SkinProfile } from '@shared/models'
import { Chip, Input, Select } from '@renderer/components/ui'
import { cn } from '@renderer/lib/cn'
import { mutate } from '@renderer/lib/store'

/** Profile inputs shared by onboarding and the profile editor. Each change persists immediately. */
type Patch = Partial<Omit<SkinProfile, 'updatedAt'>>
export const saveProfile = (patch: Patch) => mutate({ type: 'profile.update', patch })

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

export function SkinTypePicker({ profile }: { profile: SkinProfile }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SKIN_TYPES.map((t) => (
        <Chip key={t} selected={profile.skinType === t} onClick={() => saveProfile({ skinType: profile.skinType === t ? null : t })}>
          {label(t)}
        </Chip>
      ))}
    </div>
  )
}

export function ConcernPicker({ profile }: { profile: SkinProfile }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CONCERNS.map((c) => (
        <Chip key={c} selected={profile.concerns.includes(c)} onClick={() => saveProfile({ concerns: toggle(profile.concerns, c) })}>
          {label(c)}
        </Chip>
      ))}
    </div>
  )
}

export function GoalPicker({ profile }: { profile: SkinProfile }) {
  return (
    <div className="flex flex-wrap gap-2">
      {GOALS.map((g) => (
        <Chip key={g} selected={profile.goals.includes(g)} onClick={() => saveProfile({ goals: toggle(profile.goals, g) })}>
          {label(g)}
        </Chip>
      ))}
    </div>
  )
}

export function PreferencePicker({ profile }: { profile: SkinProfile }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PREFERENCES.map((p) => (
        <Chip key={p} selected={profile.preferences.includes(p)} onClick={() => saveProfile({ preferences: toggle(profile.preferences, p) })}>
          {label(p)}
        </Chip>
      ))}
    </div>
  )
}

export function SensitivityPicker({ profile }: { profile: SkinProfile }) {
  return (
    <div className="glass-inset inline-flex rounded-pill p-1">
      {SENSITIVITY.map((s) => (
        <button key={s} onClick={() => saveProfile({ sensitivity: s })} className={cn('h-9 rounded-pill px-5 text-sm transition-colors', profile.sensitivity === s ? 'bg-gradient-to-r from-lilac-500 to-[#b88cff] text-white shadow-glow-soft' : 'text-ink-soft hover:text-ink')}>
          {label(s)}
        </button>
      ))}
    </div>
  )
}

const TONE_COLORS: Record<(typeof SKIN_TONES)[number], string> = { fair: '#f6dccb', light: '#eac3a6', medium: '#d5a07a', tan: '#b07a55', deep: '#6e4630' }

export function TonePicker({ profile }: { profile: SkinProfile }) {
  return (
    <div className="flex gap-3">
      {SKIN_TONES.map((t) => (
        <button
          key={t}
          aria-label={label(t)}
          title={label(t)}
          onClick={() => saveProfile({ skinTone: profile.skinTone === t ? null : t })}
          className={cn('h-10 w-10 rounded-full border-2 transition-transform', profile.skinTone === t ? 'scale-110 border-white shadow-glow' : 'border-white/25 hover:scale-105')}
          style={{ background: TONE_COLORS[t] }}
        />
      ))}
    </div>
  )
}

export function AgeSelect({ profile }: { profile: SkinProfile }) {
  return (
    <Select value={profile.ageRange ?? ''} onChange={(e) => saveProfile({ ageRange: (e.target.value || null) as SkinProfile['ageRange'] })} className="max-w-56">
      <option value="">Prefer not to say</option>
      {AGE_RANGES.map((a) => (
        <option key={a} value={a}>
          {label(a)}
        </option>
      ))}
    </Select>
  )
}

export function AvoidList({ profile }: { profile: SkinProfile }) {
  const [value, setValue] = useState('')
  const add = () => {
    const v = value.trim()
    if (!v || profile.avoidIngredients.some((a) => a.toLowerCase() === v.toLowerCase())) return setValue('')
    void saveProfile({ avoidIngredients: [...profile.avoidIngredients, v] })
    setValue('')
  }
  return (
    <div>
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="e.g. Fragrance, Coconut oil, Sulfates" />
      </div>
      {profile.avoidIngredients.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {profile.avoidIngredients.map((a) => (
            <span key={a} className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-rose-300/30 bg-rose-400/10 pr-1.5 pl-3 text-[13px]">
              {a}
              <button aria-label={`Remove ${a}`} className="grid h-5 w-5 place-items-center rounded-full hover:bg-white/15" onClick={() => saveProfile({ avoidIngredients: profile.avoidIngredients.filter((x) => x !== a) })}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function profileCompleteness(p: SkinProfile): number {
  const parts = [!!p.skinType, !!p.sensitivity, !!p.skinTone, !!p.ageRange, p.concerns.length > 0, p.goals.length > 0, p.preferences.length > 0]
  return Math.round((parts.filter(Boolean).length / parts.length) * 100)
}
