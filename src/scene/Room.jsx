import { useCallback, useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF, useTexture } from '@react-three/drei'
import { MM } from './scale.js'
import { ContactPatches } from './ContactPatches.jsx'
import {
  configureIrradianceTexture,
  IRRADIANCE_BOUNDS,
} from './bakedIrradiance.js'
import { BakedIrradianceLayer } from './BakedIrradianceLayer.jsx'

/**
 * The HOME set: a wide walnut desk in a dark room, with its floor, envelope and
 * authored contact.
 *
 * This file used to carry a `variant` prop with a whole second `cubicle` branch —
 * laminate worktop, cantilever, carpet floor, plaster wall, ceiling. None of it
 * ran. `Room` is only ever mounted from Stages.jsx, and the office set builds its
 * own architecture in `CubicleStage`/`OfficeLighting` (see the comment there
 * about owning its shell rather than inheriting Room's rear wall). Editing the
 * dead branch to change the office looked like it worked and changed nothing,
 * and its unconditional `office-carpet` load was mutating the SAME cached
 * texture objects the real office floor samples, with a different repeat — so
 * the live floor's normal-map scale depended on component mount order. Both are
 * gone; the office owns the office.
 */

const DESK_MODEL = '/models/desk.glb'

/** The top surface of both desks; the monitor and every prop anchor here. */
export const DESK_Y = -8.34
/** 730mm below the office worktop at the scene's millimetre scale. */
export const OFFICE_FLOOR_Y = DESK_Y - 21.2

const HOME_FLOOR_Y = DESK_Y - 26
// Split by FOOTPRINT SHAPE, not by surface. A radial falloff under the keyboard
// or the notebook pulls away from the corners where the object is still touching
// the desk, and no opacity value fixes that — the prop just reads as pasted on.
const HOME_DESK_CONTACTS_RECT = [
  [0, DESK_Y + 0.035, -0.6, 11, 5], // monitor stand
  [-0.4, DESK_Y + 0.035, 9.1, 11.5, 3.8, -0.05], // keyboard
  [-9.8, DESK_Y + 0.035, 7.6, 6.4, 5, 0.38], // notebook — previously had none
]
const HOME_DESK_CONTACTS_RADIAL = [
  [6.1, DESK_Y + 0.035, 9, 3.8, 3, 0.22], // mouse
  [9.9, DESK_Y + 0.035, 5.4, 3.2, 3.2], // mug
  [-19.5, DESK_Y + 0.035, -2.5, 7, 6.5, -0.6], // lamp base
]
const HOME_FLOOR_CONTACTS = [
  [0, HOME_FLOOR_Y + 0.035, -1.5, 108, 48],
]
const HOME_CEILING_Y = 42
const HOME_REAR_Z = -64
const HOME_FRONT_Z = 35
const HOME_HALF_WIDTH = 78
const HOME_WALL_HEIGHT = HOME_CEILING_Y - HOME_FLOOR_Y
const HOME_WALL_CENTER_Y = HOME_FLOOR_Y + HOME_WALL_HEIGHT / 2
const DOOR_CENTER_X = -50
const DOOR_HALF_WIDTH = 12
const DOOR_TOP_Y = 30
const DOOR_HEIGHT = DOOR_TOP_Y - HOME_FLOOR_Y
const DOOR_CENTER_Y = HOME_FLOOR_Y + DOOR_HEIGHT / 2
const ROOM_DEPTH = HOME_FRONT_Z - HOME_REAR_Z
const ROOM_CENTER_Z = HOME_REAR_Z + ROOM_DEPTH / 2
const HOME_BAKED_FLOOR = [
  {
    position: [0, HOME_FLOOR_Y + 0.028, ROOM_CENTER_Z],
    rotation: [-Math.PI / 2, 0, 0],
    scale: [HOME_HALF_WIDTH * 2, ROOM_DEPTH],
  },
]

