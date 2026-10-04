// A minimal random-access zip reader: the central directory is read once, then
// each entry is read on demand. Supports stored and deflated entries (all the
// map packs use), not zip64 or encryption. Also used by scripts/build-maps to
// read the XP router's imagery.zip.

import fs from 'fs'
import zlib from 'zlib'

interface ZipEntry {
  method: number
  compressedSize: number
  size: number
  headerOffset: number
  /** resolved from the local header on first read */
  dataOffset?: number
}

export class ZipFile {
  private constructor(
    private readonly fd: fs.promises.FileHandle,
    readonly path: string,
    private readonly entries: Map<string, ZipEntry>,
  ) {}

  static async open(path: string): Promise<ZipFile> {
    const fd = await fs.promises.open(path, 'r')
    try {
      const { size } = await fd.stat()
      // End of central directory: 22 bytes plus up to 64 KiB of comment
      const tailLen = Math.min(size, 22 + 0xffff)
      const tail = Buffer.alloc(tailLen)
      await fd.read(tail, 0, tailLen, size - tailLen)
      let eocd = -1
      for (let i = tailLen - 22; i >= 0; i--) {
        if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
      }
      if (eocd < 0) throw new Error(`${path}: not a zip file`)
      const count = tail.readUInt16LE(eocd + 10)
      const cdSize = tail.readUInt32LE(eocd + 12)
      const cdOffset = tail.readUInt32LE(eocd + 16)
      if (count === 0xffff || cdOffset === 0xffffffff) throw new Error(`${path}: zip64 is not supported`)
      const cd = Buffer.alloc(cdSize)
      await fd.read(cd, 0, cdSize, cdOffset)
      const entries = new Map<string, ZipEntry>()
      let p = 0
      for (let i = 0; i < count; i++) {
        if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error(`${path}: bad central directory`)
        const method = cd.readUInt16LE(p + 10)
        const compressedSize = cd.readUInt32LE(p + 20)
        const size = cd.readUInt32LE(p + 24)
        const nameLen = cd.readUInt16LE(p + 28)
        const extraLen = cd.readUInt16LE(p + 30)
        const commentLen = cd.readUInt16LE(p + 32)
        const headerOffset = cd.readUInt32LE(p + 42)
        const name = cd.toString('utf8', p + 46, p + 46 + nameLen)
        entries.set(name, { method, compressedSize, size, headerOffset })
        p += 46 + nameLen + extraLen + commentLen
      }
      return new ZipFile(fd, path, entries)
    } catch (err) {
      await fd.close()
      throw err
    }
  }

  names(): string[] {
    return [...this.entries.keys()]
  }

  has(name: string): boolean {
    return this.entries.has(name)
  }

  /** The entry's bytes, or null when the zip has no such entry. */
  async read(name: string): Promise<Buffer | null> {
    const e = this.entries.get(name)
    if (!e) return null
    if (e.dataOffset === undefined) {
      const local = Buffer.alloc(30)
      await this.fd.read(local, 0, 30, e.headerOffset)
      if (local.readUInt32LE(0) !== 0x04034b50) throw new Error(`${this.path}: bad local header for ${name}`)
      e.dataOffset = e.headerOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28)
    }
    const raw = Buffer.alloc(e.compressedSize)
    await this.fd.read(raw, 0, e.compressedSize, e.dataOffset)
    if (e.method === 0) return raw
    if (e.method === 8) return zlib.inflateRawSync(raw)
    throw new Error(`${this.path}: ${name} uses unsupported compression ${e.method}`)
  }

  async close(): Promise<void> {
    await this.fd.close()
  }
}
