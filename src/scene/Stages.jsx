import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useTexture } from '@react-three/drei'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../lib/rng.js'
import { QUALITY_AA_PROFILE } from '../qualityProfile.js'
import {
  commitPendingStage,
  usePresentationRuntime,
} from '../state/presentationRuntime.js'
import { DESK_Y, OFFICE_FLOOR_Y } from './Room.jsx'
import { HomeOffice } from './HomeOffice.jsx'
import { Props } from './Props.jsx'
import { Monitor } from './Monitor.jsx'
import { PhosphorField } from './PhosphorField.jsx'
import { OFFICE_LAYOUT, OfficeDetails } from './OfficeDetails.jsx'
import { ContactPatches } from './ContactPatches.jsx'
import { IrradiancePatches } from './IrradiancePatches.jsx'
import {
  configureIrradianceTexture,
  IRRADIANCE_BOUNDS,
} from './bakedIrradiance.js'
import { BakedIrradianceLayer } from './BakedIrradianceLayer.jsx'
import { makeCeilingMaps } from './ceiling.js'
import { makeLaminateMap } from './laminate.js'
import { makeCarpetTileMap } from './carpet.js'

const SCREEN_W = 16
const SCREEN_H = 9

const agentVert = /* glsl */ `
  attribute float aVariant;
  attribute float aPhase;
  attribute float aDrive;
  varying vec2 vUv;
  varying float vVariant;
  varying float vPhase;
  varying float vDrive;

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
  varying vec2 vUv;
  varying float vVariant;
  varying float vPhase;
  varying float vDrive;

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
    vec3 black = vec3(0.012, 0.0095, 0.004);
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

    gl_FragColor = vec4(mix(black, phosphor, ink) * edge * glassFall, 1.0);
  }
`

function makeMonitorGeometry() {
  const body = new RoundedBoxGeometry(17.5, 10.5, 8.2, 3, 0.65)
  body.translate(0, 0, -4.25)
  // RoundedBoxGeometry is non-indexed; normalize the neck before merging or
  // BufferGeometryUtils correctly refuses the incompatible attribute layout.
  const neck = new THREE.CylinderGeometry(1.45, 2.1, 2.5, 12).toNonIndexed()
  neck.translate(0, -6.15, -3.2)
  const base = new RoundedBoxGeometry(8.6, 0.65, 5.0, 2, 0.24)
  base.translate(0, -7.65, -2.3)
  const merged = mergeGeometries([body, neck, base], false)
  body.dispose()
  neck.dispose()
  base.dispose()
  merged.computeVertexNormals()
  return merged
}

/**
 * Many inexpensive monitors with one chassis draw and one screen draw.
 * The hero monitor remains the full CAD model at the origin; these only need to
 * survive at room/wall distance, where silhouette, stagger, and light rhythm are
 * the information the audience can actually see.
 */
function AgentMonitors({ placements, active = false }) {
  const screenMaterial = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const chassisGeometry = useMemo(() => makeMonitorGeometry(), [])
  const screenGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(SCREEN_W, SCREEN_H)
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
      dummy.scale.setScalar(p.scale ?? 1)
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
    <group>
      <instancedMesh
        args={[chassisGeometry, undefined, placements.length]}
        receiveShadow
        frustumCulled={false}
        onUpdate={place}
      >
        <meshStandardMaterial
          color="#090b0e"
          roughness={0.68}
          metalness={0.04}
          emissive="#020403"
          emissiveIntensity={0.35}
        />
      </instancedMesh>
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
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  )
}

const PANEL_TOP_Y = DESK_Y + 22.7
const PANEL_BOTTOM_Y = OFFICE_FLOOR_Y + 0.45
const PANEL_CENTER_Y = (PANEL_TOP_Y + PANEL_BOTTOM_Y) / 2
const PANEL_HEIGHT = PANEL_TOP_Y - PANEL_BOTTOM_Y
const PANEL_POST_CENTER_Y = (OFFICE_FLOOR_Y + PANEL_TOP_Y + 0.2) / 2
const PANEL_POST_HEIGHT = PANEL_TOP_Y + 0.2 - OFFICE_FLOOR_Y
const FOREGROUND_PANEL_TOP_Y = DESK_Y + 15.5
const FOREGROUND_PANEL_CENTER_Y =
  (FOREGROUND_PANEL_TOP_Y + PANEL_BOTTOM_Y) / 2
const FOREGROUND_PANEL_HEIGHT = FOREGROUND_PANEL_TOP_Y - PANEL_BOTTOM_Y
const OFFICE_CEILING_Y = 33.3
const OFFICE_SHELL_CENTER_Y = (OFFICE_FLOOR_Y + OFFICE_CEILING_Y) / 2
const OFFICE_SHELL_HEIGHT = OFFICE_CEILING_Y - OFFICE_FLOOR_Y
const WORKTOP_SIZE = { width: 40, height: 1.5, depth: 38 }
const SUPPORT_COLUMN_HEIGHT = DESK_Y - WORKTOP_SIZE.height - OFFICE_FLOOR_Y
const BANK_INNER_X = OFFICE_LAYOUT.aisleHalfWidth
const BANK_OUTER_X = 76
const BANK_PANEL_WIDTH = BANK_OUTER_X - BANK_INNER_X
const BANK_PANEL_CENTER_X = (BANK_OUTER_X + BANK_INNER_X) / 2
const BAY_EDGES_Z = [-20, -62, -104, -146, -188]