// One instanced shell closes the room: a segmented rear wall leaves a real
// doorway, the returns catch oblique views, and the ceiling prevents the wide
// home cameras from resolving into the canvas clear colour.
const HOME_ENVELOPE_BOXES = [
  {
    position: [-70, HOME_WALL_CENTER_Y, HOME_REAR_Z - 0.5],
    scale: [16, HOME_WALL_HEIGHT, 1],
  },
  {
    position: [20, HOME_WALL_CENTER_Y, HOME_REAR_Z - 0.5],
    scale: [116, HOME_WALL_HEIGHT, 1],
  },
  {
    position: [DOOR_CENTER_X, (DOOR_TOP_Y + HOME_CEILING_Y) / 2, HOME_REAR_Z - 0.5],
    scale: [DOOR_HALF_WIDTH * 2, HOME_CEILING_Y - DOOR_TOP_Y, 1],
  },
  {
    position: [-HOME_HALF_WIDTH + 0.5, HOME_WALL_CENTER_Y, ROOM_CENTER_Z],
    scale: [1, HOME_WALL_HEIGHT, ROOM_DEPTH],
  },
  {
    position: [HOME_HALF_WIDTH - 0.5, HOME_WALL_CENTER_Y, ROOM_CENTER_Z],
    scale: [1, HOME_WALL_HEIGHT, ROOM_DEPTH],
  },
  {
    position: [0, HOME_CEILING_Y + 0.5, ROOM_CENTER_Z],
    scale: [HOME_HALF_WIDTH * 2, 1, ROOM_DEPTH],
  },
]

// The doorway does not open onto black. A short, finite return terminates at a
// second wall plane, giving the cold rim a real architectural source and the
// frontal reveal a deeper plane than the room wall.
const HOME_HALL_BOXES = [
  {
    position: [DOOR_CENTER_X, DOOR_CENTER_Y, HOME_REAR_Z - 27.5],
    scale: [DOOR_HALF_WIDTH * 2, DOOR_HEIGHT, 1],
  },
  {
    position: [DOOR_CENTER_X - DOOR_HALF_WIDTH - 0.5, DOOR_CENTER_Y, HOME_REAR_Z - 14],
    scale: [1, DOOR_HEIGHT, 28],
  },
  {
    position: [DOOR_CENTER_X + DOOR_HALF_WIDTH + 0.5, DOOR_CENTER_Y, HOME_REAR_Z - 14],
    scale: [1, DOOR_HEIGHT, 28],
  },
  {
    position: [DOOR_CENTER_X, HOME_FLOOR_Y - 0.2, HOME_REAR_Z - 14],
    scale: [DOOR_HALF_WIDTH * 2, 0.4, 28],
  },
  {
    position: [DOOR_CENTER_X, DOOR_TOP_Y + 0.25, HOME_REAR_Z - 14],
    scale: [DOOR_HALF_WIDTH * 2, 0.5, 28],
  },
]

const HOME_TRIM_BOXES = [
  // Door casing and threshold.
  {
    position: [DOOR_CENTER_X - DOOR_HALF_WIDTH, DOOR_CENTER_Y, HOME_REAR_Z + 0.2],
    scale: [1.25, DOOR_HEIGHT + 1.2, 1.25],
  },
  {
    position: [DOOR_CENTER_X + DOOR_HALF_WIDTH, DOOR_CENTER_Y, HOME_REAR_Z + 0.2],
    scale: [1.25, DOOR_HEIGHT + 1.2, 1.25],
  },
  {
    position: [DOOR_CENTER_X, DOOR_TOP_Y + 0.6, HOME_REAR_Z + 0.2],
    scale: [25.25, 1.25, 1.25],
  },
  {
    position: [DOOR_CENTER_X, HOME_FLOOR_Y + 0.24, HOME_REAR_Z + 0.45],
    scale: [24, 0.48, 1.7],
  },
  // Window frame and central mullion. Members remain broad enough to resolve
  // above the 1.5px geometry guard at every authored home waypoint.
  { position: [18, 8, HOME_REAR_Z + 0.2], scale: [1.15, 31, 1.25] },
  { position: [54, 8, HOME_REAR_Z + 0.2], scale: [1.15, 31, 1.25] },
  { position: [36, 23, HOME_REAR_Z + 0.2], scale: [37, 1.15, 1.25] },
  { position: [36, -7, HOME_REAR_Z + 0.2], scale: [37, 1.15, 1.25] },
  { position: [36, 8, HOME_REAR_Z + 0.3], scale: [0.9, 30, 1.3] },
  { position: [36, -7.55, HOME_REAR_Z + 1.0], scale: [39, 1.1, 3.2] },
  // Baseboards make the room/floor contact readable without another light.
  { position: [-70, HOME_FLOOR_Y + 1, HOME_REAR_Z + 0.2], scale: [16, 2, 1.05] },
  { position: [20, HOME_FLOOR_Y + 1, HOME_REAR_Z + 0.2], scale: [116, 2, 1.05] },
  {
    position: [-HOME_HALF_WIDTH + 1, HOME_FLOOR_Y + 1, ROOM_CENTER_Z],
    scale: [1.05, 2, ROOM_DEPTH],
  },
  {
    position: [HOME_HALF_WIDTH - 1, HOME_FLOOR_Y + 1, ROOM_CENTER_Z],
    scale: [1.05, 2, ROOM_DEPTH],
  },
]

