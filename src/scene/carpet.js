import * as THREE from 'three'
import { mulberry32 } from '../lib/rng.js'

/**
 * The office floor's LARGE-scale structure.
 *
 * The photographic carpet set is tiled at roughly 2200 px/m, which is correct
 * for a close shot and invisible in a wide one: at aisle distance the loop pile
 * is far below a pixel, the mip chain averages it away, and the floor resolves
 * to one flat grey. Adding relief does not help — the detail is not too weak,
 * it is too small.
 *
 * What you actually read across an office floor is the 500mm carpet TILE: a
 * checkerboard of alternating pile direction, so adjacent squares catch the
 * overhead light differently, with a slightly darker seam between them. That
 * pattern is metres wide, survives minification, and is the cue that says
 * commercial floor rather than grey plane. It rides as `map` while the
 * photographic normal/roughness keep their own finer repeat for close framings.
 *
 * Seeded, so what is rehearsed is what the room sees.
 */
// 512 across ~8.5m is ~60px per carpet tile: ample for a checkerboard and a
// seam, and a quarter of the resident cost of a full-resolution field. The fine
// pile detail is not here at all — it stays on the photographic normal map.
export function makeCarpetTileMap({ width, depth, tileSize = 15.4, size = 512 }) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = Math.round(size * (depth / width))
  const ctx = canvas.getContext('2d')
  const pxPerUnit = canvas.width / width
  const pzPerUnit = canvas.height / depth
  const rand = mulberry32(0x0ca4be7)

  // Dark. This map REPLACES the photographic diffuse, so it has to land at the
  // same effective albedo the tiled photo did (~0.28) — painted at showroom
  // brightness the floor stops reading as carpet at all and becomes ceramic.
  ctx.fillStyle = '#3e4341'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const cols = Math.ceil(width / tileSize)
  const rows = Math.ceil(depth / tileSize)
  const tilePx = tileSize * pxPerUnit
  const tilePz = tileSize * pzPerUnit

  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      // Quarter-turned pile reads as a value shift, not a colour shift — the
      // fibres are identical, only their facing changes.
      // Subtle on purpose. The same fibre facing two ways is a small specular
      // difference, not two colours; pushed harder it becomes a checkerboard
      // floor, which is a pattern no office has.
      const quarterTurned = (col + row) % 2 === 0
      const drift = (rand() - 0.5) * 0.02
      const value = (quarterTurned ? 0.982 : 1.018) + drift
      const r = Math.round(62 * value)
      const g = Math.round(66 * value)
      const b = Math.round(64 * value)
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
      ctx.fillRect(col * tilePx, row * tilePz, tilePx + 1, tilePz + 1)
    }
  }

  // The seam between tiles. Narrow, and only slightly darker — a laid floor is
  // butted tight, so this must read as a joint and never as a drawn grid.
  const seamPx = Math.max(1, 0.18 * pxPerUnit)
  ctx.fillStyle = 'rgba(44, 48, 46, 0.2)'
  for (let col = 0; col <= cols; col += 1) {
    ctx.fillRect(col * tilePx - seamPx / 2, 0, seamPx, canvas.height)
  }
  for (let row = 0; row <= rows; row += 1) {
    ctx.fillRect(0, row * tilePz - seamPx / 2, canvas.width, seamPx)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}