// The hero bay forms a portal at the aisle mouth. Beyond it, transverse panel
// pairs repeat down both banks while the central aisle remains continuously
// open. Outer partitions and a full-height shell ensure no camera can discover
// a raw set edge behind the repeated bays.
const CUBICLE_PANEL_BODIES = [
  {
    position: [-27.5, FOREGROUND_PANEL_CENTER_Y, -2],
    scale: [1, FOREGROUND_PANEL_HEIGHT, 36],
  },
  {
    position: [27.5, FOREGROUND_PANEL_CENTER_Y, -2],
    scale: [1, FOREGROUND_PANEL_HEIGHT, 36],
  },
  ...BAY_EDGES_Z.flatMap((z) =>
    [-1, 1].map((side) => ({
      position: [side * BANK_PANEL_CENTER_X, PANEL_CENTER_Y, z],
      scale: [BANK_PANEL_WIDTH, PANEL_HEIGHT, 1],
    }))
  ),
  {
    position: [-BANK_OUTER_X, PANEL_CENTER_Y, -80],
    scale: [1, PANEL_HEIGHT, 216],
  },
  {
    position: [BANK_OUTER_X, PANEL_CENTER_Y, -80],
    scale: [1, PANEL_HEIGHT, 216],
  },
  { position: [0, PANEL_CENTER_Y, -190], scale: [154, PANEL_HEIGHT, 1] },
]

const panelRails = CUBICLE_PANEL_BODIES.flatMap(({ position, scale }) => {
  const transverse = scale[0] > scale[2]
  // 1.3 units ≈ 42mm, which is what a real fabric-panel top cap measures. The
  // previous 0.45 (15mm) was both wrong and thin enough to fall under the Q1
  // 1.5px floor at every wide framing.
  const railScale = transverse
    ? [scale[0] + 0.8, 1.3, 1.6]
    : [1.6, 1.3, scale[2] + 0.8]
  const bodyTop = position[1] + scale[1] / 2
  const bodyBottom = position[1] - scale[1] / 2
  return [
    { position: [position[0], bodyTop + 0.2, position[2]], scale: railScale },
    {
      position: [position[0], bodyBottom - 0.1, position[2]],
      scale: [railScale[0], 0.7, railScale[2]],
    },
  ]
})

const panelPosts = [
  {
    position: [-27.5, (OFFICE_FLOOR_Y + FOREGROUND_PANEL_TOP_Y + 0.2) / 2, 16],
    scale: [1.1, FOREGROUND_PANEL_TOP_Y + 0.2 - OFFICE_FLOOR_Y, 1.5],
  },
  {
    position: [27.5, (OFFICE_FLOOR_Y + FOREGROUND_PANEL_TOP_Y + 0.2) / 2, 16],
    scale: [1.1, FOREGROUND_PANEL_TOP_Y + 0.2 - OFFICE_FLOOR_Y, 1.5],
  },
  ...BAY_EDGES_Z.flatMap((z) =>
    [-BANK_OUTER_X, -BANK_INNER_X, BANK_INNER_X, BANK_OUTER_X].map((x) => ({
      position: [x, PANEL_POST_CENTER_Y, z],
      scale: [1.1, PANEL_POST_HEIGHT, 1.5],
    }))
  ),
]

const CUBICLE_PANEL_FRAME = [...panelRails, ...panelPosts]

const CUBICLE_WORKTOPS = [
  {
    position: [0, DESK_Y - WORKTOP_SIZE.height / 2, 0.2],
    rotation: [0, 0, 0],
    scale: [1.3, 1, 0.97],
  },
  ...OFFICE_LAYOUT.stations.map(({ deskPosition }) => ({
    position: deskPosition,
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  })),
]

const CUBICLE_BAKED_FLOOR = [
  {
    position: [0, OFFICE_FLOOR_Y + 0.028, -80],
    rotation: [-Math.PI / 2, 0, 0],
    scale: [260, 360],
  },
]

const CUBICLE_BAKED_SURFACES = [
  ...CUBICLE_WORKTOPS.map(({ position, scale }) => ({
    position: [position[0], DESK_Y + 0.018, position[2]],
    rotation: [-Math.PI / 2, 0, 0],
    scale: [WORKTOP_SIZE.width * scale[0], WORKTOP_SIZE.depth * scale[2]],
  })),
  ...[-1, 1].map((side) => ({
    position: [side * 27.48, FOREGROUND_PANEL_CENTER_Y, -2],
    rotation: [0, Math.PI / 2, 0],
    scale: [34, FOREGROUND_PANEL_HEIGHT * 0.94],
  })),
  ...BAY_EDGES_Z.flatMap((z) =>
    [-1, 1].map((side) => ({
      position: [side * BANK_PANEL_CENTER_X, PANEL_CENTER_Y, z + 0.515],
      rotation: [0, 0, 0],
      scale: [BANK_PANEL_WIDTH * 0.94, PANEL_HEIGHT * 0.9],
    }))
  ),
]

// Rectangular footprints get the superellipse mask; only the chair's five-star
// base is actually round. See ContactPatches for why one shared radial blob was
// never going to ground a pedestal or a desk foot.
const CUBICLE_DESK_CONTACTS_RECT = [
  [0, DESK_Y + 0.035, -0.6, 10.5, 4.8], // monitor stand
  [-0.4, DESK_Y + 0.035, 9.1, 11, 3.6, -0.05], // keyboard
  [-10.5, DESK_Y + 0.035, 7.3, 7.6, 5.2, 0.22], // loose paper — previously none
  [-14.2, DESK_Y + 0.035, 5.8, 3, 4, -0.14], // ID badge — previously none
]

