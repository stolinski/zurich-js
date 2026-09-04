import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { SCREEN_SIZE } from './CRTScreen.jsx'
import { makeCeilingMaps } from './ceiling.js'
import { makeCarpetTileMap } from './carpet.js'
import { makeLaminateMap } from './laminate.js'
import { addMouldedGrain } from '../lib/propSurface.js'
import {
  AgentMonitors,
  readAgentScreens,
  seedAgentPlacements,
} from './AgentMonitors.jsx'

const MODEL = '/models/office.glb'
const METRES_TO_SCENE = SCREEN_SIZE.w / 0.52

/**
 * The office footprint the Blender build paints its floor and ceiling maps
 * to, and the suspended grid both the painted tees and the modeled ones sit
 * on (blender/office/build_scene.py). One authored office, two consumers.
 */
export const OFFICE_PLANE = Object.freeze({ width: 260, depth: 360, centerZ: -80 })
export const OFFICE_GRID_ORIGIN = Object.freeze([8, -4])

/**
 * Where every fixture is, in the room's frame: one tile across and two along
 * the aisle, over the aisle's edges. Mirrored from the Blender build, because
 * the environment map and the ceiling wash need them before the GLB has
 * loaded.
 */
export const OFFICE_FIXTURES = Object.freeze(
  [-16, 16].flatMap((x) => [12, -36, -84, -132, -180].map((z) => [x, 33.1, z]))
)
export const OFFICE_FIXTURE_SIZE = Object.freeze({ width: 16, depth: 32 })

function tiled(source, repeat, colorSpace) {
  const texture = source.clone()
  texture.needsUpdate = true
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(...repeat)
  texture.anisotropy = 8
  texture.colorSpace = colorSpace
  return texture
}

/**
 * A painted map fitted to a slab's footprint. The glTF exporter flips V, so a
 * map sampled with flipY off lands with its top row at the slab's far (−z)
 * end — which is where the ceiling and carpet painters put it.
 */
function fitted(texture) {
  texture.flipY = false
  texture.needsUpdate = true
  return texture
}

/** Relief from a shared map set: normal + roughness at one physical repeat. */
function relief(material, maps, repeat, normalScale, { diffuse = false } = {}) {
  material.normalMap = tiled(maps.normalMap, repeat, THREE.NoColorSpace)
  material.roughnessMap = tiled(maps.roughnessMap, repeat, THREE.NoColorSpace)
  material.normalScale = new THREE.Vector2(normalScale, normalScale)
  if (diffuse) material.map = tiled(maps.map, repeat, THREE.SRGBColorSpace)
  return material
}

/**
 * The finished look of every named surface the Blender office exports. The
 * GLB carries geometry, UVs and material boundaries; the maps and the
 * physical response are the deck's, shared with the home set where the
 * material is the same (linen, plaster) and specific where it is not.
 *
 * UVs are authored in metres (box projection at one tile per metre, or fitted
 * 0–1 across the floor and ceiling slabs), so a repeat here is tiles per metre
 * of surface. The values reproduce the previous procedural set's densities:
 * the fabric weave tiled once per metre (FABRIC_DENSITY 0.031/unit), the
 * laminate fleck every 325 mm, the plaster tooth under it every 72 mm.
 */
