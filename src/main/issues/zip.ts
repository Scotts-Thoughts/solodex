// Minimal ZIP writer (store method only, no compression) for "Export .zip".
// PNG screenshots are already compressed, and a single file is far easier for
// a user to email than a folder. Pure Buffer code so it is unit-testable.

export interface ZipEntry {
  /** Forward-slash path inside the archive. */
  name: string
  data: Uint8Array
  mtime?: Date
}

let CRC_TABLE: Uint32Array | null = null

function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  CRC_TABLE = table
  return table
}

export function crc32(bytes: Uint8Array): number {
  const table = crcTable()
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** MS-DOS date/time pair used by the ZIP headers (local time, 2 s resolution). */
export function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear())
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_EOCD = 0x06054b50
const VERSION = 20
const FLAG_UTF8 = 0x0800

export function buildZip(entries: ZipEntry[], now: Date = new Date()): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8')
    const data = Buffer.from(entry.data.buffer, entry.data.byteOffset, entry.data.byteLength)
    const crc = crc32(entry.data)
    const { time, date } = dosDateTime(entry.mtime ?? now)

    const local = Buffer.alloc(30 + name.length)
    local.writeUInt32LE(SIG_LOCAL, 0)
    local.writeUInt16LE(VERSION, 4)
    local.writeUInt16LE(FLAG_UTF8, 6)
    local.writeUInt16LE(0, 8) // method: store
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    name.copy(local, 30)

    const central = Buffer.alloc(46 + name.length)
    central.writeUInt32LE(SIG_CENTRAL, 0)
    central.writeUInt16LE(VERSION, 4) // version made by
    central.writeUInt16LE(VERSION, 6) // version needed
    central.writeUInt16LE(FLAG_UTF8, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30) // extra
    central.writeUInt16LE(0, 32) // comment
    central.writeUInt16LE(0, 34) // disk
    central.writeUInt16LE(0, 36) // internal attrs
    central.writeUInt32LE(0, 38) // external attrs
    central.writeUInt32LE(offset, 42)
    name.copy(central, 46)

    localParts.push(local, data)
    centralParts.push(central)
    offset += local.length + data.length
  }

  const centralSize = centralParts.reduce((n, b) => n + b.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(SIG_EOCD, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, ...centralParts, eocd])
}