const CUBICLE_DESK_CONTACTS_RADIAL = [
  [6.1, DESK_Y + 0.035, 9, 3.8, 3, 0.22], // mouse
  [9.9, DESK_Y + 0.035, 5.4, 3.2, 3.2], // mug
]

const CUBICLE_FLOOR_CONTACTS_RADIAL = [
  [-41, OFFICE_FLOOR_Y + 0.035, 18, 22, 24, 0.18], // chair five-star base
]

const CUBICLE_FLOOR_CONTACTS_RECT = [
  [18, OFFICE_FLOOR_Y + 0.035, -3, 17, 19], // hero pedestal
  [-20, OFFICE_FLOOR_Y + 0.035, -5.8, 18, 9], // cantilever base rail
  ...OFFICE_LAYOUT.stations.flatMap(({ side, deskPosition, pedestal }) => {
    const [deskX, , deskZ] = deskPosition
    const [pedestalX, , pedestalZ, pedestalYaw] = pedestal
    return [
      [pedestalX, OFFICE_FLOOR_Y + 0.035, pedestalZ, 17, 19, pedestalYaw],
      [
        deskX + side * 12.5,
        OFFICE_FLOOR_Y + 0.035,
        deskZ + 5,
        8,
        17,
      ],
    ]
  }),
]

const heroDeskFrame = [
  {
    position: [-20, OFFICE_FLOOR_Y + SUPPORT_COLUMN_HEIGHT / 2, -8],
    scale: [1.9, SUPPORT_COLUMN_HEIGHT, 2.2],
  },
  {
    position: [-20, OFFICE_FLOOR_Y + 0.425, -5.8],
    scale: [13.5, 0.85, 3.2],
  },
  { position: [0, DESK_Y - 3.1, -15.2], scale: [43, 2.1, 1.5] },
]

const CUBICLE_DESK_FRAMES = [
  ...heroDeskFrame,
  ...OFFICE_LAYOUT.stations.flatMap(({ side, deskPosition }) => {
    const [deskX, , deskZ] = deskPosition
    const outerX = deskX + side * 12.5
    return [
      {
        position: [outerX, OFFICE_FLOOR_Y + SUPPORT_COLUMN_HEIGHT / 2, deskZ + 5],
        scale: [2.2, SUPPORT_COLUMN_HEIGHT, 1.9],
      },
      {
        position: [outerX, OFFICE_FLOOR_Y + 0.425, deskZ + 5],
        scale: [3.2, 0.85, 13.5],
      },
      {
        position: [deskX + side * 18.8, DESK_Y - 3.1, deskZ],
        scale: [1.5, 2.1, 34],
      },
    ]
  }),
]

const CUBICLE_SHELL = [
  {
    position: [-94, OFFICE_SHELL_CENTER_Y, -85],
    scale: [2, OFFICE_SHELL_HEIGHT, 310],
  },
  {
    position: [94, OFFICE_SHELL_CENTER_Y, -85],
    scale: [2, OFFICE_SHELL_HEIGHT, 310],
  },
  {
    position: [0, OFFICE_SHELL_CENTER_Y, -240],
    scale: [190, OFFICE_SHELL_HEIGHT, 2],
  },
]

/**
 * The office described to the environment painter, in the room's own frame.
 *
 * Handed OUT rather than imported IN because `environment.js` sits upstream of
 * this module (CRTScreen reads the look presets), and the same shape is already
 * how `makeCeilingMaps` is fed. One authored office, two consumers.
 */
export const OFFICE_ENVIRONMENT_SPEC = Object.freeze({
  // The shell walls are 2 units thick and centred on ±94 / -240, so the inner
  // faces — the surfaces that actually reflect — sit one unit inboard. Open at
  // +z, where the camera enters; closed there anyway, because a hole in an
  // environment map returns black and reads as a missing wall.
  room: {
    min: [-93, OFFICE_FLOOR_Y, -239],
    max: [93, OFFICE_CEILING_Y, 62],
  },
  fixtures: OFFICE_LAYOUT.fixtures,
  fixtureSize: { width: 26.2, depth: 5.9 },
  // Seated in the hero bay. An environment map is direction-only, so this is
  // the one place in the room whose parallax it can be right about — and the
  // hero bay is the framing that has to hold up.
  eye: [0, DESK_Y + 4, 2],
  panelTopY: PANEL_TOP_Y,
  worktopY: DESK_Y,
})

function placeScaledInstances(mesh, placements, dummy) {
  placements.forEach(({ position, rotation = [0, 0, 0], scale }, index) => {
    dummy.position.set(...position)
    dummy.rotation.set(...rotation)
    dummy.scale.set(...scale)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
}

/**
 * Weave repeats per scene unit. 0.031 ≈ one 1024px tile per metre, which lands
 * the panels at roughly 1000 px/m — the hero end of QUALITY Q4's density band,
 * and close to what the old 154-unit panel happened to get right before the
 * shared-geometry stretch ruined every other panel.
 */
const FABRIC_DENSITY = 0.031

/**
 * One box geometry is instanced into partitions from 36 to 216 units long, and a
 * BoxGeometry's UVs are 0–1 per face regardless of instance scale. A fixed
 * `repeat` therefore stretches the weave differently on every panel and squashes
 * it into a sliver on the thin side faces.
 *
 * Derive the UV from the instance's own dimensions instead, picking the correct
 * pair per face from the object-space normal so a side face gets (z, y) rather
 * than (x, y). The result is one physical fabric scale across the whole set.
 */
function withPerInstanceFabricUv(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 aInstanceScale;`
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        {
          vec3 faceAxis = abs(normal);
          vec2 faceSize = faceAxis.z > 0.5
            ? aInstanceScale.xy
            : (faceAxis.x > 0.5 ? aInstanceScale.zy : aInstanceScale.xz);
          vec2 fabricUv = uv * faceSize * ${FABRIC_DENSITY.toFixed(5)};
          #ifdef USE_MAP
            vMapUv = fabricUv;
          #endif
          #ifdef USE_NORMALMAP
            vNormalMapUv = fabricUv;
          #endif
          #ifdef USE_ROUGHNESSMAP
            vRoughnessMapUv = fabricUv;
          #endif
        }`
      )
  }
  // Distinct from any other material sharing this shader family, so three does
  // not hand it a cached program compiled without the attribute.
  material.customProgramCacheKey = () => 'cubicle-panel-fabric-uv'
  return material
}

