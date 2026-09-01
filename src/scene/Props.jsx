import { useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {
  finishPropGeometry,
  varyRoughnessByWear,
} from '../lib/propSurface.js'
import { DESK_Y } from './Room.jsx'
import { MM } from './scale.js'

/**
 * What else is on the desk.
 *
 * Two jobs, and the second matters more than the first.
 *
 * 1. A desk with nothing but a monitor on it reads as a test scene. Nobody's
 *    3am desk is empty.
 *
 * 2. FOREGROUND. The keyboard sits close and low, crossing the desk's light
 *    pool and moving against the monitor under parallax. That near mass gives
 *    the camera move depth even without a fragile screen-space lens effect.
 *
 * The case is authored CAD. Each keycap uses a 300-triangle purpose-built
 * render mesh derived from the same `parts/keycap.py` dimensions: tapered
 * sides, rounded corners, and a dished top without instancing the CAD export's
 * 13,404 triangles eighty times. One cap is instanced across the whole layout.
 */

const CASE_MODEL = '/models/keyboard_case.glb'
const MUG_MODEL = '/models/mug.glb'
const MOUSE_MODEL = '/models/mouse.glb'
const LAMP_MODEL = '/models/desk_lamp.glb'
const NOTEBOOK_MODEL = '/models/notebook.glb'

// Must match the CAD. Standard key pitch.
const PITCH_MM = 19.05
const BOARD_W_MM = 300
const BOARD_D_MM = 108
const FRONT_H_MM = 13
const BACK_H_MM = 24
const TRAY_DEPTH_MM = 6.5

/**
 * A 60% layout, as unit widths per row. Real boards stagger because each row
 * starts at a different offset, and that stagger is the thing your eye uses to
 * identify a keyboard at a glance — a uniform grid reads as a calculator.
 */
const ROWS = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2], //  ` 1..0 - = ⌫
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5], // ⇥ qwerty \
  [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25], // ⇪ asdf ⏎
  [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75], //  ⇧ zxcv ⇧
  [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25], // modifiers + space
]

