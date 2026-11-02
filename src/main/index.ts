import { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, session, shell, systemPreferences, Tray, type NativeImage } from 'electron'
import { randomBytes, randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Server } from 'node:http'
import type { AskRequest, AskResponse, ProviderStatus, Result } from '@shared/assistant'
import { lassoBounds, type Point } from '@shared/circle'
import type { AnalysisMask, AnalysisRun } from '@shared/models'
import { splitIngredientText } from '@shared/ingredients'
import { CaptureConditionsSchema, CORNERS, type Corner } from '@shared/models'
import { MutationError, MutationSchema } from '@shared/mutations'
import type { BridgeMessage } from '@shared/protocol'
import { loadConfig } from './config'
import { createEmptyDatabase, Store } from './db'
import { startBridge } from './services/bridge'
import { productFromExtraction, productFromPageRead, productFromScreenRead } from './services/ingest'
import { AnthropicAssistant, AssistantError, buildContext, RuleBasedAssistant, type AssistantProvider } from './services/llm'
import { ElevenLabsSpeaker, ElevenLabsTranscriber, LocalWhisperTranscriber, OpenAITranscriber, type SpeechToText, type TextToSpeech } from './services/speech'
import { PageUnreadableError, ProductResearcher } from './services/research'
import { fetchUv, searchPlaces } from './services/uv'
import type { UvForecast } from '@shared/sun'
import { dropUrl, MAX_DROP_BYTES } from '@shared/drop'
import { ScreenReader } from './services/vision'
import { MockSkinAnalysis, YouCamError, YouCamProvider, type MaskLink, type SkinAnalysisProvider } from './services/youcam'

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
const screenReader = config.anthropicKey ? new ScreenReader(config.anthropicKey, config.llmModel) : null
const researcher = config.anthropicKey ? new ProductResearcher(config.anthropicKey, config.llmModel) : null
const analysisProvider: SkinAnalysisProvider | null = config.youcamKey
  ? new YouCamProvider(config.youcamKey, config.youcamBase)
  : config.enableMocks ? new MockSkinAnalysis() : null

let mainWindow: BrowserWindow | null = null
let companionWindow: BrowserWindow | null = null
let circleWindow: BrowserWindow | null = null
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
// Click-through state of the companion window, and where its solid pill is (window coordinates).
let clickThrough = false
let pillRect: { x: number; y: number; w: number; h: number } | null = null
let pillForced = false
let uvCache: { key: string; at: number; forecast: UvForecast } | null = null

/**
 * The island window lets clicks through its transparent parts, and the renderer switches that
 * off when the mouse is over the pill. During a drag macOS sends no mouse moves, so a drop
 * would fall through to the app behind; this poll makes the pill solid under the cursor instead.
 */
function pollPill() {
  const w = companionWindow
  if (!w || w.isDestroyed()) return
  if (!w.isVisible() || !clickThrough || !pillRect || !isIsland()) {
    if (pillForced) w.setIgnoreMouseEvents(clickThrough, { forward: true })
    pillForced = false
    return
  }
  const b = w.getBounds()
  const c = screen.getCursorScreenPoint()
  const r = pillRect
  const inside = c.x >= b.x + r.x && c.x <= b.x + r.x + r.w && c.y >= b.y + r.y && c.y <= b.y + r.y + r.h
  if (inside === pillForced) return
  pillForced = inside
  w.setIgnoreMouseEvents(!inside, { forward: true })
}

// ---------- Windows ----------

type Page = 'index' | 'companion' | 'circle'

function rendererUrl(page: Page, hash = '') {
  if (isDev) return `${process.env['ELECTRON_RENDERER_URL']}/${page}.html${hash ? `#${hash}` : ''}`
  return null
}

