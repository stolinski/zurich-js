import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mulberry32 } from '../lib/rng.js'
import { QUALITY_AA_PROFILE } from '../qualityProfile.js'
import { SCREEN_SIZE } from './CRTScreen.jsx'

const agentVert = /* glsl */ `
  attribute float aVariant;
  attribute float aPhase;
  attribute float aDrive;
  out vec2 vUv;
  flat out float vVariant;
  flat out float vPhase;
  flat out float vDrive;

  void main() {
    vUv = uv;
    vVariant = aVariant;
    vPhase = aPhase;
    vDrive = aDrive;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`

const agentFrag = /* glsl */ `
  precision highp float;
  uniform float uTime;
  in vec2 vUv;
  flat in float vVariant;
  flat in float vPhase;
  flat in float vDrive;
  out vec4 outColor;

  // Instance identity must NOT be perspective-interpolated. Even a constant
  // varying accumulates raster rounding; the hash magnifies it into patches
  // across one screen. Flat GLSL3 inputs keep each agent's seed truly constant.
  // Sinless hash. The previous sin-based hash fed sin() arguments in the
  // hundreds of thousands of radians (seed ≈ row + variant·53, scaled by ~92),
  // where GPU fast-math sin() is garbage — on Metal it collapsed to a constant
  // and silently disabled every terminal row. A polynomial hash has no range
  // cliff and is bit-stable across GPUs, which the projector laptop needs.
  float hash(float n) {
    float x = fract((n + vVariant * 0.6180339887) * 0.1031);
    x *= x + 33.33;
    x *= x + x;
    return fract(x);
  }

  void main() {
    // Distant sessions are written for silhouette and rhythm, not legibility.
    // Activity advances in slow discrete terminal-like bursts, so the wall is
    // alive without becoming a field of flickering video rectangles.
    float tick = floor((uTime + vPhase) * (0.22 + hash(vVariant) * 0.08));
    float rows = 31.0;
    float y = (1.0 - vUv.y) * rows;
    float row = floor(y) + tick;
    float within = fract(y);
    float seed = row + vVariant * 53.0;
    float enabled = step(0.16, hash(seed + 4.0));
    float indent = 0.06 + step(0.72, hash(seed + 8.0)) * 0.075;
    float length = 0.22 + hash(seed + 12.0) * 0.56;

    // Procedural rows do not pass through a texture sampler, so mipmaps cannot
    // save them. Measure their real projected size and remove structural detail
    // before it becomes a one-pixel staircase. At distance the screen becomes a
    // stable occupancy glow instead of a crawling field of diagonal bands.
    float rowDerivative = max(fwidth(y), 1e-4);
    float rowPeriodPx = 1.0 / rowDerivative;
    float detailFade = smoothstep(2.0, 3.0, rowPeriodPx);
    float rowAa = min(0.24, rowDerivative * 0.65);
    float xAa = max(fwidth(vUv.x) * 0.75, 1e-4);
    float stroke = smoothstep(0.30 - rowAa, 0.30 + rowAa, within)
      * (1.0 - smoothstep(0.50 - rowAa, 0.50 + rowAa, within));
    float lineEnd = min(0.94, indent + length);
    float body = smoothstep(indent - xAa, indent + xAa, vUv.x)
      * (1.0 - smoothstep(lineEnd - xAa, lineEnd + xAa, vUv.x));

    // A hot prompt/caret gives each screen one stable focal mark. Its phase is
    // deterministic and slow enough to read as a terminal cursor, not twinkle.
    float promptRow = mod(7.0 + floor(vVariant * 3.0), rows);
    float promptDistance = abs(mod(y - promptRow + rows * 0.5, rows) - rows * 0.5);
    float promptBand = 1.0 - smoothstep(0.48 - rowAa, 0.48 + rowAa, promptDistance);
    float caret = promptBand
      * smoothstep(0.07 - xAa, 0.07 + xAa, vUv.x)
      * (1.0 - smoothstep(0.085 - xAa, 0.085 + xAa, vUv.x));
    caret *= step(0.5, fract((uTime + vPhase) * 0.9)) * detailFade;

    float detailedInk = max(enabled * stroke * body, caret);
    // Unresolved screens collapse toward mean GLOW, not mean ink coverage. The
    // arithmetic mean of thin bright lines is ~7%, which photographs as a dead
    // panel — a real CRT at distance is dominated by its own scatter, so the
    // collapsed value sits well above the ink average.
    //
    // But a FLAT collapse is what turned the wide wall into 54 identical amber
    // swatches: a contact sheet, which is the anti-pattern ART-DIRECTION names.
    // A terminal is never uniform even when you cannot read it — content packs
    // toward the top and the rows below the prompt are empty. That variation is
    // LOW frequency, so unlike the row structure it survives minification and
    // needs no Nyquist guard of its own.
    // The multiplier brackets 1.0 so the MEAN collapsed glow is preserved: the
    // point is to redistribute the same energy top-to-bottom, not to dim the
    // wall. Pulling the mean down instead turned 54 agents into 54 dark boxes.
    float fromTop = 1.0 - vUv.y;
    float fill = 0.34 + hash(vVariant * 29.0 + 3.0) * 0.62;
    float column = 1.0 - smoothstep(fill - 0.12, fill + 0.26, fromTop);
    float occupancy =
      (0.13 + hash(vVariant * 17.0 + 91.0) * 0.08) * (0.62 + 0.72 * column);
    float ink = mix(occupancy, detailedInk, detailFade);
    vec2 edgeAa = max(fwidth(vUv) * 0.75, vec2(1e-4));
    float edge = smoothstep(0.0, edgeAa.x, vUv.x)
      * smoothstep(0.0, edgeAa.y, vUv.y)
      * smoothstep(0.0, edgeAa.x, 1.0 - vUv.x)
      * smoothstep(0.0, edgeAa.y, 1.0 - vUv.y);
    // A lit tube's black is its faceplate haze, never zero: the office
    // preset gives the hero glass 0.055, and at 0.012 the bay screens were
    // the largest patch of sub-10 luma in the cubicle frame (Q5b).
    vec3 black = vec3(0.022, 0.018, 0.008);
    // HDR drive: bright screens sit above 1.0 pre-ACES so the wall's phosphor
    // lands on the tone-map shoulder and feeds bloom, like the hero glass.
    // Amber chemistry — linear #ffd54a scaled to the previous energy.
    vec3 phosphor = vec3(0.95, 0.63, 0.066) * vDrive * 1.8;

    // A tube is dimmer into its own corners — beam throw is longer and the
    // faceplate is thicker there. Also low frequency, and it is the difference
    // between a lit rectangle and a piece of curved glass.
    // NB: the GLSL length() builtin is shadowed by the row-length float
    // declared above, so it is unavailable here — hence the explicit sqrt(dot).
    vec2 fromCentre = (vUv - 0.5) * vec2(1.55, 1.0);
    float radial = sqrt(dot(fromCentre, fromCentre));
    float glassFall = 1.0 - 0.22 * pow(clamp(radial * 1.3, 0.0, 1.0), 2.2);

    outColor = vec4(mix(black, phosphor, ink) * edge * glassFall, 1.0);
  }
`

