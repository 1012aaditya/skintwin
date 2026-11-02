/**
 * What the user dropped onto the island, and whether SkinTwin can check it: a product photo
 * (read like a circled area) or a product page link (identified from the page, then researched).
 * Pure, so the rules are tested.
 */

export const DROP_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
/** Large enough for a phone photo, small enough to read quickly. */
export const MAX_DROP_BYTES = 15 * 1024 * 1024
export const MAX_URL_LENGTH = 2048

export interface DroppedFile {
  name: string
  type: string
  size: number
}

export type DropPlan = { kind: 'image'; index: number } | { kind: 'link'; url: string } | { kind: 'reject'; message: string }

const IMAGE_URL = /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i

/** A dropped string as an http(s) URL, or null. */
export function dropUrl(raw: string | null | undefined): string | null {
  const line = (raw ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#')) // text/uri-list allows comment lines
  if (!line || line.length > MAX_URL_LENGTH) return null
  try {
    const u = new URL(line)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (!u.hostname.includes('.') || u.username || u.password) return null
    return u.toString()
  } catch {
    return null
  }
}

export function classifyDrop(d: { files: DroppedFile[]; uriList?: string | null; text?: string | null }): DropPlan {
  if (d.files.length) {
    const index = d.files.findIndex((f) => (DROP_IMAGE_TYPES as readonly string[]).includes(f.type))
    if (index < 0) return { kind: 'reject', message: 'Only product photos (PNG, JPG, WebP) or product page links work here.' }
    if (d.files[index]!.size > MAX_DROP_BYTES) return { kind: 'reject', message: 'That image is too large — use one under 15 MB.' }
    return { kind: 'image', index }
  }
  const url = dropUrl(d.uriList) ?? dropUrl(d.text)
  if (!url) return { kind: 'reject', message: 'Only product photos (PNG, JPG, WebP) or product page links work here.' }
  // a dragged picture from a web page often arrives as just its address
  if (IMAGE_URL.test(new URL(url).pathname)) return { kind: 'reject', message: 'That’s a link to an image — save the picture and drop the file, or drop the product page link instead.' }
  return { kind: 'link', url }
}
