import * as THREE from 'three'

/**
 * Shared stage-level look presets. These are deliberately tied to physical
 * contexts, never slide ids, so future representations inherit the same
 * exposure, environment, and motivated-source hierarchy.
 */
export const STAGE_LOOK_PRESETS = Object.freeze({
  home: {
    environment: { intensity: 1.05, rotation: [0, 0.08, 0] },
    atmosphere: { color: '#0f0d07', density: 0 },
    lights: {
      ambient: 0.01,
      // The brightest object in the frame has to be the thing lighting it. At
      // 11 against a 14 point fill, a neutral stand-in was out-driving the
      // monitor: the keyboard 40cm from a blazing faceplate picked up no amber
      // gradient and the mug had no lit screen-side edge. The rectangle IS the
      // source; the point is only there to keep the glass-to-chin seam open.
      screen: 28,
      localFill: 5,
      doorway: 4600,
      oppositeRim: 3.4,
      backWall: 5.2,
      officeSide: 0,
    },
    // `screenGain` is the HDR drive on the glass itself for object views. The
    // canvas is LDR, so without it the phosphor tops out at 1.0 pre-ACES and
    // the tone map rolls the "only light source in the room" down to mid-gray.
    // Gain puts the glass on the ACES shoulder where an emissive belongs and
    // gives bloom something real to pick up. Flat slides force it back to 1 so
    // the cold open stays a bit-exact canvas.
    post: { exposure: 1.3, bloom: 0.42, vignette: 0.08, dither: 0.2, screenGain: 1.9 },
    // Diffuse reflectance of the faceplate itself (CRTScreen's uHaze). It is
    // what stops a dark screen resolving to absolute black head-on.
    glassHaze: [0.011, 0.012, 0.013],
  },
  cubicle: {
    // Rotation is zero and must stay zero: the office environment is cast from
    // the room's own geometry, so turning it would slide the fixture rows off
    // the ceiling they belong to. 0.24 was the old borrowed-HDR level — near
    // enough to off that no office surface returned a highlight at all.
    environment: { intensity: 0.5, rotation: [0, 0, 0] },
    // FogExp2 squares the density term, so 0.00115 was ~5% attenuation across
    // the ENTIRE aisle — the foreground partition, the hero bay and the fourth
    // bay back all landed on the same value and the set read as one flat plane.
    // 0.0031 puts ~45% on the far termination while leaving the foreground under
    // 2%, which is the separation that makes the repetition read as depth.
    atmosphere: { color: '#303533', density: 0.0031 },
    lights: {
      ambient: 0.006,
      screen: 1.1,
      localFill: 0,
      doorway: 0,
      oppositeRim: 0,
      backWall: 0,
      officeSide: 2.4,
    },
    post: { exposure: 1.08, bloom: 0.16, vignette: 0.04, dither: 0.18, screenGain: 1.5 },
    glassHaze: [0.055, 0.062, 0.06],
  },
  wall: {
    environment: { intensity: 1, rotation: [0, 0, 0] },
    // Same correction as the cubicle: 54 emitters at identical value is a
    // contact sheet. Depth attenuation is what turns the rack vault into
    // infrastructure receding away from the hero slot.
    //
    // The haze is AMBER here, not near-black. A room this full of phosphor has
    // visible air in it, and tinting the fog to the light it is scattering is
    // what turns the vault's empty volume into atmosphere instead of a hole.
    atmosphere: { color: '#2a1f0b', density: 0.0026 },
    lights: {
      ambient: 0.012,
      screen: 2.6,
      localFill: 0,
      doorway: 0,
      oppositeRim: 0,
      backWall: 0,
      officeSide: 0,
    },
    post: { exposure: 1.12, bloom: 0.5, vignette: 0.12, dither: 0.24, screenGain: 2.3 },
    // Amber: in the rack vault the surrounding light IS the wall of screens.
    glassHaze: [0.062, 0.045, 0.014],
  },
  phosphor: {
    environment: { intensity: 0.9, rotation: [0, 0, 0] },
    atmosphere: { color: '#000000', density: 0 },
    lights: {
      ambient: 0,
      screen: 0,
      localFill: 0,
      doorway: 0,
      oppositeRim: 0,
      backWall: 0,
      officeSide: 0,
    },
    // The phosphor handoff keeps screenGain at 1: shader and geometry endpoints
    // share the ungained CRT_HANDOFF.gain, and their measured parity depends on
    // it. Stage brightness comes from exposure and bloom, which multiply the
    // whole frame and cannot split the two representations.
    post: { exposure: 1.3, bloom: 0.62, vignette: 0.08, dither: 0.2, screenGain: 1 },
    // Exactly zero: the measured handoff parity must not be perturbed.
    glassHaze: [0, 0, 0],
  },
})

