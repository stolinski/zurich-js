import * as THREE from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Surface finishing for CAD render assets (the monitor housing and every desk
 * prop). Nurb GLBs arrive with per-face normals and no UV channel, so both
 * problems are solved here, once, geometrically:
 *
 *   · `toCreasedNormals` at 40° — lathe and loft facets (small dihedrals)
 *     shade as continuous surfaces, real edges and 45° chamfers stay crisp.
 *     (`mergeVertices` can NOT do this: it compares every attribute, so
 *     coincident vertices carrying different face normals never merge.)
 *   · `weatherGeometry` — deterministic per-vertex surface history in vertex
 *     colours: cavity darkening where surfaces meet (seams, wells, joints
 *     hold shadow and grime), slight lightening on convex edges (handled
 *     plastic polishes), and broad seeded mottle so no shell reads as one
 *     flat albedo.
 *   · `varyRoughnessByWear` — the same vertex data drives ROUGHNESS in the
 *     shader: grimy cavities scatter light, worn edges tighten it. Uniform
 *     roughness is most of why a surface reads as lifeless; this is what lets
 *     the room's light actually play across a prop.
 */

export const CREASE_ANGLE = THREE.MathUtils.degToRad(40)

const hashNoise = (x, y, z, seed) => {
  const value =
    Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 53.13) * 43758.5453
  return value - Math.floor(value)
}

/** Smooth low-frequency seeded value noise, for broad surface mottle. */
function valueNoise(x, y, z, seed) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const z0 = Math.floor(z)
  const fade = (t) => t * t * (3 - 2 * t)
  const fx = fade(x - x0)
  const fy = fade(y - y0)
  const fz = fade(z - z0)
  let result = 0
  for (let corner = 0; corner < 8; corner++) {
    const cx = corner & 1
    const cy = (corner >> 1) & 1
    const cz = (corner >> 2) & 1
    const weight =
      (cx ? fx : 1 - fx) * (cy ? fy : 1 - fy) * (cz ? fz : 1 - fz)
    result += weight * hashNoise(x0 + cx, y0 + cy, z0 + cz, seed)
  }
  return result
}

