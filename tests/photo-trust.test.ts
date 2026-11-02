import { describe, expect, it } from 'vitest'
import { activeEffects, cameraEffects, sharpness, skinDetailRatio, smoothingWarning } from '../src/renderer/src/features/analysis/facecheck'
import { originWarnings, readPhotoOrigin } from '../src/renderer/src/features/analysis/exif'

/** A minimal JPEG whose Exif IFD0 holds the given ASCII tags (little-endian TIFF). */
function jpegWithExif(tags: Record<number, string>): Uint8Array {
  const entries = Object.entries(tags).map(([t, v]) => [Number(t), new TextEncoder().encode(v + '\0')] as const)
  const ifdSize = 2 + entries.length * 12 + 4
  const dataAt = 8 + ifdSize
  const tiff: number[] = [0x49, 0x49, 42, 0, 8, 0, 0, 0, entries.length, 0]
  const data: number[] = []
  for (const [tag, bytes] of entries) {
    const off = dataAt + data.length
    tiff.push(tag & 0xff, tag >> 8, 2, 0, bytes.length, 0, 0, 0, off & 0xff, (off >> 8) & 0xff, 0, 0)
    data.push(...bytes)
  }
  tiff.push(0, 0, 0, 0)
  const payload = [...new TextEncoder().encode('Exif'), 0, 0, ...tiff, ...data]
  const len = payload.length + 2
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...payload, 0xff, 0xda, 0, 2])
}

describe('uploaded photo origin', () => {
  it('reads camera make, model and software', () => {
    const o = readPhotoOrigin(jpegWithExif({ 0x010f: 'Apple', 0x0110: 'iPhone 15', 0x0131: '18.1' }))
    expect(o).toMatchObject({ make: 'Apple', model: 'iPhone 15', software: '18.1', screenshotTag: false })
    expect(originWarnings(o, 'IMG_1234.jpg')).toEqual([])
  })

  it('warns about beauty and editing apps', () => {
    for (const app of ['Facetune2', 'Meitu', 'BeautyPlus 7.5', 'Adobe Lightroom 9', 'PicsArt', 'YouCam Makeup']) {
      expect(originWarnings(readPhotoOrigin(jpegWithExif({ 0x010f: 'Apple', 0x0131: app })), 'x.jpg')[0]).toMatch(/retouch skin/)
    }
  })

  it('warns about screenshots and photos with no camera data', () => {
    expect(originWarnings(readPhotoOrigin(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2])), 'Screenshot 2026-11-02 at 10.00.png')[0]).toMatch(/screenshot/)
    expect(originWarnings(readPhotoOrigin(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2])), 'selfie.jpg')[0]).toMatch(/No camera information/)
  })

  it('finds the macOS screenshot marker in a PNG', () => {
    const text = new TextEncoder().encode('XML:com.adobe.xmp\0<exif:UserComment>Screenshot</exif:UserComment>')
    const chunk = [0, 0, 0, text.length, ...new TextEncoder().encode('iTXt'), ...text, 0, 0, 0, 0]
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk, 0, 0, 0, 0, ...new TextEncoder().encode('IEND'), 0, 0, 0, 0])
    expect(readPhotoOrigin(png).screenshotTag).toBe(true)
  })

  it('never throws on junk', () => {
    expect(() => readPhotoOrigin(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2]))).not.toThrow()
  })
})

describe('camera effects', () => {
  it('reports which effects are on and which the app can switch off', () => {
    const states = cameraEffects({ backgroundBlur: [false, true], faceFraming: [true] }, { backgroundBlur: false, faceFraming: true })
    expect(states.find((e) => e.key === 'backgroundBlur')).toEqual({ key: 'backgroundBlur', on: false, adjustable: true })
    expect(states.find((e) => e.key === 'faceFraming')).toEqual({ key: 'faceFraming', on: true, adjustable: false })
    expect(states.find((e) => e.key === 'lightingCorrection')!.on).toBeNull() // not reported = unknown, not "off"
    expect(activeEffects(states).map((e) => e.key)).toEqual(['faceFraming'])
  })
})

describe('smoothing heuristic', () => {
  // grainy "skin" vs a smoothed copy, measured with the same sharpness function the app uses
  const patch = (noise: number, seed = 1) => {
    const w = 48
    const px = new Uint8ClampedArray(w * w * 4)
    let s = seed
    for (let i = 0; i < w * w; i++) {
      s = (s * 16807) % 2147483647
      const v = 170 + ((s / 2147483647) * 2 - 1) * noise
      px.set([v, v * 0.8, v * 0.7, 255], i * 4)
    }
    return sharpness(px, w, w)
  }
  const eye = patch(90, 7)

  it('passes natural skin texture and warns on flattened skin', () => {
    expect(smoothingWarning(skinDetailRatio([patch(14, 2), patch(14, 3)], [eye]))).toBeNull()
    expect(smoothingWarning(skinDetailRatio([patch(1, 2), patch(1, 3)], [eye]))).toMatch(/smoothed/)
  })

  it('does not judge when the eyes themselves are blurry', () => {
    expect(skinDetailRatio([patch(1)], [patch(0.5)])).toBeNull()
  })
})
