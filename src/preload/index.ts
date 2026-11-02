import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { SkinTwinApi } from './api'

const on =
  <T>(channel: string) =>
  (fn: (payload: T) => void) => {
    const handler = (_e: IpcRendererEvent, payload: T) => fn(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }

const api: SkinTwinApi = {
  platform: process.platform,
  db: { get: () => ipcRenderer.invoke('db:get'), mutate: (op) => ipcRenderer.invoke('db:mutate', op), onChange: on('db:changed') },
  providers: { status: () => ipcRenderer.invoke('providers:status') },
  analysis: { run: (req) => ipcRenderer.invoke('analysis:run', req), onProgress: on('analysis:progress') },
  assistant: { ask: (req) => ipcRenderer.invoke('assistant:ask', req) },
  speech: {
    transcribe: (req) => ipcRenderer.invoke('stt:transcribe', req),
    synthesize: (text) => ipcRenderer.invoke('tts:synthesize', text)
  },
  cancel: (id) => ipcRenderer.invoke('request:cancel', id),
  companion: {
    show: (c) => ipcRenderer.invoke('companion:show', c),
    hide: () => ipcRenderer.invoke('companion:hide'),
    setMode: (m) => ipcRenderer.invoke('companion:setMode', m),
    setPinned: (p) => ipcRenderer.invoke('companion:setPinned', p),
    setClickThrough: (t) => ipcRenderer.invoke('companion:setClickThrough', t),
    dragStart: () => ipcRenderer.invoke('companion:dragStart'),
    dragMove: (dx, dy) => ipcRenderer.invoke('companion:dragMove', dx, dy),
    dragEnd: () => ipcRenderer.invoke('companion:dragEnd'),
    menu: (opts) => ipcRenderer.invoke('companion:menu', opts),
    islandInfo: () => ipcRenderer.invoke('companion:islandInfo'),
    onCommand: on('companion:command')
  },
  circle: {
    start: () => ipcRenderer.invoke('circle:start'),
    done: (r) => ipcRenderer.invoke('circle:done', r),
    openSettings: () => ipcRenderer.invoke('circle:openSettings')
  },
  app: { open: (route) => ipcRenderer.invoke('app:open', route), onNavigate: on('app:navigate') },
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  shortcuts: { status: () => ipcRenderer.invoke('shortcuts:status'), suspend: (s) => ipcRenderer.invoke('shortcuts:suspend', s) },
  bridge: { info: () => ipcRenderer.invoke('bridge:info'), regenerate: () => ipcRenderer.invoke('bridge:regenerate') },
  media: { status: (k) => ipcRenderer.invoke('media:status', k), request: (k) => ipcRenderer.invoke('media:request', k) },
  data: { exportAll: () => ipcRenderer.invoke('data:export'), deleteAll: () => ipcRenderer.invoke('data:deleteAll') }
}

contextBridge.exposeInMainWorld('skintwin', api)