/** Per-instance dimensions for `withPerInstanceFabricUv`. */
function attachInstanceScales(geometry, placements) {
  const data = new Float32Array(placements.length * 3)
  placements.forEach(({ scale }, index) => {
    data[index * 3] = scale[0]
    data[index * 3 + 1] = scale[1]
    data[index * 3 + 2] = scale[2]
  })
  geometry.setAttribute(
    'aInstanceScale',
    new THREE.InstancedBufferAttribute(data, 3)
  )
  return geometry
}

function makeCubiclePlacements() {
  const rand = mulberry32(0xc0b1c1e)
  const spots = OFFICE_LAYOUT.stations.flatMap(({ monitors }) => monitors)
  return spots.map(([x, y, z, yaw], i) => ({
    position: [x, y, z],
    rotation: [0, yaw, 0],
    scale: OFFICE_LAYOUT.monitorScale,
    variant: i + 1,
    phase: rand() * 11,
    drive: 0.55 + rand() * 0.35,
  }))
}

function OfficeShadowLight() {
  const light = useRef()
  const scene = useThree((state) => state.scene)
  useEffect(() => {
    if (!light.current) return undefined
    const target = light.current.target
    // Re-aimed between the hero bay, the foreground chair and the pedestal so a
    // NARROW cone still covers all three. The old axis pointed at the desk alone,
    // which forced a 54° cone just to keep the chair lit — and a 54° cone on a
    // 1024² map has nowhere near the texel density to resolve a contact edge.
    target.position.set(-8, DESK_Y - 10, 2)
    scene.add(target)
    target.updateMatrixWorld()
    return () => scene.remove(target)
  }, [scene])
  return (
    <spotLight
      ref={light}
      position={[6, 31, 10]}
      color="#e8f2ed"
      intensity={3400}
      distance={170}
      // 31.5° instead of 54°, on a 2048² map clamped to the occupied depth
      // range: ~20× the shadow texels per unit at the desk and floor. That is
      // the whole reason the chair, pedestal and monitor now ground.
      angle={0.55}
      penumbra={0.7}
      decay={2}
      castShadow
      // 1024², not 2048². The cone narrowing from 54° to 31.5° already bought
      // ~5x the texel density at the desk on its own; the extra 12 MiB of
      // resident depth buffer bought refinement this wide framing cannot show.
      shadow-mapSize={[1024, 1024]}
      shadow-radius={3}
      shadow-camera-near={28}
      shadow-camera-far={115}
      shadow-bias={-0.0004}
      shadow-normalBias={0.025}
    />
  )
}

/**
 * Painted once and resident from first mount: both the ceiling plane's extents
 * and the fixture layout are authored constants, so this can never change during
 * the talk and must never be built during a navigation (QUALITY Q2 — navigation
 * adds zero textures).
 */
function useCeilingMaps() {
  return useMemo(
    () =>
      makeCeilingMaps({
        plane: { width: 260, depth: 360, centerZ: -80 },
        fixtures: OFFICE_LAYOUT.fixtures,
        fixtureSize: { width: 26.2, depth: 5.9 },
      }),
    []
  )
}

function OfficeLighting() {
  const ceilingMaps = useCeilingMaps()
  return (
    <group>
      {/* Neutral skylight raises the office shadows without erasing shape.
          Two broad sources represent four modeled troffers, halving the area
          light work while preserving their long ceiling reflections. The
          hemisphere also keeps the ceiling plane and grid readable — a black
          void with floating lit rectangles breaks the frame's physical claim. */}
      {/* Hemisphere kept LOW: it exists only so the ceiling plane and grid
          are readable, never to fill the room — broad fill is what makes an
          office read as one uniform gray. The energy lives in the shaped
          troffer sources, so pools of light alternate with negative fill down
          the aisle (ART-DIRECTION's fluorescent grammar). */}
      {/* The GROUND colour is doing real work and is not a fill: a hemisphere
          lights downward-facing normals with it, and in this room the only
          downward-facing surface that matters is the whole suspended ceiling.
          Nothing else in the scene points light at it — the troffers are
          emissive, which illuminates nothing in three — so at #49504c the
          tiles went to near-black and the ceiling read as painted plenum
          rather than mineral fibre. This is the cream laminate and the carpet
          returning the troffers, which is genuinely what lights an office
          ceiling. Intensity stays at 0.12 so the SKY term is untouched and
          nothing upward-facing gets the flat wash — raising THAT is what turns
          an office into one uniform gray, which is the whole reason this light
          is dim in the first place. */}
      <hemisphereLight color="#dfe6e3" groundColor="#ffffff" intensity={0.12} />
      <OfficeShadowLight />
      <rectAreaLight
        position={[0, 31.3, 6]}
        rotation={[-Math.PI / 2, 0, 0]}
        width={58}
        height={8}
        color="#e5efea"
        intensity={9.5}
      />
      <rectAreaLight
        position={[0, 31.3, -78]}
        rotation={[-Math.PI / 2, 0, 0]}
        width={58}
        height={8}
        color="#e5efea"
        intensity={9}
      />
      {/* This plane was a bare colour, which is why the ceiling read as a black
          void with lit rectangles floating in it. Two things were missing and
          the map supplies both: the modeled T-grid correctly fades out below
          Nyquist (QUALITY Q1) but had nothing to fade INTO, and an emissive
          diffuser lights nothing in three, so no fixture ever brightened its own
          tile — which a recessed lens always does. */}
      <mesh position={[0, OFFICE_CEILING_Y, -80]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[260, 360]} />
        {/* Mineral fibre is a genuinely pale material — around 0.75 reflectance
            — and it is the single largest surface in every wide framing, so
            underdriving it costs the room its whole upper value range. */}
        <meshStandardMaterial
          color="#9ea6a1"
          roughness={0.9}
          emissive="#ffffff"
          emissiveIntensity={0.62}
          {...ceilingMaps}
        />
      </mesh>
      <OfficeDetails />
    </group>
  )
}

