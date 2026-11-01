import { AlertTriangle, BarChart3, Camera, Check, Clock, Droplets, Grid3x3, ImageUp, Info, RefreshCcw, ScanFace, Sparkles, Sun, Waves, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { label, SKIN_TYPES, type AnalysisMetric, type Concern, type SkinAnalysis, type SkinType } from '@shared/models'
import { Badge, Button, Card, ErrorState, ProgressRing, SectionTitle, Spinner } from '@renderer/components/ui'
import { cn } from '@renderer/lib/cn'
import { formatDate } from '@renderer/lib/format'
import { blobToBase64, checkImage, type ImageCheck } from '@renderer/lib/media'
import { navigate } from '@renderer/lib/router'
import { mutate, newRequestId, useDb, useProviders } from '@renderer/lib/store'
import { toast } from '@renderer/lib/toast'

type Phase =
  | { kind: 'idle' }
  | { kind: 'camera' }
  | { kind: 'preview'; blob: Blob; url: string; check: ImageCheck | null }
  | { kind: 'submitting'; url: string; stage: string; requestId: string }
  | { kind: 'error'; url: string | null; message: string; code?: string }

const METRIC_ICONS: Record<string, ReactNode> = {
  moisture: <Droplets />,
  oiliness: <Waves />,
  texture: <Grid3x3 />,
  pore: <ScanFace />,
  radiance: <Sparkles />,
  redness: <Sun />
}

export const METRIC_TO_CONCERN: Record<string, Concern> = {
  acne: 'acne',
  oiliness: 'excess_oil',
  pore: 'visible_pores',
  moisture: 'dryness',
  texture: 'texture',
  redness: 'redness',
  radiance: 'dullness',
  wrinkle: 'fine_lines',
  dark_circle_v2: 'dark_circles',
  dark_circle: 'dark_circles',
  age_spot: 'dark_spots'
}

const STAGE_TEXT: Record<string, string> = {
  starting: 'Preparing your photo…',
  uploading: 'Uploading securely to YouCam…',
  queued: 'Queued for analysis…',
  analyzing: 'YouCam is analysing your skin…',
  finalizing: 'Reading your results…'
}

export function summaryScore(a: SkinAnalysis): { value: number | null; label: string } {
  if (a.overallScore != null) return { value: a.overallScore, label: 'Overall score' }
  const scores = a.metrics.map((m) => m.score).filter((s): s is number => s != null)
  if (!scores.length) return { value: null, label: 'No score' }
  return { value: Math.round(scores.reduce((x, y) => x + y, 0) / scores.length), label: `Average of ${scores.length} scores` }
}

export function Analyze() {
  const db = useDb()
  const providers = useProviders()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const latest = db.analyses[0] ?? null
  const [shown, setShown] = useState<SkinAnalysis | null>(latest)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => setShown((s) => (s && db.analyses.some((a) => a.id === s.id) ? s : (db.analyses[0] ?? null))), [db.analyses])

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }
  useEffect(() => stopCamera, [])

  useEffect(
    () =>
      window.skintwin.analysis.onProgress(({ requestId, stage }) =>
        setPhase((p) => (p.kind === 'submitting' && p.requestId === requestId ? { ...p, stage } : p))
      ),
    []
  )

  const configured = providers?.youcam.configured || providers?.youcam.mockAllowed

  async function startCamera() {
    const os = await window.skintwin.media.request('camera')
    if (os === 'denied' || os === 'restricted') {
      await mutate({ type: 'onboarding.update', patch: { permissions: { camera: 'denied' } } })
      setPhase({ kind: 'error', url: null, message: 'Camera access is off. Enable it in System Settings › Privacy & Security › Camera, or upload a photo instead.', code: 'camera_denied' })
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' } })
      streamRef.current = stream
      await mutate({ type: 'onboarding.update', patch: { permissions: { camera: 'granted' } } })
      setPhase({ kind: 'camera' })
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play()
        }
      })
    } catch {
      setPhase({ kind: 'error', url: null, message: 'No camera is available. Upload a photo instead.', code: 'no_camera' })
    }
  }

  async function capture() {
    const v = videoRef.current
    if (!v) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    const ctx = c.getContext('2d')!
    ctx.translate(c.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(v, 0, 0)
    stopCamera()
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.92))
    await preview(blob)
  }

  async function preview(blob: Blob) {
    const url = URL.createObjectURL(blob)
    setPhase({ kind: 'preview', blob, url, check: null })
    try {
      const check = await checkImage(blob)
      setPhase({ kind: 'preview', blob, url, check })
    } catch {
      setPhase({ kind: 'error', url, message: 'That file couldn’t be read as an image.' })
    }
  }

  async function submit(blob: Blob, url: string) {
    const requestId = newRequestId()
    setPhase({ kind: 'submitting', url, stage: 'starting', requestId })
    const res = await window.skintwin.analysis.run({ requestId, imageBase64: await blobToBase64(blob), mimeType: blob.type })
    if (res.ok) {
      setShown(res.data)
      setPhase({ kind: 'idle' })
      URL.revokeObjectURL(url)
      toast.success(res.data.isMock ? 'Mock analysis complete (not a real result)' : 'Analysis complete')
    } else if (res.code === 'cancelled') setPhase({ kind: 'idle' })
    else setPhase({ kind: 'error', url, message: res.error, code: res.code })
  }

  const photoUrl = phase.kind === 'preview' || phase.kind === 'submitting' ? phase.url : phase.kind === 'error' ? phase.url : null

  return (
    <div className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-8 max-[1180px]:grid-cols-1">
      <div className="flex flex-col gap-6">
        <SectionTitle eyebrow="Skin analysis" title={<>Understand<br />your skin better</>} body="Capture a photo or upload a clear selfie to analyse your skin with YouCam. Cosmetic assessment only — not a medical diagnosis." />

        {providers && !configured && (
          <ErrorState title="Skin analysis isn’t configured yet" body="Add YOUCAM_API_KEY to your .env file and restart SkinTwin. Everything else in the app works without it." />
        )}
        {providers?.youcam.mockAllowed && (
          <div className="flex items-start gap-2 rounded-tile border border-dashed border-amber-200/50 bg-amber-300/10 p-3 text-[13px] text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Development mock mode: no YouCam key is set, so results are placeholder values flagged “Mock data”. They are not an analysis of your photo.
          </div>
        )}

        {/* Capture surface */}
        <div className="relative mx-auto aspect-[4/5] w-full max-w-[460px]">
          <div className="absolute inset-0 overflow-hidden rounded-[44%_56%_48%_52%/52%_44%_56%_48%] border-2 border-lilac-200/50 shadow-[0_0_60px_rgb(190_150_255/0.45)]" style={{ background: 'radial-gradient(circle at 40% 30%, #6a4fc2, #2e1f6a)' }}>
            {phase.kind === 'camera' && <video ref={videoRef} className="h-full w-full -scale-x-100 object-cover" muted playsInline />}
            {photoUrl && <img src={photoUrl} alt="Your selfie preview" className="h-full w-full object-cover" />}
            {phase.kind === 'idle' && !photoUrl && (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-soft">
                <ScanFace className="h-20 w-20 text-lilac-200/80" />
                <p className="max-w-[220px] text-center text-sm">Face a window or soft light, remove glasses, look straight ahead.</p>
              </div>
            )}
            {phase.kind === 'submitting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#1d1546]/60 backdrop-blur-sm">
                <Spinner className="h-10 w-10" />
                <p className="text-sm font-medium">{STAGE_TEXT[phase.stage] ?? 'Working…'}</p>
              </div>
            )}
          </div>
          {/* face guide */}
          {(phase.kind === 'camera' || phase.kind === 'preview') && (
            <div className="pointer-events-none absolute inset-[22%_24%_26%] rounded-[50%] border-2 border-dashed border-white/50" />
          )}
          {phase.kind === 'preview' && phase.check && (
            <div className="glass absolute top-[18%] left-[-6%] space-y-1.5 rounded-2xl p-3 text-[13px]">
              {[
                ['Resolution', Math.min(phase.check.width, phase.check.height) >= 480],
                ['Lighting', phase.check.brightness >= 0.22 && phase.check.brightness <= 0.9],
                ['File type & size', /^image\/(jpeg|png)$/.test(phase.blob.type) && phase.blob.size <= 10 * 1024 * 1024]
              ].map(([t, okay]) => (
                <p key={t as string} className="flex items-center justify-between gap-4">
                  {t}
                  {okay ? <Check className="h-4 w-4 text-mint-300" /> : <X className="h-4 w-4 text-rose-300" />}
                </p>
              ))}
            </div>
          )}
        </div>

        {phase.kind === 'preview' && phase.check && !phase.check.ok && (
          <ErrorState title="This photo may not analyse well" body={phase.check.issues.join(' ')} />
        )}
        {phase.kind === 'error' && <ErrorState title="Analysis didn’t complete" body={phase.message} />}

        <div className="flex items-center justify-center gap-3">
          <input
            id="selfie-upload"
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void preview(f)
            }}
          />
          {phase.kind === 'camera' ? (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  stopCamera()
                  setPhase({ kind: 'idle' })
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" size="icon-lg" aria-label="Capture photo" onClick={capture} className="h-16 w-16 ring-4 ring-lilac-300/40">
                <Camera className="h-6 w-6" />
              </Button>
            </>
          ) : phase.kind === 'preview' ? (
            <>
              <Button onClick={() => setPhase({ kind: 'idle' })}>
                <RefreshCcw className="h-4 w-4" /> Retake
              </Button>
              <Button variant="primary" size="lg" disabled={!configured || !phase.check || /^image\/(jpeg|png)$/.test(phase.blob.type) === false} onClick={() => submit(phase.blob, phase.url)}>
                <Sparkles className="h-4 w-4" /> {providers?.youcam.configured ? 'Analyze with YouCam' : 'Run mock analysis (dev)'}
              </Button>
            </>
          ) : phase.kind === 'submitting' ? (
            <Button variant="ghost" onClick={() => window.skintwin.cancel(phase.requestId)}>
              Cancel
            </Button>
          ) : (
            <>
              <Button onClick={() => document.getElementById('selfie-upload')?.click()}>
                <ImageUp className="h-4 w-4" /> Upload
              </Button>
              <Button variant="primary" size="icon-lg" aria-label="Open camera" onClick={startCamera} className="h-16 w-16 ring-4 ring-lilac-300/40">
                <Camera className="h-6 w-6" />
              </Button>
              {phase.kind === 'error' && phase.url ? (
                <Button onClick={() => setPhase({ kind: 'idle' })}>
                  <RefreshCcw className="h-4 w-4" /> Retake
                </Button>
              ) : (
                <span className="w-[98px]" />
              )}
            </>
          )}
        </div>
        <p className="text-center text-xs text-ink-faint">Your photo is sent to YouCam only when you press Analyze, and is never saved by SkinTwin.</p>
      </div>

      {shown ? <AnalysisResult analysis={shown} /> : <NoResultYet />}
    </div>
  )
}

