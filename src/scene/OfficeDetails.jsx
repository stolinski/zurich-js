import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { MM } from './scale.js'
import { DESK_Y, OFFICE_FLOOR_Y } from './Room.jsx'

const FIXTURE_MODEL = '/models/fluorescent-fixture.glb'
const PEDESTAL_MODEL = '/models/office-pedestal.glb'
const CHAIR_MODEL = '/models/office-chair.glb'

const AGENT_MONITOR_SCALE = 0.92
// The procedural monitor base bottoms at -7.975 local units. This offset lands
// every repeated base on the same DESK_Y plane as the full-resolution hero.
const AGENT_MONITOR_Y = DESK_Y + 7.975 * AGENT_MONITOR_SCALE
const AISLE_HALF_WIDTH = 29
const BANK_CENTRE_X = 51.5
const BAY_CENTRES_Z = [-41, -83, -125, -167]

const OFFICE_STATIONS = BAY_CENTRES_Z.flatMap((z, row) =>
  [-1, 1].map((side) => ({
    side,
    row,
    deskPosition: [side * BANK_CENTRE_X, DESK_Y - 0.75, z],
    // Each bank faces inward. The screens, desk depth, and repeated transverse
    // dividers now describe an aisle rather than a row of desks facing camera.
    monitors: [
      [
        side * (AISLE_HALF_WIDTH + 4.5),
        AGENT_MONITOR_Y,
        z - 2.5,
        side < 0 ? Math.PI / 2 : -Math.PI / 2,
      ],
    ],
    pedestal: [
      side * 62,
      OFFICE_FLOOR_Y,
      z + (row % 2 === 0 ? 8 : -7),
      side < 0 ? Math.PI / 2 : -Math.PI / 2,
    ],
  }))
)

/**
 * One physical office aisle shared by set dressing and structural geometry.
 * Four repeated depths on both banks provide real parallax behind the hero bay;
 * every repeated asset remains one resident instanced draw.
 */
export const OFFICE_LAYOUT = Object.freeze({
  monitorScale: AGENT_MONITOR_SCALE,
  aisleHalfWidth: AISLE_HALF_WIDTH,
  bankCentreX: BANK_CENTRE_X,
  bayCentresZ: BAY_CENTRES_Z,
  fixtures: [-1, 1].flatMap((side) =>
    [8, -34, -76, -118, -160].map((z) => [side * 22, 31.55, z])
  ),
  hero: {
    pedestal: [18, OFFICE_FLOOR_Y, -3, 0],
    // The pulled-out chair remains the only chair in the aisle. Repeating the
    // 29k-triangle hero chair into every distant bay would spend silhouette
    // budget where the desks, pedestals, and screens already carry scale.
    chair: [-41, OFFICE_FLOOR_Y, 18, 0.18],
  },
  stations: OFFICE_STATIONS,
})

const FIXTURES = OFFICE_LAYOUT.fixtures
const PEDESTALS = [
  OFFICE_LAYOUT.hero.pedestal,
  ...OFFICE_LAYOUT.stations.map(({ pedestal }) => pedestal),
]
const CHAIRS = [OFFICE_LAYOUT.hero.chair]

function geometryFrom(scene) {
  let geometry = null
  scene.traverse((object) => {
    if (!geometry && object.isMesh) geometry = object.geometry
  })
  return geometry
}

function groupGeometry(source, bucketCount, classify) {
  const geometry = source?.clone()
  const index = geometry?.index
  const position = geometry?.attributes.position
  if (!geometry || !index || !position) return geometry

  const buckets = Array.from({ length: bucketCount }, () => [])
  for (let offset = 0; offset < index.count; offset += 3) {
    const ids = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)]
    const x = ids.reduce((sum, id) => sum + position.getX(id), 0) / 3
    const y = ids.reduce((sum, id) => sum + position.getY(id), 0) / 3
    const z = ids.reduce((sum, id) => sum + position.getZ(id), 0) / 3
    buckets[classify(x, y, z)].push(...ids)
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

function segmentPedestalGeometry(source) {
  return groupGeometry(source, 4, (x, y, z) => {
    const front = y < -252
    const pull = front && [323, 447, 569].some((height) => Math.abs(z - height) < 12)
    const lock = front && x > 130 && z > 495 && z < 545
    if (pull || lock) return 2
    if (z < 62) return 3
    if (front && z > 82) return 1
    return 0
  })
}

