import { AlertTriangle, ArrowDown, ArrowUp, Camera, Check, Minus, RefreshCcw, ScanFace, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AnalysisMask, CaptureConditions, SkinAnalysis } from '@shared/models'
import { metricDeltas, previousRealScan, scanSummary } from '@shared/skin'
import { ProgressRing } from '@renderer/components/ui'
import { cn } from '@renderer/lib/cn'
import { formatDate } from '@renderer/lib/format'
import { coverCrop } from '@renderer/lib/media'
import { useDb, useProviders } from '@renderer/lib/store'
import { openCamera, type CameraSession } from '../features/analysis/camera'
import { activeEffects, allOk, firstIssue, smoothingWarning } from '../features/analysis/facecheck'
import { EffectsNotice, liveConditions, PreScanChecklist } from '../features/analysis/ScanNotes'
import { Heatmap } from '../features/analysis/Heatmap'
import { MetricTile } from '../features/analysis/Analyze'
import { CAPTURE_ASPECT, MIN_CAPTURE_SHORT_SIDE, useFaceGuide } from '../features/analysis/useFaceGuide'

/**
 * A skin scan started from the island: the camera with the face guide drops down, the photo
 * goes to YouCam only when the user presses Analyze, progress and the one-line result live in
 * the pill, and Details shows the full scores. The photo stays in memory and is never saved.
 */

export type SkinScan =
  | { kind: 'idle' }
  | { kind: 'checklist' }
  | { kind: 'camera' }
  | { kind: 'preview'; blob: Blob; url: string; capture: CaptureConditions }
  | { kind: 'running'; requestId: string; stage: string; url: string }
  | { kind: 'done'; analysis: SkinAnalysis; masks: AnalysisMask[]; url: string }
  | { kind: 'error'; message: string }

export const SCAN_STAGE: Record<string, { title: string; progress: number }> = {
  starting: { title: 'Preparing your photo…', progress: 0.1 },
  uploading: { title: 'Sending to YouCam…', progress: 0.3 },
  queued: { title: 'Queued at YouCam…', progress: 0.45 },
  analyzing: { title: 'YouCam is analysing your skin…', progress: 0.7 },
  finalizing: { title: 'Reading your results…', progress: 0.9 }
}