function makeSurfaceFinishers({ plaster, linen, carpet, ceilingMaps, carpetTiles, laminatePrint }) {
  const physical = (params) => new THREE.MeshPhysicalMaterial(params)
  const standard = (params) => new THREE.MeshStandardMaterial(params)
  return {
    'Cubicle fabric': () =>
      relief(
        physical({
          color: '#777873',
          roughness: 0.86,
          metalness: 0,
          sheen: 0.45,
          sheenColor: new THREE.Color('#b7b8b1'),
          sheenRoughness: 0.8,
          envMapIntensity: 0.64,
        }),
        linen,
        [0.95, 0.95],
        0.5,
        { diffuse: true }
      ),
    // The tile below the beltline, a step darker: the tone break at desk
    // height is what reads as a panel system rather than a slab.
    'Cubicle fabric lower': () =>
      relief(
        physical({
          color: '#575b59',
          roughness: 0.88,
          metalness: 0,
          sheen: 0.4,
          sheenColor: new THREE.Color('#9a9c96'),
          sheenRoughness: 0.82,
          envMapIntensity: 0.6,
        }),
        linen,
        [0.95, 0.95],
        0.5,
        { diffuse: true }
      ),
    // Satin anodised cap, not a mirror: at higher metalness the rails broke
    // into crawling dashes along every panel top at the wide framings.
    'Partition frame': () =>
      physical({
        color: '#5f6462',
        roughness: 0.55,
        metalness: 0.25,
        clearcoat: 0.04,
        clearcoatRoughness: 0.6,
        envMapIntensity: 0.7,
      }),
    'Partition raceway': () =>
      standard({ color: '#474c4a', roughness: 0.62, metalness: 0.18 }),
    // `map` is the fleck print (laminate.js); the plaster set supplies the
    // tooth under it, which is what stops the largest bright surface in the
    // room returning one uniform value under every highlight.
    'Laminate worktop': () => {
      const material = relief(
        physical({
          color: '#9f9b91',
          roughness: 0.61,
          metalness: 0,
          clearcoat: 0.08,
          clearcoatRoughness: 0.64,
          envMapIntensity: 0.88,
        }),
        plaster,
        [14, 14],
        0.19
      )
      material.map = tiled(laminatePrint, [3.08, 3.08], THREE.SRGBColorSpace)
      return material
    },
    'Desk steel': () =>
      physical({
        color: '#475052',
        roughness: 0.4,
        metalness: 0.58,
        clearcoat: 0.025,
        clearcoatRoughness: 0.55,
        envMapIntensity: 0.94,
      }),
    'Keyboard tray': () => standard({ color: '#2a2f2e', roughness: 0.62, metalness: 0.1 }),
    // Relief keeps the fine photographic repeat; the tile field carries the
    // metre-scale structure the wide framings actually resolve.
    'Carpet tile': () => {
      const material = relief(
        standard({ color: '#c4cbc7', roughness: 0.98, metalness: 0 }),
        carpet,
        [18, 24],
        0.38
      )
      material.map = carpetTiles
      return material
    },
    // Mineral fibre is a genuinely pale material and the single largest
    // surface in every wide framing; the painted map carries the tees and
    // the troffer wash (ceiling.js).
    'Ceiling tile': () =>
      standard({
        color: '#9ea6a1',
        roughness: 0.9,
        emissive: '#ffffff',
        emissiveIntensity: 0.62,
        map: ceilingMaps.map,
        emissiveMap: ceilingMaps.emissiveMap,
      }),
    // Faded by projected size (see the frame loop below): a 24 mm tee at the
    // far end of the aisle is a projector moiré generator.
    // Painted steel a shade below the tile, not bare metal: at metalness 0.34
    // the grid reflected the dark room and the ceiling read as a black cage.
    'Ceiling tee': () =>
      standard({
        color: '#8f958f',
        roughness: 0.55,
        metalness: 0.12,
        transparent: true,
        depthWrite: false,
      }),
    'Troffer frame': () => standard({ color: '#aeb6b2', roughness: 0.5, metalness: 0.2 }),
    // Driven above display white: a fluorescent aperture is allowed to reach
    // the ACES shoulder (QUALITY Q5).
    'Troffer lens': () =>
      standard({
        color: '#b8c2bd',
        emissive: '#bac8c1',
        emissiveIntensity: 2.1,
        roughness: 0.62,
        metalness: 0,
      }),
    'Return grille': () => standard({ color: '#4b5353', roughness: 0.5, metalness: 0.38 }),
    'Office shell': () =>
      relief(standard({ color: '#4b534f', roughness: 0.93, metalness: 0 }), plaster, [1.2, 1.2], 0.3),
    'Vinyl base': () => standard({ color: '#2e3231', roughness: 0.7 }),
    'Office door': () => physical({ color: '#666b67', roughness: 0.48, clearcoat: 0.06 }),
    'Door frame': () => standard({ color: '#2c302f', roughness: 0.5, metalness: 0.3 }),
    'Door glass': () =>
      physical({ color: '#071013', roughness: 0.19, metalness: 0.04, clearcoat: 0.32 }),
    'Binder bin': () => standard({ color: '#8d918b', roughness: 0.55, metalness: 0.12 }),
    'Pedestal carcass': () =>
      physical({ color: '#5d6966', roughness: 0.61, metalness: 0.06, clearcoat: 0.08, clearcoatRoughness: 0.78, envMapIntensity: 0.82 }),
    'Pedestal drawer': () =>
      physical({ color: '#697571', roughness: 0.49, metalness: 0.08, clearcoat: 0.1, clearcoatRoughness: 0.68, envMapIntensity: 0.9 }),
    'Pedestal hardware': () =>
      physical({ color: '#343b3c', roughness: 0.27, metalness: 0.76, clearcoat: 0.03, clearcoatRoughness: 0.48, envMapIntensity: 1.05 }),
    'Pedestal caster': () =>
      physical({ color: '#202629', roughness: 0.7, metalness: 0.04, clearcoat: 0.02, clearcoatRoughness: 0.84, envMapIntensity: 0.7 }),
    // Contract upholstery is matte; a broad sheen lobe read as painted
    // plastic. Warm-biased because the cool office light pushes it neutral.
    'Chair wool': () =>
      relief(
        physical({
          color: '#5a554e',
          roughness: 0.96,
          metalness: 0,
          sheen: 0.16,
          sheenColor: new THREE.Color('#9c9890'),
          sheenRoughness: 0.9,
          envMapIntensity: 0.5,
        }),
        linen,
        [1, 1],
        0.95,
        { diffuse: true }
      ),
    'Chair frame': () =>
      physical({ color: '#151a1d', roughness: 0.5, metalness: 0.025, clearcoat: 0.05, clearcoatRoughness: 0.74, envMapIntensity: 0.88 }),
    'Chair chrome': () =>
      physical({ color: '#8b9491', roughness: 0.29, metalness: 0.78, clearcoat: 0.02, clearcoatRoughness: 0.44, envMapIntensity: 1.1 }),
    // The hero shell's colour and moulded tooth. The grain's periods are in
    // OBJECT units: the hero mesh is millimetres, this export is metres, so
    // the hero's 0.09 / 0.82 become 0.00009 / 0.00082 here — at the hero's
    // numbers the tooth was a 9 cm and 82 cm cloud over every bezel.
    'Bay CRT': () =>
      addMouldedGrain(standard({ color: '#2b2d32', roughness: 0.62, metalness: 0.015 }), {
        fine: 0.00009,
        broad: 0.00082,
      }),
    'Keyboard case': () => standard({ color: '#20262d', roughness: 0.72 }),
    'PBT keycaps': () => standard({ color: '#3a424c', roughness: 0.62 }),
    'PBT modifier keycaps': () => standard({ color: '#2c333b', roughness: 0.66 }),
    'Keyboard plate': () => standard({ color: '#0b0d0d', roughness: 0.8 }),
    'Soft rubber': () => standard({ color: '#111514', roughness: 0.82 }),
    'Mouse shell': () => standard({ color: '#2a3038', roughness: 0.54, envMapIntensity: 0.85 }),
    'Dead black': () => standard({ color: '#080b0a', roughness: 0.84 }),
    // Glazed ceramic: the one sharp bright specular on the desk.
    'Bone ceramic': () =>
      physical({ color: '#c9c6bc', roughness: 0.38, metalness: 0, clearcoat: 0.65, clearcoatRoughness: 0.22 }),
    'Black coffee': () => standard({ color: '#070605', roughness: 0.18, metalness: 0.1 }),
    'Copy paper': () => standard({ color: '#d8d3c5', roughness: 0.9 }),
    'ID badge': () => standard({ color: '#315b70', roughness: 0.74 }),
    'Lanyard': () => standard({ color: '#23282c', roughness: 0.9 }),
    'Modesty panel': () => standard({ color: '#585e5c', roughness: 0.55, metalness: 0.3 }),
    'Waste bin': () => standard({ color: '#2b2f2e', roughness: 0.72 }),
    'Power strip': () => standard({ color: '#d8d6cf', roughness: 0.6 }),
    'Desk phone': () => physical({ color: '#3a3f3e', roughness: 0.6, clearcoat: 0.06 }),
    'Copier shell': () => physical({ color: '#a9a79e', roughness: 0.55, clearcoat: 0.05 }),
    'Copier trim': () => standard({ color: '#2c302f', roughness: 0.5 }),
    'Clock rim': () => standard({ color: '#1d2120', roughness: 0.45, metalness: 0.3 }),
    'Clock face': () => standard({ color: '#e6e4dc', roughness: 0.7 }),
  }
}

