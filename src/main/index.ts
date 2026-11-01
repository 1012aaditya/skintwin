import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, session, shell, systemPreferences, Tray } from 'electron'
import { randomBytes, randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Server } from 'node:http'
import type { AskRequest, AskResponse, ProviderStatus, Result } from '@shared/assistant'
import type { SkinAnalysis } from '@shared/models'
import { CORNERS, type Corner } from '@shared/models'
import { MutationError, MutationSchema } from '@shared/mutations'
import type { BridgeMessage } from '@shared/protocol'
import { loadConfig } from './config'
import { createEmptyDatabase, Store } from './db'
import { startBridge } from './services/bridge'
import { productFromExtraction } from './services/ingest'
import { AnthropicAssistant, AssistantError, buildContext, RuleBasedAssistant, type AssistantProvider } from './services/llm'
import { ElevenLabsSpeaker, ElevenLabsTranscriber, LocalWhisperTranscriber, OpenAITranscriber, type SpeechToText, type TextToSpeech } from './services/speech'
import { MockSkinAnalysis, YouCamError, YouCamProvider, type SkinAnalysisProvider } from './services/youcam'

const here = dirname(fileURLToPath(import.meta.url))
// Lets automated tests run against a throwaway data folder instead of the real one.
if (process.env['SKINTWIN_USER_DATA']) app.setPath('userData', process.env['SKINTWIN_USER_DATA'])
const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']
const config = loadConfig([process.cwd(), app.getPath('userData')], isDev)
const store = new Store(join(app.getPath('userData'), 'skintwin-db.json'), { demoCatalog: config.demoCatalog })

const assistant: AssistantProvider = config.anthropicKey ? new AnthropicAssistant(config.anthropicKey, config.llmModel) : new RuleBasedAssistant()
const localStt = config.sttProvider === 'local' ? new LocalWhisperTranscriber(join(app.getPath('userData'), 'models'), config.sttLocalModel) : null
const stt: SpeechToText | null =
  config.sttProvider === 'openai' ? new OpenAITranscriber(config.openaiKey!)
  : config.sttProvider === 'elevenlabs' ? new ElevenLabsTranscriber(config.elevenLabsKey!)
  : localStt
const tts: TextToSpeech | null = config.ttsProvider === 'elevenlabs' ? new ElevenLabsSpeaker(config.elevenLabsKey!, config.elevenLabsVoiceId!) : null
const analysisProvider: SkinAnalysisProvider | null = config.youcamKey
  ? new YouCamProvider(config.youcamKey, config.youcamBase)
  : config.enableMocks ? new MockSkinAnalysis() : null

let mainWindow: BrowserWindow | null = null
let companionWindow: BrowserWindow | null = null
let tray: Tray | null = null
let bridgeServer: Server | null = null
let bridgeError: string | null = null
let quitting = false
const inflight = new Map<string, AbortController>()

// orb = idle orb only; compact = orb + listening/thinking; expanded = full panel
const COMPANION_SIZES = { orb: { width: 160, height: 160 }, compact: { width: 340, height: 480 }, expanded: { width: 440, height: 760 } } as const
type CompanionMode = keyof typeof COMPANION_SIZES
const EDGE_MARGIN = 16
let companionMode: CompanionMode = 'orb'
let placingUntil = 0 // ignore 'moved' events caused by our own setBounds
let shortcutStatus: { toggle: boolean; voice: boolean } = { toggle: false, voice: false }

// ---------- Windows ----------

function rendererUrl(page: 'index' | 'companion', hash = '') {
  if (isDev) return `${process.env['ELECTRON_RENDERER_URL']}/${page}.html${hash ? `#${hash}` : ''}`
  return null
}

function loadPage(win: BrowserWindow, page: 'index' | 'companion', hash = '') {
  const url = rendererUrl(page, hash)
  if (url) void win.loadURL(url)
  else void win.loadFile(join(here, `../renderer/${page}.html`), { hash })
}

function hardenWindow(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = isDev ? url.startsWith(process.env['ELECTRON_RENDERER_URL']!) : url.startsWith('file://')
    if (!allowed) e.preventDefault()
  })
}

const webPreferences = () => ({
  preload: join(here, '../preload/index.cjs'),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  spellcheck: false
})

function createMainWindow(route?: string) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (route) mainWindow.webContents.send('app:navigate', route)
    mainWindow.show()
    mainWindow.focus()
    return mainWindow
  }
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1040,
    minHeight: 700,
    title: 'SkinTwin',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#2b1f5e',
    show: false,
    webPreferences: webPreferences()
  })
  hardenWindow(mainWindow)
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => (mainWindow = null))
  loadPage(mainWindow, 'index', route ?? '')
  return mainWindow
}

