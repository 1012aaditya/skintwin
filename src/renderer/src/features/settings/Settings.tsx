import { Bot, Check, Copy, Download, Globe, Keyboard, KeyRound, Mic, RefreshCcw, ShieldCheck, Trash2, Volume2 } from 'lucide-react'
import { DEFAULT_SHORTCUTS } from '@shared/models'
import { acceleratorFromEvent, prettyAccelerator } from '@shared/shortcuts'
import { cn } from '@renderer/lib/cn'
import { useEffect, useState, type ReactNode } from 'react'
import { Badge, Button, Card, CardHeader, Select, Tabs, Toggle } from '@renderer/components/ui'
import { useRoute } from '@renderer/lib/router'
import { mutate, useDb, useProviders } from '@renderer/lib/store'
import { toast } from '@renderer/lib/toast'
import type { MediaStatus } from '../../../../preload/api'
import { requestMedia } from '../onboarding/Onboarding'

type Tab = 'voice' | 'privacy' | 'browser'

export function Settings() {
  const { query } = useRoute()
  const [tab, setTab] = useState<Tab>((query.get('tab') as Tab) ?? 'voice')
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-[34px] font-semibold">Settings</h1>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'voice', label: 'Voice & assistant', icon: <Mic /> }, { value: 'privacy', label: 'Privacy & permissions', icon: <ShieldCheck /> }, { value: 'browser', label: 'Browser extension', icon: <Globe /> }]} />
      {tab === 'voice' && <VoiceSettings />}
      {tab === 'privacy' && <PrivacySettings />}
      {tab === 'browser' && <BrowserSettings />}
    </div>
  )
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-2 text-[13px] text-ink-soft">
        {detail}
        <Badge tone={ok ? 'success' : 'warn'} size="sm">{ok ? 'Live' : 'Not configured'}</Badge>
      </span>
    </div>
  )
}