/** Camera + face guide, then a preview with an explicit Analyze button (each run uses a YouCam credit). */
export function SkinCameraView({ scan, onStartCamera, onCaptured, onAnalyze, onRetake, onClose }: { scan: SkinScan; onStartCamera: () => void; onCaptured: (blob: Blob, capture: CaptureConditions) => void; onAnalyze: () => void; onRetake: () => void; onClose: () => void }) {
  const providers = useProviders()
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const [camError, setCamError] = useState<string | null>(null)
  const [session, setSession] = useState<CameraSession | null>(null)
  const locked = useRef(false)
  const live = scan.kind === 'camera' && !camError
  const effectsOn = session ? activeEffects(session.effects).length > 0 : false
  const guide = useFaceGuide(videoRef, overlayRef, live && !!session, (photo, m) => photo.toBlob((b) => b && onCaptured(b, liveConditions(session, m, locked.current)), 'image/jpeg', 0.92), { holdCapture: effectsOn })
  const ok = guide.status === 'ready' && allOk(guide.checks) && !effectsOn
  const issue = firstIssue(guide.checks)
  const smoothed = smoothingWarning(guide.detail)

  useEffect(() => {
    if (scan.kind !== 'camera') return
    let cam: CameraSession | null = null
    let stopped = false
    let lockTimer: ReturnType<typeof setTimeout> | undefined
    locked.current = false
    void (async () => {
      const os = await window.skintwin.media.request('camera')
      if (os === 'denied' || os === 'restricted') return setCamError('Camera access is off. Turn it on in System Settings › Privacy & Security › Camera.')
      try {
        cam = await openCamera()
        if (stopped) return cam.stream.getTracks().forEach((t) => t.stop())
        setSession(cam)
        if (videoRef.current) {
          videoRef.current.srcObject = cam.stream
          void videoRef.current.play()
        }
        // let auto exposure settle on the face, then hold it for the capture
        const c = cam
        lockTimer = setTimeout(() => void c.lockExposure().then((v) => (locked.current = v)), 1500)
      } catch {
        setCamError('No camera is available.')
      }
    })()
    return () => {
      stopped = true
      clearTimeout(lockTimer)
      cam?.stream.getTracks().forEach((t) => t.stop())
      setSession(null)
    }
  }, [scan.kind])

  if (scan.kind === 'checklist') return <PreScanChecklist onStart={onStartCamera} onCancel={onClose} />

  const captureNow = () => {
    const v = videoRef.current
    if (!v?.videoWidth) return
    const { x, y, w, h } = coverCrop(v.videoWidth, v.videoHeight, CAPTURE_ASPECT)
    const scale = Math.max(1, MIN_CAPTURE_SHORT_SIDE / w)
    const c = document.createElement('canvas')
    c.width = Math.round(w * scale)
    c.height = Math.round(h * scale)
    const ctx = c.getContext('2d')!
    ctx.translate(c.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(v, x, y, w, h, 0, 0, c.width, c.height)
    c.toBlob((b) => b && onCaptured(b, liveConditions(session, guide.lastMeasure(), locked.current)), 'image/jpeg', 0.92)
  }

  const configured = providers?.youcam.configured || providers?.youcam.mockAllowed
  return (
    <div className="space-y-3" data-testid="skin-scan">
      {providers && !configured && <p className="rounded-2xl bg-amber-300/10 p-3 text-[13px] text-amber-100">Skin analysis isn’t set up yet: add YOUCAM_API_KEY to your .env file and restart SkinTwin.</p>}
      {providers?.youcam.mockAllowed && <p className="rounded-2xl border border-dashed border-amber-200/50 bg-amber-300/10 p-2.5 text-[12.5px] text-amber-100">Development mock mode: results will be placeholder values, not an analysis of your photo.</p>}
      <div className="relative mx-auto aspect-[4/5] w-full max-w-[300px] overflow-hidden rounded-[28px] bg-[#2e1f6a]">
        {scan.kind === 'camera' && !camError && (
          <>
            <video ref={videoRef} className="h-full w-full -scale-x-100 object-cover" muted playsInline />
            <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100" />
            <div className={cn('pointer-events-none absolute inset-[10%_15%_14%] rounded-[50%] border-2 transition-colors', ok ? 'border-solid border-mint-300 shadow-[0_0_24px_rgb(120_240_190/0.5)]' : 'border-dashed border-white/50')} />
            <p aria-live="polite" className="pointer-events-none absolute inset-x-3 bottom-3 text-center text-[13px] font-semibold text-white [text-shadow:0_1px_6px_rgb(0_0_0/0.7)]">
              {guide.status === 'loading' ? 'Starting the face guide…' : guide.status === 'unavailable' ? 'Fill the oval with your face' : effectsOn ? 'Turn off the video effect first' : ok ? 'Perfect — hold still…' : (issue?.hint ?? 'Bring your face into the oval')}
            </p>
          </>
        )}
        {scan.kind === 'preview' && <img src={scan.url} alt="Your selfie preview" className="h-full w-full object-cover" />}
        {(camError || scan.kind === 'error') && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-5 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-300" />
            <p className="text-[13.5px]">{camError ?? (scan.kind === 'error' ? scan.message : '')}</p>
          </div>
        )}
      </div>
      {scan.kind === 'camera' && session && <EffectsNotice effects={session.effects} studioLightUnknown={session.studioLightUnknown} />}
      {scan.kind === 'camera' && smoothed && <p className="rounded-2xl bg-amber-300/10 p-2.5 text-[12.5px] text-amber-100">{smoothed}</p>}
      {scan.kind === 'preview' && smoothingWarning(scan.capture.skinDetail) && <p className="rounded-2xl bg-amber-300/10 p-2.5 text-[12.5px] text-amber-100">{smoothingWarning(scan.capture.skinDetail)}</p>}
      {scan.kind === 'camera' && guide.status === 'ready' && guide.checks.length > 0 && (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
          {guide.checks.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5">
              {c.ok ? <Check className="h-3.5 w-3.5 text-mint-300" /> : <X className="h-3.5 w-3.5 text-rose-300" />}
              <span className={c.ok ? 'text-ink/80' : 'text-ink'}>{c.label}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-center gap-2">
        {scan.kind === 'camera' && !camError && (
          <button onClick={captureNow} className="inline-flex h-10 items-center gap-2 rounded-pill border border-white/18 bg-white/8 px-4 text-[13.5px] hover:bg-white/15" title="It also takes the photo by itself once every check is green">
            <Camera className="h-4 w-4" /> Take it now
          </button>
        )}
        {scan.kind === 'preview' && (
          <>
            <button onClick={onRetake} className="inline-flex h-10 items-center gap-2 rounded-pill border border-white/18 bg-white/8 px-4 text-[13.5px] hover:bg-white/15">
              <RefreshCcw className="h-4 w-4" /> Retake
            </button>
            <button onClick={onAnalyze} disabled={!configured} className="inline-flex h-10 items-center gap-2 rounded-pill bg-gradient-to-r from-[#9a74ff] to-[#c48fff] px-4 text-[13.5px] font-medium text-white disabled:opacity-40">
              <Sparkles className="h-4 w-4" /> {providers?.youcam.configured ? 'Analyze with YouCam' : 'Run mock analysis (dev)'}
            </button>
          </>
        )}
        {(camError || scan.kind === 'error') && (
          <button onClick={scan.kind === 'error' ? onRetake : onClose} className="inline-flex h-10 items-center gap-2 rounded-pill border border-white/18 bg-white/8 px-4 text-[13.5px] hover:bg-white/15">
            {scan.kind === 'error' ? <><RefreshCcw className="h-4 w-4" /> Try again</> : 'Close'}
          </button>
        )}
      </div>
      <p className="text-center text-[11.5px] text-ink/60">
        {scan.kind === 'preview' ? 'Each analysis uses one YouCam credit. ' : 'Face a window or soft light, glasses off. '}
        Your photo goes to YouCam only when you press Analyze, and is never saved.
      </p>
    </div>
  )
}

/** Details for a finished scan: scores, change since the last real scan, and where it shows up. */
export function SkinResultView({ analysis, masks, photo }: { analysis: SkinAnalysis; masks: AnalysisMask[]; photo: string }) {
  const db = useDb()
  const summary = scanSummary(analysis, db.analyses)
  const prev = analysis.isMock ? null : previousRealScan(db.analyses, analysis)
  const deltas = metricDeltas(analysis, prev)
  return (
    <div className="space-y-4" data-testid="skin-result">
      <div className="flex items-center gap-4">
        <ProgressRing value={summary.score} size={84} stroke={8} label={summary.score ?? '—'} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{analysis.isMock ? 'Mock scan — not a real result' : 'Your skin scan'}</p>
          <p className="text-[13px] text-ink/80">{summary.line}</p>
          <p className="mt-0.5 text-[11.5px] text-ink/55">{analysis.isMock ? 'Placeholder values' : 'YouCam’s 0–100 scores, higher looks healthier'} · {formatDate(analysis.createdAt, { dateStyle: 'medium', timeStyle: 'short' } as Intl.DateTimeFormatOptions)}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {analysis.metrics.map((m) => (
          <MetricTile key={m.key} m={m} />
        ))}
      </div>
      {masks.length > 0 && <Heatmap photo={photo} masks={masks} metrics={analysis.metrics} />}
      <section className="border-t border-white/10 pt-4">
        <h3 className="mb-2 flex items-center gap-2 text-[14px] font-semibold">
          <ScanFace className="h-4 w-4 text-lilac-200" /> Since last time
        </h3>
        {analysis.isMock ? (
          <p className="text-[13px] text-ink/75">Mock results aren’t compared with your real scans.</p>
        ) : !prev ? (
          <p className="text-[13px] text-ink/75">This is your first real scan — the next one will show what changed.</p>
        ) : (
          <>
            <p className="mb-2 text-[12.5px] text-ink/65">Compared with {formatDate(prev.createdAt)}. Light and camera move scores too, so look for steady trends.</p>
            <ul className="space-y-1.5">
              {deltas.map((d) => (
                <li key={d.key} className="flex items-center gap-2 text-[13.5px]">
                  {d.delta > 0 ? <ArrowUp className="h-4 w-4 text-mint-300" /> : d.delta < 0 ? <ArrowDown className="h-4 w-4 text-rose-300" /> : <Minus className="h-4 w-4 text-ink/50" />}
                  <span className="flex-1">{d.label}</span>
                  <span className="tabular-nums text-ink/70">
                    {d.before} → {d.after}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