export function weatherGeometry(geometry, seed = 1) {
  const position = geometry.attributes.position
  const normal = geometry.attributes.normal
  if (!position || !normal) return geometry
  const count = position.count

  // Unify coincident vertices (0.05mm buckets) so adjacency crosses the
  // duplicated borders of a non-indexed, creased mesh.
  const representative = new Int32Array(count)
  const buckets = new Map()
  for (let vertex = 0; vertex < count; vertex++) {
    const key =
      `${Math.round(position.getX(vertex) * 20)},` +
      `${Math.round(position.getY(vertex) * 20)},` +
      `${Math.round(position.getZ(vertex) * 20)}`
    const existing = buckets.get(key)
    if (existing === undefined) {
      buckets.set(key, vertex)
      representative[vertex] = vertex
    } else {
      representative[vertex] = existing
    }
  }

  const cavitySum = new Float64Array(count)
  const cavityCount = new Float64Array(count)
  const index = geometry.index
  const triangles = (index ? index.count : count) / 3
  const vertexAt = (slot) => (index ? index.getX(slot) : slot)
  for (let triangle = 0; triangle < triangles; triangle++) {
    for (let corner = 0; corner < 3; corner++) {
      const a = vertexAt(triangle * 3 + corner)
      const b = vertexAt(triangle * 3 + ((corner + 1) % 3))
      let dx = position.getX(b) - position.getX(a)
      let dy = position.getY(b) - position.getY(a)
      let dz = position.getZ(b) - position.getZ(a)
      const length = Math.hypot(dx, dy, dz)
      if (length < 1e-6) continue
      dx /= length
      dy /= length
      dz /= length
      const rep = representative[a]
      cavitySum[rep] +=
        normal.getX(a) * dx + normal.getY(a) * dy + normal.getZ(a) * dz
      cavityCount[rep] += 1
    }
  }

  const colors = new Float32Array(count * 3)
  for (let vertex = 0; vertex < count; vertex++) {
    const rep = representative[vertex]
    const cavity = cavityCount[rep] ? cavitySum[rep] / cavityCount[rep] : 0
    const px = position.getX(vertex)
    const py = position.getY(vertex)
    const pz = position.getZ(vertex)
    const mottle =
      1 + (valueNoise(px / 38, py / 38, pz / 38, seed) - 0.5) * 0.24
    const shade = THREE.MathUtils.clamp(
      (1 - 0.7 * Math.max(cavity, 0) + 0.22 * Math.max(-cavity, 0)) * mottle,
      0.36,
      1.14
    )
    // Faintly warm in the dark end: grime is never spectrally neutral.
    colors[vertex * 3] = shade
    colors[vertex * 3 + 1] = shade * (0.985 + 0.015 * shade)
    colors[vertex * 3 + 2] = shade * (0.96 + 0.04 * shade)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

/** The full finishing chain. Segment BEFORE this so material groups survive. */
export function finishPropGeometry(geometry, seed = 1) {
  return weatherGeometry(toCreasedNormals(geometry, CREASE_ANGLE), seed)
}

/**
 * Drive roughness from the weathering luma. One shared injection string keeps
 * this a single extra program variant, compiled during startup warm.
 */
export function varyRoughnessByWear(material) {
  material.vertexColors = true
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      #ifdef USE_COLOR
        float wearLuma = (vColor.r + vColor.g + vColor.b) / 3.0;
        roughnessFactor = clamp(roughnessFactor + (1.0 - wearLuma) * 0.55, 0.18, 1.0);
      #endif
      `
    )
  }
  material.customProgramCacheKey = () => 'wear-roughness'
  return material
}

/**
 * Moulded-plastic microstructure, without UVs and without a projection.
 *
 * A CAD housing with clean normals and one roughness value is a black
 * SILHOUETTE, not an object: nothing breaks its specular up, so every highlight
 * is a smooth analytic wash and the eye reads clay. Real ABS is spark-eroded in
 * the tool — a fine isotropic tooth over a slower orange-peel undulation — and
 * that microstructure is most of what says "moulded" before you notice shape.
 *
 * This is NOT the tiled photographic normal the housing rightly refuses: there
 * is no image, no repeat, and no box projection, so there are no seams and no
 * grain direction to give a projection away. The height field is procedural in
 * OBJECT space, which is where a moulding texture actually lives — it belongs
 * to the part, so it does not swim when the camera moves and every instance off
 * the same tool carries the same tooth.
 *
 * The normal comes from the height's SCREEN-SPACE derivative (Mikkelsen's
 * surface gradient — the same construction three uses for `bumpMap`), so one
 * noise evaluation buys a correct perturbation on arbitrary geometry. It also
 * band-limits itself for free: each octave fades out on measured object-units
 * per pixel before its own period reaches two pixels, which is QUALITY Q1's
 * Nyquist guard rather than a hope.
 *
 * Composes onto an existing `onBeforeCompile` (in practice `varyRoughnessByWear`)
 * rather than replacing it, and extends the cache key so the combination gets
 * its own program.
 */
export function addMouldedGrain(
  material,
  { fine = 0.09, broad = 0.82, strength = 0.13, roughVariation = 0.15 } = {}
) {
  const previousCompile = material.onBeforeCompile
  const previousKey = material.customProgramCacheKey?.() ?? ''
  const f = (value) => value.toFixed(5)

  material.onBeforeCompile = (shader, renderer) => {
    previousCompile?.call(material, shader, renderer)

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGrainPosition;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vGrainPosition = transformed;`
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGrainPosition;

        float grainHash(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
        }

        float grainNoise(vec3 p) {
          vec3 cell = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float n00 = mix(grainHash(cell), grainHash(cell + vec3(1.0, 0.0, 0.0)), f.x);
          float n10 = mix(grainHash(cell + vec3(0.0, 1.0, 0.0)), grainHash(cell + vec3(1.0, 1.0, 0.0)), f.x);
          float n01 = mix(grainHash(cell + vec3(0.0, 0.0, 1.0)), grainHash(cell + vec3(1.0, 0.0, 1.0)), f.x);
          float n11 = mix(grainHash(cell + vec3(0.0, 1.0, 1.0)), grainHash(cell + vec3(1.0, 1.0, 1.0)), f.x);
          return mix(mix(n00, n10, f.y), mix(n01, n11, f.y), f.z);
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        vec3 grainDx = dFdx(vGrainPosition);
        vec3 grainDy = dFdy(vGrainPosition);
        // Object units covered by one pixel, from whichever screen axis is
        // stretched further — the conservative side of the Nyquist test.
        float grainUnitsPerPixel = max(length(grainDx), length(grainDy));
        float grainFineGuard =
          1.0 - smoothstep(0.32, 0.62, grainUnitsPerPixel / ${f(fine)});
        // The broad octave gets the SAME test on its own period. It survives
        // much further out — that is the point of having it — but the hero
        // housing is also instanced down the aisle, where at four bays back it
        // is a few dozen pixels wide and an unguarded lattice would crawl.
        float grainBroadGuard =
          1.0 - smoothstep(0.32, 0.62, grainUnitsPerPixel / ${f(broad)});
        float grainFine = grainNoise(vGrainPosition / ${f(fine)}) - 0.5;
        float grainBroad = grainNoise(vGrainPosition / ${f(broad)}) - 0.5;
        float grainHeight =
          grainFine * grainFineGuard * 0.55 + grainBroad * grainBroadGuard;
        // A textured tool scatters: the tooth is fractionally MATTER than the
        // polished flats between it, which is what stops the sheen reading as
        // one analytic sweep across the whole housing.
        roughnessFactor = clamp(
          roughnessFactor + grainHeight * ${f(roughVariation)}, 0.05, 1.0
        );`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 r1 = cross(grainDy, normal);
          vec3 r2 = cross(normal, grainDx);
          float det = dot(grainDx, r1);
          if (abs(det) > 1e-12) {
            vec3 surfaceGradient = sign(det) *
              (dFdx(grainHeight) * r1 + dFdy(grainHeight) * r2);
            normal = normalize(
              abs(det) * normal - ${f(strength)} * surfaceGradient
            );
          }
        }`
      )
  }

  material.customProgramCacheKey = () =>
    `${previousKey}|moulded-grain:${f(fine)}:${f(broad)}:${f(strength)}:${f(
      roughVariation
    )}`
  return material
}
