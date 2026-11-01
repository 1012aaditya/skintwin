import { ArrowLeft, ArrowRight, Camera, Check, Globe, Layers, Mic, ScanFace, ShieldCheck, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import type { PermissionState } from '@shared/models'
import { prettyAccelerator } from '@shared/shortcuts'
import { Orb } from '@renderer/components/Orb'
import { Badge, Button, Card, Field, Input } from '@renderer/components/ui'
import { cn } from '@renderer/lib/cn'
import { navigate } from '@renderer/lib/router'
import { mutate, useDb } from '@renderer/lib/store'
import { toast } from '@renderer/lib/toast'
import { AgeSelect, AvoidList, ConcernPicker, GoalPicker, PreferencePicker, SensitivityPicker, SkinTypePicker, TonePicker } from '../profile/fields'

const STEPS = ['Welcome', 'Skin profile', 'Details', 'Preferences', 'Permissions', 'Skin analysis', 'Done'] as const

export function Onboarding() {
  const db = useDb()
  const step = Math.min(db.onboarding.step, STEPS.length - 1)
  const go = (s: number) => mutate({ type: 'onboarding.update', patch: { step: Math.max(0, Math.min(STEPS.length - 1, s)) } })
  const finish = async (route = '/discover') => {
    await mutate({ type: 'onboarding.update', patch: { completed: true, step: STEPS.length - 1 } })
    navigate(route)
    void window.skintwin.companion.show()
  }

  return (
    <div className="drag flex h-full items-center justify-center p-8">
      <Card strong className="no-drag relative flex h-[min(720px,92vh)] w-full max-w-[880px] flex-col overflow-hidden">
        <div className="flex items-center gap-4 px-8 pt-7">
          {step > 0 && step < STEPS.length - 1 ? (
            <Button size="icon" variant="ghost" aria-label="Back" onClick={() => go(step - 1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : (
            <span className="w-9" />
          )}
          <span className="text-lg font-semibold">SkinTwin</span>
          {step > 0 && step < STEPS.length - 1 && (
            <>
              <div className="ml-4 flex flex-1 gap-1.5" aria-label={`Step ${step} of ${STEPS.length - 2}`}>
                {STEPS.slice(1, -1).map((_, i) => (
                  <span key={i} className={cn('h-1.5 flex-1 rounded-pill transition-colors', i < step ? 'bg-gradient-to-r from-lilac-400 to-blush-300' : 'bg-white/15')} />
                ))}
              </div>
              <span className="text-[13px] text-ink-soft">
                Step {step} of {STEPS.length - 2}
              </span>
            </>
          )}
        </div>

        <div className="scroll-area min-h-0 flex-1 px-10 py-6">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22 }}>
              {step === 0 && <Welcome />}
              {step === 1 && <ProfileStep />}
              {step === 2 && <DetailsStep />}
              {step === 3 && <PreferencesStep />}
              {step === 4 && <PermissionsStep />}
              {step === 5 && <AnalysisStep onAnalyze={() => finish('/analyze')} />}
              {step === 6 && <DoneStep />}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between px-10 pb-8">
          {step === 0 ? (
            <span className="text-xs text-ink-faint">Cosmetic guidance only — not medical advice.</span>
          ) : step < STEPS.length - 1 ? (
            <Button variant="ghost" onClick={() => go(step + 1)}>
              Skip for now
            </Button>
          ) : (
            <span />
          )}
          {step === 0 ? (
            <Button variant="primary" size="lg" onClick={() => go(1)}>
              Get started <ArrowRight className="h-4 w-4" />
            </Button>
          ) : step === STEPS.length - 1 ? (
            <Button variant="primary" size="lg" onClick={() => finish()}>
              Open SkinTwin <ArrowRight className="h-4 w-4" />
            </Button>
          ) : step === 5 ? (
            <Button variant="glass" size="lg" onClick={() => go(6)}>
              I’ll do it later <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={() => go(step + 1)}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

function StepTitle({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-[30px] font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 max-w-xl text-[15px] text-ink-soft">{body}</p>
    </div>
  )
}

function Welcome() {
  const db = useDb()
  return (
    <div className="flex flex-col items-center pt-4 text-center">
      <Orb size={150} mood="happy" />
      <h1 className="mt-6 text-[44px] font-semibold tracking-tight text-gradient">Meet SkinTwin</h1>
      <p className="mt-2 text-lg text-ink-soft">Your personal skin intelligence companion.</p>
      <div className="glass-inset mt-8 grid w-full max-w-2xl grid-cols-3 divide-x divide-white/10 rounded-[24px] py-5">
        {[
          [<ScanFace key="a" />, 'Understand your skin', 'Optional selfie analysis with YouCam'],
          [<Sparkles key="b" />, 'Check any product', 'Ask “is this good for my skin?”'],
          [<Layers key="c" />, 'Build your routine', 'Track what you own and use']
        ].map(([icon, t, b]) => (
          <div key={t as string} className="flex flex-col items-center gap-2 px-4">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-lilac-200 [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
            <p className="text-sm font-semibold">{t}</p>
            <p className="text-xs text-ink-soft">{b}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 w-full max-w-xs text-left">
        <Field label="What should SkinTwin call you? (optional)">
          <Input defaultValue={db.displayName ?? ''} placeholder="Your first name" onBlur={(e) => mutate({ type: 'user.setName', name: e.target.value || null })} />
        </Field>
      </div>
    </div>
  )
}

function ProfileStep() {
  const { profile } = useDb()
  return (
    <>
      <StepTitle title="Create your skin profile" body="Tell SkinTwin about your skin so it can personalize product checks. You can change any of this later." />
      <div className="space-y-6">
        <Field label="Skin type">
          <SkinTypePicker profile={profile} />
        </Field>
        <Field label="Main concerns">
          <ConcernPicker profile={profile} />
        </Field>
        <Field label="Skin goals">
          <GoalPicker profile={profile} />
        </Field>
      </div>
    </>
  )
}

function DetailsStep() {
  const { profile } = useDb()
  return (
    <>
      <StepTitle title="A few more details" body="These help SkinTwin flag strong actives and tone-related advice. All optional." />
      <div className="grid grid-cols-2 gap-6">
        <Card className="p-5">
          <Field label="Skin sensitivity">
            <SensitivityPicker profile={profile} />
          </Field>
        </Card>
        <Card className="p-5">
          <Field label="Skin tone">
            <TonePicker profile={profile} />
          </Field>
        </Card>
        <Card className="p-5">
          <Field label="Age range">
            <AgeSelect profile={profile} />
          </Field>
        </Card>
      </div>
    </>
  )
}

function PreferencesStep() {
  const { profile } = useDb()
  return (
    <>
      <StepTitle title="Your preferences" body="SkinTwin will flag products that conflict with these." />
      <div className="space-y-6">
        <Field label="Ingredient preferences">
          <PreferencePicker profile={profile} />
        </Field>
        <Field label="Ingredients to avoid" hint="Press Enter to add. Matching is by name in the ingredient list.">
          <AvoidList profile={profile} />
        </Field>
      </div>
    </>
  )
}

function PermissionRow({ icon, title, body, state, action }: { icon: ReactNode; title: string; body: string; state: PermissionState; action: ReactNode }) {
  return (
    <div className="glass-inset flex items-center gap-4 rounded-[20px] p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-lilac-200 [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[15px] font-semibold">
          {title}
          {state === 'granted' && <Badge tone="success" size="sm">Allowed</Badge>}
          {state === 'denied' && <Badge tone="danger" size="sm">Denied</Badge>}
          {state === 'skipped' && <Badge size="sm">Skipped</Badge>}
        </p>
        <p className="mt-0.5 text-[13px] text-ink-soft">{body}</p>
      </div>
      {action}
    </div>
  )
}

export async function requestMedia(kind: 'microphone' | 'camera'): Promise<PermissionState> {
  try {
    const os = await window.skintwin.media.request(kind)
    if (os === 'denied' || os === 'restricted') return 'denied'
    const stream = await navigator.mediaDevices.getUserMedia(kind === 'microphone' ? { audio: true } : { video: true })
    stream.getTracks().forEach((t) => t.stop()) // only verifying access; nothing is recorded
    return 'granted'
  } catch {
    return 'denied'
  }
}

function PermissionsStep() {
  const { onboarding } = useDb()
  const p = onboarding.permissions
  const set = (patch: Partial<typeof p>) => mutate({ type: 'onboarding.update', patch: { permissions: patch } })
  const [busy, setBusy] = useState<string | null>(null)
  return (
    <>
      <StepTitle title="Let’s set things up" body="Each permission is optional and explained before it’s requested. SkinTwin works without any of them." />
      <div className="space-y-3">
        <PermissionRow
          icon={<Mic />}
          title="Microphone"
          body="Ask questions out loud. The mic is only on while the companion shows it’s listening — never in the background. Audio goes to your configured speech provider and isn’t stored."
          state={p.microphone}
          action={
            p.microphone === 'granted' ? null : (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => set({ microphone: 'skipped' })}>
                  Not now
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  loading={busy === 'mic'}
                  onClick={async () => {
                    setBusy('mic')
                    const s = await requestMedia('microphone')
                    setBusy(null)
                    await set({ microphone: s })
                    if (s === 'denied') toast.error('Microphone access was denied. You can type questions instead, or enable it in System Settings › Privacy.')
                  }}
                >
                  Allow microphone
                </Button>
              </div>
            )
          }
        />
        <PermissionRow
          icon={<Camera />}
          title="Camera"
          body="Used only when you choose to take a selfie for skin analysis. We’ll ask at that moment — nothing to do now."
          state={p.camera}
          action={<Badge size="sm">Asked when needed</Badge>}
        />
        <PermissionRow
          icon={<Globe />}
          title="Browser product awareness"
          body="Install the SkinTwin browser extension, then click it on a product page. It reads only that page’s product details (name, ingredients, price) after you click."
          state={p.pageAccess}
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => set({ pageAccess: 'skipped' })}>
                Not now
              </Button>
              <Button size="sm" variant="glass" onClick={() => set({ pageAccess: 'granted' })}>
                I’ll set it up
              </Button>
            </div>
          }
        />
      </div>
      <p className="mt-5 flex items-center gap-2 text-xs text-ink-faint">
        <ShieldCheck className="h-4 w-4" /> Your data stays on this device unless a feature you use needs a provider. You can change these anytime in Settings.
      </p>
    </>
  )
}

function AnalysisStep({ onAnalyze }: { onAnalyze: () => void }) {
  return (
    <div className="flex flex-col items-center pt-6 text-center">
      <div className="relative grid h-40 w-40 place-items-center rounded-[40px] border border-white/20 bg-white/5">
        <ScanFace className="h-16 w-16 text-lilac-200" />
        <span className="absolute inset-3 rounded-[30px] border-2 border-dashed border-lilac-300/40" />
      </div>
      <h2 className="mt-6 text-[30px] font-semibold">Analyze your skin?</h2>
      <p className="mt-2 max-w-md text-[15px] text-ink-soft">
        Take or upload a clear selfie and YouCam’s AI will score hydration, oiliness, pores, texture and more. It’s a cosmetic assessment, not a medical diagnosis. The photo is sent to YouCam for analysis and isn’t stored by SkinTwin.
      </p>
      <Button variant="primary" size="lg" className="mt-6" onClick={onAnalyze}>
        <Camera className="h-4 w-4" /> Analyze now
      </Button>
    </div>
  )
}

function DoneStep() {
  const db = useDb()
  const rows = [
    ['Skin profile', !!db.profile.skinType || db.profile.concerns.length > 0],
    ['Preferences', db.profile.preferences.length > 0],
    ['Microphone', db.onboarding.permissions.microphone === 'granted']
  ] as const
  return (
    <div className="flex flex-col items-center pt-4 text-center">
      <Orb size={130} mood="happy" />
      <h2 className="mt-6 text-[34px] font-semibold">You’re all set{db.displayName ? `, ${db.displayName}` : ''}!</h2>
      <p className="mt-1 text-ink-soft">Your SkinTwin is ready ✨</p>
      <div className="glass-inset mt-6 w-full max-w-sm space-y-3 rounded-[20px] p-5 text-left">
        {rows.map(([t, done]) => (
          <p key={t} className="flex items-center gap-3 text-sm">
            <span className={cn('grid h-6 w-6 place-items-center rounded-full', done ? 'bg-mint-400 text-[#0b3a1f]' : 'bg-white/15 text-ink-faint')}>
              <Check className="h-3.5 w-3.5" />
            </span>
            {t} {done ? '' : <span className="text-ink-faint">— you can add this later</span>}
          </p>
        ))}
      </div>
      <p className="mt-5 text-[13px] text-ink-soft">
        Tip: press <kbd className="rounded bg-white/15 px-1.5 py-0.5">{prettyAccelerator(db.settings.companion.shortcut)}</kbd> in any app to show SkinTwin, and <kbd className="rounded bg-white/15 px-1.5 py-0.5">{prettyAccelerator(db.settings.companion.voiceShortcut)}</kbd> to talk.
      </p>
    </div>
  )
}
