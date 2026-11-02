import { describe, expect, it } from 'vitest'
import { DatabaseSchema } from '@shared/models'
import { acceleratorFromEvent, prettyAccelerator } from '@shared/shortcuts'
import { fresh, run } from './helpers'

const key = (k: string, code: string, mods: Partial<Record<'altKey' | 'shiftKey' | 'metaKey' | 'ctrlKey', boolean>> = {}) => ({ key: k, code, altKey: false, shiftKey: false, metaKey: false, ctrlKey: false, ...mods })

describe('shortcut helpers', () => {
  it('formats accelerators with mac symbols', () => {
    expect(prettyAccelerator('Alt+Space')).toBe('⌥ Space')
    expect(prettyAccelerator('Shift+Alt+Space')).toBe('⌥⇧ Space')
    expect(prettyAccelerator('CommandOrControl+Shift+K')).toBe('⇧⌘K')
    expect(prettyAccelerator('CommandOrControl+Shift+K', false)).toBe('Shift+Ctrl+K')
  })
  it('records combos from key events using the physical key', () => {
    expect(acceleratorFromEvent(key(' ', 'Space', { altKey: true }))).toBe('Alt+Space')
    expect(acceleratorFromEvent(key('ß', 'KeyS', { altKey: true }))).toBe('Alt+S') // ⌥S types "ß" on a Mac
    expect(acceleratorFromEvent(key('k', 'KeyK', { metaKey: true, shiftKey: true }))).toBe('Shift+Command+K')
  })
  it('ignores bare keys, shift-only combos and lone modifiers', () => {
    expect(acceleratorFromEvent(key('a', 'KeyA'))).toBeNull()
    expect(acceleratorFromEvent(key('A', 'KeyA', { shiftKey: true }))).toBeNull()
    expect(acceleratorFromEvent(key('Alt', 'AltLeft', { altKey: true }))).toBeNull()
  })
})

describe('companion settings', () => {
  it('loads a database saved before shortcuts/corner existed', () => {
    const old = JSON.parse(JSON.stringify(fresh()))
    old.settings.companion = { launchOnStartup: true, alwaysOnTop: false }
    const parsed = DatabaseSchema.parse(old)
    expect(parsed.settings.companion).toEqual({ launchOnStartup: true, alwaysOnTop: false, shortcut: 'Alt+Space', voiceShortcut: 'Alt+Shift+Space', corner: 'bottom-right', style: 'island' })
  })
  it('a partial patch changes only what it names', () => {
    const db = run(fresh(), { type: 'settings.update', patch: { companion: { shortcut: 'Command+Shift+K' } } }, { type: 'settings.update', patch: { companion: { corner: 'top-left' } } })
    expect(db.settings.companion).toMatchObject({ shortcut: 'Command+Shift+K', voiceShortcut: 'Alt+Shift+Space', corner: 'top-left', alwaysOnTop: true })
  })
})
