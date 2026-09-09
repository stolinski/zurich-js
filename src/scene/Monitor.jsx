import { useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
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
 * shell with tight 90s corners, a stepped fascia, a chin, clean sides, and an
 * integrated stand) and exported to `public/models/crt-monitor.glb`. Before that it was
 * a nurb CAD part (`parts/crt_monitor.py`), and before that JavaScript
 * primitives, which have a hard ceiling: no true fillets, no continuous loft.
 *
 * TO CHANGE THE SHAPE, edit the Python and re-export — do not rebuild it here:
 *     blender --background --factory-startup --python blender/home-office/build_monitor.py
 *
 * The model is at true scale in mm with the same axis convention the scene
 * uses (X width, Y up, screen facing +Z), so the only transform needed here is
 * a uniform scale and a shift to put the glass on the origin. The opening,
 * pocket depth, stand underside, control positions and the four named
 * surfaces below are the contract the Blender script keeps.
 *
 * The surfaces arrive as glTF primitives, one per Blender material slot, and
 * are finished here BY NAME — the same rule every set follows. Until
 * 2026-09-09 this file bucketed triangles by centroid instead ("stand below
 * Y = −180"), and the chin, which runs from −170 to −242 and was filled with
 * sliver triangles the width of the housing, came out half stand material:
 * lighter, shinier wedges with hard diagonal edges on every room slide.
 */

const MODEL = '/models/crt-monitor.glb'
/** Blender's material slots, in the order the material array below is built. */
const SURFACES = ['CRT shell', 'CRT face', 'CRT stand', 'CRT inner return']

// Must match build_monitor.py. The screen's width sets the scale; its
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
  // The chin's recessed control bay: its centre line and its floor. The
  // inserts below stand on that floor.
  controlsYMm: -206,
  bayFloorMm: -3,
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

/**
 * The four surfaces as one geometry with one group per surface, in SURFACES
 * order. Merged rather than kept as four meshes so the normal crease and the
 * weathering see the whole housing: a creased normal at the bezel's rim needs
 * the side it meets, and that side is another primitive.
 */
function mergeHousingSurfaces(gltfScene) {
  const parts = new Map()
  gltfScene.traverse((object) => {
    if (object.isMesh) parts.set(object.material.name, object.geometry)
  })
  const missing = SURFACES.filter((name) => !parts.has(name))
  if (missing.length) {
    throw new Error(`crt-monitor.glb is missing surfaces: ${missing.join(', ')}`)
  }
  return mergeGeometries(
    SURFACES.map((name) => parts.get(name)),
    true
  )
}

export function Monitor() {
  const { scene } = useGLTF(MODEL)

  // Built once from the cached GLTF, never mutating it, so a hot reload can't
  // accumulate material swaps or re-finish an already finished geometry.
  const housing = useMemo(() => {
    // Broad material partitions correspond to moulded subassemblies. Still not
    // a tiled micro-normal — a box-projected photograph over a compound housing
    // buys seams and a readable grain direction. The tooth comes from
    // `addMouldedGrain` instead: procedural, object-space, self-band-limiting,
    // and the reason the housing stopped reading as a black silhouette. The CAD
    // bevel flow and room-sized highlights carry the form; this carries the
    // material.
    const materials = [
      // CRT shell — the rear cabinet behind the mould split.
      new THREE.MeshStandardMaterial(SHELL),
      // CRT face — the bezel moulding: front, fascia, chin and the sides
      // forward of the split. It stays the darkest lit surface so the glass
      // still wins the frame, but not so dark that the inner chamfer's amber
      // gradient — the thing that reads as light rather than a border — has
      // nothing to land on.
      new THREE.MeshStandardMaterial({
        color: '#25272b',
        roughness: 0.64,
        metalness: 0.01,
        envMapIntensity: 1.15,
      }),
      // CRT stand — base, turntable, pedestal and tilt barrel.
      new THREE.MeshStandardMaterial({
        color: '#33363c',
        roughness: 0.46,
        metalness: 0.025,
      }),
      // CRT inner return — the pocket's light-absorbing walls and floor.
      // Treating it like satin face plastic lets the screen key reflect as a
      // white neon outline; this is the authored pocket, not an overlay.
      new THREE.MeshPhysicalMaterial({
        color: '#020303',
        roughness: 0.96,
        metalness: 0,
        specularIntensity: 0.01,
        envMapIntensity: 0.35,
      }),
    ]
      .map(varyRoughnessByWear)
      .map(addMouldedGrain)
    // Crease the normals (the CAD's per-face normals shaded the housing's
    // gentle side curvature as vertical bands) and bake the weathering pass
    // shared with every desk prop.
    const mesh = new THREE.Mesh(finishPropGeometry(mergeHousingSurfaces(scene), 3), materials)
    mesh.name = 'crt_monitor'
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
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

  const controlY = (CAD.controlsYMm - CAD.screenCentreMm) * SCALE
  const controls = [
    { x: -6.83, width: 0.43 },
    { x: -5.97, width: 0.55 },
    { x: -4.95, width: 0.55 },
  ]
  // The inserts stand in the chin's bay, from its floor to a millimetre proud
  // of the face: buttons in a well rather than decals on a flat chin.
  const housingShift = (CAD.recessDepthMm - 2) * SCALE
  const bayFloorZ = CAD.bayFloorMm * SCALE + housingShift
  const insertDepth = housingShift + SCALE - bayFloorZ
  const insertZ = bayFloorZ + insertDepth / 2

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
        position={[0, -CAD.screenCentreMm * SCALE, housingShift]}
      />

      {/* Separate inserts sit inside the bay, so the controls read as buttons
          rather than three strangely illuminated holes in the shell. */}
      {controls.map(({ x, width }, index) => (
        <mesh key={x} position={[x, controlY, insertZ]}>
          <boxGeometry args={[width * 0.82, 0.18, insertDepth]} />
          <meshStandardMaterial color="#07090b" roughness={0.74} />
          {index === 0 && (
            <mesh position={[-width * 0.2, 0, insertDepth / 2 + 0.004]}>
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
