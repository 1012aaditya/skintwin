import { useMemo, useSyncExternalStore, useEffect, useState } from 'react'
import type { ProviderStatus } from '@shared/assistant'
import type { Product, Snapshot } from '@shared/models'
import type { Mutation } from '@shared/mutations'
import { computeMatch, type MatchResult } from '@shared/scoring'
import { toast } from './toast'

/**
 * Renderer-side mirror of the main-process database. The main process is the
 * single source of truth; every window receives the same snapshot on change.
 */
let snapshot: Snapshot | null = null
const listeners = new Set<() => void>()
let started = false

function start() {
  if (started) return
  started = true
  window.skintwin.db.onChange((s) => {
    snapshot = s
    listeners.forEach((l) => l())
  })
  void window.skintwin.db.get().then((s) => {
    snapshot = s
    listeners.forEach((l) => l())
  })
}

function subscribe(fn: () => void) {
  start()
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useSnapshot(): Snapshot | null {
  return useSyncExternalStore(subscribe, () => snapshot)
}

/** Use inside screens that render only after the snapshot loaded. */
export function useDb(): Snapshot {
  const s = useSnapshot()
  if (!s) throw new Error('Snapshot not loaded')
  return s
}

export async function mutate(op: Mutation, success?: string): Promise<boolean> {
  const res = await window.skintwin.db.mutate(op)
  if (!res.ok) {
    toast.error(res.error)
    return false
  }
  if (success) toast.success(success)
  return true
}

export function useProductMap(): Map<string, Product> {
  const db = useDb()
  return useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products])
}

export function useRoutineProducts(): Product[] {
  const db = useDb()
  const map = useProductMap()
  return useMemo(
    () => [...db.routines.am.steps, ...db.routines.pm.steps].map((s) => map.get(s.productId)).filter((p): p is Product => !!p),
    [db.routines, map]
  )
}

export function useMatch(product: Product | null | undefined): MatchResult | null {
  const db = useDb()
  const routineProducts = useRoutineProducts()
  return useMemo(() => (product ? computeMatch(product, db.profile, { routineProducts }) : null), [product, db.profile, routineProducts])
}

/** Products that come from a catalog (demo or partner) — candidates for recommendations. */
export function useCatalog(): Product[] {
  const db = useDb()
  return useMemo(() => db.products.filter((p) => p.source.kind === 'demo_catalog' || p.source.kind === 'partner'), [db.products])
}

export function useOwnedIds(): Set<string> {
  const db = useDb()
  return useMemo(
    () => new Set(db.inventory.filter((i) => i.status !== 'archived' && i.status !== 'finished').map((i) => i.productId)),
    [db.inventory]
  )
}

let providerCache: ProviderStatus | null = null
export function useProviders(): ProviderStatus | null {
  const [status, setStatus] = useState<ProviderStatus | null>(providerCache)
  useEffect(() => {
    void window.skintwin.providers.status().then((s) => {
      providerCache = s
      setStatus(s)
    })
  }, [])
  return status
}

export const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const newRequestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