function CubicleStage({ active }) {
  const placements = useMemo(() => makeCubiclePlacements(), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const unitBoxGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  // Its own geometry, because the instanced dimension attribute is sized to the
  // panel-body instance count and the unit box is shared with three other draws.
  const panelBodyGeometry = useMemo(
    () => attachInstanceScales(new THREE.BoxGeometry(1, 1, 1), CUBICLE_PANEL_BODIES),
    []
  )
  const worktopGeometry = useMemo(
    () =>
      new RoundedBoxGeometry(
        WORKTOP_SIZE.width,
        WORKTOP_SIZE.height,
        WORKTOP_SIZE.depth,
        4,
        0.42
      ),
    []
  )
  const fabric = useTexture({
    map: '/textures/rough-linen/diffuse.jpg',
    normalMap: '/textures/rough-linen/normal.jpg',
    roughnessMap: '/textures/rough-linen/roughness.jpg',
  })
  // Relief only. The photographic diffuse is no longer used — the tile field in
  // carpet.js carries albedo — so it is not loaded and does not sit resident.
  const carpet = useTexture({
    normalMap: '/textures/office-carpet/normal.jpg',
    roughnessMap: '/textures/office-carpet/roughness.jpg',
  })
  const laminateSource = useTexture({
    normalMap: '/textures/painted-plaster/normal.jpg',
    roughnessMap: '/textures/painted-plaster/roughness.jpg',
  })
  const irradianceSource = useTexture(
    '/textures/lightmaps/cubicle-irradiance.png'
  )
  const floorIrradianceSource = useTexture(
    '/textures/lightmaps/cubicle-floor-irradiance.png'
  )
  const irradianceMap = useMemo(
    () => configureIrradianceTexture(irradianceSource),
    [irradianceSource]
  )
  const floorIrradianceMap = useMemo(
    () => configureIrradianceTexture(floorIrradianceSource),
    [floorIrradianceSource]
  )
  const fabricMaps = useMemo(() => {
    for (const texture of Object.values(fabric)) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      // Repeat is 1:1 here and the real density is applied PER INSTANCE in the
      // vertex shader (see FABRIC_DENSITY). One shared unit box carries panels
      // scaled from 36 to 216 units long, so a fixed repeat stretched the same
      // weave over a 6× range of physical sizes — adjacent partitions implied
      // wildly different material scale, which is a Q4 failure, and the
      // vertical repeat was a further 5:1 stretch against the horizontal.
      texture.repeat.set(1, 1)
      texture.anisotropy = 8
      texture.colorSpace = THREE.NoColorSpace
    }
    fabric.map.colorSpace = THREE.SRGBColorSpace
    return fabric
  }, [fabric])
  const carpetMaps = useMemo(() => {
    // Relief keeps the fine photographic repeat — it is the close-framing
    // detail. The photographic DIFFUSE is dropped in favour of the tile field,
    // which carries the metre-scale structure the wide framings actually
    // resolve; three gives each map its own uv transform, so the two scales
    // coexist on one material.
    for (const texture of [carpet.normalMap, carpet.roughnessMap]) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(18, 24)
      texture.anisotropy = 6
      texture.colorSpace = THREE.NoColorSpace
    }
    return {
      normalMap: carpet.normalMap,
      roughnessMap: carpet.roughnessMap,
      map: makeCarpetTileMap({ width: 260, depth: 360 }),
    }
  }, [carpet])
  const laminatePrint = useMemo(() => makeLaminateMap(), [])
  const laminateMaps = useMemo(() => {
    const maps = {}
    for (const [name, source] of Object.entries(laminateSource)) {
      const texture = source.clone()
      texture.needsUpdate = true
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(18, 12)
      texture.anisotropy = 8
      texture.colorSpace = THREE.NoColorSpace
      maps[name] = texture
    }
    return maps
  }, [laminateSource])
  const materials = useMemo(() => {
    const set = {
      panel: withPerInstanceFabricUv(
        new THREE.MeshPhysicalMaterial({
          color: '#777873',
          roughness: 0.86,
          metalness: 0,
          normalScale: new THREE.Vector2(0.5, 0.5),
          sheen: 0.45,
          sheenColor: '#b7b8b1',
          sheenRoughness: 0.8,
          envMapIntensity: 0.64,
          ...fabricMaps,
        })
      ),
      // Satin anodised cap, not a mirror. At metalness 0.7 / roughness 0.34 a
      // 0.45-unit rail is a shiny sliver: it projects near a pixel wide at the
      // wide framings and broke into crawling dashes along every panel top.
      // Q1 forbids that; a real top cap is also 40mm, not 15mm (see panelRails).
      panelFrame: new THREE.MeshPhysicalMaterial({
        color: '#5f6462',
        roughness: 0.55,
        metalness: 0.25,
        clearcoat: 0.04,
        clearcoatRoughness: 0.6,
        envMapIntensity: 0.7,
      }),
      // `map` is the fleck print (laminate.js); the plaster set supplies the
      // tooth under it. normalScale was 0.045, which is near enough to flat
      // that the largest bright surface in the room returned one uniform
      // value under every highlight — the single most reliable clay tell in
      // the set.
      worktop: new THREE.MeshPhysicalMaterial({
        color: '#9f9b91',
        roughness: 0.61,
        metalness: 0,
        clearcoat: 0.08,
        clearcoatRoughness: 0.64,
        envMapIntensity: 0.88,
        normalScale: new THREE.Vector2(0.19, 0.19),
        ...laminateMaps,
        map: laminatePrint,
      }),
      deskFrame: new THREE.MeshPhysicalMaterial({
        color: '#475052',
        roughness: 0.4,
        metalness: 0.58,
        clearcoat: 0.025,
        clearcoatRoughness: 0.55,
        envMapIntensity: 0.94,
      }),
      carpet: new THREE.MeshStandardMaterial({
        color: '#c4cbc7',
        roughness: 0.98,
        metalness: 0,
        normalScale: new THREE.Vector2(0.38, 0.38),
        ...carpetMaps,
      }),
      // The shell carries the side walls and the far termination. At #313735
      // they had no albedo left to return the ceiling's fill, so every wide
      // framing put a bright ceiling and floor against dead black verticals —
      // ART-DIRECTION's explicit lighting failure ("bright tops over dead
      // sides"). Still a dim room; just a room with walls in it.
      shell: new THREE.MeshStandardMaterial({
        color: '#4b534f',
        roughness: 0.93,
        metalness: 0,
      }),
    }
    return set
  }, [carpetMaps, fabricMaps, laminateMaps, laminatePrint])
  const placePanelBodies = useCallback(
    (mesh) => placeScaledInstances(mesh, CUBICLE_PANEL_BODIES, dummy),
    [dummy]
  )
  const placePanelFrame = useCallback(
    (mesh) => placeScaledInstances(mesh, CUBICLE_PANEL_FRAME, dummy),
    [dummy]
  )
  const placeWorktops = useCallback(
    (mesh) => placeScaledInstances(mesh, CUBICLE_WORKTOPS, dummy),
    [dummy]
  )
  const placeDeskFrames = useCallback(
    (mesh) => placeScaledInstances(mesh, CUBICLE_DESK_FRAMES, dummy),
    [dummy]
  )
  const placeShell = useCallback(
    (mesh) => placeScaledInstances(mesh, CUBICLE_SHELL, dummy),
    [dummy]
  )

  return (
    <group>
      <OfficeLighting />

      {/* This stage owns its architectural shell instead of inheriting Room's
          single rear wall at z=-62. The floor, side walls, and far termination
          continue past every repeated bay, so the aisle never opens into void. */}
      <mesh
        position={[0, OFFICE_FLOOR_Y, -80]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={materials.carpet}
        receiveShadow
      >
        <planeGeometry args={[260, 360]} />
      </mesh>
      <instancedMesh
        args={[unitBoxGeometry, materials.shell, CUBICLE_SHELL.length]}
        receiveShadow
        onUpdate={placeShell}
      />

      {/* Full-height panel skins terminate in one instanced frame system. The
          bodies stop 15mm above the carpet and overlap a floor-contacting base
          rail, removing both the old floating partition and its raw set edge. */}
      <instancedMesh
        args={[panelBodyGeometry, materials.panel, CUBICLE_PANEL_BODIES.length]}
        castShadow
        receiveShadow
        onUpdate={placePanelBodies}
      />
      <instancedMesh
        args={[unitBoxGeometry, materials.panelFrame, CUBICLE_PANEL_FRAME.length]}
        castShadow
        receiveShadow
        onUpdate={placePanelFrame}
      />

      {/* The hero worktop and eight bank worktops share one rounded laminate
          geometry and one instanced support system. Four repeated depths per
          bank create parallax without adding a draw for each workstation. */}
      <instancedMesh
        args={[worktopGeometry, materials.worktop, CUBICLE_WORKTOPS.length]}
        castShadow
        receiveShadow
        onUpdate={placeWorktops}
      />
      <instancedMesh
        args={[unitBoxGeometry, materials.deskFrame, CUBICLE_DESK_FRAMES.length]}
        castShadow
        receiveShadow
        onUpdate={placeDeskFrames}
      />

      <AgentMonitors placements={placements} active={active} />
      <BakedIrradianceLayer
        texture={floorIrradianceMap}
        bounds={IRRADIANCE_BOUNDS.cubicle}
        intensity={0.3}
        placements={CUBICLE_BAKED_FLOOR}
      />
      <BakedIrradianceLayer
        texture={irradianceMap}
        bounds={IRRADIANCE_BOUNDS.cubicle}
        intensity={0.2}
        placements={CUBICLE_BAKED_SURFACES}
      />
      {/* These were 0.12 / 0.2 — under the office's broad neutral fill that is
          indistinguishable from nothing, which is why the chair, pedestal and
          desk feet all appeared to hover. */}
      <ContactPatches
        patches={CUBICLE_DESK_CONTACTS_RECT}
        opacity={0.26}
        shape="rect"
      />
      <ContactPatches patches={CUBICLE_DESK_CONTACTS_RADIAL} opacity={0.32} />
      <ContactPatches
        patches={CUBICLE_FLOOR_CONTACTS_RECT}
        opacity={0.34}
        shape="rect"
      />
      <ContactPatches patches={CUBICLE_FLOOR_CONTACTS_RADIAL} opacity={0.44} />
    </group>
  )
}