/**
 * A dark-room environment map.
 *
 * This is the single biggest thing standing between the monitor looking like a
 * real object and looking like a CG prop. Without an environment, a
 * meshStandardMaterial has NOTHING to reflect: its specular term can only pick
 * up the handful of punctual lights in the scene, so every surface resolves to
 * flat diffuse shading with one hot spot. That is precisely the "cheap" look —
 * and no amount of extra geometry fixes it, because the problem isn't shape.
 *
 * Real plastic in a dark room still reflects the room: a faint cool wash from
 * whatever ambient light exists, a slightly brighter band at the horizon, a
 * darker floor, and — here — a green pool thrown back up off the desk by the
 * screen. That broad, low-level reflection is what your eye reads as "surface".
 *
 * Deliberately DIM. This must add specular life without lighting the room; the
 * screen is still the only real light source (PLAN.md phase 1).
 */

/** Equirectangular canvas: x is azimuth, y is altitude (top = up). */
function paintRoom(size = 512) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size / 2
  const ctx = canvas.getContext('2d')

  // Vertical wash: ceiling → horizon → floor.
  //
  // BRIGHTER THAN IT LOOKS LIKE IT SHOULD BE, because this is the scene's
  // bounce light. Light that has hit a surface and come back is dim, broad and
  // directionless, and an environment map is exactly that — it arrives from
  // every direction at once and varies smoothly. Standing in point lights to
  // fake it is what flattens a scene: a bright source near a surface floods it
  // evenly, and an evenly flooded surface with no microstructure is precisely
  // what reads as plastic. That was the real cause of the shiny desk.
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height)
  sky.addColorStop(0.0, '#151918') // ceiling, faint neutral
  sky.addColorStop(0.42, '#303633') // broad room-side reflection
  sky.addColorStop(0.55, '#1a201e')
  sky.addColorStop(1.0, '#080b0a') // floor
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Green bounce off the desk, low and in front of the monitor. This is the
  // reflection that makes the bezel's lower edge read as plastic rather than
  // paint — it's the screen's own light coming back up at it.
  const bounce = ctx.createRadialGradient(
    canvas.width * 0.5,
    canvas.height * 0.78,
    0,
    canvas.width * 0.5,
    canvas.height * 0.78,
    canvas.width * 0.3
  )
  bounce.addColorStop(0, 'rgba(180, 148, 64, 0.42)')
  bounce.addColorStop(0.42, 'rgba(150, 122, 52, 0.2)')
  bounce.addColorStop(1, 'rgba(118, 96, 42, 0)')
  ctx.fillStyle = bounce
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // A cold sliver high and behind — the same spill the rim light implies, so
  // the reflections agree with the lighting instead of contradicting it.
  const cold = ctx.createRadialGradient(
    canvas.width * 0.12,
    canvas.height * 0.22,
    0,
    canvas.width * 0.12,
    canvas.height * 0.22,
    canvas.width * 0.22
  )
  cold.addColorStop(0, 'rgba(188, 205, 199, 0.4)')
  cold.addColorStop(0.36, 'rgba(151, 170, 163, 0.18)')
  cold.addColorStop(1, 'rgba(112, 128, 122, 0)')
  ctx.fillStyle = cold
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // STRUCTURED sources. A pure gradient environment gives every specular a
  // shapeless wash, which is most of why the housing and props read as
  // lifeless clay: a reflection only convinces when it has an image in it.
  // The room's own architecture supplies the shapes — the night window as a
  // 2×2 pane grid, and the cool door slit. Soft-edged so PMREM keeps them as
  // readable smears at prop roughness rather than hard decals.
  ctx.save()
  ctx.shadowColor = 'rgba(96, 112, 138, 0.9)'
  ctx.shadowBlur = 7
  ctx.fillStyle = 'rgba(88, 104, 130, 0.62)'
  const paneW = canvas.width * 0.052
  const paneH = canvas.height * 0.115
  const windowX = canvas.width * 0.655
  const windowY = canvas.height * 0.27
  for (let px = 0; px < 2; px++) {
    for (let py = 0; py < 2; py++) {
      ctx.fillRect(
        windowX + px * (paneW + canvas.width * 0.008),
        windowY + py * (paneH + canvas.height * 0.02),
        paneW,
        paneH
      )
    }
  }
  ctx.fillStyle = 'rgba(104, 120, 146, 0.55)'
  ctx.fillRect(
    canvas.width * 0.118,
    canvas.height * 0.3,
    canvas.width * 0.014,
    canvas.height * 0.34
  )
  ctx.restore()

  return canvas
}