function loadPage(win: BrowserWindow, page: Page, hash = '') {
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

// ---------- Island ----------
// The island hangs from the top centre of the screen, around the camera notch like the
// iPhone's Dynamic Island. Its window is a fixed width; the renderer draws the pill inside
// it and the transparent rest lets clicks through.

const ISLAND_WIDTH = 480
const ISLAND_BAR_HEIGHT = 340 // pill plus room to grow (listening, progress, hover actions, an open routine)
const ISLAND_PANEL_HEIGHT = 760
// macOS doesn't report the notch's size; every notched MacBook's is a little under this.
const NOTCH_WIDTH = 200

const isIsland = () => store.get().settings.companion.style === 'island'
const menuBarHeight = (d: Electron.Display) => d.workArea.y - d.bounds.y
// Notched MacBooks have a taller menu bar (≈37pt) than other Macs (≈24pt).
const hasNotch = (d: Electron.Display) => process.platform === 'darwin' && d.internal && menuBarHeight(d) >= 32
const islandDisplay = () => screen.getAllDisplays().find(hasNotch) ?? screen.getPrimaryDisplay()

function islandInfo() {
  const d = islandDisplay()
  const notch = hasNotch(d)
  return { notch, barHeight: notch ? menuBarHeight(d) : 0, notchWidth: notch ? NOTCH_WIDTH : 0 }
}

function islandBounds(mode: CompanionMode, display = islandDisplay()) {
  const height = mode === 'expanded' ? Math.min(ISLAND_PANEL_HEIGHT, display.workArea.height) : ISLAND_BAR_HEIGHT
  return { x: Math.round(display.bounds.x + (display.bounds.width - ISLAND_WIDTH) / 2), y: display.bounds.y, width: ISLAND_WIDTH, height }
}

const companionBounds = (mode: CompanionMode) =>
  isIsland() ? islandBounds(mode) : cornerBounds(mode, store.get().settings.companion.corner, companionWindow ? screen.getDisplayMatching(companionWindow.getBounds()) : undefined)

/** The island sits above the menu bar, so it needs a higher window level than the floating orb. */
function applyCompanionLevel() {
  const win = companionWindow
  if (!win || win.isDestroyed()) return
  if (isIsland()) win.setAlwaysOnTop(true, 'status')
  else win.setAlwaysOnTop(store.get().settings.companion.alwaysOnTop, 'floating')
}

function placeCompanion(animate = true) {
  const win = companionWindow
  if (!win || win.isDestroyed()) return
  placingUntil = Date.now() + 600
  win.setBounds(companionBounds(companionMode), animate && !isIsland())
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
    ...companionBounds('orb'),
    frame: false,
    enableLargerThanScreen: true, // lets the island sit over the menu bar
    transparent: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    fullscreenable: false,
    maximizable: false,
    alwaysOnTop: store.get().settings.companion.alwaysOnTop,
    show: false,
    title: 'SkinTwin Companion',
    // A macOS panel (like Spotlight) can float over other apps' full-screen spaces; a normal window can't.
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    backgroundColor: '#00000000',
    webPreferences: webPreferences()
  })
  if (process.platform === 'darwin') companionWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  const pillTimer = setInterval(pollPill, 120)
  companionWindow.on('closed', () => clearInterval(pillTimer))
  // Keep skin verdicts out of screen sharing and recordings (Meet, Zoom…); the user still sees it.
  // Newer macOS capture APIs may ignore this, so Privacy mode exists as a manual fallback.
  companionWindow.setContentProtection(true)
  applyCompanionLevel()
  hardenWindow(companionWindow)
  companionWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      companionWindow?.hide()
    }
  })
  companionWindow.on('closed', () => (companionWindow = null))
  // Native drags (panel header) end with 'moved' on macOS: snap to a corner.
  companionWindow.on('moved', () => !isIsland() && Date.now() > placingUntil && snapToNearestCorner())
  companionWindow.once('ready-to-show', () => {
    // macOS can nudge a new window below the menu bar; put the island back on top of it.
    placeCompanion(false)
    companionWindow?.showInactive()
  })
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
  | { type: 'circle-reading'; requestId: string; source?: 'circle' | 'image' | 'link' }
  | { type: 'circle-progress'; requestId: string; stage: 'researching' }
  | { type: 'circle-result'; requestId: string; productId: string }
  | { type: 'circle-failed'; requestId: string | null; kind: 'screen_denied' | 'screen_unreadable' | 'page_unreadable' | 'provider'; message: string }

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

