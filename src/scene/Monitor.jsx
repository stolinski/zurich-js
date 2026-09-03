import { useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { SCREEN_SIZE } from './CRTScreen.jsx'
import { DESK_Y } from './Room.jsx'
import {
  addMouldedGrain,
  finishPropGeometry,
  varyRoughnessByWear,
} from '../lib/propSurface.js'

/**
 * THE MONITOR — a widescreen Trinitron, in the spirit of the Sony GDM-FW900.
 *
 * The housing is AUTHORED GEOMETRY, not primitives. Since 2026-09-02 it is
 * modelled in Blender by `blender/home-office/build_monitor.py` (a lofted
 * shell, a stepped fascia, a chin, conformed vent strips, and an integrated
 * stand) and exported to `public/models/crt-monitor.glb`. Before that it was
 * a nurb CAD part (`parts/crt_monitor.py`), and before that JavaScript
 * primitives, which have a hard ceiling: no true fillets, no continuous loft.
 *
 * TO CHANGE THE SHAPE, edit the Python and re-export — do not rebuild it here:
 *     blender --background --factory-startup --python blender/home-office/build_monitor.py
 *
 * The model is at true scale in mm with the same axis convention the scene
 * uses (X width, Y up, screen facing +Z), so the only transform needed here is
 * a uniform scale and a shift to put the glass on the origin. The opening,
 * pocket depth, stand underside, control positions and the material buckets
 * below are the contract the Blender script keeps.
 */

const MODEL = '/models/crt-monitor.glb'

// Must match parts/crt_monitor.py. The screen's width sets the scale; its
// centre sits `SCREEN_CENTRE_MM` below the housing's midline because the chin
// is deeper than the top bezel, so the model shifts up by that much to land the
// glass on the origin.
const CAD = {
  screenWidthMm: 520,
  screenCentreMm: (34 - 68) / 2, // (bezel_side − bezel_chin) / 2
  plateBottomMm: -288, // stand's underside in CAD space
  // Depth of the screen pocket cut into the front housing. The glass belongs at
  // the BOTTOM of it, not at its mouth — with the housing left at the origin
  // the screen plane sat flush with the front face, so the pocket's inner walls
  // stood proud of the picture all the way round and caught the screen's own
  // light as a hard bright rectangle. That's what reads as a box-shadow.
  recessDepthMm: 12,
}

const SCALE = SCREEN_SIZE.w / CAD.screenWidthMm
/** Where the stand's underside lands once the glass is on the origin. */
export const MONITOR_BASE_Y = (CAD.plateBottomMm - CAD.screenCentreMm) * SCALE

// Warm graphite, not blue-black. At #111319 the housing had no albedo left to
// model form with: in a dark room lit only by its own glass it collapsed to a
// silhouette, so none of the compound curvature the CAD actually carries reached
// the frame. This is still a dark monitor — it is just dark plastic rather than
// a hole. Blue-black also went muddy under an amber-only key; the hue is pulled
// neutral-warm so the screen's own light reads as light on plastic.
const SHELL = { color: '#2b2d32', roughness: 0.62, metalness: 0.015 }
const CABLE_R = 0.17

function segmentHousingGeometry(source) {
  const geometry = source.clone()
  const index = geometry.index
  const position = geometry.attributes.position
  if (!index || !position) return geometry

  const buckets = [[], [], [], []]
  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset)
    const b = index.getX(offset + 1)
    const c = index.getX(offset + 2)
    const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3
    const y = (position.getY(a) + position.getY(b) + position.getY(c)) / 3
    const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3
    // CAD remains one watertight solid, but manufactured subassemblies need
    // distinct broad reflection response. The stand/base occupies the lower
    // band; the stepped face and bezel live at the front of the tube. The
    // vent fields get their own near-black matte bucket: the boolean slot
    // cuts tessellate the curved side into ragged slivers whose rims catch
    // the doorway light as torn dashes — a material that cannot highlight is
    // the honest fix, and the slots keep their structure as dark recesses.
    const ventField =
      Math.abs(x) > 262 && y > 2 && y < 96 && z > -220 && z < -122
    const materialIndex = ventField ? 3 : y < -180 ? 2 : z > -36 ? 1 : 0
    buckets[materialIndex].push(a, b, c)
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

export function Monitor() {
  const { scene } = useGLTF(MODEL)

  // One solid out of the kernel means one mesh and one material. Clone so a
  // hot reload can't accumulate material swaps on the cached GLTF.
  const housing = useMemo(() => {
    const root = scene.clone(true)
    // Broad material partitions correspond to moulded subassemblies. Still not
    // a tiled micro-normal — a box-projected photograph over a compound housing
    // buys seams and a readable grain direction. The tooth comes from
    // `addMouldedGrain` instead: procedural, object-space, self-band-limiting,
    // and the reason the housing stopped reading as a black silhouette. The CAD
    // bevel flow and room-sized highlights carry the form; this carries the
    // material.
    const materials = [
      new THREE.MeshStandardMaterial(SHELL),
      // The stepped face and bezel stay the darkest lit surface so the glass
      // still wins the frame, but not so dark that the inner chamfer's amber
      // gradient — the thing that reads as light rather than a border — has
      // nothing to land on.
      new THREE.MeshStandardMaterial({
        color: '#1e2025',
        roughness: 0.52,
        metalness: 0.01,
      }),
      new THREE.MeshStandardMaterial({
        color: '#33363c',
        roughness: 0.46,
        metalness: 0.025,
      }),
      // Vents remain near-black: they are recesses, and a lit recess is what
      // made the boolean cut rims read as torn dashes.
      new THREE.MeshStandardMaterial({
        color: '#131417',
        roughness: 0.94,
        metalness: 0,
        envMapIntensity: 0.25,
      }),
    ]
      .map(varyRoughnessByWear)
      // The vents are recesses and read as absence, so they stay smooth; giving
      // a near-black cavity a highlight to break up is how the boolean cut rims
      // came back as torn dashes.
      .map((material, index) =>
        index === 3 ? material : addMouldedGrain(material)
      )
    root.traverse((o) => {
      if (o.isMesh) {
        // Segment while indexed, then crease the normals (the CAD's per-face
        // normals shaded the housing's gentle side curvature as vertical
        // bands and the vent-slot rims as torn speckle) and bake the
        // weathering pass shared with every desk prop.
        o.geometry = finishPropGeometry(segmentHousingGeometry(o.geometry), 3)
        o.material = materials
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    return root
  }, [scene])

  // Cable. Sampled from a real CATENARY rather than eyeballed control points —
  // a hanging cable's sag is cosh, and a spline through guessed waypoints reads
  // as a bent wire because the curvature is wrong exactly where the eye checks.
  const strainRelief = useMemo(() => {
    // A short tapered-looking rubber boot bridges the authored housing and the
    // flexible cable. Without it the spline appears to originate from an exact
    // mathematical point on the shell — a tiny but unmistakable CG cue.
    const curve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(0.35, -0.95, -13.65),
        new THREE.Vector3(0.36, -0.98, -13.28),
        new THREE.Vector3(0.42, -1.02, -12.92),
      ],
      false,
      'catmullrom',
      0.35
    )
    return new THREE.TubeGeometry(curve, 20, CABLE_R * 1.65, 10, false)
  }, [])

  const cable = useMemo(() => {
    const back = -13.2 // just behind the neck, in scene units
    const rest = DESK_Y + CABLE_R
    const exit = new THREE.Vector3(0.35, -1.0, back)
    const land = new THREE.Vector3(3.1, rest, back - 1.2)

    const a = 3.4 // slack: smaller = deeper sag
    const span = Math.hypot(land.x - exit.x, land.z - exit.z)
    const pts = []
    const STEPS = 26
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS
      const u = (t - 0.5) * (span / a)
      const sag = a * (Math.cosh(u) - Math.cosh(span / (2 * a)))
      pts.push(
        new THREE.Vector3(
          exit.x + (land.x - exit.x) * t,
          THREE.MathUtils.lerp(exit.y, land.y, t) + sag,
          exit.z + (land.z - exit.z) * t
        )
      )
    }
    // Continue to the rear edge and DOWN behind the desk. The old curve ended
    // in open air six units in front of the monitor, which read as a severed
    // wire in the profile shot.
    pts.push(new THREE.Vector3(4.8, rest, back - 1.9))
    pts.push(new THREE.Vector3(6.7, rest, back - 2.9))
    pts.push(new THREE.Vector3(8.1, rest - 0.4, back - 4.0))
    pts.push(new THREE.Vector3(8.25, rest - 4.0, back - 4.25))
    pts.push(new THREE.Vector3(8.25, DESK_Y - 24, back - 4.25))

    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4)
    return new THREE.TubeGeometry(curve, 72, CABLE_R, 8, false)
  }, [])

  const controlY = -4.86
  const controls = [
    { x: -6.83, width: 0.43 },
    { x: -5.97, width: 0.55 },
    { x: -4.95, width: 0.55 },
  ]

  return (
    <group>
      {/* The authored housing: face, tube, neck, stand — one solid. */}
      {/* Pushed FORWARD by the recess depth, so the glass sits down inside the
          pocket the way a faceplate does rather than flush with the front face.
          Short by a couple of millimetres on purpose: shifting by the full
          depth puts the pocket's floor exactly coplanar with the screen plane,
          and the two z-fight — the lit housing wins in patches and the terminal
          vanishes behind a flat green rectangle. */}
      <primitive
        object={housing}
        scale={SCALE}
        position={[0, -CAD.screenCentreMm * SCALE, (CAD.recessDepthMm - 2) * SCALE]}
      />

      {/* Dark baffles immediately behind the real CAD vent cuts. An open hole
          through a solid model sees the blue doorway/environment and glows like
          a second screen; manufactured vents lead into a black labyrinth. The
          baffle keeps the slot interiors dark while their cut rims still catch
          the moving highlight that makes them read as geometry. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 8.05, 1.95, -5.02]}>
          <boxGeometry args={[0.2, 3.25, 3.1]} />
          <meshBasicMaterial color="#010203" />
        </mesh>
      ))}
      {[-1, 1].flatMap((side) =>
        [20, 38, 56, 74].map((ventY) => (
          <mesh
            key={`${side}-${ventY}`}
            position={[
              side * 8.58,
              (ventY - CAD.screenCentreMm) * SCALE,
              (-176 + CAD.recessDepthMm - 2) * SCALE,
            ]}
          >
            {/* Inboard of the shell: at ±8.78 these poked through the housing
                silhouette as little black tabs at oblique angles. */}
            <boxGeometry args={[0.3, 0.19, 2.42]} />
            <meshBasicMaterial color="#010203" />
          </mesh>
        ))
      )}


      {/* Separate inserts sit inside the CAD recesses, so the controls read as
          buttons rather than three strangely illuminated holes in the shell. */}
      {controls.map(({ x, width }, index) => (
        <mesh key={x} position={[x, controlY, 0.315]}>
          <boxGeometry args={[width * 0.82, 0.18, 0.055]} />
          <meshStandardMaterial color="#07090b" roughness={0.74} />
          {index === 0 && (
            <mesh position={[-width * 0.2, 0, 0.033]}>
              <circleGeometry args={[0.045, 12]} />
              <meshBasicMaterial color="#62c77d" toneMapped={false} />
            </mesh>
          )}
        </mesh>
      ))}

      <mesh geometry={strainRelief} castShadow>
        <meshStandardMaterial color="#08090b" roughness={0.82} metalness={0.01} />
      </mesh>
      <mesh geometry={cable} castShadow>
        <meshStandardMaterial color="#0a0b0d" roughness={0.62} metalness={0.05} />
      </mesh>
    </group>
  )
}

useGLTF.preload(MODEL)
