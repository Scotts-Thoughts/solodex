import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import { ZipFile } from '../zip'
import { ZipWriter } from '../../../../scripts/build-maps/zipWriter'
import { TILE, levelsFor, writePyramid } from '../../../../scripts/build-maps/pyramid'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'solodex-maps-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('map pack zips', () => {
  it('reads back stored and deflated entries', async () => {
    const file = path.join(dir, 'roundtrip.zip')
    const w = new ZipWriter(file)
    const json = Buffer.from(JSON.stringify({ hello: 'world', list: Array.from({ length: 200 }, (_, i) => i) }))
    const bin = Buffer.from([0, 1, 2, 3, 255])
    w.add('pack.json', json, { deflate: true })
    w.add('sprites/0.png', bin)
    w.add('interiors/ünïcode.webp', Buffer.from('x'))
    w.close()

    const z = await ZipFile.open(file)
    expect(z.names().sort()).toEqual(['interiors/ünïcode.webp', 'pack.json', 'sprites/0.png'])
    expect((await z.read('pack.json'))!.equals(json)).toBe(true)
    expect((await z.read('sprites/0.png'))!.equals(bin)).toBe(true)
    expect((await z.read('interiors/ünïcode.webp'))!.toString()).toBe('x')
    expect(await z.read('missing')).toBeNull()
    await z.close()
  })

  it('rejects duplicate entries', () => {
    const w = new ZipWriter(path.join(dir, 'dup.zip'))
    w.add('a', Buffer.from('1'))
    expect(() => w.add('a', Buffer.from('2'))).toThrow(/duplicate/)
    w.close()
  })
})

describe('tile pyramids', () => {
  it('needs one level per halving until a tile covers the surface', () => {
    expect(levelsFor(512, 300)).toBe(1)
    expect(levelsFor(513, 10)).toBe(2)
    expect(levelsFor(15360, 15360)).toBe(6)
  })

  it('skips empty tiles and downsamples without darkening transparent edges', async () => {
    const file = path.join(dir, 'pyramid.zip')
    const w = new ZipWriter(file)
    // 1024×512: tile (0, 0) is opaque red on its right half only, tile (1, 0) is empty
    const surface = await writePyramid(w, 'world', 1024, 512, (tx) => {
      if (tx === 1) return null
      const data = Buffer.alloc(TILE * TILE * 4)
      for (let y = 0; y < TILE; y++) for (let x = TILE / 2; x < TILE; x++) data.set([255, 0, 0, 255], (y * TILE + x) * 4)
      return data
    }, { mode: 'lossless' })
    w.close()
    expect(surface.levels).toBe(2)
    expect(surface.tiles).toEqual([['0_0'], ['0_0']])

    const z = await ZipFile.open(file)
    expect(z.has('world/0/1_0.webp')).toBe(false)
    const { data, info } = await sharp((await z.read('world/1/0_0.webp'))!).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    await z.close()
    // the level-1 tile holds tile (0, 0) halved in its top-left quadrant
    const px = (x: number, y: number) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)]
    expect(px(200, 100)).toEqual([255, 0, 0, 255])
    expect(px(50, 100)[3]).toBe(0)
    expect(px(400, 100)[3]).toBe(0)
  })
})