/**
 * Bright commercial-office reflections, ray-cast from the room's own geometry.
 *
 * The office ran on a generic CC0 HDR of an unfinished daylit space at
 * environment intensity 0.24, and that is the whole reason every office surface
 * resolved to Lambertian clay: a cream laminate worktop sitting under ten
 * fluorescent troffers returned not one highlight, because nothing in its
 * specular integral was both bright and localised. The modeled troffers cannot
 * supply it — an emissive material lights nothing in three — and the two broad
 * rectAreaLights that do the actual lighting are 58 units wide, which averages
 * the fixture array into a shapeless wash by construction. More runtime lights
 * are explicitly off the table (ART-DIRECTION).
 *
 * So the reflections come from the set. For every direction, hit the room box
 * from a seat in the hero bay and return what is really there: the fixture rows
 * land where the ceiling actually puts them, and the worktop starts returning
 * them as the long soft streaks that make laminate read as laminate.
 *
 * FLOAT, not a canvas. Eight bits cannot hold the several stops between a
 * fluorescent aperture and the wall it lights, and that ratio is the entire
 * difference between a highlight with a shoulder and a pale grey smear. The
 * buffer is transient — PMREM consumes it and it is disposed.
 */

/** Radiance of each office surface. Linear, and deliberately far apart. */
const OFFICE_ENV_RADIANCE = Object.freeze({
  // ~75:1 over the walls. A real troffer against a painted shell is more, but
  // this is a reflection budget, not a photometric one: past roughly this ratio
  // the aperture stops reading as a lamp and starts clipping to a white blob.
  // Scaled down by 3.3 when the Blender office's recessed troffers grew from
  // 26×6 units to one tile by two (16×32): the map's irradiance is aperture
  // radiance times aperture area, and at the old value the larger lenses
  // drove the laminate to display white.
  aperture: [6.5, 7.0, 6.8],
  ceilingTile: [0.27, 0.286, 0.277],
  // The lens washes its own tile and the two beside it. Without this the
  // fixtures read as stickers on a flat ceiling, which is exactly how the
  // modeled ones read before ceiling.js gave them the same treatment.
  ceilingWash: [0.5, 0.53, 0.51],
  // The lower hemisphere is not decoration: a downward-facing normal — the
  // whole suspended ceiling, every desk underside — is lit by NOTHING ELSE, so
  // when these were authored at true dark-room levels the ceiling tiles lost
  // their grid and the set inverted into ART-DIRECTION's "dead tops" failure.
  // Ten troffers over cream laminate really do put this much light back up.
  shell: [0.105, 0.116, 0.11],
  partition: [0.083, 0.1, 0.121],
  // Cream laminate is the largest reflector in the room and it sits right below
  // the horizon, so it is what the monitor housings and the mug pick up from
  // underneath. The office's answer to the home map's desk bounce.
  laminate: [0.42, 0.403, 0.367],
  carpet: [0.085, 0.092, 0.087],
  // Amber is the only chroma in the room and there are fifty-odd emitters of it
  // at one height. Faint, but it is why the office plastics are not neutral.
  monitorGlow: [0.3, 0.21, 0.06],
})

