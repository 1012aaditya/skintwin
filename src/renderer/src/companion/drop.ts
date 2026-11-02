import { classifyDrop } from '@shared/drop'
import { blobToBase64 } from '@renderer/lib/media'

/** Longest side sent to Claude for a dropped photo — plenty to read a label. */
const MAX_SIDE = 2000

/** Re-encode any accepted photo (PNG, WebP, JPEG) as a JPEG of sensible size. */
async function toJpeg(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.9))
}

/**
 * Hands a drop to main: a product photo goes the same way as a circled area, a page link is
 * identified from that page. Returns a short message when the drop can't be used.
 */
export async function handleDrop(dt: DataTransfer): Promise<string | null> {
  const files = [...dt.files]
  const plan = classifyDrop({ files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })), uriList: dt.getData('text/uri-list'), text: dt.getData('text/plain') })
  if (plan.kind === 'reject') return plan.message
  if (plan.kind === 'link') {
    await window.skintwin.drop.link(plan.url)
    return null
  }
  try {
    await window.skintwin.drop.image(await blobToBase64(await toJpeg(files[plan.index]!)))
    return null
  } catch {
    return 'That image couldn’t be opened. Try a PNG or JPG photo.'
  }
}
