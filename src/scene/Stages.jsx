import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useTexture } from '@react-three/drei'
import {
  commitPendingStage,
  usePresentationRuntime,
} from '../state/presentationRuntime.js'
import { DESK_Y, OFFICE_FLOOR_Y } from './Room.jsx'
import { HomeOffice } from './HomeOffice.jsx'
import {
  CubicleOffice,
  OFFICE_FIXTURES,
  OFFICE_FIXTURE_SIZE,
} from './CubicleOffice.jsx'
import { AgentVault } from './AgentVault.jsx'
import { Monitor } from './Monitor.jsx'
import { PhosphorField } from './PhosphorField.jsx'
import { ContactPatches } from './ContactPatches.jsx'
import {
  configureIrradianceTexture,
  IRRADIANCE_BOUNDS,
} from './bakedIrradiance.js'
import { BakedIrradianceLayer } from './BakedIrradianceLayer.jsx'

const SCREEN_W = 16
const SCREEN_H = 9

/**
 * ── The cubicle's spatial contract ──
 * Shared with the Blender build (blender/office/build_scene.py), which
 * models every visible surface on these numbers. What the runtime still
 * places here — the light rig, the irradiance receivers, the contact
 * patches — is positioned from the same constants.
 */
const PANEL_TOP_Y = DESK_Y + 22.7
const HERO_PANEL_TOP_Y = DESK_Y + 15.5
const RACEWAY_TOP_Y = OFFICE_FLOOR_Y + 3.23
const CAP_HEIGHT = 1.3
const OFFICE_CEILING_Y = 33.3
const AISLE_HALF_WIDTH = 29
const BANK_OUTER_X = 76
const BAY_EDGES_Z = [-20, -62, -104, -146]
const FAR_PANEL_Z = -190
const BAY_CENTRES_Z = BAY_EDGES_Z.map((z, index) =>
  ((index + 1 < BAY_EDGES_Z.length ? BAY_EDGES_Z[index + 1] : FAR_PANEL_Z) + z) / 2
)
// Worksurfaces: the hero top spans its bay; each bank top is 650 mm deep off
// the aisle line. In scene units of 32.5 mm.
const HERO_TOP = { x: 0, z: -2.15, width: 55.7, depth: 27.7 }
const BANK_TOP = { x: 39.9, width: 20, depth: 39.7 }

/**
 * The office described to the environment painter, in the room's own frame.
 *
 * Handed OUT rather than imported IN because `environment.js` sits upstream of
 * this module (CRTScreen reads the look presets), and the same fixture layout
 * paints the ceiling wash (CubicleOffice). One authored office, two consumers.
 */
export const OFFICE_ENVIRONMENT_SPEC = Object.freeze({
  // The shell walls are 120 mm thick outside ±94 / −240, so the inner faces
  // — the surfaces that actually reflect — sit on those lines. Open at +z,
  // where the camera enters; closed there anyway, because a hole in an
  // environment map returns black and reads as a missing wall.
  room: {
    min: [-94, OFFICE_FLOOR_Y, -240],
    max: [94, OFFICE_CEILING_Y, 62],
  },
  fixtures: OFFICE_FIXTURES,
  fixtureSize: OFFICE_FIXTURE_SIZE,
  // Seated in the hero bay. An environment map is direction-only, so this is
  // the one place in the room whose parallax it can be right about — and the
  // hero bay is the framing that has to hold up.
  eye: [0, DESK_Y + 4, 2],
  panelTopY: PANEL_TOP_Y,
  worktopY: DESK_Y,
})

const CUBICLE_BAKED_FLOOR = [
  {
    position: [0, OFFICE_FLOOR_Y + 0.028, -80],
    rotation: [-Math.PI / 2, 0, 0],
    scale: [260, 360],
  },
]