// ---------- Circle a product ----------

const CIRCLE_SHORTCUT = 'Alt+Shift+C'
const PRIVACY_SHORTCUT = 'Alt+Shift+P'
const privacyOn = () => store.get().settings.companion.privacyMode
const togglePrivacy = () => store.mutate({ type: 'settings.update', patch: { companion: { privacyMode: !privacyOn() } } })
const SCREEN_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
let circleDisplay: Electron.Display | null = null
let companionBeforeCircle = false

const circleFailed = (kind: 'screen_denied' | 'screen_unreadable' | 'page_unreadable' | 'provider', message: string, requestId: string | null = null) =>
  showCompanion({ type: 'circle-failed', requestId, kind, message }, true)

/** Screenshot of one display, or null if it couldn't be taken. */
async function captureDisplay(display: Electron.Display): Promise<NativeImage | null> {
  try {
    const { width, height } = display.size
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(width * display.scaleFactor), height: Math.round(height * display.scaleFactor) } })
    const shot = (sources.find((s) => s.display_id === String(display.id)) ?? sources[0])?.thumbnail ?? null
    return shot && !shot.isEmpty() ? shot : null
  } catch (err) {
    console.warn('[circle] capture failed:', (err as Error).message)
    return null
  }
}

/** Turn the cursor into a pen over the live screen; the screenshot is taken after the user lets go. */
async function startCircle() {
  if (circleWindow) return
  if (!screenReader) return circleFailed('provider', 'Circling a product needs Claude. Add ANTHROPIC_API_KEY to your .env file.')
  if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
    // Asking for a source is what makes macOS show its permission prompt the first time.
    await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }).catch(() => [])
    if (systemPreferences.getMediaAccessStatus('screen') !== 'granted')
      return circleFailed('screen_denied', 'SkinTwin needs Screen Recording permission to see what you circle.')
  }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  circleDisplay = display
  companionBeforeCircle = !!companionWindow?.isVisible()
  companionWindow?.hide() // keep the orb out of the picture
  circleWindow = new BrowserWindow({
    ...display.bounds,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    skipTaskbar: true,
    fullscreenable: false,
    enableLargerThanScreen: true,
    show: false,
    title: 'Circle a product',
    // Like the companion: a panel can sit over another app's full-screen space.
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    backgroundColor: '#00000000',
    webPreferences: webPreferences()
  })
  if (process.platform === 'darwin') circleWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  circleWindow.setAlwaysOnTop(true, 'screen-saver')
  hardenWindow(circleWindow)
  circleWindow.once('ready-to-show', () => {
    circleWindow?.setBounds(display.bounds)
    circleWindow?.show()
    circleWindow?.focus()
  })
  circleWindow.on('closed', () => (circleWindow = null))
  loadPage(circleWindow, 'circle')
}

/**
 * Look the product up on the web: its full ingredient list and what reputable sources say
 * about the ingredients that matter for this user. A failure here isn't fatal — the verdict
 * just says it couldn't be checked online.
 */
async function researchProduct(productId: string, requestId: string, signal: AbortSignal) {
  if (!researcher) return
  const product = store.get().products.find((p) => p.id === productId)
  if (!product) return
  showCompanion({ type: 'circle-progress', requestId, stage: 'researching' })
  try {
    const { research, ingredientsText } = await researcher.research(product, store.get(), signal)
    store.update((d) => {
      const p = d.products.find((x) => x.id === productId)
      if (!p) return
      p.research = research
      // Ingredients the user circled win; the online list only fills a gap.
      if (!p.ingredients.length && ingredientsText && research.ingredientSource) {
        p.ingredients = splitIngredientText(ingredientsText).slice(0, 120)
        p.source = { ...p.source, label: `${p.source.label}; ingredients from ${new URL(research.ingredientSource.url).hostname.replace(/^www\./, '')}` }
      }
    })
    console.info(`[research] ingredients ${research.ingredientsCheck}, ${research.findings.length} sourced findings`)
  } catch (err) {
    if (signal.aborted) throw err
    console.warn(`[research] failed: ${(err as { status?: number }).status ?? (err as Error).message}`)
  }
}