function VoiceSettings() {
  const db = useDb()
  const providers = useProviders()
  const v = db.settings.voice
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [mic, setMic] = useState<MediaStatus>('unknown')
  useEffect(() => {
    const load = () => setVoices(speechSynthesis.getVoices().filter((x) => x.lang.startsWith('en')))
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    void window.skintwin.media.status('microphone').then(setMic)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])
  const set = (patch: Partial<typeof v>) => mutate({ type: 'settings.update', patch: { voice: patch } })
  return (
    <div className="space-y-5">
      <Card className="p-6">
        <CardHeader icon={<Bot />} title="Providers" subtitle="Configured in your .env file. Keys never leave the app’s main process." />
        <div className="mt-3 divide-y divide-white/8">
          <StatusRow label="Assistant (language model)" ok={!!providers?.llm.configured} detail={providers?.llm.configured ? `Anthropic · ${providers.llm.model}` : 'Offline rule-based answers'} />
          <StatusRow label="Speech-to-text" ok={!!providers?.stt.configured} detail={providers?.stt.provider ?? 'Type instead of speaking'} />
          <StatusRow label="Text-to-speech" ok detail={providers?.tts.provider === 'elevenlabs' ? 'ElevenLabs' : 'macOS system voice (on-device)'} />
          <StatusRow label="Skin analysis (YouCam)" ok={!!providers?.youcam.configured} detail={providers?.youcam.mockAllowed ? 'Dev mock enabled' : ''} />
        </div>
      </Card>
      <CompanionSettings />
      <Card className="space-y-5 p-6">
        <CardHeader icon={<Volume2 />} title="Voice responses" />
        <Toggle checked={v.responseEnabled && !v.textOnly} disabled={v.textOnly} onChange={(x) => set({ responseEnabled: x })} label="Speak answers aloud" description="The companion reads answers using your selected voice." />
        <Toggle checked={v.textOnly} onChange={(x) => set({ textOnly: x })} label="Text-only mode" description="Never use the microphone or speaker; type questions and read answers." />
        {providers?.tts.provider !== 'elevenlabs' && (
          <div className="grid grid-cols-2 gap-4">
            <label className="text-sm">
              <span className="mb-1.5 block text-ink-soft">System voice</span>
              <Select value={v.voiceName ?? ''} onChange={(e) => set({ voiceName: e.target.value || null })}>
                <option value="">Default</option>
                {voices.map((x) => (
                  <option key={x.name} value={x.name}>
                    {x.name} ({x.lang})
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm">
              <span className="mb-1.5 block text-ink-soft">Speech rate: {v.rate.toFixed(1)}×</span>
              <input type="range" min={0.6} max={1.6} step={0.1} value={v.rate} onChange={(e) => set({ rate: Number(e.target.value) })} className="mt-3 w-full accent-[#a98bff]" />
            </label>
          </div>
        )}
        <Button
          size="sm"
          onClick={() => {
            const u = new SpeechSynthesisUtterance('Hi, I’m SkinTwin. Here when you need me.')
            u.rate = v.rate
            const voice = voices.find((x) => x.name === v.voiceName)
            if (voice) u.voice = voice
            speechSynthesis.cancel()
            speechSynthesis.speak(u)
          }}
        >
          <Volume2 className="h-4 w-4" /> Preview voice
        </Button>
      </Card>
      <Card className="space-y-5 p-6">
        <CardHeader icon={<Mic />} title="Microphone & activation" />
        <div className="flex items-center justify-between">
          <span className="text-sm">Microphone permission</span>
          <span className="flex items-center gap-2">
            <Badge tone={mic === 'granted' ? 'success' : mic === 'denied' || mic === 'restricted' ? 'danger' : 'neutral'} size="sm">{mic}</Badge>
            {mic !== 'granted' && (
              <Button size="sm" onClick={async () => {
                const s = await requestMedia('microphone')
                await mutate({ type: 'onboarding.update', patch: { permissions: { microphone: s } } })
                setMic(await window.skintwin.media.status('microphone'))
                if (s === 'denied') toast.error('Enable SkinTwin in System Settings › Privacy & Security › Microphone.')
              }}>Request access</Button>
            )}
          </span>
        </div>
        <label className="block text-sm">
          <span className="mb-1.5 block text-ink-soft">Activation mode</span>
          <Select value={v.activation} onChange={(e) => set({ activation: e.target.value as typeof v.activation })} className="max-w-xs">
            <option value="click_to_toggle">Click to start, click to send</option>
            <option value="push_to_talk">Hold to talk (release to send)</option>
          </Select>
        </label>
        <p className="text-xs text-ink-faint">SkinTwin only listens after you click the orb or press the talk shortcut — never in the background.</p>
      </Card>
    </div>
  )
}

function CompanionSettings() {
  const db = useDb()
  const c = db.settings.companion
  const [status, setStatus] = useState<{ toggle: boolean; voice: boolean } | null>(null)
  useEffect(() => void window.skintwin.shortcuts.status().then(setStatus), [c.shortcut, c.voiceShortcut])
  const set = (patch: Partial<typeof c>) => mutate({ type: 'settings.update', patch: { companion: patch } })
  return (
    <Card className="space-y-5 p-6">
      <CardHeader icon={<Keyboard />} title="Companion" subtitle="Shortcuts work from any app." />
      <ShortcutRow label="Show / hide companion" value={c.shortcut} ok={status?.toggle} other={c.voiceShortcut} onChange={(v) => set({ shortcut: v })} onReset={() => set({ shortcut: DEFAULT_SHORTCUTS.toggle })} />
      <ShortcutRow label="Talk (press again to send)" value={c.voiceShortcut} ok={status?.voice} other={c.shortcut} onChange={(v) => set({ voiceShortcut: v })} onReset={() => set({ voiceShortcut: DEFAULT_SHORTCUTS.voice })} />
      <div>
        <p className="mb-2 text-sm">Style</p>
        <div className="grid w-fit grid-cols-2 gap-2 rounded-2xl bg-white/6 p-2" role="radiogroup" aria-label="Companion style">
          {([['island', 'Top island', 'A pill around the notch at the top of your screen'], ['orb', 'Floating orb', 'A small orb in a corner you choose']] as const).map(([k, title, desc]) => (
            <button key={k} role="radio" aria-checked={c.style === k} onClick={() => set({ style: k })} className={cn('w-52 rounded-xl border p-3 text-left transition-colors', c.style === k ? 'border-lilac-200 bg-lilac-400/30' : 'border-white/12 bg-white/5 hover:bg-white/10')}>
              <span className="relative mb-2.5 block h-10 rounded-lg bg-white/8">
                {k === 'island' ? <span className="absolute top-0 left-1/2 h-3 w-14 -translate-x-1/2 rounded-b-lg bg-black" /> : <span className="absolute right-2 bottom-2 h-3.5 w-3.5 rounded-full bg-gradient-to-br from-white to-lilac-400 shadow-glow-soft" />}
              </span>
              <span className="block text-sm font-medium">{title}</span>
              <span className="mt-0.5 block text-xs text-ink-faint">{desc}</span>
            </button>
          ))}
        </div>
      </div>
      {c.style === 'orb' && (
        <div>
          <p className="mb-2 text-sm">Screen corner</p>
        <div className="grid w-fit grid-cols-2 gap-2 rounded-2xl bg-white/6 p-2" role="radiogroup" aria-label="Companion corner">
          {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((k) => (
            <button key={k} role="radio" aria-checked={c.corner === k} aria-label={k.replace('-', ' ')} onClick={() => set({ corner: k })} className={cn('relative h-14 w-24 rounded-xl border transition-colors', c.corner === k ? 'border-lilac-200 bg-lilac-400/30' : 'border-white/12 bg-white/5 hover:bg-white/10')}>
              <span className={cn('absolute h-3.5 w-3.5 rounded-full bg-gradient-to-br from-white to-lilac-400 shadow-glow-soft', k.startsWith('top') ? 'top-2' : 'bottom-2', k.endsWith('left') ? 'left-2' : 'right-2')} />
            </button>
          ))}
        </div>
          <p className="mt-2 text-xs text-ink-faint">You can also drag the orb — it snaps to the nearest corner.</p>
        </div>
      )}
      <Toggle
        checked={c.privacyMode}
        onChange={(x) => set({ privacyMode: x })}
        label="Privacy mode"
        description="The island shows only a dot — no verdicts, scores or skin details — and answers aren’t read aloud. Handy while presenting. Shortcut: ⌥⇧P."
      />
      <p className="-mt-2 text-xs text-ink-faint">SkinTwin also asks macOS to keep the companion out of screen sharing and recordings. Some apps’ newer capture methods may still show it, so use Privacy mode when it matters.</p>
      <Toggle checked={c.launchOnStartup} onChange={(x) => set({ launchOnStartup: x })} label="Show companion when SkinTwin starts" />
      {c.style === 'orb' && <Toggle checked={c.alwaysOnTop} onChange={(x) => window.skintwin.companion.setPinned(x)} label="Keep companion above other windows" />}
    </Card>
  )
}

function ShortcutRow({ label, value, ok, other, onChange, onReset }: { label: string; value: string; ok: boolean | undefined; other: string; onChange: (v: string) => void; onReset: () => void }) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!recording) return
    void window.skintwin.shortcuts.suspend(true) // so pressing the current combo doesn't trigger it
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      if (e.key === 'Escape') return setRecording(false)
      const acc = acceleratorFromEvent(e)
      if (!acc) return setError('Hold ⌘, ⌥ or ⌃ and press a key.')
      if (acc === other) return setError('That’s already used by the other shortcut.')
      setError(null)
      onChange(acc)
      setRecording(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      void window.skintwin.shortcuts.suspend(false)
    }
  }, [recording, other, onChange])
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{label}</p>
        {ok === false && !recording && <p className="mt-0.5 text-xs text-amber-200">Unavailable — another app is using it. Pick a different combination.</p>}
        {error && recording && <p className="mt-0.5 text-xs text-amber-200">{error}</p>}
      </div>
      <button onClick={() => (setError(null), setRecording((r) => !r))} className={cn('h-10 min-w-36 rounded-xl border px-4 font-mono text-[15px] transition-colors', recording ? 'border-lilac-200 bg-lilac-400/25 text-lilac-50' : 'border-white/15 bg-white/8 hover:bg-white/12')}>
        {recording ? 'Press keys…' : prettyAccelerator(value, window.skintwin.platform === 'darwin')}
      </button>
      <Button size="sm" variant="ghost" onClick={onReset}>
        Reset
      </Button>
    </div>
  )
}

