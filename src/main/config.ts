import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BRIDGE_DEFAULT_PORT } from '@shared/protocol'

/**
 * Secrets live only in the main process. They are read from the process
 * environment, then from a .env file (project root in dev, userData in production).
 * Nothing in here is ever sent to a renderer.
 */
function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    out[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

export interface AppConfig {
  anthropicKey: string | null
  llmModel: string
  youcamKey: string | null
  youcamBase: string
  sttProvider: 'openai' | 'elevenlabs' | null
  openaiKey: string | null
  elevenLabsKey: string | null
  elevenLabsVoiceId: string | null
  ttsProvider: 'system' | 'elevenlabs'
  demoCatalog: boolean
  enableMocks: boolean
  bridgePort: number
}

export function loadConfig(dirs: string[], isDev: boolean): AppConfig {
  const fileVars: Record<string, string> = {}
  for (const d of dirs) {
    const f = join(d, '.env')
    if (existsSync(f)) Object.assign(fileVars, parseDotEnv(readFileSync(f, 'utf8')))
  }
  const get = (k: string) => {
    const v = process.env[k] ?? fileVars[k]
    return v && v.trim() ? v.trim() : null
  }
  const openaiKey = get('OPENAI_API_KEY')
  const elevenLabsKey = get('ELEVENLABS_API_KEY')
  const sttPref = get('STT_PROVIDER')
  const sttProvider =
    sttPref === 'openai' && openaiKey ? 'openai'
    : sttPref === 'elevenlabs' && elevenLabsKey ? 'elevenlabs'
    : openaiKey ? 'openai'
    : elevenLabsKey ? 'elevenlabs'
    : null
  return {
    anthropicKey: get('ANTHROPIC_API_KEY'),
    llmModel: get('SKINTWIN_LLM_MODEL') ?? 'claude-opus-5-5',
    youcamKey: get('YOUCAM_API_KEY'),
    youcamBase: get('YOUCAM_API_BASE') ?? 'https://yce-api-01.makeupar.com',
    sttProvider,
    openaiKey,
    elevenLabsKey,
    elevenLabsVoiceId: get('ELEVENLABS_VOICE_ID'),
    ttsProvider: get('TTS_PROVIDER') === 'elevenlabs' && elevenLabsKey && get('ELEVENLABS_VOICE_ID') ? 'elevenlabs' : 'system',
    demoCatalog: (get('SKINTWIN_DEMO_CATALOG') ?? (isDev ? '1' : '0')) !== '0',
    enableMocks: (get('SKINTWIN_ENABLE_MOCKS') ?? (isDev ? '1' : '0')) !== '0',
    bridgePort: Number(get('SKINTWIN_BRIDGE_PORT') ?? BRIDGE_DEFAULT_PORT)
  }
}