/**
 * Positional segmentation of the simplified chair into its four material
 * families. (The export's COLOR_0 was probed and carries no usable per-family
 * colors — nearly every vertex is white — so position windows with generous
 * margins are the honest classifier.)
 *
 * The same pass authors intentional planar UVs so the cushions can carry the
 * office linen weave: seat fabric projects from above, back fabric from the
 * front. Nurb GLBs have no UV channel, and per-cushion planar projection is
 * the desk-top precedent, not the forbidden box-projection-over-a-compound.
 */
function segmentChairGeometry(source) {
  const geometry = source.clone()
  const index = geometry.index
  const position = geometry.attributes.position
  if (!index || !position) return geometry

  const buckets = [[], [], [], []]
  for (let offset = 0; offset < index.count; offset += 3) {
    const ids = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)]
    const x = ids.reduce((sum, id) => sum + position.getX(id), 0) / 3
    const y = ids.reduce((sum, id) => sum + position.getY(id), 0) / 3
    const z = ids.reduce((sum, id) => sum + position.getZ(id), 0) / 3

    const radial = Math.hypot(x, y)
    const gasLift = z > 225 && z < 390 && radial < (z > 350 ? 29 : 25)
    const adjustmentLever =
      x > 115 && x < 214 && y > -40 && y < -10 && z > 365 && z < 395

    // The upholstery windows carry generous margins on purpose: the meshopt-
    // simplified triangles are 15–25mm across, and tight thresholds let
    // borderline centroids drift into the dark plastic bucket — which painted
    // a jagged bite into the back cushion's lower centre.
    const seatUpholstery = z > 438 && z < 517 && Math.abs(x) < 258
    const reclinedBackCentre =
      181 + Math.max(0, z - 524) * Math.tan(THREE.MathUtils.degToRad(10))
    const backUpholstery =
      z >= 517 && Math.abs(x) < 248 && y > 82 && y < reclinedBackCentre + 26

    const materialIndex = gasLift || adjustmentLever
      ? 3
      : seatUpholstery
        ? 0
        : backUpholstery
          ? 1
          : 2
    buckets[materialIndex].push(...ids)
  }

  // Planar fabric UVs in metres of cloth: the seat reads from above, the back
  // face-on. Plastic and metal share the seat projection; their materials
  // carry no maps, so only the projection's existence matters.
  const uv = new Float32Array(position.count * 2)
  const fabricScale = 1 / 340
  for (let vertex = 0; vertex < position.count; vertex++) {
    const x = position.getX(vertex)
    const y = position.getY(vertex)
    const z = position.getZ(vertex)
    uv[vertex * 2] = x * fabricScale
    uv[vertex * 2 + 1] = (z < 517 ? y : z) * fabricScale
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))

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

const PEDESTAL_MATERIAL_PRESET = [
  {
    color: '#5d6966',
    roughness: 0.61,
    metalness: 0.06,
    clearcoat: 0.08,
    clearcoatRoughness: 0.78,
    envMapIntensity: 0.82,
  },
  {
    color: '#697571',
    roughness: 0.49,
    metalness: 0.08,
    clearcoat: 0.1,
    clearcoatRoughness: 0.68,
    envMapIntensity: 0.9,
  },
  {
    color: '#343b3c',
    roughness: 0.27,
    metalness: 0.76,
    clearcoat: 0.03,
    clearcoatRoughness: 0.48,
    envMapIntensity: 1.05,
  },
  {
    color: '#202629',
    roughness: 0.7,
    metalness: 0.04,
    clearcoat: 0.02,
    clearcoatRoughness: 0.84,
    envMapIntensity: 0.7,
  },
]

// Upholstery, measured against the rest of the set rather than picked in
// isolation. At #596766/#4b5959 the cushions rendered at 34–38% saturation while
// the partitions, laminate and carpet all sat between 8% and 20% — so the chair
// was the only chromatic object in an office whose art direction reserves chroma
// for the phosphor. It read as a toy in a grey room. The albedo is biased warm
// because the cool office IBL and troffers push it back toward neutral, and the
// sheen is way down: contract upholstery is matte, and a broad sheen lobe was
// most of what made the cushions look like painted plastic.
const CHAIR_MATERIAL_PRESET = [
  {
    color: '#5a554e',
    roughness: 0.96,
    metalness: 0,
    sheen: 0.16,
    sheenColor: '#9c9890',
    sheenRoughness: 0.9,
    envMapIntensity: 0.5,
  },
  {
    color: '#4e4a45',
    roughness: 0.94,
    metalness: 0,
    sheen: 0.13,
    sheenColor: '#928e87',
    sheenRoughness: 0.88,
    envMapIntensity: 0.52,
  },
  {
    color: '#151a1d',
    roughness: 0.5,
    metalness: 0.025,
    clearcoat: 0.05,
    clearcoatRoughness: 0.74,
    envMapIntensity: 0.88,
  },
  {
    color: '#8b9491',
    roughness: 0.29,
    metalness: 0.78,
    clearcoat: 0.02,
    clearcoatRoughness: 0.44,
    envMapIntensity: 1.1,
  },
]