/**
 * Blender owns the office's architecture, furniture, UVs and material
 * boundaries (blender/office). R3F keeps the live CRT, the eight agent
 * screens, the light rig, the painted ceiling and carpet fields, and the
 * baked irradiance receivers. The metric root is scaled once from the exact
 * 520 mm glass contract; there are no per-prop alignment fudges at runtime.
 */
export function CubicleOffice({ active }) {
  const { scene } = useGLTF(MODEL)
  const { camera, size, viewport } = useThree()
  const teeMaterial = useRef(null)
  const plaster = useTexture({
    normalMap: '/textures/painted-plaster/normal.jpg',
    roughnessMap: '/textures/painted-plaster/roughness.jpg',
  })
  const linen = useTexture({
    map: '/textures/rough-linen/diffuse.jpg',
    normalMap: '/textures/rough-linen/normal.jpg',
    roughnessMap: '/textures/rough-linen/roughness.jpg',
  })
  const carpet = useTexture({
    normalMap: '/textures/office-carpet/normal.jpg',
    roughnessMap: '/textures/office-carpet/roughness.jpg',
  })
  // Painted once and resident from first mount: the footprint and the
  // fixture layout are authored constants, so nothing here can be built
  // during a navigation (QUALITY Q2).
  const painted = useMemo(
    () => ({
      ceilingMaps: (() => {
        const maps = makeCeilingMaps({
          plane: OFFICE_PLANE,
          fixtures: OFFICE_FIXTURES,
          fixtureSize: OFFICE_FIXTURE_SIZE,
          gridOrigin: OFFICE_GRID_ORIGIN,
        })
        return { map: fitted(maps.map), emissiveMap: fitted(maps.emissiveMap) }
      })(),
      carpetTiles: fitted(makeCarpetTileMap({ width: OFFICE_PLANE.width, depth: OFFICE_PLANE.depth })),
      laminatePrint: makeLaminateMap(),
    }),
    []
  )

  const office = useMemo(() => {
    const root = scene.clone(true)
    const finishers = makeSurfaceFinishers({ plaster, linen, carpet, ...painted })
    const materialCache = new Map()
    const finish = (source) => {
      if (!materialCache.has(source)) {
        const finisher = finishers[source.name]
        if (!finisher) {
          throw new Error(`office.glb carries a surface with no runtime finish: ${source.name}`)
        }
        const material = finisher()
        material.name = source.name
        materialCache.set(source, material)
      }
      return materialCache.get(source)
    }

    root.traverse((object) => {
      if (!object.isMesh) return
      const sources = Array.isArray(object.material) ? object.material : [object.material]
      const finished = sources.map(finish)
      object.material = finished.length === 1 ? finished[0] : finished
      if (sources.length === 1 && sources[0].name === 'Ceiling tee') {
        teeMaterial.current = object.material
      }
      object.castShadow = true
      object.receiveShadow = true
    })
    return root
  }, [carpet, linen, painted, plaster, scene])

  const placements = useMemo(
    () => seedAgentPlacements(readAgentScreens(scene), 0xc0b1c1e),
    [scene]
  )

  const gridCenter = useMemo(() => new THREE.Vector3(0, 33.1, OFFICE_PLANE.centerZ), [])
  useFrame(() => {
    const material = teeMaterial.current
    if (!material) return
    const distance = Math.max(0.001, camera.position.distanceTo(gridCenter))
    // Moiré is a property of the physical raster, so measure in buffer pixels
    // (CSS height × DPR), not CSS pixels.
    const pixelsPerUnit =
      (size.height * viewport.dpr) /
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance)
    // A 24 mm tee is 0.74 scene units. Let the modeled grid exist only while
    // its narrow side is genuinely sampled; below that the painted tees on
    // the tiles carry it.
    const memberWidthPx = 0.74 * pixelsPerUnit
    const opacity = THREE.MathUtils.smoothstep(memberWidthPx, 1.5, 3)
    material.opacity = opacity
    material.visible = opacity > 0.01
  })

  return (
    <group>
      <primitive object={office} scale={METRES_TO_SCENE} />
      <AgentMonitors placements={placements} active={active} />
    </group>
  )
}

useGLTF.preload(MODEL)