/** A circled region or a dropped photo: read it with Claude, research it, then ask about it. */
async function readCircle(jpeg: Buffer, origin: 'circle' | 'image' = 'circle') {
  const requestId = `circle:${randomUUID()}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 180_000)
  inflight.set(requestId, ctrl)
  showCompanion({ type: 'circle-reading', requestId, source: origin }, origin === 'circle')
  try {
    const read = await screenReader!.read(jpeg, ctrl.signal)
    const now = new Date().toISOString()
    const db = store.get()
    const recent = db.detected?.method === 'screen' ? (db.products.find((p) => p.id === db.detected!.productId) ?? null) : null
    const product = productFromScreenRead(read, now, recent, origin)
    if (!product) return circleFailed('screen_unreadable', read.note || (origin === 'image' ? 'I couldn’t spot a single skincare product in that photo.' : 'I couldn’t spot a single skincare product there.'), requestId)
    store.update((d) => {
      const idx = d.products.findIndex((p) => p.id === product.id)
      const old = idx >= 0 ? d.products[idx]! : null
      // A later, blurrier circle of the same product mustn't wipe ingredients read earlier.
      const merged = old ? { ...product, ingredients: product.ingredients.length ? product.ingredients : old.ingredients, createdAt: old.createdAt } : product
      if (old) d.products[idx] = merged
      else d.products.push(merged)
      d.detected = { productId: product.id, tabUrl: '', retailer: null, detectedAt: now, method: 'screen' }
      d.lastDetectionFailure = null
    })
    console.info(`[circle] read (${read.confidence} confidence, ${product.ingredients.length} ingredients)`)
    await researchProduct(product.id, requestId, ctrl.signal)
    showCompanion({ type: 'circle-result', requestId, productId: product.id })
  } catch (err) {
    const status = (err as { status?: number }).status
    console.warn(`[circle] failed: ${status ?? (err as Error).name}`)
    if (ctrl.signal.aborted) circleFailed('provider', 'That took too long. Try again, or circle a smaller area.', requestId)
    else if (err instanceof AssistantError) circleFailed('provider', err.message, requestId)
    else if (status === 401) circleFailed('provider', 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.', requestId)
    else circleFailed('provider', 'Couldn’t reach Claude. Check your connection and try again.', requestId)
  } finally {
    clearTimeout(timer)
    inflight.delete(requestId)
  }
}

/** A product page link dropped onto the island: fetch that page, identify the product, research it. */
async function readLink(url: string) {
  const requestId = `link:${randomUUID()}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 180_000)
  inflight.set(requestId, ctrl)
  showCompanion({ type: 'circle-reading', requestId, source: 'link' })
  try {
    const { read, pageUrl } = await researcher!.identify(url, ctrl.signal)
    const now = new Date().toISOString()
    const product = productFromPageRead(read, pageUrl, now)
    if (!product) return circleFailed('page_unreadable', read.note || 'That page doesn’t seem to be about one skincare product.', requestId)
    store.update((d) => {
      const idx = d.products.findIndex((p) => p.id === product.id)
      const old = idx >= 0 ? d.products[idx]! : null
      const merged = old ? { ...product, ingredients: product.ingredients.length ? product.ingredients : old.ingredients, research: old.research, createdAt: old.createdAt } : product
      if (old) d.products[idx] = merged
      else d.products.push(merged)
      d.detected = { productId: product.id, tabUrl: pageUrl, retailer: product.retailer, detectedAt: now, method: 'link' }
      d.lastDetectionFailure = null
    })
    console.info(`[drop] link read (${read.confidence} confidence, ${product.ingredients.length} ingredients)`) // never the URL
    await researchProduct(product.id, requestId, ctrl.signal)
    showCompanion({ type: 'circle-result', requestId, productId: product.id })
  } catch (err) {
    const status = (err as { status?: number }).status
    console.warn(`[drop] link failed: ${status ?? (err as Error).name}`)
    if (err instanceof PageUnreadableError) circleFailed('page_unreadable', err.message, requestId)
    else if (ctrl.signal.aborted) circleFailed('provider', 'That took too long. Try again, or circle the product on screen.', requestId)
    else if (status === 401) circleFailed('provider', 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.', requestId)
    else circleFailed('provider', 'Couldn’t reach Claude. Check your connection and try again.', requestId)
  } finally {
    clearTimeout(timer)
    inflight.delete(requestId)
  }
}