function makeMaterialSet(preset) {
  return preset.map((parameters) => new THREE.MeshPhysicalMaterial(parameters))
}

function placeCadInstances(mesh, placements, dummy, cadRotation) {
  placements.forEach(([x, y, z, yaw = 0], index) => {
    dummy.position.set(x, y, z)
    dummy.quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).multiply(cadRotation)
    dummy.scale.setScalar(MM)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
}


/**
 * Authored office furniture with intentionally tiny draw-call cost:
 * four CAD troffers, three filing pedestals, and three task chairs are only
 * three instanced chassis draws plus one instanced diffuser draw.
 */
export function OfficeDetails() {
  const gridMaterial = useRef(null)
  const { camera, size, viewport } = useThree()
  const { scene: fixtureScene } = useGLTF(FIXTURE_MODEL)
  const { scene: pedestalScene } = useGLTF(PEDESTAL_MODEL)
  const { scene: chairScene } = useGLTF(CHAIR_MODEL)
  const fixtureGeometry = useMemo(() => geometryFrom(fixtureScene), [fixtureScene])
  const pedestalGeometry = useMemo(
    () => segmentPedestalGeometry(geometryFrom(pedestalScene)),
    [pedestalScene]
  )
  const chairGeometry = useMemo(
    () => segmentChairGeometry(geometryFrom(chairScene)),
    [chairScene]
  )
  const pedestalMaterials = useMemo(
    () => makeMaterialSet(PEDESTAL_MATERIAL_PRESET),
    []
  )
  const upholsteryLinen = useTexture({
    map: '/textures/rough-linen/diffuse.jpg',
    normalMap: '/textures/rough-linen/normal.jpg',
    roughnessMap: '/textures/rough-linen/roughness.jpg',
  })
  const chairFabricMaps = useMemo(() => {
    // The chair's planar UVs are authored in metres of cloth (segmentation
    // pass), so the shared linen set is cloned at repeat 1 and stays
    // independent of the partitions' panel-scale tiling.
    const maps = {}
    for (const [name, source] of Object.entries(upholsteryLinen)) {
      const texture = source.clone()
      texture.needsUpdate = true
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      // The segmentation pass lays one tile per 340mm of cloth, which puts the
      // linen's threads under a pixel at the closest authored office framing —
      // the mip chain then averages the weave away and the cushions resolve to
      // flat colour. 0.55 stretches a tile to ~620mm so the structure lands
      // above Nyquist and reads as heavy contract upholstery.
      texture.repeat.set(0.55, 0.55)
      texture.anisotropy = 8
      texture.colorSpace =
        name === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace
      maps[name] = texture
    }
    return maps
  }, [upholsteryLinen])
  const chairMaterials = useMemo(() => {
    const materials = makeMaterialSet(CHAIR_MATERIAL_PRESET)
    // Seat and back upholstery carry the weave; without it the cushions'
    // sheen resolved as one hard vinyl band under the office key light.
    for (const index of [0, 1]) {
      materials[index].map = chairFabricMaps.map
      materials[index].normalMap = chairFabricMaps.normalMap
      materials[index].roughnessMap = chairFabricMaps.roughnessMap
      materials[index].normalScale = new THREE.Vector2(0.95, 0.95)
      materials[index].needsUpdate = true
    }
    return materials
  }, [chairFabricMaps])
  const diffuserGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const ceilingGrid = useMemo(() => {
    const members = []
    for (let z = -230; z <= 70; z += 16) {
      members.push({ position: [0, 33.12, z], scale: [210, 0.08, 0.12] })
    }
    for (let x = -96; x <= 96; x += 16) {
      members.push({ position: [x, 33.1, -80], scale: [0.12, 0.08, 300] })
    }
    return members
  }, [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const cadRotation = useMemo(
    () => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
    []
  )
  const gridCenter = useMemo(() => new THREE.Vector3(0, 33.1, -80), [])

  useFrame(() => {
    if (!gridMaterial.current) return
    const distance = Math.max(0.001, camera.position.distanceTo(gridCenter))
    // Moiré is a property of the physical raster, so measure in buffer pixels
    // (CSS height × DPR), not CSS pixels.
    const pixelsPerUnit =
      (size.height * viewport.dpr) /
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance)
    const memberWidthPx = 0.12 * pixelsPerUnit
    // Thin repeated ceiling geometry is a projector moiré generator. Let the
    // manufactured grid exist only while its narrow side is genuinely sampled;
    // below that, the broad ceiling panels and troffers carry the scale cue.
    const opacity = THREE.MathUtils.smoothstep(memberWidthPx, 1.5, 3)
    gridMaterial.current.opacity = opacity
    gridMaterial.current.visible = opacity > 0.01
  })

  return (
    <group>
      {/* A modeled suspended-ceiling T-grid now runs the full aisle depth.
          Thirty-three members remain one draw and fade before becoming moiré. */}
      <instancedMesh
        args={[undefined, undefined, ceilingGrid.length]}
        receiveShadow
        onUpdate={(mesh) => {
          ceilingGrid.forEach(({ position, scale }, index) => {
            dummy.position.set(...position)
            dummy.rotation.set(0, 0, 0)
            dummy.scale.set(...scale)
            dummy.updateMatrix()
            mesh.setMatrixAt(index, dummy.matrix)
          })
          mesh.instanceMatrix.needsUpdate = true
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          ref={gridMaterial}
          color="#858c88"
          roughness={0.46}
          metalness={0.34}
          transparent
          depthWrite={false}
        />
      </instancedMesh>

      {/* Recessed return-air grilles punctuate the continuous ceiling run.
          Both share one instanced draw and remain dark between lit troffers. */}
      <instancedMesh
        args={[undefined, undefined, 3]}
        receiveShadow
        onUpdate={(mesh) => {
          ;[-13, -97, -181].forEach((z, index) => {
            dummy.position.set(-54, 33.02, z)
            dummy.rotation.set(0, 0, 0)
            dummy.scale.set(12, 0.16, 5.8)
            dummy.updateMatrix()
            mesh.setMatrixAt(index, dummy.matrix)
          })
          mesh.instanceMatrix.needsUpdate = true
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#4b5353" roughness={0.5} metalness={0.38} />
      </instancedMesh>

      <instancedMesh
        args={[fixtureGeometry, undefined, FIXTURES.length]}
        castShadow
        onUpdate={(mesh) => placeCadInstances(mesh, FIXTURES, dummy, cadRotation)}
      >
        <meshStandardMaterial color="#626a67" roughness={0.58} metalness={0.14} />
      </instancedMesh>

      <instancedMesh
        args={[diffuserGeometry, undefined, FIXTURES.length]}
        onUpdate={(mesh) => {
          FIXTURES.forEach(([x, y, z], index) => {
            dummy.position.set(x, y - 0.025, z)
            dummy.rotation.set(Math.PI / 2, 0, 0)
            dummy.scale.set(26.2, 5.9, 1)
            dummy.updateMatrix()
            mesh.setMatrixAt(index, dummy.matrix)
          })
          mesh.instanceMatrix.needsUpdate = true
        }}
      >
        {/* Driven above display white: a fluorescent aperture is allowed to
            reach the ACES shoulder (QUALITY Q5) — at 0.62 the diffusers read
            as gray cards floating in a dark ceiling, not as light sources. */}
        <meshStandardMaterial
          color="#b8c2bd"
          emissive="#bac8c1"
          emissiveIntensity={2.1}
          roughness={0.62}
          metalness={0}
        />
      </instancedMesh>

      <instancedMesh
        args={[pedestalGeometry, pedestalMaterials, PEDESTALS.length]}
        castShadow
        receiveShadow
        onUpdate={(mesh) => placeCadInstances(mesh, PEDESTALS, dummy, cadRotation)}
      />

      {/* Original millimetre/Z-up CAD. Spatial groups preserve separate seat
          and back upholstery, molded frame, exposed metal, powder-coated
          carcass/drawers, bright hardware, and dark caster responses while each
          repeated asset remains one instanced mesh. */}
      <instancedMesh
        args={[chairGeometry, chairMaterials, CHAIRS.length]}
        castShadow
        receiveShadow
        onUpdate={(mesh) => placeCadInstances(mesh, CHAIRS, dummy, cadRotation)}
      />
    </group>
  )
}

useGLTF.preload(FIXTURE_MODEL)
useGLTF.preload(PEDESTAL_MODEL)
useGLTF.preload(CHAIR_MODEL)
