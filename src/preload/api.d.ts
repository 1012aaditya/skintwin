import type { AskRequest, AskResponse, ProviderStatus, Result } from '../shared/assistant'
import type { SkinAnalysis, Snapshot } from '../shared/models'
import type { Mutation } from '../shared/mutations'

export type CompanionCommand =
  | { type: 'listen' }
  | { type: 'menu'; action: 'type' | 'panel' | 'quick-actions' | 'profile' }
  | { type: 'product-detected'; productId: string }
  | { type: 'analyze-product'; productId: string }
  | { type: 'compare-product'; productId: string }
  | { type: 'detection-failed'; reason: string }
  | { type: 'circle-reading'; requestId: string }
  | { type: 'circle-progress'; requestId: string; stage: 'researching' }
  | { type: 'circle-result'; requestId: string; productId: string }
  | { type: 'circle-failed'; requestId: string | null; kind: 'screen_denied' | 'screen_unreadable' | 'provider'; message: string }

export type MediaStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'

export interface SkinTwinApi {
  platform: string
  db: {
    get(): Promise<Snapshot>
    mutate(op: Mutation): Promise<Result<Snapshot>>
    onChange(fn: (s: Snapshot) => void): () => void
  }
  providers: { status(): Promise<ProviderStatus> }
  analysis: {
    run(req: { requestId: string; imageBase64: string; mimeType: string }): Promise<Result<SkinAnalysis>>
    onProgress(fn: (p: { requestId: string; stage: string }) => void): () => void
  }
  assistant: { ask(req: AskRequest): Promise<Result<AskResponse>> }
  speech: {
    transcribe(req: { requestId: string; audioBase64: string; mimeType: string }): Promise<Result<{ text: string }>>
    synthesize(text: string): Promise<Result<{ audioBase64: string; mimeType: string }>>
  }
  cancel(requestId: string): Promise<void>
  companion: {
    show(command?: CompanionCommand): Promise<void>
    hide(): Promise<void>
    setMode(mode: 'orb' | 'compact' | 'expanded'): Promise<void>
    setPinned(pinned: boolean): Promise<void>
    setClickThrough(through: boolean): Promise<void>
    dragStart(): Promise<void>
    dragMove(dx: number, dy: number): Promise<void>
    dragEnd(): Promise<void>
    menu(opts: { hasProduct: boolean }): Promise<void>
    /** Whether this Mac has a camera notch, and the menu bar height the island lines up with. */
    islandInfo(): Promise<{ notch: boolean; barHeight: number; notchWidth: number }>
    onCommand(fn: (c: CompanionCommand) => void): () => void
  }
  circle: {
    start(): Promise<void>
    done(result: { points: { x: number; y: number }[]; width: number; height: number } | null): Promise<void>
    openSettings(): Promise<void>
  }
  app: { open(route: string): Promise<void>; onNavigate(fn: (route: string) => void): () => void }
  openExternal(url: string): Promise<void>
  shortcuts: { status(): Promise<{ toggle: boolean; voice: boolean }>; suspend(suspended: boolean): Promise<{ toggle: boolean; voice: boolean }> }
  bridge: { info(): Promise<{ port: number; token: string; running: boolean; error: string | null }>; regenerate(): Promise<string> }
  media: { status(kind: 'microphone' | 'camera'): Promise<MediaStatus>; request(kind: 'microphone' | 'camera'): Promise<MediaStatus> }
  data: { exportAll(): Promise<Result<{ path: string }>>; deleteAll(): Promise<Result<Snapshot>> }
}

declare global {
  interface Window {
    skintwin: SkinTwinApi
  }
}