// The receivers sit a hair off each surface the Blender set models: the
// worktops, the hero bay's side panels, and the transverse dividers' faces
// toward the camera.
const CUBICLE_BAKED_SURFACES = [
  {
    position: [HERO_TOP.x, DESK_Y + 0.018, HERO_TOP.z],
    rotation: [-Math.PI / 2, 0, 0],
    scale: [HERO_TOP.width, HERO_TOP.depth],
  },
  ...BAY_CENTRES_Z.flatMap((z) =>
    [-1, 1].map((side) => ({
      position: [side * BANK_TOP.x, DESK_Y + 0.018, z],
      rotation: [-Math.PI / 2, 0, 0],
      scale: [BANK_TOP.width, BANK_TOP.depth],
    }))
  ),
  ...[-1, 1].map((side) => ({
    position: [
      side * (AISLE_HALF_WIDTH - 0.9),
      (RACEWAY_TOP_Y + HERO_PANEL_TOP_Y - CAP_HEIGHT) / 2,
      -2,
    ],
    rotation: [0, side * -Math.PI / 2, 0],
    scale: [34, (HERO_PANEL_TOP_Y - CAP_HEIGHT - RACEWAY_TOP_Y) * 0.94],
  })),
  ...BAY_EDGES_Z.flatMap((z) =>
    [-1, 1].map((side) => ({
      position: [
        side * ((AISLE_HALF_WIDTH + BANK_OUTER_X) / 2),
        (RACEWAY_TOP_Y + PANEL_TOP_Y - CAP_HEIGHT) / 2,
        z + 0.9,
      ],
      rotation: [0, 0, 0],
      scale: [
        (BANK_OUTER_X - AISLE_HALF_WIDTH) * 0.94,
        (PANEL_TOP_Y - CAP_HEIGHT - RACEWAY_TOP_Y) * 0.9,
      ],
    }))
  ),
]

// Rectangular footprints get the superellipse mask; only the chair's five-star
// base and the mug are actually round. Positions follow the Blender props
// (build_hero_props): the keyboard 190 mm in front of the glass, the loose
// paper and the badge to its left, the mouse and mug to its right.
const CUBICLE_DESK_CONTACTS_RECT = [
  [0, DESK_Y + 0.035, -0.6, 10.5, 4.8], // monitor stand
  [-0.4, DESK_Y + 0.035, 7.5, 11, 3.6, -0.04], // keyboard
  [-10.5, DESK_Y + 0.035, 4.9, 7.6, 5.2, 0.23], // loose paper
  [-16.5, DESK_Y + 0.035, 10.5, 2.2, 3, -0.14], // ID badge
]

const CUBICLE_DESK_CONTACTS_RADIAL = [
  [6.1, DESK_Y + 0.035, 6.15, 3.8, 3, 0.09], // mouse
  [9.9, DESK_Y + 0.035, 1.85, 3.2, 3.2], // mug
]

const CUBICLE_FLOOR_CONTACTS_RADIAL = [
  [-43, OFFICE_FLOOR_Y + 0.035, 18, 22, 24, 0.18], // chair five-star base
]

const CUBICLE_FLOOR_CONTACTS_RECT = [
  [15, OFFICE_FLOOR_Y + 0.035, -3, 14, 17], // hero pedestal
  [-24.6, OFFICE_FLOOR_Y + 0.035, -12.9, 2.2, 17], // left desk foot
  [24.6, OFFICE_FLOOR_Y + 0.035, -12.9, 2.2, 17], // right desk foot
]

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

function OfficeLighting() {
  return (
    <group>
      {/* Neutral skylight raises the office shadows without erasing shape.
          Two broad sources represent the modeled troffers, halving the area
          light work while preserving their long ceiling reflections. */}
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
    </group>
  )
}

function CubicleStage({ active }) {
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

  return (
    <group>
      <OfficeLighting />
      {/* Every visible surface — shell, ceiling system, partitions,
          worksurfaces, chairs, pedestals, bay housings and desk props — is
          the Blender office. The eight bay screens are drawn inside it from
          the placements its build exported. */}
      <CubicleOffice active={active} />
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
        <CubicleStage active={stage === 'cubicle'} />
      </group>
      <group
        visible={stage === 'wall'}
        userData={{ presentationStages: ['wall'] }}
      >
        <AgentVault active={stage === 'wall'} />
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