/** Bounds for the companion pinned to a screen corner. Every mode shares the corner, so the orb never jumps. */
function cornerBounds(mode: CompanionMode, corner: Corner, display = screen.getPrimaryDisplay()) {
  const { workArea: wa } = display
  const size = COMPANION_SIZES[mode]
  const height = Math.min(size.height, wa.height - EDGE_MARGIN * 2)
  return {
    x: corner.endsWith('right') ? wa.x + wa.width - size.width - EDGE_MARGIN : wa.x + EDGE_MARGIN,
    y: corner.startsWith('bottom') ? wa.y + wa.height - height - EDGE_MARGIN : wa.y + EDGE_MARGIN,
    width: size.width,
    height
  }
}

function placeCompanion(animate = true) {
  const win = companionWindow
  if (!win || win.isDestroyed()) return
  placingUntil = Date.now() + 600
  win.setBounds(cornerBounds(companionMode, store.get().settings.companion.corner, screen.getDisplayMatching(win.getBounds())), animate)
}

/** After a drag, snap to whichever corner of that display is closest. */
function snapToNearestCorner() {
  const win = companionWindow
  if (!win) return
  const b = win.getBounds()
  const display = screen.getDisplayMatching(b)
  const { workArea: wa } = display
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  const corner: Corner = `${cy > wa.y + wa.height / 2 ? 'bottom' : 'top'}-${cx > wa.x + wa.width / 2 ? 'right' : 'left'}`
  if (corner !== store.get().settings.companion.corner) store.mutate({ type: 'settings.update', patch: { companion: { corner } } })
  placingUntil = Date.now() + 600
  win.setBounds(cornerBounds(companionMode, corner, display), true)
}

function createCompanionWindow(): BrowserWindow {
  if (companionWindow && !companionWindow.isDestroyed()) return companionWindow
  companionMode = 'orb'
  companionWindow = new BrowserWindow({
    ...cornerBounds('orb', store.get().settings.companion.corner),
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    fullscreenable: false,
    maximizable: false,
    alwaysOnTop: store.get().settings.companion.alwaysOnTop,
    show: false,
    title: 'SkinTwin Companion',
    backgroundColor: '#00000000',
    webPreferences: webPreferences()
  })
  if (process.platform === 'darwin') companionWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  companionWindow.setAlwaysOnTop(store.get().settings.companion.alwaysOnTop, 'floating')
  hardenWindow(companionWindow)
  companionWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      companionWindow?.hide()
    }
  })
  companionWindow.on('closed', () => (companionWindow = null))
  // Native drags (panel header) end with 'moved' on macOS: snap to a corner.
  companionWindow.on('moved', () => Date.now() > placingUntil && snapToNearestCorner())
  companionWindow.once('ready-to-show', () => companionWindow?.showInactive())
  loadPage(companionWindow, 'companion')
  return companionWindow
}

function showCompanion(command?: CompanionCommand, focus = false) {
  const win = createCompanionWindow()
  const send = () => {
    if (focus) win.show()
    else win.showInactive()
    if (command) win.webContents.send('companion:command', command)
  }
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
  else send()
}

type CompanionCommand =
  | { type: 'listen' }
  | { type: 'menu'; action: 'type' | 'panel' | 'quick-actions' | 'profile' }
  | { type: 'product-detected'; productId: string }
  | { type: 'analyze-product'; productId: string }
  | { type: 'compare-product'; productId: string }
  | { type: 'detection-failed'; reason: string }

function broadcast(channel: string, payload: unknown) {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload)
}

store.subscribe((snap) => broadcast('db:changed', snap))

// ---------- Bridge (browser extension) ----------

async function handleBridgeMessage(msg: BridgeMessage): Promise<{ productId?: string }> {
  const now = new Date().toISOString()
  if (msg.type === 'product_detection_failed') {
    store.update((db) => (db.lastDetectionFailure = { tabUrl: msg.url, reason: msg.reason.slice(0, 300), at: now }))
    showCompanion({ type: 'detection-failed', reason: msg.reason })
    return {}
  }
  const product = productFromExtraction(msg.product, now)
  store.update((db) => {
    const idx = db.products.findIndex((p) => p.id === product.id)
    if (idx >= 0) db.products[idx] = { ...product, createdAt: db.products[idx]!.createdAt }
    else db.products.push(product)
    db.detected = { productId: product.id, tabUrl: product.url!, retailer: product.retailer, detectedAt: now, method: msg.product.method }
    db.lastDetectionFailure = null
  })
  if (msg.type === 'analysis_requested') showCompanion({ type: 'analyze-product', productId: product.id })
  else if (msg.type === 'comparison_requested') showCompanion({ type: 'compare-product', productId: product.id })
  else showCompanion({ type: 'product-detected', productId: product.id })
  return { productId: product.id }
}

