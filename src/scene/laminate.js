import * as THREE from 'three'
import { mulberry32 } from '../lib/rng.js'

/**
 * The office worktop's albedo.
 *
 * The desk is the largest bright surface in every cubicle framing and it was a
 * single flat colour — no map at all, and a plaster normal at scale 0.045,
 * which is close enough to zero that nothing survived to the pixels. A slab of
 * uniform cream under ten troffers is the most reliable clay tell in the set,
 * because a real surface is never one value: your eye expects the value to
 * BREAK UP under a highlight and reads paint or plastic when it does not.
 *
 * What commercial laminate actually looks like is a fine two-tone fleck pressed
 * into a warm off-white ground — a photographic print, so the structure is pure
 * colour with no relief behind it. That is why this is a `map` and not a normal
 * map, and why the fleck is allowed to be small: a texture mips, so at aisle
 * distance the flecks average cleanly back to the base value instead of
 * crawling, which is exactly the failure mode a COMPUTED pattern would have
 * here (QUALITY Q1).
 *
 * Painted near white on purpose. `map` multiplies `color`, so the material's
 * authored cream stays the anchor and this only supplies the variation; a map
 * with a mean below 1 would silently darken the whole desk and re-tune the
 * stage's exposure by accident. For the same reason the light and dark flecks
 * are balanced against each other rather than laid over a tinted ground.
 *
 * Seeded, so what is rehearsed is what the room sees.
 */
export function makeLaminateMap({ tileUnits = 10, size = 512 } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const rand = mulberry32(0x1a3a1a7)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)

  // Fleck only, and no broad mottle underneath it. Slow tonal drift is what a
  // real laminate sheet has, but a TILED map cannot carry it: the drift repeats
  // with the tile, so four soft clouds across a desk read as spills rather than
  // as material. The broad variation on this surface is the room's job — it
  // comes from the fixture reflections, which are real and do not repeat.
  //
  // Deliberately low contrast. The fleck's job is to break a highlight up, not
  // to be seen; at the alpha this first shipped with, the desk read as dirty.
  const fleckCount = Math.round(size * size * 0.055)
  for (let i = 0; i < fleckCount; i += 1) {
    const x = rand() * size
    const y = rand() * size
    const radius = 0.4 + rand() * rand() * 1.35
    const dark = rand() > 0.45
    ctx.fillStyle = dark
      ? `rgba(104, 97, 84, ${0.03 + rand() * 0.06})`
      : `rgba(255, 253, 247, ${0.08 + rand() * 0.12})`
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  // The worktop is 40 units across, so this lands one tile per `tileUnits` of
  // desk. Anisotropy matters more here than anywhere else in the set: the desk
  // is the surface most often seen at a grazing angle.
  texture.repeat.set(40 / tileUnits, 38 / tileUnits)
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}