function makeKeycapGeometry() {
  // 300 authored triangles instead of the CAD export's 13,404. At eighty
  // instances that removes over a million triangles per keyboard while keeping
  // tapered walls, rounded corners and a cylindrical finger dish.
  const geometry = new RoundedBoxGeometry(18, 18, 9.5, 2, 1.1)
  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i++) {
    const z = position.getZ(i)
    const height = THREE.MathUtils.clamp((z + 4.75) / 9.5, 0, 1)
    const taper = THREE.MathUtils.lerp(1, 14.2 / 18, height)
    const x = position.getX(i) * taper
    const y = position.getY(i) * taper
    const topBlend = THREE.MathUtils.smoothstep(height, 0.7, 1)
    const across = THREE.MathUtils.clamp(y / 7.1, -1, 1)
    const dish = (1 - across * across) * 1.05 * topBlend
    position.setXYZ(i, x, y, z + 4.75 - dish)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

function Keyboard({ position, rotation }) {
  const { scene: caseScene } = useGLTF(CASE_MODEL)

  const caseNode = useMemo(() => {
    const root = caseScene.clone(true)
    const material = varyRoughnessByWear(
      new THREE.MeshStandardMaterial({
        color: '#20262d',
        roughness: 0.72,
      })
    )
    root.traverse((o) => {
      if (o.isMesh) {
        o.geometry = finishPropGeometry(o.geometry.clone(), 7)
        o.material = material
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    return root
  }, [caseScene])

  const capGeometry = useMemo(() => makeKeycapGeometry(), [])

  // Where every cap sits, in millimetres, laid out on the tilted tray.
  const placements = useMemo(() => {
    const tilt = Math.atan2(BACK_H_MM - FRONT_H_MM, BOARD_D_MM)
    const out = []
    ROWS.forEach((row, r) => {
      // Rows run back (row 0) to front, one pitch apart, centred on the tray.
      const y = (ROWS.length / 2 - 0.5 - r) * PITCH_MM
      let x = 0
      const rowUnits = row.reduce((a, b) => a + b, 0)
      x = -(rowUnits * PITCH_MM) / 2
      row.forEach((units) => {
        const cx = x + (units * PITCH_MM) / 2
        // Height follows the tilted top surface, minus the tray recess.
        const z = FRONT_H_MM + ((y + BOARD_D_MM / 2) / BOARD_D_MM) * (BACK_H_MM - FRONT_H_MM) - TRAY_DEPTH_MM
        out.push({ x: cx, y, z, units, tilt })
        x += units * PITCH_MM
      })
    })
    return out
  }, [])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  return (
    <group position={position} rotation={rotation} scale={MM}>
      <primitive object={caseNode} />
      {capGeometry && (
        <instancedMesh
          args={[capGeometry, undefined, placements.length]}
          castShadow
          receiveShadow
          onUpdate={(inst) => {
            placements.forEach((p, i) => {
              // The CAD keycap is modelled +Z up; the board's top is +Z too,
              // so only the row tilt has to be applied.
              dummy.position.set(p.x, p.y, p.z)
              dummy.rotation.set(p.tilt, 0, 0)
              // Wide keys are stretched across X only — a spacebar is a long
              // cap, not a scaled-up one, so the profile must not grow with it.
              dummy.scale.set(p.units, 1, 1)
              dummy.updateMatrix()
              inst.setMatrixAt(i, dummy.matrix)
            })
            inst.instanceMatrix.needsUpdate = true
          }}
        >
          {/* PBT grain is sub-pixel here. Broad roughness carries the material;
              a tiled normal turned every cap into visible sandpaper. Lighter
              than the case so the caps read as separate parts, not a relief
              pattern carved into one slab. */}
          <meshStandardMaterial color="#3a424c" roughness={0.62} />
        </instancedMesh>
      )}
    </group>
  )
}

/**
 * Loads an authored part, applies one material, and stands it up.
 *
 * At prop scale, authored edges and distinct broad roughness values carry the
 * material. Tiling one plastic normal over leather, ceramic, paper and ABS made
 * every object repeat the same visible pattern and forced de-indexed geometry.
 * Keep micrograin below the projected pixel size instead.
 */
// Creased normals + per-vertex weathering + wear-driven roughness live in
// lib/propSurface.js and are shared with the monitor housing. Segment before
// finishing so material groups survive the non-indexed conversion.

function segmentPropGeometry(source, profile) {
  const geometry = source.clone()
  const index = geometry.index
  const position = geometry.attributes.position
  if (!index || !position || !profile) return geometry
  const buckets = [[], [], []]
  for (let offset = 0; offset < index.count; offset += 3) {
    const ids = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)]
    const x = ids.reduce((sum, id) => sum + position.getX(id), 0) / 3
    const y = ids.reduce((sum, id) => sum + position.getY(id), 0) / 3
    const z = ids.reduce((sum, id) => sum + position.getZ(id), 0) / 3
    const materialIndex =
      profile === 'mouse'
        ? Math.abs(x) < 8 && y < -20 && y > -50 && z > 16
          ? 2
          : z < 9 || y < -68
            ? 1
            : 0
        : z < 30
          ? 1
          : z > 245 && y < -45
            ? 2
            : 0
    buckets[materialIndex].push(...ids)
  }
  const ordered = buckets.flat()
  const IndexArray = position.count > 65535 ? Uint32Array : Uint16Array
  geometry.setIndex(new THREE.BufferAttribute(new IndexArray(ordered), 1))
  geometry.clearGroups()
  let start = 0
  buckets.forEach((bucket, materialIndex) => {
    geometry.addGroup(start, bucket.length, materialIndex)
    start += bucket.length
  })
  return geometry
}

function propMaterials(profile, fallback) {
  if (profile === 'mouse') {
    // Satin ABS shell over a matte lower moulding: the creased normals now
    // shade the dome continuously, so the top can afford a real sheen again.
    return [
      new THREE.MeshStandardMaterial({
        color: '#343b41',
        roughness: 0.5,
        envMapIntensity: 0.85,
      }),
      new THREE.MeshStandardMaterial({
        color: '#24282c',
        roughness: 0.78,
        envMapIntensity: 0.6,
      }),
      new THREE.MeshStandardMaterial({ color: '#111315', roughness: 0.9 }),
    ]
  }
  if (profile === 'lamp') {
    return [
      new THREE.MeshStandardMaterial({ color: '#35414d', roughness: 0.4, metalness: 0.42 }),
      new THREE.MeshStandardMaterial({ color: '#202832', roughness: 0.54, metalness: 0.32 }),
      new THREE.MeshStandardMaterial({ color: '#465462', roughness: 0.34, metalness: 0.5 }),
    ]
  }
  if (profile === 'mug') {
    // Glazed ceramic: a clearcoat gives the one sharp bright specular on the
    // desk — the material read that separates a mug from a painted cylinder.
    return new THREE.MeshPhysicalMaterial({
      color: fallback.color,
      roughness: 0.38,
      metalness: 0,
      clearcoat: 0.65,
      clearcoatRoughness: 0.22,
    })
  }
  return new THREE.MeshStandardMaterial(fallback)
}

function CadProp({
  url,
  color,
  roughness,
  metalness = 0.02,
  materialProfile,
  ...props
}) {
  const { scene } = useGLTF(url)
  const node = useMemo(() => {
    const root = scene.clone(true)
    const material = propMaterials(materialProfile, { color, roughness, metalness })
    for (const entry of Array.isArray(material) ? material : [material]) {
      varyRoughnessByWear(entry)
    }
    root.traverse((o) => {
      if (o.isMesh) {
        o.geometry = finishPropGeometry(
          segmentPropGeometry(o.geometry, materialProfile),
          url.length
        )
        o.material = material
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    return root
  }, [scene, color, roughness, metalness, materialProfile, url])
  // CAD is modelled +Z up; the scene is +Y up.
  return <primitive object={node} rotation={[-Math.PI / 2, 0, 0]} scale={MM} {...props} />
}

function Mug({ position, rotation, color = '#15181c' }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Revolved with a real wall, so the RIM is a narrow ring that catches a
          bright line all the way round and you can see down inside. A capped
          cylinder has neither, which is why the previous one read as a tin. */}
      <CadProp
        url={MUG_MODEL}
        color={color}
        roughness={0.52}
        metalness={0.04}
        materialProfile="mug"
      />
      {/* The coffee: a disc down inside the wall, not a lid across the top. */}
      <mesh position={[0, 1.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.05, 40]} />
        <meshStandardMaterial color="#070605" roughness={0.18} metalness={0.1} />
      </mesh>
    </group>
  )
}

export function Props({ variant = 'home' }) {
  const cubicle = variant === 'cubicle'

  return (
    <group>
      {/* Close and low — this is the foreground anchor. Kept inside the screen's
          pool of light: an unlit black slab at the bottom of frame reads as a
          hole, not as a keyboard. The CAD is modelled +Z up, so it lies flat
          with a quarter-turn about X. */}
      <Keyboard
        position={[-0.4, DESK_Y, 9.4]}
        rotation={[-Math.PI / 2, 0, -0.05]}
      />

      {/* A desk with a keyboard and no mouse reads as a set-dressing mistake.
          Angled slightly, the way one is actually left. */}
      {/* Nose (buttons + cable) faces the MONITOR — the yaw's π flip is load-
          bearing. Without it the mouse sat backwards on the desk, palm hump
          forward and cable dropping toward the user, which no hand has ever
          done to a mouse. */}
      <CadProp
        url={MOUSE_MODEL}
        color="#2a3038"
        roughness={0.54}
        materialProfile="mouse"
        position={[6.1, DESK_Y, 9.0]}
        rotation={[-Math.PI / 2, 0, Math.PI + 0.18]}
      />

      {/* Warm glazed bone at home: five near-identical charcoal props read as
          one clay material poured over the whole desk. The mug is the value
          anchor of the prop family. */}
      <Mug
        position={[9.9, DESK_Y, 5.4]}
        rotation={[0, -0.5, 0]}
        color={cubicle ? '#c9c6bc' : '#a39584'}
      />

      {cubicle ? (
        <>
          {/* Corporate ephemera replaces the home lamp/notebook silhouette.
              Muted paper and an ID badge catch the neutral ceiling light and
              make this desk read as a different person's workstation. */}
          <mesh position={[-10.5, DESK_Y + 0.08, 7.3]} rotation={[0, 0.22, 0]} castShadow>
            <boxGeometry args={[6.8, 0.16, 4.5]} />
            <meshStandardMaterial color="#d8d3c5" roughness={0.9} />
          </mesh>
          <mesh position={[-14.2, DESK_Y + 0.13, 5.8]} rotation={[0, -0.14, 0]} castShadow>
            <boxGeometry args={[2.4, 0.12, 3.5]} />
            <meshStandardMaterial color="#315b70" roughness={0.74} />
          </mesh>
        </>
      ) : (
        <>
          {/* The lamp is OFF, and that's the point. Everything else on this
              desk is horizontal and low, so it supplies the home silhouette. */}
          <CadProp
            url={LAMP_MODEL}
            color="#29323c"
            roughness={0.46}
            metalness={0.2}
            materialProfile="lamp"
            position={[-19.5, DESK_Y, -2.5]}
            rotation={[-Math.PI / 2, 0, -0.6]}
          />

          {/* Worn leather journal, not another charcoal slab. */}
          <CadProp
            url={NOTEBOOK_MODEL}
            color="#5f4c3a"
            roughness={0.6}
            position={[-9.8, DESK_Y, 7.6]}
            rotation={[-Math.PI / 2, 0, 0.38]}
          />
        </>
      )}
    </group>
  )
}

useGLTF.preload(CASE_MODEL)
useGLTF.preload(MUG_MODEL)
useGLTF.preload(MOUSE_MODEL)
useGLTF.preload(LAMP_MODEL)
useGLTF.preload(NOTEBOOK_MODEL)
