import { describe, expect, it } from 'vitest'
import { allOk, boxInCrop, evaluateFace, faceCrop, firstIssue, measureLight, poseFromMatrix, sharpness, type FaceMeasure } from '../src/renderer/src/features/analysis/facecheck'

const light = { mean: 0.55, balance: 0.95, clipped: 0, dark: 0, grid: [[0.55]] }
const good: FaceMeasure = { faces: 1, box: { x: 0.15, y: 0.12, w: 0.7, h: 0.75 }, yaw: 2, pitch: -3, roll: 1, eyesClosed: 0.05, mouthOpen: 0.02, smile: 0.05, light, motion: 0.001 }
const hint = (m: Partial<FaceMeasure>, live = true) => firstIssue(evaluateFace({ ...good, ...m }, { live }))?.hint ?? null

describe('YouCam photo checks', () => {
  it('passes a well-framed, evenly lit, steady face', () => {
    expect(allOk(evaluateFace(good, { live: true }))).toBe(true)
  })
  it('needs exactly one face', () => {
    expect(hint({ faces: 0, box: null })).toMatch(/Bring your face/)
    expect(hint({ faces: 2 })).toMatch(/Only you/)
  })
  it('enforces YouCam’s face-width rule with margin', () => {
    expect(hint({ box: { x: 0.25, y: 0.2, w: 0.5, h: 0.6 } })).toMatch(/Move closer/)
    expect(hint({ box: { x: 0.02, y: 0.02, w: 0.96, h: 0.9 } })).toMatch(/Move back/)
  })
  it('wants the face centered, straight, eyes open, mouth closed', () => {
    expect(hint({ box: { x: 0.28, y: 0.12, w: 0.7, h: 0.75 } })).toMatch(/Center/)
    expect(hint({ yaw: 18 })).toMatch(/straight/)
    expect(hint({ roll: 12 })).toMatch(/level/)
    expect(hint({ eyesClosed: 0.8 })).toMatch(/eyes open/)
    expect(hint({ mouthOpen: 0.5 })).toMatch(/mouth/)
    expect(hint({ smile: 0.8 })).toMatch(/no smile/)
  })
  it('flags dark, blown-out and uneven light', () => {
    expect(hint({ light: { ...light, mean: 0.2 } })).toMatch(/Too dark/)
    expect(hint({ light: { ...light, clipped: 0.1 } })).toMatch(/Too bright/)
    expect(hint({ light: { ...light, balance: 0.6 } })).toMatch(/uneven/)
  })
  it('words hints for an uploaded photo, not a live camera', () => {
    expect(hint({ box: { x: 0.25, y: 0.2, w: 0.5, h: 0.6 } }, false)).toMatch(/closer selfie/)
  })
  it('asks to hold still only in live mode', () => {
    expect(hint({ motion: 0.05 })).toBe('Hold still')
    expect(hint({ motion: null }, false)).toBeNull()
  })
})

describe('measurements', () => {
  it('reads head angles from a transformation matrix', () => {
    expect(poseFromMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toEqual({ pitch: 0, yaw: -0, roll: 0 })
    const a = (20 * Math.PI) / 180 // 20° roll about the view axis
    expect(poseFromMatrix([Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]).roll).toBeCloseTo(20)
  })
  it('expresses the face box in the crop YouCam receives', () => {
    // 1920×1080 frame, centred 864×1080 crop; face spans x 0.35–0.65 of the frame
    const b = boxInCrop([{ x: 0.35, y: 0.2 }, { x: 0.65, y: 0.8 }], 1920, 1080, { x: 528, y: 0, w: 864, h: 1080 })
    expect(b.x).toBeCloseTo((0.35 * 1920 - 528) / 864)
    expect(b.w).toBeCloseTo((0.3 * 1920) / 864)
    expect(b.h).toBeCloseTo(0.6)
  })
  it('measures brightness and left/right balance over the face ellipse', () => {
    const w = 40, h = 50
    const px = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = x < w / 2 ? 60 : 200 // dark left half, bright right half
      px.set([v, v, v, 255], (y * w + x) * 4)
    }
    const l = measureLight(px, w, h)
    expect(l.balance).toBeLessThan(0.4)
    expect(l.grid).toHaveLength(6)
    expect(l.grid[0]).toHaveLength(5)
  })
  it('scores a sharp edge above a flat image', () => {
    const w = 20, h = 20
    const flat = new Uint8ClampedArray(w * h * 4).fill(128)
    const edge = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) edge.set(i % w < 10 ? [0, 0, 0, 255] : [255, 255, 255, 255], i * 4)
    expect(sharpness(edge, w, h)).toBeGreaterThan(sharpness(flat, w, h))
  })
})

describe('upload auto-crop', () => {
  it('crops a 4:5 frame around a small face so it fills ~72% of the width', () => {
    const c = faceCrop({ x: 0.4, y: 0.3, w: 0.2, h: 0.3 }, 3000, 4000)!
    expect(c.w / c.h).toBeCloseTo(0.8, 2)
    expect((0.2 * 3000) / c.w).toBeCloseTo(0.72, 1)
    expect(c.x).toBeGreaterThanOrEqual(0)
    expect(c.y + c.h).toBeLessThanOrEqual(4000)
  })
  it('refuses when the crop would drop below YouCam’s 480px minimum', () => {
    expect(faceCrop({ x: 0.45, y: 0.45, w: 0.1, h: 0.12 }, 1200, 1500)).toBeNull()
  })
})
