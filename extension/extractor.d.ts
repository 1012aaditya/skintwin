import type { ExtractedProduct } from '../src/shared/protocol'
export function extractProductFromPage(): { ok: true; product: ExtractedProduct } | { ok: false; reason: string }
