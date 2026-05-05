// Generates public/icon-192.png and public/icon-512.png
// No external deps — raw PNG construction using zlib built-in
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC = join(__dirname, '../public')

const BG = [14, 14, 14]       // #0e0e0e
const ACCENT = [0, 210, 106]  // #00d26a

function crc32(buf) {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  let crc = 0xffffffff
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crcInput = Buffer.concat([typeBytes, data])
  const crcVal = Buffer.alloc(4)
  crcVal.writeUInt32BE(crc32(crcInput))
  return Buffer.concat([len, typeBytes, data, crcVal])
}

function makePNG(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 2  // color type RGB
  // compression, filter, interlace = 0

  const cx = size / 2
  const cy = size / 2
  const r = size * 0.35

  // Pixel rows: filter byte 0 + RGB per pixel
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    row[0] = 0 // filter none
    for (let x = 0; x < size; x++) {
      const dx = x - cx
      const dy = y - cy
      const [pr, pg, pb] = dx * dx + dy * dy <= r * r ? ACCENT : BG
      const o = 1 + x * 3
      row[o] = pr; row[o + 1] = pg; row[o + 2] = pb
    }
    rows.push(row)
  }

  const idat = deflateSync(Buffer.concat(rows))

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync(join(PUBLIC, 'icon-192.png'), makePNG(192))
writeFileSync(join(PUBLIC, 'icon-512.png'), makePNG(512))
console.log('Generated icon-192.png and icon-512.png')