function NoResultYet() {
  return (
    <Card strong className="flex flex-col items-center justify-center gap-4 p-10 text-center">
      <BarChart3 className="h-12 w-12 text-lilac-200" />
      <h2 className="text-2xl font-semibold">No analysis yet</h2>
      <p className="max-w-sm text-ink-soft">Your results will appear here: hydration, oil control, texture, pores, radiance and more — exactly as YouCam reports them.</p>
    </Card>
  )
}

export function MetricTile({ m }: { m: AnalysisMetric }) {
  const tone = m.score == null ? 'text-ink-soft' : m.score >= 80 ? 'text-mint-300' : m.score >= 60 ? 'text-amber-300' : 'text-rose-300'
  return (
    <div className="glass-inset flex flex-col items-center gap-1 rounded-[20px] px-3 py-4 text-center">
      <span className="text-lilac-200 [&_svg]:h-5 [&_svg]:w-5">{METRIC_ICONS[m.key] ?? <Sparkles />}</span>
      <span className="text-[13px] text-ink-soft">{m.label}</span>
      <span className={cn('text-2xl font-semibold', tone)}>{m.score ?? '—'}</span>
    </div>
  )
}

export function AnalysisResult({ analysis }: { analysis: SkinAnalysis }) {
  const db = useDb()
  const summary = summaryScore(analysis)
  const scored = analysis.metrics.filter((m) => m.score != null).sort((a, b) => b.score! - a.score!)
  const strengths = scored.slice(0, 2)
  const focus = scored.slice(-2).reverse().filter((m) => m.score! < 75)
  const suggestedConcerns = [...new Set(focus.map((m) => METRIC_TO_CONCERN[m.key]).filter(Boolean) as Concern[])].filter((c) => !db.profile.concerns.includes(c))
  const ytType = analysis.skinType?.toLowerCase() as SkinType | undefined
  const suggestedType = ytType && (SKIN_TYPES as readonly string[]).includes(ytType) && db.profile.skinType !== ytType ? ytType : null

  return (
    <Card strong className="flex flex-col gap-6 p-7">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-white/12 text-lilac-200">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <h2 className="text-[26px] font-semibold">Your skin analysis</h2>
          <p className="text-sm text-ink-soft">
            {analysis.isMock ? 'Development mock' : <>Powered by <span className="font-semibold text-blush-300">YouCam</span></>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge size="sm">
            <Clock className="h-3 w-3" /> {formatDate(analysis.createdAt, { dateStyle: 'medium', timeStyle: 'short' } as Intl.DateTimeFormatOptions)}
          </Badge>
          {analysis.isMock && <Badge tone="demo" size="sm">Mock data — not a real result</Badge>}
        </div>
      </div>

      <div className="flex items-center gap-8">
        <ProgressRing value={summary.value} size={160} stroke={12} label={summary.value == null ? '—' : <>{summary.value}<span className="text-base text-ink-soft">/100</span></>} sublabel={summary.label} />
        <div className="flex-1 space-y-2">
          {analysis.skinAge != null && <p className="text-sm text-ink-soft">Estimated skin age: <span className="font-semibold text-ink">{analysis.skinAge}</span></p>}
          {analysis.skinType && <p className="text-sm text-ink-soft">YouCam skin type: <span className="font-semibold text-ink">{label(analysis.skinType)}</span></p>}
          {strengths.length > 0 && (
            <p className="text-[15px]">
              Relative strengths: <span className="font-semibold text-mint-300">{strengths.map((m) => m.label).join(' & ')}</span>
            </p>
          )}
          <p className="text-[12.5px] text-ink-faint">Scores are YouCam’s 0–100 display scores; higher means the area looks healthier in this photo. Lighting and camera can affect results.</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 max-[1400px]:grid-cols-4">
        {analysis.metrics.map((m) => (
          <MetricTile key={m.key} m={m} />
        ))}
      </div>

      {focus.length > 0 && (
        <div className="glass-inset rounded-[20px] p-5">
          <p className="mb-3 flex items-center gap-2 font-semibold">
            <Info className="h-4 w-4 text-lilac-200" /> Key insights
          </p>
          <ul className="space-y-2 text-[14px]">
            {strengths.map((m) => (
              <li key={m.key} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-mint-300" /> {m.label} scored {m.score} — one of your stronger areas.
              </li>
            ))}
            {focus.map((m) => (
              <li key={m.key} className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-300" /> {m.label} scored {m.score} — the lowest in this analysis.
              </li>
            ))}
          </ul>
        </div>
      )}

      {!analysis.isMock && (suggestedConcerns.length > 0 || suggestedType) && (
        <div className="flex items-center gap-3 rounded-[20px] border border-lilac-300/30 bg-lilac-400/10 p-4">
          <p className="flex-1 text-[13.5px]">
            Update your profile from this analysis?{' '}
            <span className="text-ink-soft">
              {suggestedType && <>Skin type → {label(suggestedType)}. </>}
              {suggestedConcerns.length > 0 && <>Add concerns: {suggestedConcerns.map(label).join(', ')}.</>}
            </span>
          </p>
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              mutate(
                { type: 'profile.update', patch: { ...(suggestedType ? { skinType: suggestedType } : {}), concerns: [...db.profile.concerns, ...suggestedConcerns] } },
                'Profile updated'
              )
            }
          >
            Update profile
          </Button>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="primary" size="lg" className="flex-1" onClick={() => navigate('/shop')}>
          Get personalized recommendations
        </Button>
        <Button size="lg" onClick={() => navigate(`/progress?analysis=${encodeURIComponent(analysis.id)}`)}>
          <BarChart3 className="h-4 w-4" /> Detailed report
        </Button>
      </div>
      {db.analyses.length > 1 && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-[13px] text-ink-soft">
          {db.analyses.length} analyses saved · <button className="underline" onClick={() => navigate('/progress')}>See your progress</button>
        </motion.p>
      )}
    </Card>
  )
}