function StaticBoxInstances({ geometry, placements, children, ...props }) {
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const place = useCallback(
    (mesh) => {
      placements.forEach(({ position, scale, rotation = [0, 0, 0] }, index) => {
        dummy.position.set(...position)
        dummy.rotation.set(...rotation)
        dummy.scale.set(...scale)
        dummy.updateMatrix()
        mesh.setMatrixAt(index, dummy.matrix)
      })
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
      mesh.instanceMatrix.needsUpdate = true
    },
    [dummy, placements]
  )

  return (
    <instancedMesh
      args={[geometry, undefined, placements.length]}
      onUpdate={place}
      frustumCulled={false}
      {...props}
    >
      {children}
    </instancedMesh>
  )
}

function HomeEnvelope({ wallMaps, blindMaps }) {
  const unitBox = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const materials = useMemo(
    () => ({
      envelope: new THREE.MeshStandardMaterial({
        color: '#383d3b',
        roughness: 0.97,
        metalness: 0,
        emissive: '#1b211f',
        emissiveIntensity: 0.08,
        ...wallMaps,
      }),
      hall: new THREE.MeshStandardMaterial({
        color: '#222725',
        roughness: 0.96,
        metalness: 0,
        emissive: '#141a18',
        emissiveIntensity: 0.06,
        ...wallMaps,
      }),
      trim: new THREE.MeshStandardMaterial({
        color: '#303735',
        roughness: 0.68,
        metalness: 0.04,
        emissive: '#18211f',
        emissiveIntensity: 0.08,
      }),
      blind: new THREE.MeshStandardMaterial({
        color: '#5d5e58',
        roughness: 0.98,
        metalness: 0,
        ...blindMaps,
      }),
    }),
    [blindMaps, wallMaps]
  )

  return (
    <group>
      <StaticBoxInstances
        geometry={unitBox}
        placements={HOME_ENVELOPE_BOXES}
        castShadow
        receiveShadow
      >
        <primitive attach="material" object={materials.envelope} />
      </StaticBoxInstances>

      <StaticBoxInstances
        geometry={unitBox}
        placements={HOME_HALL_BOXES}
        castShadow
        receiveShadow
      >
        <primitive attach="material" object={materials.hall} />
      </StaticBoxInstances>

      <StaticBoxInstances
        geometry={unitBox}
        placements={HOME_TRIM_BOXES}
        castShadow
        receiveShadow
      >
        <primitive attach="material" object={materials.trim} />
      </StaticBoxInstances>

      {/* A recessed, terminated night window adds another plane without
          becoming a second luminous rectangle. The linen roller blind catches
          only broad room response; the phosphor glass stays dominant. */}
      <mesh position={[36, 8, HOME_REAR_Z + 0.05]} receiveShadow>
        <boxGeometry args={[35, 29, 0.28]} />
        <meshPhysicalMaterial
          color="#0b1010"
          roughness={0.32}
          metalness={0.08}
          clearcoat={0.18}
          clearcoatRoughness={0.4}
          emissive="#07100e"
          emissiveIntensity={0.05}
        />
      </mesh>
      <mesh
        position={[36, 14.5, HOME_REAR_Z + 0.92]}
        material={materials.blind}
        receiveShadow
      >
        <boxGeometry args={[34.7, 17, 0.36]} />
      </mesh>
    </group>
  )
}