function makeWallPlacements() {
  const rand = mulberry32(0xa93e17)
  const out = []
  let variant = 1

  // A compact rear bank keeps the hero monitor's exact centre slot. The former
  // eleven-column facade is reduced to the part that should read head-on.
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const cx = col - 2
      const cy = 2 - row
      if (cx === 0 && cy === 0) continue
      out.push({
        position: [cx * 19.2, cy * 16.5, -0.2],
        rotation: [0, 0, 0],
        scale: 1,
        variant: variant++,
        phase: rand() * 14,
        // Wide spread on purpose: 54 identical brightnesses read as wallpaper,
        // not as 54 separate agents. Some screens run hot, some idle.
        drive: 0.34 + rand() * 1.05,
      })
    }
  }

  // Thirty additional cells turn toward the camera on two three-deep wings.
  // The wings narrow as they recede, producing a concave infrastructure vault
  // rather than a contact sheet with artificial z jitter.
  const wingDepths = [
    { x: 78, z: 26, yaw: 0.68 },
    { x: 69, z: 1, yaw: 0.61 },
    { x: 60, z: -24, yaw: 0.54 },
  ]
  for (const side of [-1, 1]) {
    for (const depth of wingDepths) {
      for (let row = 0; row < 5; row++) {
        out.push({
          position: [side * depth.x, (2 - row) * 16.5, depth.z],
          rotation: [0, side < 0 ? depth.yaw : -depth.yaw, 0],
          scale: 1,
          variant: variant++,
          phase: rand() * 14,
          drive: 0.34 + rand() * 1.05,
        })
      }
    }
  }
  return out
}

