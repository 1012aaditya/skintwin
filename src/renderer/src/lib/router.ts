import { useSyncExternalStore } from 'react'

/** Minimal hash router — enough for a desktop app with a dozen screens. */
export interface Route {
  path: string
  segments: string[]
  query: URLSearchParams
}

function read(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/discover'
  const [path = '/discover', qs = ''] = raw.split('?')
  return { path, segments: path.split('/').filter(Boolean), query: new URLSearchParams(qs) }
}

let current = read()
const subs = new Set<() => void>()
window.addEventListener('hashchange', () => {
  current = read()
  subs.forEach((s) => s())
})

export function navigate(to: string) {
  if (window.location.hash !== `#${to}`) window.location.hash = to
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    () => current
  )
}
