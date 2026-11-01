import { useSyncExternalStore } from 'react'

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  text: string
}
let toasts: Toast[] = []
const subs = new Set<() => void>()
let seq = 0
const emit = () => subs.forEach((s) => s())

function push(kind: Toast['kind'], text: string) {
  const id = ++seq
  toasts = [...toasts.slice(-3), { id, kind, text }]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, kind === 'error' ? 6000 : 3200)
}

export const toast = {
  success: (t: string) => push('success', t),
  error: (t: string) => push('error', t),
  info: (t: string) => push('info', t)
}

export function useToasts() {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    () => toasts
  )
}