// ---------- IPC ----------

const ok = <T>(data: T): Result<T> => ({ ok: true, data })
const fail = (error: string, code?: string): Result<never> => ({ ok: false, error, code })

function registerIpc() {
  ipcMain.handle('db:get', () => store.snapshot())

  ipcMain.handle('db:mutate', (_e, raw: unknown) => {
    const parsed = MutationSchema.safeParse(raw)
    if (!parsed.success) return fail('Invalid request: ' + parsed.error.issues[0]?.message, 'validation')
    try {
      return ok(store.mutate(parsed.data))
    } catch (err) {
      return fail(err instanceof MutationError ? err.message : 'Could not save changes.', 'mutation')
    }
  })

  ipcMain.handle('providers:status', (): ProviderStatus => ({
    llm: { configured: !!config.anthropicKey, provider: assistant.name, model: config.anthropicKey ? config.llmModel : null },
    stt: { configured: !!stt, provider: stt?.name ?? null },
    tts: { configured: true, provider: tts?.name ?? 'system' },
    youcam: { configured: !!config.youcamKey, mockAllowed: !config.youcamKey && config.enableMocks },
    bridge: { running: !!bridgeServer, port: config.bridgePort, error: bridgeError },
    demoCatalog: config.demoCatalog
  }))

  ipcMain.handle('analysis:run', async (e, req: { requestId: string; imageBase64: string; mimeType: string }): Promise<Result<SkinAnalysis>> => {
    if (!analysisProvider) return fail('Skin analysis isn’t configured. Add YOUCAM_API_KEY to your .env file.', 'not_configured')
    if (typeof req?.imageBase64 !== 'string' || !/^image\/(jpeg|png)$/.test(req.mimeType)) return fail('Use a JPG or PNG image.', 'invalid_type')
    if (inflight.has(req.requestId)) return fail('Analysis already running.', 'duplicate')
    const ctrl = new AbortController()
    inflight.set(req.requestId, ctrl)
    try {
      const image = Buffer.from(req.imageBase64, 'base64')
      const result = await analysisProvider.analyze(image, req.mimeType, ctrl.signal, (stage) =>
        e.sender.send('analysis:progress', { requestId: req.requestId, stage })
      )
      if (store.get().settings.privacy.storeAnalysisHistory) store.update((db) => db.analyses.unshift(result))
      console.info(`[analysis] ${analysisProvider.name} ok: ${result.metrics.length} metrics`)
      return ok(result)
    } catch (err) {
      // Codes and messages only — never the image.
      console.warn(`[analysis] failed: ${err instanceof YouCamError ? err.code : (err as Error).name} — ${(err as Error).message}`)
      if (err instanceof YouCamError) return fail(err.message, err.code)
      if ((err as Error).name === 'AbortError') return fail('Analysis cancelled.', 'cancelled')
      return fail('Couldn’t reach the analysis service. Check your connection and try again.', 'network')
    } finally {
      inflight.delete(req.requestId)
    }
  })

  ipcMain.handle('request:cancel', (_e, requestId: string) => {
    inflight.get(requestId)?.abort()
    inflight.delete(requestId)
  })

  ipcMain.handle('assistant:ask', async (_e, req: AskRequest): Promise<Result<AskResponse>> => {
    const text = typeof req?.text === 'string' ? req.text.trim().slice(0, 1000) : ''
    if (!text) return fail('Please ask a question.', 'empty')
    if (inflight.has(req.requestId)) return fail('Already answering.', 'duplicate')
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 60_000)
    inflight.set(req.requestId, ctrl)
    try {
      const db = store.get()
      const ctx = buildContext(db, text, req.productId, req.conversationId)
      const reply = await assistant.ask(ctx, ctrl.signal)
      let conversationId = req.conversationId
      if (db.settings.privacy.storeConversations) {
        const now = new Date().toISOString()
        store.update((d) => {
          let conv = conversationId ? d.conversations.find((c) => c.id === conversationId) : undefined
          if (!conv) {
            conv = { id: `conv:${randomUUID()}`, createdAt: now, updatedAt: now, messages: [] }
            d.conversations.unshift(conv)
            d.conversations = d.conversations.slice(0, 100)
          }
          conversationId = conv.id
          conv.updatedAt = now
          conv.messages.push(
            { id: randomUUID(), role: 'user', text, createdAt: now, productId: req.productId, provider: null, suggestedActions: [] },
            { id: randomUUID(), role: 'assistant', text: reply.answer, createdAt: now, productId: req.productId, provider: assistant.name, suggestedActions: reply.suggestedActions }
          )
        })
      }
      return ok({
        requestId: req.requestId,
        conversationId,
        reply,
        provider: assistant.name,
        providerNote: assistant.name === 'rules' ? 'Offline rule-based answer — no AI provider configured.' : null
      })
    } catch (err) {
      if (ctrl.signal.aborted) return fail('The request was cancelled or timed out.', 'cancelled')
      if (err instanceof AssistantError) return fail(err.message, err.code)
      const status = (err as { status?: number }).status
      if (status === 401) return fail('The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.', 'auth')
      if (status === 429) return fail('The assistant is busy right now. Try again in a moment.', 'rate_limited')
      return fail('Couldn’t reach the assistant. Check your connection and try again.', 'network')
    } finally {
      clearTimeout(timer)
      inflight.delete(req.requestId)
    }
  })

  ipcMain.handle('stt:transcribe', async (_e, req: { requestId: string; audioBase64: string; mimeType: string }): Promise<Result<{ text: string }>> => {
    if (!stt) return fail('Voice input is turned off (STT_PROVIDER=off in .env). Type your question instead.', 'not_configured')
    const ctrl = new AbortController()
    // The first on-device request may include the one-time model download.
    const timer = setTimeout(() => ctrl.abort(), stt === localStt ? 300_000 : 30_000)
    inflight.set(req.requestId, ctrl)
    try {
      const audio = Buffer.from(req.audioBase64, 'base64')
      if (audio.length < 2000) return fail('I didn’t catch that — the recording was too short.', 'too_short')
      if (audio.length > 20 * 1024 * 1024) return fail('Recording is too long.', 'too_long')
      const text = await stt.transcribe(audio, req.mimeType, ctrl.signal)
      if (!text) return fail('I didn’t catch any words. Try again a little closer to the mic.', 'empty')
      return ok({ text })
    } catch (err) {
      if (ctrl.signal.aborted) return fail('Transcription cancelled.', 'cancelled')
      return fail(`Transcription failed: ${(err as Error).message}`, 'provider')
    } finally {
      clearTimeout(timer)
      inflight.delete(req.requestId)
    }
  })

  ipcMain.handle('tts:synthesize', async (_e, text: string): Promise<Result<{ audioBase64: string; mimeType: string }>> => {
    if (!tts) return fail('Using system voice.', 'system')
    try {
      const out = await tts.synthesize(String(text), AbortSignal.timeout(20_000))
      return ok({ audioBase64: out.audio.toString('base64'), mimeType: out.mimeType })
    } catch (err) {
      return fail((err as Error).message, 'provider')
    }
  })

  ipcMain.handle('companion:show', (_e, command?: CompanionCommand) => showCompanion(command))
  ipcMain.handle('companion:hide', () => companionWindow?.hide())
  // The window is transparent, so resizing it instantly is invisible; the renderer animates the content.
  ipcMain.handle('companion:setMode', (_e, mode: CompanionMode) => {
    if (!(mode in COMPANION_SIZES) || mode === companionMode) return
    companionMode = mode
    placeCompanion(false)
  })
  // Manual drag for the orb: a click must still register as a click, so it can't be a native drag region.
  let dragStart: { x: number; y: number } | null = null
  ipcMain.handle('companion:dragStart', () => {
    const b = companionWindow?.getBounds()
    dragStart = b ? { x: b.x, y: b.y } : null
  })
  ipcMain.handle('companion:dragMove', (_e, dx: number, dy: number) => {
    if (!dragStart || !companionWindow || !Number.isFinite(dx) || !Number.isFinite(dy)) return
    placingUntil = Date.now() + 600
    companionWindow.setPosition(Math.round(dragStart.x + dx), Math.round(dragStart.y + dy))
  })
  ipcMain.handle('companion:dragEnd', () => {
    if (dragStart) snapToNearestCorner()
    dragStart = null
  })
  ipcMain.handle('companion:menu', (e, opts: { hasProduct: boolean }) => {
    const c = store.get().settings.companion
    const cmd = (command: CompanionCommand) => () => companionWindow?.webContents.send('companion:command', command)
    const moveTo = (corner: Corner) => () => {
      store.mutate({ type: 'settings.update', patch: { companion: { corner } } })
      placeCompanion()
    }
    Menu.buildFromTemplate([
      { label: 'Talk to SkinTwin', accelerator: c.voiceShortcut || undefined, registerAccelerator: false, click: cmd({ type: 'listen' }) },
      { label: 'Type a question', click: cmd({ type: 'menu', action: 'type' }) },
      ...(opts?.hasProduct ? [{ label: 'Quick actions for this product', click: cmd({ type: 'menu', action: 'quick-actions' }) }] : []),
      { label: 'My skin profile', click: cmd({ type: 'menu', action: 'profile' }) },
      { type: 'separator' },
      { label: 'Keep on top', type: 'checkbox', checked: c.alwaysOnTop, click: (item) => {
        companionWindow?.setAlwaysOnTop(item.checked, 'floating')
        store.mutate({ type: 'settings.update', patch: { companion: { alwaysOnTop: item.checked } } })
      } },
      { label: 'Move to', submenu: CORNERS.map((corner) => ({ label: corner.replace('-', ' ').replace(/\b\w/g, (m) => m.toUpperCase()), type: 'radio' as const, checked: c.corner === corner, click: moveTo(corner) })) },
      { type: 'separator' },
      { label: 'Open SkinTwin', click: () => createMainWindow() },
      { label: 'Shortcut settings…', click: () => createMainWindow('/settings') },
      { label: 'Hide', accelerator: c.shortcut || undefined, registerAccelerator: false, click: () => companionWindow?.hide() }
    ]).popup({ window: BrowserWindow.fromWebContents(e.sender) ?? undefined })
  })
  ipcMain.handle('shortcuts:status', () => shortcutStatus)
  // Paused while the user records a new shortcut, so pressing the old one doesn't fire.
  ipcMain.handle('shortcuts:suspend', (_e, suspended: boolean) => {
    if (suspended) globalShortcut.unregisterAll()
    else registerShortcuts()
    return shortcutStatus
  })
  // Transparent parts of the compact companion let clicks fall through to the windows behind it.
  ipcMain.handle('companion:setClickThrough', (_e, through: boolean) => {
    companionWindow?.setIgnoreMouseEvents(!!through, { forward: true })
  })
  ipcMain.handle('companion:setPinned', (_e, pinned: boolean) => {
    companionWindow?.setAlwaysOnTop(!!pinned, 'floating')
    store.mutate({ type: 'settings.update', patch: { companion: { alwaysOnTop: !!pinned } } })
  })
  ipcMain.handle('app:open', (_e, route: string) => {
    createMainWindow(typeof route === 'string' && route.startsWith('/') ? route : '/discover')
  })
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    try {
      const u = new URL(url)
      if (u.protocol === 'https:' || u.protocol === 'http:') void shell.openExternal(u.toString())
    } catch {
      /* ignore invalid */
    }
  })

  ipcMain.handle('bridge:info', () => ({ port: config.bridgePort, token: store.get().bridge.pairingToken, running: !!bridgeServer, error: bridgeError }))
  ipcMain.handle('bridge:regenerate', () => {
    store.update((db) => (db.bridge.pairingToken = randomBytes(18).toString('base64url')))
    return store.get().bridge.pairingToken
  })

  ipcMain.handle('media:status', async (_e, kind: 'microphone' | 'camera') => {
    if (process.platform !== 'darwin' && process.platform !== 'win32') return 'granted'
    return systemPreferences.getMediaAccessStatus(kind)
  })
  ipcMain.handle('media:request', async (_e, kind: 'microphone' | 'camera') => {
    if (process.platform === 'darwin') return (await systemPreferences.askForMediaAccess(kind)) ? 'granted' : 'denied'
    return 'granted'
  })

  ipcMain.handle('data:export', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: `skintwin-export-${new Date().toISOString().slice(0, 10)}.json` })
    if (canceled || !filePath) return fail('Export cancelled.', 'cancelled')
    writeFileSync(filePath, JSON.stringify(store.snapshot(), null, 2))
    return ok({ path: filePath })
  })
  ipcMain.handle('data:deleteAll', () => {
    store.replaceAll(createEmptyDatabase({ demoCatalog: config.demoCatalog }))
    return ok(store.snapshot())
  })
}