// ---------- Skin analysis masks ----------

const MAX_MASK_BYTES = 6 * 1024 * 1024

/**
 * Fetch YouCam's mask images (signed, short-lived links) and hand them to the result screen
 * as data URLs. They're held in memory only — never written to disk or the database.
 * Logs shape facts only (size, transparency), never the links or the pixels.
 */
async function downloadMasks(links: MaskLink[], signal: AbortSignal): Promise<AnalysisMask[]> {
  const out: AnalysisMask[] = []
  const skipped = new Map<string, number>()
  const skip = (why: string) => skipped.set(why, (skipped.get(why) ?? 0) + 1)
  let described = false
  for (const link of links) {
    const images: string[] = []
    for (const url of link.urls) {
      const res = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) }).catch((err: Error) => (skip(err.name), null))
      if (!res) continue
      if (!res.ok) {
        skip(`http_${res.status}`)
        continue
      }
      // Storage often labels files as generic binary, so decode rather than trust the label.
      const type = res.headers.get('content-type') ?? 'none'
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > MAX_MASK_BYTES) {
        skip('too_large')
        continue
      }
      const img = nativeImage.createFromBuffer(buf)
      if (img.isEmpty()) {
        skip(`not_an_image(${type})`)
        continue
      }
      if (!described) {
        described = true
        console.info(`[analysis] mask format: ${maskFacts(img, type)}`)
      }
      images.push(`data:image/png;base64,${img.toPNG().toString('base64')}`)
    }
    if (images.length) out.push({ key: link.key, label: link.label, images })
  }
  console.info(`[analysis] masks ready for ${out.length}/${links.length}${skipped.size ? `; skipped: ${[...skipped].map(([k, n]) => `${k}×${n}`).join(', ')}` : ''}`)
  return out
}

