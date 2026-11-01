/** Helpers for Electron accelerator strings ("Alt+Shift+Space"). */

const MAC_SYMBOLS: Record<string, string> = {
  CommandOrControl: '⌘',
  CmdOrCtrl: '⌘',
  Command: '⌘',
  Cmd: '⌘',
  Control: '⌃',
  Ctrl: '⌃',
  Alt: '⌥',
  Option: '⌥',
  Shift: '⇧',
  Super: '⌘',
  Meta: '⌘'
}
const MOD_ORDER = ['Control', 'Ctrl', 'Alt', 'Option', 'Shift', 'CommandOrControl', 'CmdOrCtrl', 'Command', 'Cmd', 'Super', 'Meta']

/** "Alt+Shift+Space" → "⌥⇧Space" on macOS, "Alt+Shift+Space" elsewhere. */
export function prettyAccelerator(acc: string, mac = true): string {
  if (!acc) return 'Not set'
  const parts = acc.split('+')
  const key = parts.pop() ?? ''
  const mods = parts.sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b))
  if (!mac) return [...mods.map((m) => (m === 'CommandOrControl' || m === 'CmdOrCtrl' ? 'Ctrl' : m)), key].join('+')
  return `${mods.map((m) => MAC_SYMBOLS[m] ?? m).join('')}${key === 'Space' ? ' Space' : key}`.trim()
}

const KEY_NAMES: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
  Enter: 'Return'
}

/**
 * Build an accelerator from a keydown event. Returns null until a non-modifier
 * key is pressed with at least one modifier (bare keys would hijack typing).
 */
export function acceleratorFromEvent(e: { key: string; code: string; altKey: boolean; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): string | null {
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return null
  const mods: string[] = []
  if (e.ctrlKey) mods.push('Control')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (e.metaKey) mods.push('Command')
  if (!mods.length || (mods.length === 1 && mods[0] === 'Shift')) return null
  // Use the physical key so ⌥ combinations (which produce symbols like "ß") map correctly.
  let key = KEY_NAMES[e.key] ?? e.key
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3)
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5)
  else if (e.code === 'Space') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()
  return [...mods, key].join('+')
}