// ---------- Shortcuts & menus ----------

const shortcutKeys = () => `${store.get().settings.companion.shortcut}|${store.get().settings.companion.voiceShortcut}`

function tryRegister(acc: string, fn: () => void): boolean {
  if (!acc) return false
  try {
    return globalShortcut.register(acc, fn)
  } catch {
    return false // invalid accelerator string
  }
}

/** Global shortcuts: one shows/hides the companion, the other starts talking (press again to send). */
function registerShortcuts() {
  globalShortcut.unregisterAll()
  const { shortcut, voiceShortcut } = store.get().settings.companion
  shortcutStatus = {
    toggle: tryRegister(shortcut, () => {
      if (companionWindow?.isVisible()) companionWindow.hide()
      else showCompanion(undefined, true)
    }),
    voice: tryRegister(voiceShortcut, () => showCompanion({ type: 'listen' }, true))
  }
  if (!shortcutStatus.toggle) console.warn(`[shortcut] ${shortcut} is unavailable (taken by another app or invalid)`)
  if (!shortcutStatus.voice) console.warn(`[shortcut] ${voiceShortcut} is unavailable (taken by another app or invalid)`)
}

/** Standard menus plus a Companion menu, so the shortcuts are discoverable. */
function setAppMenu() {
  const { shortcut, voiceShortcut } = store.get().settings.companion
  const isMac = process.platform === 'darwin'
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' as const }] : []),
      { role: 'fileMenu' },
      { role: 'editMenu' },
      {
        label: 'Companion',
        submenu: [
          { label: 'Show / hide companion', accelerator: shortcut || undefined, registerAccelerator: false, click: () => (companionWindow?.isVisible() ? companionWindow.hide() : showCompanion(undefined, true)) },
          { label: 'Talk to SkinTwin', accelerator: voiceShortcut || undefined, registerAccelerator: false, click: () => showCompanion({ type: 'listen' }, true) },
          { type: 'separator' },
          { label: 'Change shortcuts…', click: () => createMainWindow('/settings') }
        ]
      },
      { role: 'viewMenu' },
      { role: 'windowMenu' }
    ])
  )
}

