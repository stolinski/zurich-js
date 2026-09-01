import * as THREE from 'three'
import { mulberry32 } from '../lib/rng.js'

/**
 * The suspended ceiling, as filtered texture.
 *
 * `OfficeDetails` models a real T-grid and correctly fades it out once a member
 * projects below ~1.5px (QUALITY Q1 — thin repeated geometry is a projector
 * moiré generator). But it faded to NOTHING, so at every wide framing the
 * ceiling became a flat dark plane with lit rectangles floating in it. Q1 allows
 * a member to disappear when it "becomes a filtered texture"; this is that
 * texture, and the modeled grid now crossfades into it instead of into a void.
 *
 * It also carries the TROFFER WASH. A recessed fluorescent always brightens the
 * tile around its lens — the lens is proud of the grid and mineral fibre is
 * highly reflective — and without it the fixtures read as gray cards floating in
 * a dark ceiling rather than as sources. Baking it here rather than adding
 * runtime lights follows the compositing policy: authored static irradiance on a
 * simplified receiver, not another punctual source per fixture.
 *
 * Everything is seeded, so what is rehearsed is what the room sees.
 */

/**
 * @param {object} plane world extents of the receiving ceiling plane
 * @param {number} plane.width   size along world X
 * @param {number} plane.depth   size along world Z
 * @param {number} plane.centerZ world Z of the plane's centre
 * @param {Array<[number, number, number]>} fixtures world fixture positions
 * @param {object} fixtureSize   world footprint of one diffuser
 */
function paintCeiling({ plane, fixtures, fixtureSize, tileSpacing }, size = 1024) {
  const canvas = document.createElement('canvas')
  const aspect = plane.depth / plane.width
  canvas.width = size
  canvas.height = Math.round(size * aspect)
  const ctx = canvas.getContext('2d')
  const pxPerUnit = canvas.width / plane.width
  const pzPerUnit = canvas.height / plane.depth

  const toU = (x) => (x / plane.width + 0.5) * canvas.width
  const toV = (z) => ((z - plane.centerZ) / plane.depth + 0.5) * canvas.height

  return { canvas, ctx, pxPerUnit, pzPerUnit, toU, toV, tileSpacing }
}

/** Mineral-fibre tiles with a seeded per-tile value shift, plus the T-bar. */
function paintTiles(target, plane) {
  const { canvas, ctx, pxPerUnit, toU, toV, tileSpacing } = target
  const rand = mulberry32(0x0ce111a6)

  ctx.fillStyle = '#8d938f'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Real tiles are never one value. The variation is small and low-frequency,
  // which is exactly what survives minification.
  for (let x = -plane.width / 2; x < plane.width / 2; x += tileSpacing) {
    for (
      let z = plane.centerZ - plane.depth / 2;
      z < plane.centerZ + plane.depth / 2;
      z += tileSpacing
    ) {
      const shade = 0.93 + rand() * 0.14
      const value = Math.round(141 * shade)
      ctx.fillStyle = `rgb(${value}, ${Math.round(value * 1.04)}, ${Math.round(value * 1.01)})`
      ctx.fillRect(
        toU(x),
        toV(z),
        tileSpacing * pxPerUnit + 1,
        tileSpacing * pxPerUnit + 1
      )
    }
  }

  // T-bar at its REAL width. The modeled grid uses 0.12 units (3.9mm), which is
  // a quarter of an actual 24mm tee and is most of why it aliased; drawn at true
  // size into a mipmapped map it resolves cleanly instead.
  //
  // DARKER than the tile. A tee is a recess between two proud tiles, so at any
  // distance it reads as a shadow line — painting it brighter turned the ceiling
  // into a glowing wireframe rather than a ceiling.
  const barPx = Math.max(1, 0.74 * pxPerUnit)
  ctx.fillStyle = 'rgba(74, 80, 78, 0.72)'
  for (let x = -plane.width / 2; x <= plane.width / 2; x += tileSpacing) {
    ctx.fillRect(toU(x) - barPx / 2, 0, barPx, canvas.height)
  }
  for (
    let z = plane.centerZ - plane.depth / 2;
    z <= plane.centerZ + plane.depth / 2;
    z += tileSpacing
  ) {
    ctx.fillRect(0, toV(z) - barPx / 2, canvas.width, barPx)
  }
}

/** The wash each recessed lens throws onto its surrounding tile. */
function paintWash(target, fixtures, fixtureSize) {
  const { canvas, ctx, pxPerUnit, pzPerUnit, toU, toV } = target

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Elongated along the fixture's own long axis, because the spill from a 4ft
  // lens is not circular. One radial gradient drawn into a squashed space is
  // the ellipse: scale y so a circle of radiusPx becomes reachZ deep.
  const radiusPx = fixtureSize.width * 1.9 * pxPerUnit
  const depthPx = fixtureSize.depth * 6.4 * pzPerUnit

  ctx.globalCompositeOperation = 'lighter'
  for (const [x, , z] of fixtures) {
    ctx.save()
    ctx.translate(toU(x), toV(z))
    ctx.scale(1, depthPx / radiusPx)
    const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusPx)
    wash.addColorStop(0, 'rgba(232, 245, 239, 0.9)')
    wash.addColorStop(0.3, 'rgba(198, 214, 208, 0.44)')
    wash.addColorStop(0.62, 'rgba(150, 166, 161, 0.15)')
    wash.addColorStop(1, 'rgba(120, 134, 130, 0)')
    ctx.fillStyle = wash
    ctx.beginPath()
    ctx.arc(0, 0, radiusPx, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.globalCompositeOperation = 'source-over'
}

function finish(canvas, colorSpace, anisotropy) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = colorSpace
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  texture.anisotropy = anisotropy
  texture.needsUpdate = true
  return texture
}

/**
 * Build the ceiling's colour map and the emissive wash map for one plane.
 * The caller owns disposal.
 */
export function makeCeilingMaps({ plane, fixtures, fixtureSize, tileSpacing = 16, anisotropy = 8 }) {
  // The colour map needs enough resolution to draw a 24mm tee; the wash is
  // nothing but smooth gradients, so it runs at a quarter of the footprint and
  // keeps the resident texture budget (QUALITY Q3, ≤80 MiB total) intact.
  const tiles = paintCeiling({ plane, fixtures, fixtureSize, tileSpacing }, 1024)
  paintTiles(tiles, plane)

  const wash = paintCeiling({ plane, fixtures, fixtureSize, tileSpacing }, 512)
  paintWash(wash, fixtures, fixtureSize)

  return {
    map: finish(tiles.canvas, THREE.SRGBColorSpace, anisotropy),
    emissiveMap: finish(wash.canvas, THREE.SRGBColorSpace, anisotropy),
  }
}