/**
 * The CAD exporter supplies positions, colours and normals but no TEXCOORD_0.
 * A PBR map on that geometry therefore sampled one texel over the whole desk —
 * the maps existed, but could never be seen. The authored top is XY in CAD
 * space, so a planar XY projection gives it stable real-world grain direction.
 */
function prepareDeskGeometry(geometry) {
  const prepared = geometry.clone()
  prepared.computeBoundingBox()
  const { min, max } = prepared.boundingBox
  const width = Math.max(1e-6, max.x - min.x)
  const depth = Math.max(1e-6, max.y - min.y)
  const thickness = Math.max(1e-6, max.z - min.z)
  const position = prepared.attributes.position
  const normal = prepared.attributes.normal
  const uv = new Float32Array(position.count * 2)

  // The slab is built +Z-up in CAD. The top gets a long, continuous planar
  // veneer; the vertical band follows whichever edge it belongs to. This keeps
  // grain horizontal around the bullnose instead of projecting the top straight
  // through the edge and underside.
  for (let i = 0; i < position.count; i++) {
    const x = (position.getX(i) - min.x) / width
    const y = (position.getY(i) - min.y) / depth
    const z = (position.getZ(i) - min.z) / thickness
    const nx = Math.abs(normal.getX(i))
    const ny = Math.abs(normal.getY(i))
    const nz = normal.getZ(i)

    if (Math.abs(nz) > 0.58) {
      uv[i * 2] = x * 1.12
      uv[i * 2 + 1] = y * 0.52
    } else {
      uv[i * 2] = (nx > ny ? y : x) * (nx > ny ? 0.5 : 1.12)
      uv[i * 2 + 1] = 0.18 + z * 0.12
    }
  }
  prepared.setAttribute('uv', new THREE.BufferAttribute(uv, 2))

  // Keep one mesh and one draw per surface class. Reordering the existing index
  // is much cheaper than de-indexing 17k triangles, and gives the broad top,
  // veneer edge, and dark underside physically distinct roughness responses.
  const source = prepared.index
  if (source) {
    const buckets = [[], [], []]
    for (let offset = 0; offset < source.count; offset += 3) {
      const a = source.getX(offset)
      const b = source.getX(offset + 1)
      const c = source.getX(offset + 2)
      const nz = (normal.getZ(a) + normal.getZ(b) + normal.getZ(c)) / 3
      const materialIndex = nz > 0.42 ? 0 : nz < -0.42 ? 2 : 1
      buckets[materialIndex].push(a, b, c)
    }
    const ordered = buckets.flat()
    const IndexArray = position.count > 65535 ? Uint32Array : Uint16Array
    prepared.setIndex(new THREE.BufferAttribute(new IndexArray(ordered), 1))
    prepared.clearGroups()
    let start = 0
    buckets.forEach((bucket, materialIndex) => {
      prepared.addGroup(start, bucket.length, materialIndex)
      start += bucket.length
    })
  }

  return prepared
}