function addScaled(target, offset, colour, scale) {
  target[offset] += colour[0] * scale
  target[offset + 1] += colour[1] * scale
  target[offset + 2] += colour[2] * scale
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Equirect in three's DataTexture convention: row 0 is v = 0 is straight DOWN.
 * (A CanvasTexture flips; a DataTexture does not, and getting this backwards
 * puts the ceiling under the floor with no error anywhere.)
 */
function paintOffice(spec, size = 512) {
  const width = size
  const height = size / 2
  const data = new Float32Array(width * height * 4)
  const { room, fixtures, fixtureSize, eye, panelTopY, worktopY } = spec
  const R = OFFICE_ENV_RADIANCE
  const halfW = fixtureSize.width / 2
  const halfD = fixtureSize.depth / 2
  const floorY = room.min[1]
  const ceilingY = room.max[1]
  const wallSpan = ceilingY - floorY

  for (let row = 0; row < height; row += 1) {
    const v = (row + 0.5) / height
    const altitude = (v - 0.5) * Math.PI
    const cosA = Math.cos(altitude)
    const dy = Math.sin(altitude)
    for (let col = 0; col < width; col += 1) {
      const u = (col + 0.5) / width
      const azimuth = (u - 0.5) * 2 * Math.PI
      const dx = Math.cos(azimuth) * cosA
      const dz = Math.sin(azimuth) * cosA
      const offset = (row * width + col) * 4

      // Nearest exit through the room box. The eye is always inside it, so
      // exactly one slab bound is hit and the smallest positive t wins.
      let best = Infinity
      let axis = 1
      const direction = [dx, dy, dz]
      for (let a = 0; a < 3; a += 1) {
        const d = direction[a]
        if (Math.abs(d) < 1e-6) continue
        const bound = d > 0 ? room.max[a] : room.min[a]
        const t = (bound - eye[a]) / d
        if (t > 0 && t < best) {
          best = t
          axis = a
        }
      }
      const hx = eye[0] + dx * best
      const hy = eye[1] + dy * best
      const hz = eye[2] + dz * best

      if (axis === 1 && dy > 0) {
        addScaled(data, offset, R.ceilingTile, 1)
        for (const [fx, , fz] of fixtures) {
          const inX = 1 - smoothstep(halfW - 0.9, halfW + 0.9, Math.abs(hx - fx))
          const inZ = 1 - smoothstep(halfD - 0.5, halfD + 0.5, Math.abs(hz - fz))
          if (inX > 0 && inZ > 0) addScaled(data, offset, R.aperture, inX * inZ)
          const spreadX = (hx - fx) / (halfW * 2.6)
          const spreadZ = (hz - fz) / (halfD * 6.5)
          addScaled(
            data,
            offset,
            R.ceilingWash,
            Math.exp(-(spreadX * spreadX + spreadZ * spreadZ))
          )
        }
      } else if (axis === 1) {
        // Looking down. Steeply down is carpet; near the horizon it is desks,
        // because a room this full of worktops only shows its floor past them.
        const grazing = 1 - smoothstep(0.06, 0.5, -dy)
        addScaled(data, offset, R.carpet, 1 - grazing)
        addScaled(data, offset, R.laminate, grazing)
      } else {
        const heightMix = (hy - floorY) / wallSpan
        const panelMix = 1 - smoothstep(
          (panelTopY - floorY) / wallSpan - 0.04,
          (panelTopY - floorY) / wallSpan + 0.06,
          heightMix
        )
        addScaled(data, offset, R.shell, 1 - panelMix)
        addScaled(data, offset, R.partition, panelMix)
        // A band of glass at seated eye height, broken up along the aisle so it
        // reflects as separate emitters rather than one continuous stripe.
        const glassBand = Math.exp(
          -Math.pow((hy - (worktopY + 9)) / 7, 2)
        )
        const alongAisle = 0.55 + 0.45 * Math.sin(hz * 0.15 + hx * 0.04)
        addScaled(data, offset, R.monitorGlow, glassBand * alongAisle)
      }
      data[offset + 3] = 1
    }
  }

  const texture = new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  texture.needsUpdate = true
  return texture
}

/**
 * Build the PMREM-filtered environment. PMREM (rather than handing the raw
 * equirect to `scene.environment`) is what makes rough surfaces reflect a
 * correspondingly blurred version of the room — without it every roughness
 * value reflects the same sharp image and the material response is wrong.
 *
 * Both stages are synthetic and art-directed to their own set. The home dark
 * room is painted 8-bit, which its narrow range can carry; the office is cast
 * to float because a fluorescent aperture is several stops over the wall it
 * lights, and that ratio is what gives plastic and metal a highlight with a
 * shoulder instead of a grey smear. `officeSpec` is the room description from
 * Stages (`OFFICE_ENVIRONMENT_SPEC`) and is required for the office variant.
 *
 * Returns the texture and a dispose fn; the caller owns both.
 */
export function makeRoomEnvironment(renderer, variant = 'home', officeSpec = null) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()

  const isOffice = variant === 'office'
  if (isOffice && !officeSpec) {
    throw new Error('makeRoomEnvironment: the office variant needs a room spec')
  }
  const source = isOffice
    ? paintOffice(officeSpec)
    : new THREE.CanvasTexture(paintRoom())
  source.mapping = THREE.EquirectangularReflectionMapping
  // The office buffer is already linear radiance; only the canvas needs
  // decoding. Tagging the float texture sRGB would crush its top four stops.
  if (!isOffice) source.colorSpace = THREE.SRGBColorSpace

  const target = pmrem.fromEquirectangular(source)

  source.dispose()
  pmrem.dispose()

  return {
    texture: target.texture,
    dispose: () => target.dispose(),
  }
}
