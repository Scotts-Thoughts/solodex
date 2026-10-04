// Streams a zip to disk: images are stored (already compressed), JSON and
// binary blobs deflated. Read back by src/main/maps/zip.ts (no zip64).

import fs from 'fs'
import zlib from 'zlib'

interface Written {
  name: Buffer
  method: number
  crc: number
  compressedSize: number
  size: number
  offset: number
}

export class ZipWriter {
  private readonly fd: number
  private offset = 0
  private readonly written: Written[] = []
  private readonly names = new Set<string>()

  constructor(readonly path: string) {
    this.fd = fs.openSync(path, 'w')
  }

  get bytes(): number {
    return this.offset
  }

  get count(): number {
    return this.written.length
  }

  add(name: string, data: Buffer, opts: { deflate?: boolean } = {}): void {
    if (this.names.has(name)) throw new Error(`zip: duplicate entry ${name}`)
    this.names.add(name)
    const nameBuf = Buffer.from(name, 'utf8')
    const deflated = opts.deflate ? zlib.deflateRawSync(data, { level: 9 }) : null
    const body = deflated && deflated.length < data.length ? deflated : data
    const method = body === data ? 0 : 8
    const crc = zlib.crc32(data)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4) // version needed
    header.writeUInt16LE(0x0800, 6) // UTF-8 names
    header.writeUInt16LE(method, 8)
    header.writeUInt32LE(0, 10) // time/date
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(body.length, 18)
    header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(nameBuf.length, 26)
    header.writeUInt16LE(0, 28)
    this.written.push({ name: nameBuf, method, crc, compressedSize: body.length, size: data.length, offset: this.offset })
    this.write(header)
    this.write(nameBuf)
    this.write(body)
    if (this.offset > 0xffffffff || this.written.length >= 0xffff) throw new Error('zip: too large (zip64 is not supported)')
  }

  close(): void {
    const cdStart = this.offset
    for (const w of this.written) {
      const h = Buffer.alloc(46)
      h.writeUInt32LE(0x02014b50, 0)
      h.writeUInt16LE(20, 4) // made by
      h.writeUInt16LE(20, 6) // needed
      h.writeUInt16LE(0x0800, 8)
      h.writeUInt16LE(w.method, 10)
      h.writeUInt32LE(0, 12)
      h.writeUInt32LE(w.crc, 16)
      h.writeUInt32LE(w.compressedSize, 20)
      h.writeUInt32LE(w.size, 24)
      h.writeUInt16LE(w.name.length, 28)
      h.writeUInt32LE(w.offset, 42)
      this.write(h)
      this.write(w.name)
    }
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(this.written.length, 8)
    eocd.writeUInt16LE(this.written.length, 10)
    eocd.writeUInt32LE(this.offset - cdStart, 12)
    eocd.writeUInt32LE(cdStart, 16)
    this.write(eocd)
    fs.closeSync(this.fd)
  }

  private write(buf: Buffer): void {
    fs.writeSync(this.fd, buf)
    this.offset += buf.length
  }
}
