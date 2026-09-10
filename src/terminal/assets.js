import { PHOSPHOR } from './theme.js'

/**
 * `silhouette` fills the artwork's own alpha with phosphor — right for a logo,
 * which is a flat shape, and catastrophic for a photograph, which would come
 * back as a solid amber rectangle. `duotone` keeps the image's LUMINANCE and
 * takes the hue from phosphor, so a photo stays a photo and still lands on the
 * one-hue ladder the glass is built on.
 */
const SOURCES = Object.freeze({
  syntax: { src: '/logos/syntax.svg', tone: 'silhouette' },
  sentry: { src: '/logos/sentry.svg', tone: 'silhouette' },
  // The code is drawn a thousand pixels wide and has to SCAN from the back of
  // a room, so it is rasterised at two pixels per SVG unit (40 px modules) and
  // never downsampled below the size it is drawn at. Its modules are tinted
  // GLASS, not phosphor: the painter lays it on an amber panel, because a
  // light-on-dark code only decodes on scanners that try inverted polarity.
  qr: { src: '/logos/qr.svg', tone: 'silhouette', raster: 1480, tint: PHOSPHOR.glass },
  robAvatar: { src: '/rob/avatar.png', tone: 'duotone' },
  robPhoto: { src: '/rob/hospital.jpg', tone: 'duotone' },
})

const assets = new Map()
let loading

function tintImage(image, color, tone, raster = 1024) {
  const scale = Math.min(1, raster / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))

  const ctx = canvas.getContext('2d')
  if (tone === 'duotone') {
    // Amber underneath, the photograph's luminance on top. `luminosity` keeps
    // the hue and saturation already on the canvas and takes only the lightness
    // from the source, which is exactly a duotone print.
    ctx.fillStyle = color
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'luminosity'
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  } else {
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = color
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.globalCompositeOperation = 'source-over'
  return canvas
}

function loadAsset(id, { src, tone, raster, tint = PHOSPHOR.phosphor }) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      assets.set(id, tintImage(image, tint, tone, raster))
      resolve()
    }
    image.onerror = () => reject(new Error(`Unable to load terminal asset: ${src}`))
    image.src = src
  })
}

/** Load and tint all screen artwork before the presentation begins painting. */
export function ensureTerminalAssets() {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return Promise.resolve()
  }
  loading ??= Promise.all(
    Object.entries(SOURCES).map(([id, source]) => loadAsset(id, source))
  )
  return loading
}

export function getTerminalAsset(id) {
  return assets.get(id) ?? null
}