function rackBox(placement, localPosition, scale) {
  const yaw = placement.rotation[1]
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  const [localX, localY, localZ] = localPosition
  return {
    position: [
      placement.position[0] + localX * cos + localZ * sin,
      placement.position[1] + localY,
      placement.position[2] - localX * sin + localZ * cos,
    ],
    rotation: [0, yaw, 0],
    scale,
  }
}

function makeRackArchitecture(placements) {
  const heroCell = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    hero: true,
  }
  const cells = [...placements, heroCell]
  const backings = cells.map((cell) =>
    rackBox(
      cell,
      [0, 0, cell.hero ? -18 : -9.2],
      [18.55, 15.75, 1.35]
    )
  )
  const frames = cells.flatMap((cell) => [
    rackBox(cell, [0, 7.95, -4.6], [19.45, 0.42, 9.6]),
    rackBox(cell, [0, -7.95, -4.6], [19.45, 0.42, 9.6]),
    rackBox(cell, [-9.15, 0, -4.6], [0.42, 16.3, 9.6]),
    rackBox(cell, [9.15, 0, -4.6], [0.42, 16.3, 9.6]),
  ])
  return { backings, frames }
}

const WALL_SHELL = [
  { position: [0, -43, 2], scale: [190, 1.5, 180] },
  { position: [0, 43, 2], scale: [190, 1.5, 180] },
  { position: [-94, 0, 2], scale: [2, 87, 180] },
  { position: [94, 0, 2], scale: [2, 87, 180] },
  { position: [0, 0, -42], scale: [190, 87, 2] },
]