export function Room() {
  const { scene } = useGLTF(DESK_MODEL)
  const wood = useTexture({
    map: '/textures/wood-table/diffuse.jpg',
    normalMap: '/textures/wood-table/normal.jpg',
    roughnessMap: '/textures/wood-table/roughness.jpg',
  })
  const plaster = useTexture({
    normalMap: '/textures/painted-plaster/normal.jpg',
    roughnessMap: '/textures/painted-plaster/roughness.jpg',
  })
  const roughLinen = useTexture({
    map: '/textures/rough-linen/diffuse.jpg',
    normalMap: '/textures/rough-linen/normal.jpg',
    roughnessMap: '/textures/rough-linen/roughness.jpg',
  })
  const homeFloorIrradianceSource = useTexture(
    '/textures/lightmaps/home-floor-irradiance.png'
  )
  const homeFloorIrradianceMap = useMemo(
    () => configureIrradianceTexture(homeFloorIrradianceSource),
    [homeFloorIrradianceSource]
  )

  const woodMaps = useMemo(() => {
    for (const texture of Object.values(wood)) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      // Surface-specific scale and direction are authored into the geometry's
      // UVs. The source remains untransformed so top and edge agree at the rim.
      texture.repeat.set(1, 1)
      texture.anisotropy = 12
    }
    wood.map.colorSpace = THREE.SRGBColorSpace
    wood.normalMap.colorSpace = wood.roughnessMap.colorSpace = THREE.NoColorSpace
    return wood
  }, [wood])

  const wallMaps = useMemo(() => {
    const maps = {}
    for (const [name, source] of [
      ['normalMap', plaster.normalMap],
      ['roughnessMap', plaster.roughnessMap],
    ]) {
      const texture = source.clone()
      texture.needsUpdate = true
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(4, 2.1)
      texture.anisotropy = 8
      texture.colorSpace = THREE.NoColorSpace
      maps[name] = texture
    }
    return {
      ...maps,
      normalScale: new THREE.Vector2(0.58, 0.58),
    }
  }, [plaster.normalMap, plaster.roughnessMap])

  const homeFloorMaps = useMemo(() => {
    const maps = {}
    for (const [name, source] of Object.entries(wood)) {
      const texture = source.clone()
      texture.needsUpdate = true
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(8, 6)
      texture.anisotropy = 8
      texture.colorSpace = name === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace
      maps[name] = texture
    }
    return {
      ...maps,
      normalScale: new THREE.Vector2(0.18, 0.18),
    }
  }, [wood])

  const blindMaps = useMemo(() => {
    const maps = {}
    for (const [name, source] of Object.entries(roughLinen)) {
      const texture = source.clone()
      texture.needsUpdate = true
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(3.4, 1.2)
      texture.anisotropy = 6
      texture.colorSpace = name === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace
      maps[name] = texture
    }
    return {
      ...maps,
      normalScale: new THREE.Vector2(0.08, 0.08),
    }
  }, [roughLinen])

  const homeDesk = useMemo(() => {
    const root = scene.clone(true)
    const materials = [
      new THREE.MeshStandardMaterial({
        color: '#e7ddd2',
        roughness: 1,
        metalness: 0,
        ...woodMaps,
        normalScale: new THREE.Vector2(0.34, 0.34),
      }),
      new THREE.MeshStandardMaterial({
        color: '#baa598',
        roughness: 0.96,
        metalness: 0,
        ...woodMaps,
        normalScale: new THREE.Vector2(0.16, 0.16),
      }),
      new THREE.MeshStandardMaterial({
        color: '#281916',
        roughness: 0.94,
        metalness: 0,
      }),
    ]
    root.traverse((object) => {
      if (!object.isMesh) return
      object.geometry = prepareDeskGeometry(object.geometry)
      object.material = materials
      object.receiveShadow = true
      object.castShadow = true
    })
    return root
  }, [scene, woodMaps])

  const homeFloorMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#76716d',
        roughness: 0.96,
        metalness: 0,
        ...homeFloorMaps,
      }),
    [homeFloorMaps]
  )

  return (
    <group>
      <primitive
        object={homeDesk}
        position={[0, DESK_Y, -2]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={MM}
      />

      {/* A real receiving floor is what gives the furniture weight. The room
          terminates at its own shell and uses the local timber set at a broader
          floor scale. */}
      <mesh
        position={[0, HOME_FLOOR_Y, ROOM_CENTER_Z]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[HOME_HALF_WIDTH * 2, ROOM_DEPTH]} />
        <primitive attach="material" object={homeFloorMaterial} />
      </mesh>

      <BakedIrradianceLayer
        texture={homeFloorIrradianceMap}
        bounds={IRRADIANCE_BOUNDS.home}
        intensity={0.08}
        placements={HOME_BAKED_FLOOR}
      />

      {/* Firm enough that every prop visibly sits on the desk — faint contact is
          most of why an object reads as pasted in. The rect mask has a flat
          plateau where the radial one is already falling off, so it carries at a
          lower opacity without printing its own quad edge. */}
      <ContactPatches
        patches={HOME_DESK_CONTACTS_RECT}
        opacity={0.3}
        shape="rect"
      />
      <ContactPatches patches={HOME_DESK_CONTACTS_RADIAL} opacity={0.38} />
      <ContactPatches patches={HOME_FLOOR_CONTACTS} opacity={0.2} />

      <HomeEnvelope wallMaps={wallMaps} blindMaps={blindMaps} />
    </group>
  )
}

useGLTF.preload(DESK_MODEL)
