// Generates LifeOS icon assets without external image dependencies.
/* eslint-disable @typescript-eslint/no-require-imports */
const { deflateSync } = require('node:zlib')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

const PUBLIC = join(__dirname, '../public')
const APP = join(__dirname, '../app')

const BG = [14, 14, 14, 255]
const WHITE = [237, 237, 237, 255]
const ACCENT = [183, 255, 28, 255]

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="LifeOS icon">
  <rect width="512" height="512" rx="112" fill="#0e0e0e"/>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M147 338a157 157 0 0 1 105-239" stroke="#ededed" stroke-width="16"/>
    <path d="M205 397a157 157 0 0 0 216-107" stroke="#ededed" stroke-width="16"/>
    <path d="M282 98a157 157 0 0 1 131 126" stroke="#b7ff1c" stroke-width="16"/>
    <g stroke="#ededed" stroke-width="13">
      <path d="M256 158v196"/>
      <path d="M158 256h196"/>
      <path d="M187 187l138 138"/>
      <path d="M325 187 187 325"/>
      <path d="M256 256 211 147"/>
      <path d="M256 256 301 147"/>
      <path d="M256 256 211 365"/>
      <path d="M256 256 301 365"/>
    </g>
    <g fill="#0e0e0e" stroke="#ededed" stroke-width="13">
      <circle cx="256" cy="256" r="35"/>
      <circle cx="256" cy="137" r="21"/>
      <circle cx="256" cy="375" r="21"/>
      <circle cx="137" cy="256" r="21"/>
      <circle cx="375" cy="256" r="21"/>
      <circle cx="172" cy="172" r="21"/>
      <circle cx="340" cy="172" r="21"/>
      <circle cx="172" cy="340" r="21"/>
      <circle cx="340" cy="340" r="21"/>
    </g>
  </g>
</svg>
`

function crc32(buf) {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
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
  const crcVal = Buffer.alloc(4)
  crcVal.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([len, typeBytes, data, crcVal])
}

function blend(dst, src) {
  const alpha = src[3] / 255
  return [
    Math.round(src[0] * alpha + dst[0] * (1 - alpha)),
    Math.round(src[1] * alpha + dst[1] * (1 - alpha)),
    Math.round(src[2] * alpha + dst[2] * (1 - alpha)),
    255,
  ]
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax
  const vy = by - ay
  const wx = px - ax
  const wy = py - ay
  const c1 = vx * wx + vy * wy
  const c2 = vx * vx + vy * vy
  const t = c2 === 0 ? 0 : Math.max(0, Math.min(1, c1 / c2))
  const x = ax + t * vx
  const y = ay + t * vy
  return Math.hypot(px - x, py - y)
}

function strokeCoverage(distance, width) {
  return Math.max(0, Math.min(1, width / 2 + 0.7 - distance))
}

function angleInArc(angle, start, end) {
  const twoPi = Math.PI * 2
  let a = (angle + twoPi) % twoPi
  let s = (start + twoPi) % twoPi
  let e = (end + twoPi) % twoPi
  if (s <= e) return a >= s && a <= e
  return a >= s || a <= e
}

function drawStroke(pixel, coverage, color) {
  if (coverage <= 0) return pixel
  return blend(pixel, [color[0], color[1], color[2], Math.round(color[3] * Math.min(1, coverage))])
}

function sampleIcon(size, x, y) {
  let pixel = BG

  const cx = size / 2
  const cy = size / 2
  const scale = size / 512
  const ringR = 157 * scale
  const ringW = 16 * scale
  const spokeW = 13 * scale
  const dotR = 21 * scale
  const hubR = 35 * scale

  const dx = x - cx
  const dy = y - cy
  const dist = Math.hypot(dx, dy)
  const angle = Math.atan2(dy, dx)
  const ringCoverage = strokeCoverage(Math.abs(dist - ringR), ringW)

  if (ringCoverage > 0 && angleInArc(angle, 2.55, 4.65)) pixel = drawStroke(pixel, ringCoverage, WHITE)
  if (ringCoverage > 0 && angleInArc(angle, 4.82, 6.08)) pixel = drawStroke(pixel, ringCoverage, ACCENT)
  if (ringCoverage > 0 && angleInArc(angle, 0.07, 2.03)) pixel = drawStroke(pixel, ringCoverage, WHITE)

  const points = [
    [256, 137], [256, 375], [137, 256], [375, 256],
    [172, 172], [340, 172], [172, 340], [340, 340],
  ].map(([px, py]) => [px * scale, py * scale])

  for (const [px, py] of points) {
    pixel = drawStroke(pixel, strokeCoverage(distToSegment(x, y, cx, cy, px, py), spokeW), WHITE)
  }

  for (const [px, py] of points) {
    const d = Math.hypot(x - px, y - py)
    pixel = drawStroke(pixel, strokeCoverage(Math.abs(d - dotR), spokeW), WHITE)
    if (d < dotR - spokeW / 2) pixel = BG
  }

  const hubD = Math.hypot(dx, dy)
  pixel = drawStroke(pixel, strokeCoverage(Math.abs(hubD - hubR), spokeW), WHITE)
  if (hubD < hubR - spokeW / 2) pixel = BG

  return [pixel[0], pixel[1], pixel[2], 255]
}

function makePNG(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6

  const rows = []
  const samples = 3
  const total = samples * samples
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4)
    row[0] = 0
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0]
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const p = sampleIcon(size, x + (sx + 0.5) / samples, y + (sy + 0.5) / samples)
          for (let i = 0; i < 4; i++) acc[i] += p[i]
        }
      }
      const o = 1 + x * 4
      for (let i = 0; i < 4; i++) row[o + i] = Math.round(acc[i] / total)
    }
    rows.push(row)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function makeIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  let offset = 6 + images.length * 16
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16)
    entry[0] = size === 256 ? 0 : size
    entry[1] = size === 256 ? 0 : size
    entry[2] = 0
    entry[3] = 0
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    return entry
  })

  return Buffer.concat([header, ...entries, ...images.map(({ data }) => data)])
}

writeFileSync(join(PUBLIC, 'lifeos-icon.svg'), svg)
writeFileSync(join(PUBLIC, 'icon-192.png'), makePNG(192))
writeFileSync(join(PUBLIC, 'icon-512.png'), makePNG(512))
writeFileSync(join(PUBLIC, 'apple-touch-icon.png'), makePNG(180))
writeFileSync(join(APP, 'icon.png'), makePNG(192))
writeFileSync(join(APP, 'apple-icon.png'), makePNG(180))
writeFileSync(join(APP, 'favicon.ico'), makeIco([
  { size: 16, data: makePNG(16) },
  { size: 32, data: makePNG(32) },
  { size: 48, data: makePNG(48) },
]))
console.log('Generated LifeOS icon SVG, PNGs, Apple touch icon, and favicon')