function AgentWall({ active }) {
  const placements = useMemo(() => makeWallPlacements(), [])
  const architecture = useMemo(
    () => makeRackArchitecture(placements),
    [placements]
  )
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const unitBoxGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const materials = useMemo(
    () => ({
      // Enough albedo that the aggregate screen spill grounds the vault's
      // floor and ceiling; near-vantablack could not return any light and the
      // wall read as rows floating in a void — which is exactly what it still
      // did at #0b1210, with half the frame measuring below 10/255.
      shell: new THREE.MeshStandardMaterial({
        color: '#1d2523',
        roughness: 0.94,
        metalness: 0.04,
      }),
      backing: new THREE.MeshStandardMaterial({
        color: '#12181a',
        roughness: 0.84,
        metalness: 0.12,
      }),
      frame: new THREE.MeshStandardMaterial({
        color: '#18201f',
        roughness: 0.46,
        metalness: 0.52,
      }),
    }),
    []
  )
  const placeShell = useCallback(
    (mesh) => placeScaledInstances(mesh, WALL_SHELL, dummy),
    [dummy]
  )
  const placeBackings = useCallback(
    (mesh) => placeScaledInstances(mesh, architecture.backings, dummy),
    [architecture.backings, dummy]
  )
  const placeFrames = useCallback(
    (mesh) => placeScaledInstances(mesh, architecture.frames, dummy),
    [architecture.frames, dummy]
  )
  const irradiance = useMemo(() => {
    const screenReturns = placements.map((placement) => {
      const transform = rackBox(
        placement,
        [0, 0, -8.51],
        [17.2, 13.8, 1]
      )
      return {
        position: transform.position,
        rotation: transform.rotation,
        scale: [transform.scale[0], transform.scale[1]],
        color: '#d9a94f',
        strength: 0.028 + placement.drive * 0.05,
      }
    })
    // Fifty-four emitters facing an unlit floor and ceiling is not a lit room.
    // These are the aggregate throw onto the vault's own surfaces — the pools a
    // bank of screens actually lays down in front of itself — authored as static
    // world-space cards rather than as more runtime lights, which ART-DIRECTION
    // rules out.
    const vaultReturns = [
      {
        position: [0, -42.2, 6],
        rotation: [-Math.PI / 2, 0, 0],
        scale: [170, 120],
        color: '#c99a45',
        strength: 0.2,
      },
      {
        position: [0, 42.2, 6],
        rotation: [Math.PI / 2, 0, 0],
        scale: [170, 110],
        color: '#b98f42',
        strength: 0.14,
      },
      {
        position: [-92.6, 0, 8],
        rotation: [0, Math.PI / 2, 0],
        scale: [130, 74],
        color: '#c99a45',
        strength: 0.11,
      },
      {
        position: [92.6, 0, 8],
        rotation: [0, -Math.PI / 2, 0],
        scale: [130, 74],
        color: '#c99a45',
        strength: 0.11,
      },
    ]

    return [
      ...screenReturns,
      ...vaultReturns,
      {
        position: [0, 0, -17.31],
        rotation: [0, 0, 0],
        scale: [17.2, 13.8],
        color: '#d9a94f',
        strength: 0.062,
      },
    ]
  }, [placements])

  return (
    <group>
      {/* A continuous floor/ceiling shell and deep cell boxes make the screen
          field occupiable architecture. All five shell pieces are one draw. */}
      <instancedMesh
        args={[unitBoxGeometry, materials.shell, WALL_SHELL.length]}
        receiveShadow
        onUpdate={placeShell}
      />
      <instancedMesh
        args={[unitBoxGeometry, materials.backing, architecture.backings.length]}
        receiveShadow
        onUpdate={placeBackings}
      />
      <instancedMesh
        args={[unitBoxGeometry, materials.frame, architecture.frames.length]}
        receiveShadow
        onUpdate={placeFrames}
      />
      <IrradiancePatches patches={irradiance} />
      <AgentMonitors placements={placements} active={active} />

      {/* One broad reflection source still represents the aggregate screen
          spill. Rebuilding the wall adds no runtime light. */}
      <rectAreaLight
        position={[0, 2, 34]}
        rotation={[0, 0, 0]}
        width={175}
        height={82}
        color="#d9a94f"
        intensity={2.4}
      />
    </group>
  )
}

function StageSet({ stage, screenTexture }) {
  const monitorVisible = stage !== 'phosphor'

  return (
    <>
      {/* Every context stays mounted, but exactly one annotated stage branch is
          visible. PresentationWarmup uses the same annotations to render each
          real variant offscreen, one at a time; it never creates the synthetic
          all-sets/all-lights scene that the old compile pass did. */}
      <group
        visible={monitorVisible}
        userData={{ presentationStages: ['home', 'cubicle', 'wall'] }}
      >
        <Monitor />
      </group>
      <group
        visible={stage === 'home'}
        userData={{ presentationStages: ['home'] }}
      >
        <HomeOffice />
      </group>
      <group
        visible={stage === 'cubicle'}
        userData={{ presentationStages: ['cubicle'] }}
      >
        <Props />
        <CubicleStage active={stage === 'cubicle'} />
      </group>
      <group
        visible={stage === 'wall'}
        userData={{ presentationStages: ['wall'] }}
      >
        <AgentWall active={stage === 'wall'} />
      </group>
      <group
        visible={stage === 'phosphor'}
        userData={{ presentationStages: ['phosphor'] }}
      >
        <PhosphorField texture={screenTexture} />
      </group>
    </>
  )
}

/**
 * Keeps backward set swaps hidden behind the hero glass. Immediate-safe stage
 * decisions are made synchronously with navigation in presentationRuntime;
 * this component owns only the camera-dependent backward threshold gate.
 *
 * The visibility commit updates the one displayStage store. ShadowLifecycle's
 * layout effect then invalidates shadows after React has committed geometry,
 * lights, environment, dust, and post settings for that same stage.
 */
export function StageDirector({ screenTexture }) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const displayStage = usePresentationRuntime((state) => state.displayStage)
  const corners = useMemo(
    () => [
      [-SCREEN_W / 2, -SCREEN_H / 2, 0],
      [SCREEN_W / 2, -SCREEN_H / 2, 0],
      [SCREEN_W / 2, SCREEN_H / 2, 0],
      [-SCREEN_W / 2, SCREEN_H / 2, 0],
    ],
    []
  )
  const forward = useMemo(() => new THREE.Vector3(), [])
  const screenNormal = useMemo(() => new THREE.Vector3(0, 0, -1), [])
  const projected = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    if (!usePresentationRuntime.getState().pendingStage) return

    camera.getWorldDirection(forward)
    const facing = forward.dot(screenNormal)
    if (facing < 0.997) return

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const corner of corners) {
      projected.set(...corner).project(camera)
      minX = Math.min(minX, projected.x)
      maxX = Math.max(maxX, projected.x)
      minY = Math.min(minY, projected.y)
      maxY = Math.max(maxY, projected.y)
    }
    const covered = minX <= -1.01 && maxX >= 1.01 && minY <= -1.01 && maxY >= 1.01
    if (covered) {
      commitPendingStage('glass-covered', gl.info.render.frame, {
        facing,
        bounds: { minX, maxX, minY, maxY },
      })
    }
  })

  return <StageSet stage={displayStage} screenTexture={screenTexture} />
}
