import { describe, expect, it } from 'vitest'
import { coverCrop } from '../src/renderer/src/lib/media'

describe('selfie capture crop', () => {
  it('takes the centred 4:5 slice of a wide webcam frame', () => {
    expect(coverCrop(1920, 1080, 4 / 5)).toEqual({ x: 528, y: 0, w: 864, h: 1080 })
  })
  it('trims top and bottom of a tall frame', () => {
    expect(coverCrop(1000, 2000, 4 / 5)).toEqual({ x: 0, y: 375, w: 1000, h: 1250 })
  })
  it('keeps a frame that already matches', () => {
    expect(coverCrop(800, 1000, 4 / 5)).toEqual({ x: 0, y: 0, w: 800, h: 1000 })
  })
})
