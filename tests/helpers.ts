import { DEMO_CATALOG } from '@shared/catalog'
import type { Database, Product } from '@shared/models'
import { applyMutation, type Mutation } from '@shared/mutations'
import { createEmptyDatabase } from '../src/main/db'

let n = 0
export const env = { now: () => '2026-11-01T10:00:00.000Z', newId: (p: string) => `${p}:${++n}` }
export const fresh = (): Database => createEmptyDatabase({ demoCatalog: true })
export const run = (db: Database, ...ops: Mutation[]) => ops.reduce((d, op) => applyMutation(d, op, env), db)
export const product = (id: string): Product => DEMO_CATALOG.find((p) => p.id === `demo:${id}`)!
