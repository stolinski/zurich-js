import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

function channelsFor(colorType) {
  if (colorType === 0) return 1
  if (colorType === 2) return 3
  if (colorType === 3) return 1
  if (colorType === 4) return 2
  if (colorType === 6) return 4
  throw new Error(`Unsupported PNG color type ${colorType}`)
}

function decodeRows(inflated, width, height, bytesPerPixel, stride) {
  const expected = height * (stride + 1)
  if (inflated.length !== expected) {
    throw new Error(`Unexpected PNG payload size ${inflated.length}; expected ${expected}`)
  }

  const rows = Buffer.allocUnsafe(height * stride)
  let sourceOffset = 0
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset]
    sourceOffset += 1
    const rowOffset = y * stride
    const previousOffset = (y - 1) * stride
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x]
      const left = x >= bytesPerPixel ? rows[rowOffset + x - bytesPerPixel] : 0
      const up = y > 0 ? rows[previousOffset + x] : 0
      const upperLeft =
        y > 0 && x >= bytesPerPixel
          ? rows[previousOffset + x - bytesPerPixel]
          : 0
      let value
      if (filter === 0) value = raw
      else if (filter === 1) value = raw + left
      else if (filter === 2) value = raw + up
      else if (filter === 3) value = raw + Math.floor((left + up) / 2)
      else if (filter === 4) value = raw + paeth(left, up, upperLeft)
      else throw new Error(`Unsupported PNG filter ${filter} on row ${y}`)
      rows[rowOffset + x] = value & 0xff
    }
    sourceOffset += stride
  }
  return rows
}

/** Decode deterministic 8-bit, non-interlaced PNGs without third-party packages. */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a PNG file')
  }

  let offset = 8
  let header = null
  let palette = null
  let transparency = null
  const idat = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    offset += length + 12

    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      }
    } else if (type === 'PLTE') {
      palette = data
    } else if (type === 'tRNS') {
      transparency = data
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
  }

  if (!header) throw new Error('PNG has no IHDR chunk')
  if (header.bitDepth !== 8) {
    throw new Error(`Only 8-bit PNGs are supported; got ${header.bitDepth}-bit`)
  }
  if (header.interlace !== 0) {
    throw new Error('Interlaced PNGs are unsupported')
  }
  if (header.compression !== 0 || header.filter !== 0) {
    throw new Error('PNG uses an unsupported compression or filter method')
  }

  const channels = channelsFor(header.colorType)
  const stride = header.width * channels
  const rows = decodeRows(
    inflateSync(Buffer.concat(idat)),
    header.width,
    header.height,
    channels,
    stride
  )
  const rgba = Buffer.allocUnsafe(header.width * header.height * 4)

  for (let pixel = 0; pixel < header.width * header.height; pixel += 1) {
    const source = pixel * channels
    const target = pixel * 4
    if (header.colorType === 6) {
      rgba[target] = rows[source]
      rgba[target + 1] = rows[source + 1]
      rgba[target + 2] = rows[source + 2]
      rgba[target + 3] = rows[source + 3]
    } else if (header.colorType === 2) {
      rgba[target] = rows[source]
      rgba[target + 1] = rows[source + 1]
      rgba[target + 2] = rows[source + 2]
      rgba[target + 3] = 255
    } else if (header.colorType === 0) {
      rgba[target] = rows[source]
      rgba[target + 1] = rows[source]
      rgba[target + 2] = rows[source]
      rgba[target + 3] = 255
    } else if (header.colorType === 4) {
      rgba[target] = rows[source]
      rgba[target + 1] = rows[source]
      rgba[target + 2] = rows[source]
      rgba[target + 3] = rows[source + 1]
    } else if (header.colorType === 3) {
      if (!palette) throw new Error('Indexed PNG has no palette')
      const paletteIndex = rows[source]
      const paletteOffset = paletteIndex * 3
      if (paletteOffset + 2 >= palette.length) {
        throw new Error(`PNG palette index ${paletteIndex} is out of bounds`)
      }
      rgba[target] = palette[paletteOffset]
      rgba[target + 1] = palette[paletteOffset + 1]
      rgba[target + 2] = palette[paletteOffset + 2]
      rgba[target + 3] = transparency?.[paletteIndex] ?? 255
    }
  }

  return {
    width: header.width,
    height: header.height,
    rgba,
    colorType: header.colorType,
    bitDepth: header.bitDepth,
  }
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export async function readPng(path) {
  const file = await readFile(path)
  const decoded = decodePng(file)
  return {
    ...decoded,
    fileSha256: sha256(file),
    pixelSha256: sha256(decoded.rgba),
    bytes: file.length,
  }
}
