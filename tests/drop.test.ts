import { describe, expect, it } from 'vitest'
import { classifyDrop, dropUrl } from '@shared/drop'

const file = (type: string, size = 1000, name = 'x') => ({ name, type, size })

describe('dropping onto the island', () => {
  it('accepts product photos and picks the first image among several files', () => {
    expect(classifyDrop({ files: [file('image/png')] })).toEqual({ kind: 'image', index: 0 })
    expect(classifyDrop({ files: [file('application/pdf'), file('image/webp')] })).toEqual({ kind: 'image', index: 1 })
  })

  it('rejects other files and oversized images with a short reason', () => {
    expect(classifyDrop({ files: [file('application/pdf')] })).toMatchObject({ kind: 'reject', message: expect.stringMatching(/product photo/) })
    expect(classifyDrop({ files: [file('image/gif')] }).kind).toBe('reject')
    expect(classifyDrop({ files: [file('image/jpeg', 20 * 1024 * 1024)] })).toMatchObject({ kind: 'reject', message: expect.stringMatching(/too large/) })
  })

  it('accepts http(s) product links from a uri-list or plain text', () => {
    expect(classifyDrop({ files: [], uriList: '# from Safari\nhttps://www.nykaa.com/minimalist-serum/p/123' })).toEqual({ kind: 'link', url: 'https://www.nykaa.com/minimalist-serum/p/123' })
    expect(classifyDrop({ files: [], text: '  https://beminimalist.co/products/niacinamide  ' }).kind).toBe('link')
  })

  it('rejects non-web links, local addresses without a domain, and image links', () => {
    for (const bad of ['file:///Users/me/a.html', 'javascript:alert(1)', 'http://localhost/x', 'https://user:pw@example.com/', 'just some text']) expect(dropUrl(bad)).toBeNull()
    expect(classifyDrop({ files: [], uriList: 'https://cdn.shop.com/img/serum.jpg?w=800' })).toMatchObject({ kind: 'reject', message: expect.stringMatching(/link to an image/) })
    expect(classifyDrop({ files: [], text: '' }).kind).toBe('reject')
  })
})
