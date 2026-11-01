export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export interface ImageCheck {
  ok: boolean
  width: number
  height: number
  issues: string[]
  brightness: number
}

/** Local quality checks before anything leaves the device. */
export async function checkImage(blob: Blob): Promise<ImageCheck> {
  const issues: string[] = []
  if (!/^image\/(jpeg|png)$/.test(blob.type)) issues.push('Use a JPG or PNG image.')
  if (blob.size > MAX_IMAGE_BYTES) issues.push('Image is larger than 10 MB.')
  const bmp = await createImageBitmap(blob)
  const { width, height } = bmp
  if (Math.min(width, height) < 480) issues.push(`Image is ${width}×${height}; it needs at least 480px on the short side.`)
  const c = new OffscreenCanvas(64, 64)
  const ctx = c.getContext('2d')!
  ctx.drawImage(bmp, 0, 0, 64, 64)
  const data = ctx.getImageData(0, 0, 64, 64).data
  let sum = 0
  for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!
  const brightness = sum / (data.length / 4) / 255
  if (brightness < 0.22) issues.push('The photo looks dark — face a window or soft light.')
  if (brightness > 0.9) issues.push('The photo looks overexposed — avoid direct harsh light.')
  bmp.close()
  return { ok: issues.length === 0, width, height, issues, brightness }
}