/** Size and transparency of a mask image, for checking the format without logging pixels. */
function maskFacts(img: NativeImage, type: string): string {
  const { width, height } = img.getSize()
  const px = img.toBitmap() // BGRA
  let transparent = 0
  let bright = 0
  const n = px.length / 4
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3]! < 250) transparent++
    if (px[i]! + px[i + 1]! + px[i + 2]! > 600) bright++
  }
  return `${type} ${width}×${height}, ${Math.round((transparent / n) * 100)}% transparent, ${Math.round((bright / n) * 100)}% bright`
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

  ipcMain.handle('analysis:run', async (e, req: { requestId: string; imageBase64: string; mimeType: string; capture?: unknown }): Promise<Result<AnalysisRun>> => {
    if (!analysisProvider) return fail('Skin analysis isn’t configured. Add YOUCAM_API_KEY to your .env file.', 'not_configured')
    if (typeof req?.imageBase64 !== 'string' || !/^image\/(jpeg|png)$/.test(req.mimeType)) return fail('Use a JPG or PNG image.', 'invalid_type')
    if (inflight.has(req.requestId)) return fail('Analysis already running.', 'duplicate')
    const ctrl = new AbortController()
    inflight.set(req.requestId, ctrl)
    try {
      const image = Buffer.from(req.imageBase64, 'base64')
      const { analysis: raw, masks: links } = await analysisProvider.analyze(image, req.mimeType, ctrl.signal, (stage) =>
        e.sender.send('analysis:progress', { requestId: req.requestId, stage })
      )
      // How the photo was taken (light, camera, effects) — numbers and names only, validated.
      const capture = CaptureConditionsSchema.safeParse(req.capture)
      const result = capture.success ? { ...raw, capture: capture.data } : raw
      if (store.get().settings.privacy.storeAnalysisHistory) store.update((db) => db.analyses.unshift(result))
      console.info(`[analysis] ${analysisProvider.name} ok: ${result.metrics.length} metrics, masks for ${links.length}`)
      const masks = await downloadMasks(links, ctrl.signal).catch((err) => {
        console.warn(`[analysis] masks unavailable: ${(err as Error).message}`)
        return []
      })
      return ok({ analysis: result, masks })
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

  ipcMain.handle('circle:start', () => void startCircle())
  ipcMain.handle('circle:done', async (e, raw: { points: Point[]; width: number; height: number } | null) => {
    if (!circleWindow || e.sender !== circleWindow.webContents) return
    const display = circleDisplay
    // Hide the pen stroke before taking the picture, so only the page itself is sent.
    circleWindow.setOpacity(0)
    circleWindow.close()
    const valid = raw && Array.isArray(raw.points) && raw.width > 0 && raw.height > 0
    const box = valid ? lassoBounds(raw.points.slice(0, 5000), raw.width, raw.height) : null
    if (!display || !box) {
      if (companionBeforeCircle) companionWindow?.showInactive()
      return
    }
    await new Promise((r) => setTimeout(r, 120)) // let the window actually leave the screen
    const shot = await captureDisplay(display)
    if (!shot) return circleFailed('screen_unreadable', 'I couldn’t capture your screen. Try again.')
    const size = shot.getSize()
    const sx = size.width / raw!.width
    const sy = size.height / raw!.height
    let crop = shot.crop({ x: Math.round(box.x * sx), y: Math.round(box.y * sy), width: Math.max(1, Math.round(box.w * sx)), height: Math.max(1, Math.round(box.h * sy)) })
    const { width, height } = crop.getSize()
    const scale = 1568 / Math.max(width, height) // Claude's vision sweet spot
    if (scale < 1) crop = crop.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'best' })
    void readCircle(crop.toJPEG(88))
  })
  // Something dropped onto the island. The renderer has already re-encoded photos as JPEG.
  ipcMain.handle('drop:image', (_e, raw: { jpegBase64: string }) => {
    if (!screenReader) return circleFailed('provider', 'Checking a photo needs Claude. Add ANTHROPIC_API_KEY to your .env file.')
    const jpeg = typeof raw?.jpegBase64 === 'string' && raw.jpegBase64.length < MAX_DROP_BYTES * 1.4 ? Buffer.from(raw.jpegBase64, 'base64') : null
    if (!jpeg || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return circleFailed('screen_unreadable', 'That image couldn’t be read. Try a PNG or JPG photo.')
    void readCircle(jpeg, 'image')
  })
  ipcMain.handle('drop:link', (_e, raw: { url: string }) => {
    if (!researcher) return circleFailed('provider', 'Checking a link needs Claude. Add ANTHROPIC_API_KEY to your .env file.')
    const url = dropUrl(raw?.url)
    if (!url) return circleFailed('page_unreadable', 'That isn’t a web link SkinTwin can open.')
    void readLink(url)
  })
  // UV alerts: city search for Settings, and today's forecast for the island.
  ipcMain.handle('uv:search', async (_e, query: string) => {
    try {
      return ok(await searchPlaces(String(query ?? '')))
    } catch (err) {
      console.warn(`[uv] city search failed: ${(err as Error).message}`)
      return fail('Couldn’t reach Open-Meteo. Check your connection and try again.', 'network')
    }
  })
  ipcMain.handle('uv:today', async (): Promise<UvForecast | null> => {
    const { place, sunAlerts } = store.get().settings.companion
    if (!place || !sunAlerts) return null
    const key = `${place.latitude},${place.longitude}`
    // one fetch per half hour per place is plenty; a failure just means no alert
    if (uvCache && uvCache.key === key && Date.now() - uvCache.at < 30 * 60_000) return uvCache.forecast
    try {
      const forecast = await fetchUv(place)
      uvCache = { key, at: Date.now(), forecast }
      return forecast
    } catch (err) {
      console.warn(`[uv] forecast unavailable: ${(err as Error).message}`)
      return null
    }
  })
  // The island's solid pill, in window coordinates, so drags over it are caught (see pollPill).
  ipcMain.handle('companion:setSolidRect', (_e, r: { x: number; y: number; w: number; h: number } | null) => {
    pillRect = r && [r.x, r.y, r.w, r.h].every(Number.isFinite) ? r : null
  })
  ipcMain.handle('circle:openSettings', () => {
    if (process.platform === 'darwin') void shell.openExternal(SCREEN_SETTINGS_URL)
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
    if (isIsland()) return // the island stays put at the top of the screen
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
      { label: 'Circle a product on screen', accelerator: CIRCLE_SHORTCUT, registerAccelerator: false, click: () => void startCircle() },
      ...(opts?.hasProduct ? [{ label: 'Quick actions for this product', click: cmd({ type: 'menu', action: 'quick-actions' }) }] : []),
      { label: 'My skin profile', click: cmd({ type: 'menu', action: 'profile' }) },
      { type: 'separator' },
      { label: 'Privacy mode (hide skin info)', type: 'checkbox', checked: c.privacyMode, accelerator: PRIVACY_SHORTCUT, registerAccelerator: false, click: togglePrivacy },
      ...(c.style === 'orb'
        ? [
            { label: 'Keep on top', type: 'checkbox' as const, checked: c.alwaysOnTop, click: (item: Electron.MenuItem) => {
              store.mutate({ type: 'settings.update', patch: { companion: { alwaysOnTop: item.checked } } })
              applyCompanionLevel()
            } },
            { label: 'Move to', submenu: CORNERS.map((corner) => ({ label: corner.replace('-', ' ').replace(/\b\w/g, (m) => m.toUpperCase()), type: 'radio' as const, checked: c.corner === corner, click: moveTo(corner) })) }
          ]
        : []),
      { label: c.style === 'island' ? 'Switch to floating orb' : 'Switch to top island', click: () => store.mutate({ type: 'settings.update', patch: { companion: { style: c.style === 'island' ? 'orb' : 'island' } } }) },
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
    clickThrough = !!through
    companionWindow?.setIgnoreMouseEvents(!!through, { forward: true })
  })
  ipcMain.handle('companion:setPinned', (_e, pinned: boolean) => {
    store.mutate({ type: 'settings.update', patch: { companion: { alwaysOnTop: !!pinned } } })
    applyCompanionLevel()
  })
  ipcMain.handle('companion:islandInfo', () => islandInfo())
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

// privacyMode is included so the menus' checkbox is rebuilt when it changes
const shortcutKeys = () => `${store.get().settings.companion.shortcut}|${store.get().settings.companion.voiceShortcut}|${store.get().settings.companion.privacyMode}`

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
  if (!tryRegister(CIRCLE_SHORTCUT, () => void startCircle())) console.warn(`[shortcut] ${CIRCLE_SHORTCUT} is unavailable (taken by another app or invalid)`)
  if (!tryRegister(PRIVACY_SHORTCUT, togglePrivacy)) console.warn(`[shortcut] ${PRIVACY_SHORTCUT} is unavailable (taken by another app or invalid)`)
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
          { label: 'Circle a product on screen', accelerator: CIRCLE_SHORTCUT, registerAccelerator: false, click: () => void startCircle() },
          { label: 'Privacy mode (hide skin info)', type: 'checkbox', checked: privacyOn(), accelerator: PRIVACY_SHORTCUT, registerAccelerator: false, click: togglePrivacy },
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
      { label: 'Circle a product on screen', click: () => void startCircle() },
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
    // Switching between island and orb (or moving the orb from Settings) re-places the window.
    const placement = () => `${store.get().settings.companion.style}|${store.get().settings.companion.corner}`
    let lastPlacement = placement()
    store.subscribe(() => {
      if (placement() === lastPlacement) return
      lastPlacement = placement()
      applyCompanionLevel()
      placeCompanion(false)
    })
    screen.on('display-metrics-changed', () => placeCompanion(false))

    try {
      bridgeServer = await startBridge(config.bridgePort, {
        token: () => store.get().bridge.pairingToken,
        pageAccess: () => store.get().onboarding.permissions.pageAccess === 'granted',
        onMessage: handleBridgeMessage
      })
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