function PrivacySettings() {
  const db = useDb()
  const p = db.settings.privacy
  const set = (patch: Partial<typeof p>) => mutate({ type: 'settings.update', patch: { privacy: patch } })
  const perms = db.onboarding.permissions
  return (
    <div className="space-y-5">
      <Card className="p-6">
        <CardHeader icon={<ShieldCheck />} title="Where your data goes" />
        <div className="mt-4 grid grid-cols-3 gap-3 text-[13px]">
          <div className="glass-inset rounded-2xl p-4">
            <p className="mb-2 font-semibold">Stored on this device</p>
            <p className="text-ink-soft">Profile, routines, inventory, saved products, analysis scores and conversation text — in one local file. Selfies and audio are never saved.</p>
          </div>
          <div className="glass-inset rounded-2xl p-4">
            <p className="mb-2 font-semibold">Sent only when you act</p>
            <p className="text-ink-soft">Selfie → YouCam (when you press Analyze). Voice recording → your speech provider (when you stop talking). Question + relevant profile/product context → Anthropic (when you ask).</p>
          </div>
          <div className="glass-inset rounded-2xl p-4">
            <p className="mb-2 font-semibold">Read from web pages</p>
            <p className="text-ink-soft">Only product name, brand, image, price, ingredients and URL — only after you click the extension on that page.</p>
          </div>
        </div>
      </Card>
      <Card className="space-y-5 p-6">
        <CardHeader title="Controls" />
        <Toggle checked={p.sendProfileToAssistant} onChange={(x) => set({ sendProfileToAssistant: x })} label="Share my skin profile with the assistant" description="Off: answers are less personal; your profile isn’t sent to the AI provider." />
        <Toggle checked={p.storeConversations} onChange={(x) => set({ storeConversations: x })} label="Keep conversation history" description="Turning this off deletes existing history." />
        <Toggle checked={p.storeAnalysisHistory} onChange={(x) => set({ storeAnalysisHistory: x })} label="Keep analysis history" description="Off: new analysis results are shown but not saved." />
        <div className="grid grid-cols-3 gap-3 text-[13px]">
          {(['microphone', 'camera', 'pageAccess'] as const).map((k) => (
            <div key={k} className="glass-inset rounded-2xl p-3">
              <p className="text-ink-soft">{k === 'pageAccess' ? 'Browser page access' : k[0]!.toUpperCase() + k.slice(1)}</p>
              <p className="mt-1 font-semibold capitalize">{perms[k]}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card className="flex flex-wrap items-center gap-3 p-6">
        <CardHeader title="Your data" className="mr-auto" />
        <Button onClick={async () => { const r = await window.skintwin.data.exportAll(); if (r.ok) toast.success(`Exported to ${r.data.path}`) }}>
          <Download className="h-4 w-4" /> Export all data
        </Button>
        <Button variant="danger" onClick={() => confirm('Delete all analysis history?') && mutate({ type: 'analysis.deleteAll' }, 'Analysis history deleted')}>Delete analyses</Button>
        <Button variant="danger" onClick={() => confirm('Delete all conversations?') && mutate({ type: 'conversations.deleteAll' }, 'Conversations deleted')}>Delete conversations</Button>
        <Button variant="danger" onClick={async () => { if (confirm('Delete ALL SkinTwin data on this device and start over? This cannot be undone.')) { await window.skintwin.data.deleteAll(); toast.success('All data deleted') } }}>
          <Trash2 className="h-4 w-4" /> Delete everything
        </Button>
      </Card>
    </div>
  )
}

function BrowserSettings() {
  const db = useDb()
  const allowed = db.onboarding.permissions.pageAccess === 'granted'
  const [info, setInfo] = useState<{ port: number; token: string; running: boolean; error: string | null } | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => void window.skintwin.bridge.info().then(setInfo), [])
  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-6">
        <CardHeader icon={<Globe />} title="Connect the browser extension" subtitle="Works in Chrome, Edge, Arc and Brave." />
        <ol className="list-decimal space-y-2 pl-5 text-[14px] text-ink-soft">
          <li>Open <code className="rounded bg-white/10 px-1.5">chrome://extensions</code>, turn on <b>Developer mode</b>.</li>
          <li>Click <b>Load unpacked</b> and choose the <code className="rounded bg-white/10 px-1.5">extension</code> folder inside the SkinTwin project.</li>
          <li>Click the SkinTwin icon in your browser toolbar and paste the pairing code below.</li>
          <li>On any product page, click the icon → <b>Check this product</b>.</li>
        </ol>
      </Card>
      <Card className="p-6">
        <Toggle
          checked={allowed}
          onChange={(x) => mutate({ type: 'onboarding.update', patch: { permissions: { pageAccess: x ? 'granted' : 'skipped' } } })}
          label="Let the extension send product pages to SkinTwin"
          description={allowed ? 'The extension reads a page only when you click it there.' : 'Off: the extension won’t read pages, and SkinTwin refuses anything it sends.'}
        />
      </Card>
      <Card className="space-y-4 p-6">
        <CardHeader icon={<KeyRound />} title="Pairing code" subtitle="Keeps other apps and web pages from talking to SkinTwin." />
        {info?.error && <p className="text-sm text-rose-200">{info.error}</p>}
        <div className="flex items-center gap-2">
          <code className="glass-inset flex-1 truncate rounded-2xl px-4 py-3 font-mono text-[15px] select-all">{info?.token ?? '…'}</code>
          <Button onClick={async () => { await navigator.clipboard.writeText(info!.token); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="ghost" onClick={async () => { if (!confirm('Generate a new code? The extension will need the new code.')) return; await window.skintwin.bridge.regenerate(); setInfo(await window.skintwin.bridge.info()) }}>
            <RefreshCcw className="h-4 w-4" /> New code
          </Button>
        </div>
        <p className="text-xs text-ink-faint">Bridge: {info?.running ? `listening on 127.0.0.1:${info.port} (this computer only)` : 'not running'}</p>
      </Card>
    </div>
  )
}
