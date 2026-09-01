import { getStage } from './stages.js'

/**
 * Does this slide bypass post-processing entirely?
 *
 * ONLY a flat passthrough does — the screen covering the frame with `tube: 0`,
 * which is the cold open's whole trick and has to reach the projector as a
 * bit-exact canvas. That is a narrower thing than "the screen fills the frame",
 * and conflating the two cost the talk its entire data run: twenty-six
 * glass-filling slides are `tube: 1`, a full-frame CATHODE RAY TUBE, and they
 * were being drawn with no exposure, no ACES and no bloom while the identical
 * tube sitting in a room three slides earlier got all three. The mask and the
 * peak-normalised scanline beam cost roughly 45% of the frame's mean, and on
 * those slides nothing was left to put it back.
 *
 * Lives here, next to the authoring contract, because two very different
 * consumers have to agree on it exactly — Effects, which fades post, and
 * CameraRig, which tags each flight's endpoints — and when they disagreed the
 * post mix popped on settle.
 */
export function bypassesPost(slide) {
  return Boolean(slide?.camera?.fillScreen) && (slide?.crt?.tube ?? 0) === 0
}

function assertVector(value, field, slideId) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => !Number.isFinite(item))) {
    throw new Error(`Slide "${slideId}" must provide ${field} as three finite numbers`)
  }
}

/**
 * Validate the authoring file once at module initialization.
 *
 * Runtime code can then treat every slide as a known deterministic snapshot
 * rather than defending against malformed stage or camera declarations during
 * a camera move. This intentionally does not add inheritance: session fallback
 * remains the deck's one explicit carry-forward rule.
 */
export function defineSlides(specs) {
  if (!Array.isArray(specs) || specs.length === 0) {
    throw new Error('The presentation must contain at least one slide')
  }

  const ids = new Set()
  for (const slide of specs) {
    if (!slide?.id || typeof slide.id !== 'string') {
      throw new Error('Every presentation slide needs a string id')
    }
    if (ids.has(slide.id)) throw new Error(`Duplicate slide id "${slide.id}"`)
    ids.add(slide.id)
    getStage(slide.stage)

    if (!slide.camera || typeof slide.camera !== 'object') {
      throw new Error(`Slide "${slide.id}" needs a camera cue`)
    }
    assertVector(slide.camera.target, 'camera.target', slide.id)
    if (!slide.camera.fillScreen) assertVector(slide.camera.pos, 'camera.pos', slide.id)
    if (
      slide.camera.smoothTime !== undefined &&
      (!Number.isFinite(slide.camera.smoothTime) || slide.camera.smoothTime <= 0)
    ) {
      throw new Error(`Slide "${slide.id}" camera.smoothTime must be positive`)
    }
    if (
      slide.camera.fov !== undefined &&
      (!Number.isFinite(slide.camera.fov) || slide.camera.fov < 20 || slide.camera.fov > 70)
    ) {
      throw new Error(`Slide "${slide.id}" camera.fov must be between 20 and 70 degrees`)
    }
  }

  const coldOpen = specs[0]
  if (
    coldOpen.id !== 'cold-open' ||
    coldOpen.stage !== 'home' ||
    coldOpen.camera.fillScreen !== true ||
    coldOpen.crt?.tube !== 0 ||
    coldOpen.phosphor
  ) {
    throw new Error('The first slide must preserve the flat home-stage cold-open contract')
  }

  return specs
}
