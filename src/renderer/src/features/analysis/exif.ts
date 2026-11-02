/**
 * Where an uploaded photo came from, read from its own metadata: the camera (EXIF Make/Model),
 * the app that last saved it (EXIF Software), and screenshot markers. Pure; tested.
 */

export interface PhotoOrigin {
  make: string | null
  model: string | null
  software: string | null
  /** XMP/PNG text says it's a screenshot */
  screenshotTag: boolean
}

const ascii = (b: Uint8Array, start: number, len: number) => {
  let s = ''
  for (let i = start; i < start + len && i < b.length; i++) {
    if (b[i] === 0) break
    s += String.fromCharCode(b[i]!)
  }
  return s.trim()
}

/** Make (0x010f), Model (0x0110) and Software (0x0131) from a TIFF/EXIF block starting at `tiff`. */
function readIfd0(b: Uint8Array, tiff: number): Pick<PhotoOrigin, 'make' | 'model' | 'software'> {
  const out = { make: null as string | null, model: null as string | null, software: null as string | null }
  if (tiff + 8 > b.length) return out
  const le = b[tiff] === 0x49 && b[tiff + 1] === 0x49
  const u16 = (o: number) => (le ? b[o]! | (b[o + 1]! << 8) : (b[o]! << 8) | b[o + 1]!)
  const u32 = (o: number) => (le ? (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16)) + b[o + 3]! * 0x1000000 : b[o]! * 0x1000000 + ((b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!))
  const ifd = tiff + u32(tiff + 4)
  if (ifd + 2 > b.length) return out
  const n = u16(ifd)
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12
    if (e + 12 > b.length) break
    const tag = u16(e)
    const type = u16(e + 2)
    const count = u32(e + 4)
    if (type !== 2) continue // ASCII only
    const at = count <= 4 ? e + 8 : tiff + u32(e + 8)
    const v = ascii(b, at, Math.min(count, 200)) || null
    if (tag === 0x010f) out.make = v
    else if (tag === 0x0110) out.model = v
    else if (tag === 0x0131) out.software = v
  }
  return out
}

const latin1 = (b: Uint8Array, start: number, end: number) => {
  let s = ''
  for (let i = start; i < end; i++) s += String.fromCharCode(b[i]!)
  return s
}

export function readPhotoOrigin(b: Uint8Array): PhotoOrigin {
  const out: PhotoOrigin = { make: null, model: null, software: null, screenshotTag: false }
  // JPEG: walk the APPn segments for Exif and XMP
  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2
    while (o + 4 < b.length && b[o] === 0xff) {
      const marker = b[o + 1]!
      const len = (b[o + 2]! << 8) | b[o + 3]!
      if (marker === 0xda) break // image data starts
      if (marker === 0xe1) {
        if (latin1(b, o + 4, o + 10) === 'Exif\0\0') Object.assign(out, readIfd0(b, o + 10))
        else if (/Screenshot/i.test(latin1(b, o + 4, Math.min(b.length, o + 2 + len)))) out.screenshotTag = true
      }
      o += 2 + len
    }
    return out
  }
  // PNG: eXIf chunk for camera data, text chunks for screenshot markers
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    let o = 8
    while (o + 8 <= b.length) {
      const len = ((b[o]! << 24) >>> 0) + ((b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!)
      const type = latin1(b, o + 4, o + 8)
      const data = o + 8
      if (type === 'eXIf') Object.assign(out, readIfd0(b, data))
      else if ((type === 'iTXt' || type === 'tEXt') && /Screenshot/i.test(latin1(b, data, Math.min(b.length, data + len)))) out.screenshotTag = true
      if (type === 'IEND') break
      o = data + len + 4
    }
  }
  return out
}

/** Apps that retouch or beautify faces, matched against EXIF Software. */
const EDITORS = [/facetune/i, /meitu/i, /beautyplus/i, /snapseed/i, /lightroom/i, /photoshop/i, /picsart/i, /youcam makeup/i, /perfect365/i, /airbrush/i, /b612/i, /snow\b/i, /faceapp/i, /vsco/i]

export function originWarnings(o: PhotoOrigin, fileName: string): string[] {
  const out: string[] = []
  const editor = o.software && EDITORS.some((re) => re.test(o.software!))
  if (editor) out.push(`This photo was saved by ${o.software}, which can retouch skin — use the original camera photo.`)
  if (o.screenshotTag || /screen ?shot|screenshot/i.test(fileName)) out.push('This looks like a screenshot — use the original photo, not a capture of it.')
  else if (!editor && !o.make && !o.model) out.push('No camera information in this photo, so it may have been edited or re-saved — an original camera photo is more reliable.')
  return out
}