/**
 * Seed the per-screen character of a set's agent screens. The placements come
 * from the set's GLB (its `agent_screens` scene extra, written by the Blender
 * build so the screens can never drift from the housings); the variant, phase
 * and drive are seeded here so what is rehearsed is what the room sees.
 *
 * `driveRange` is [min, spread]: the office runs its screens in a narrow band,
 * the wall spreads them wide on purpose — 54 identical brightnesses read as
 * wallpaper, not as 54 separate agents.
 */
export function seedAgentPlacements(screens, seed, driveRange = [0.55, 0.35]) {
  const rand = mulberry32(seed)
  return screens.map(({ x, y, z, yaw }, index) => ({
    position: [x, y, z],
    rotation: [0, yaw, 0],
    variant: index + 1,
    phase: rand() * 14,
    drive: driveRange[0] + rand() * driveRange[1],
  }))
}

/** The scene extra a set's Blender build writes, parsed. */
export function readAgentScreens(gltfScene) {
  const raw = gltfScene.userData.agent_screens
  if (typeof raw !== 'string') {
    throw new Error('The set GLB carries no agent_screens scene extra')
  }
  return JSON.parse(raw)
}

/**
 * The lit glass of every distant agent: one instanced plane with the
 * procedural session shader. The housings around them are part of each
 * set's Blender export; this is only what glows.
 */
export function AgentMonitors({ placements, active = false }) {
  const screenMaterial = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const screenGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(SCREEN_SIZE.w, SCREEN_SIZE.h)
    const variants = new Float32Array(placements.length)
    const phases = new Float32Array(placements.length)
    const drives = new Float32Array(placements.length)
    placements.forEach((p, i) => {
      variants[i] = p.variant
      phases[i] = p.phase
      drives[i] = p.drive
    })
    geometry.setAttribute('aVariant', new THREE.InstancedBufferAttribute(variants, 1))
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1))
    geometry.setAttribute('aDrive', new THREE.InstancedBufferAttribute(drives, 1))
    return geometry
  }, [placements])
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])

  const place = (instances) => {
    placements.forEach((p, i) => {
      dummy.position.fromArray(p.position)
      dummy.rotation.set(...p.rotation)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      instances.setMatrixAt(i, dummy.matrix)
    })
    instances.instanceMatrix.needsUpdate = true
  }

  useEffect(() => {
    if (active && screenMaterial.current) {
      screenMaterial.current.uniforms.uTime.value = 0
    }
  }, [active])

  useFrame((_, dt) => {
    if (active && screenMaterial.current && !QUALITY_AA_PROFILE) {
      screenMaterial.current.uniforms.uTime.value += dt
    }
  })

  return (
    <instancedMesh
      args={[screenGeometry, undefined, placements.length]}
      frustumCulled={false}
      onUpdate={place}
    >
      <shaderMaterial
        ref={screenMaterial}
        uniforms={uniforms}
        vertexShader={agentVert}
        fragmentShader={agentFrag}
        glslVersion={THREE.GLSL3}
        toneMapped={false}
      />
    </instancedMesh>
  )
}