// ---------- App lifecycle ----------

function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAQUlEQVR4AWMYBaNgFAx/8P//f4b/DAwM/xn+M/xnYPjPwMDA8J8BCFgYGBj+M/xnYPjPwMDwn4GBgeE/AwMDAwBkmQ8Rj7vBKQAAAABJRU5ErkJggg=='
  )
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('SkinTwin')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show companion', click: () => showCompanion() },
      { label: 'Talk to SkinTwin', click: () => showCompanion({ type: 'listen' }, true) },
      { label: 'Open SkinTwin', click: () => createMainWindow() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => createMainWindow())
  app.setName('SkinTwin')

  app.whenReady().then(async () => {
    // Only our own windows may use the camera/microphone, and only when the user starts it.
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
      const own = BrowserWindow.fromWebContents(wc) !== null
      cb(own && (permission === 'media' || permission === 'clipboard-sanitized-write'))
    })
    session.defaultSession.setPermissionCheckHandler((wc, permission) => !!wc && permission === 'media')

    registerIpc()
    createMainWindow()
    if (store.get().settings.companion.launchOnStartup && store.get().onboarding.completed) createCompanionWindow()
    try {
      createTray()
    } catch (err) {
      console.warn('[tray] unavailable:', (err as Error).message)
    }

    registerShortcuts()
    setAppMenu()
    // Load (and on first run download) the speech model in the background, so the
    // first spoken question doesn't wait for it.
    setTimeout(() => void localStt?.warmUp().catch((err) => console.warn('[stt] on-device model unavailable:', (err as Error).message)), 2000)
    let lastKeys = shortcutKeys()
    store.subscribe(() => {
      const keys = shortcutKeys()
      if (keys !== lastKeys) {
        lastKeys = keys
        registerShortcuts()
        setAppMenu()
      }
    })

    try {
      bridgeServer = await startBridge(config.bridgePort, { token: () => store.get().bridge.pairingToken, onMessage: handleBridgeMessage })
    } catch (err) {
      bridgeError = `Browser bridge couldn’t start on port ${config.bridgePort}: ${(err as Error).message}`
      console.warn('[bridge]', bridgeError)
    }

    app.on('activate', () => createMainWindow())
  })

  app.on('before-quit', () => {
    quitting = true
    store.flush()
  })
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    bridgeServer?.close()
    for (const c of inflight.values()) c.abort()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
