import { useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF, useTexture } from '@react-three/drei'
import { SCREEN_SIZE } from './CRTScreen.jsx'
import { IrradiancePatches } from './IrradiancePatches.jsx'
import { addMouldedGrain } from '../lib/propSurface.js'
import {
  AgentMonitors,
  readAgentScreens,
  seedAgentPlacements,
} from './AgentMonitors.jsx'

const MODEL = '/models/wall.glb'
const METRES_TO_SCENE = SCREEN_SIZE.w / 0.52

function tiled(source, repeat) {
  const texture = source.clone()
  texture.needsUpdate = true
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(...repeat)
  texture.anisotropy = 8
  texture.colorSpace = THREE.NoColorSpace
  return texture
}

/**
 * The finished look of every named surface the Blender wall exports. The
 * vault is one material family — painted concrete, powder-coated rack steel,
 * galvanised tray — and the fifty-four housings are the hero's shell. UVs are
 * box-projected at one tile per metre, so repeats are tiles per metre.
 */
function makeSurfaceFinishers({ plaster }) {
  const standard = (params) => new THREE.MeshStandardMaterial(params)
  const concrete = (color, roughness) => {
    const material = standard({ color, roughness, metalness: 0.04 })
    material.normalMap = tiled(plaster.normalMap, [1.4, 1.4])
    material.roughnessMap = tiled(plaster.roughnessMap, [1.4, 1.4])
    material.normalScale = new THREE.Vector2(0.25, 0.25)
    return material
  }
  return {
    // Enough albedo that the aggregate screen spill grounds the vault's
    // floor and ceiling; near-vantablack could not return any light and the
    // wall read as rows floating in a void — which is exactly what it still
    // did at #0b1210, with half the frame measuring below 10/255.
    'Vault floor': () => concrete('#1d2523', 0.94),
    'Vault ceiling': () => concrete('#1a2120', 0.95),
    'Vault wall': () => concrete('#1d2523', 0.94),
    'Rack upright': () => standard({ color: '#18201f', roughness: 0.46, metalness: 0.52 }),
    'Rack shelf': () => standard({ color: '#141a1b', roughness: 0.5, metalness: 0.4 }),
    'Rack panel': () => standard({ color: '#12181a', roughness: 0.84, metalness: 0.12 }),
    'Cable tray': () => standard({ color: '#4a5250', roughness: 0.5, metalness: 0.6 }),
    'Cable bundle': () => standard({ color: '#0c0d0d', roughness: 0.8 }),
    'Power cable': () => standard({ color: '#0a0b0d', roughness: 0.62, metalness: 0.05 }),
    // Checker plate a shade off the floor, not polished steel: at metalness
    // 0.55 it caught the spill as a bright wedge running at the camera.
    'Trench cover': () => standard({ color: '#20262a', roughness: 0.62, metalness: 0.28 }),
    // The hero shell's colour and moulded tooth. The grain's periods are in
    // OBJECT units: the hero mesh is millimetres, this export is metres, so
    // the hero's 0.09 / 0.82 become 0.00009 / 0.00082 here — at the hero's
    // numbers the tooth was a 9 cm and 82 cm cloud over every bezel.
    'Wall CRT': () =>
      addMouldedGrain(standard({ color: '#2b2d32', roughness: 0.62, metalness: 0.015 }), {
        fine: 0.00009,
        broad: 0.00082,
      }),
  }
}

/** A point `back` scene units behind a screen, along its own normal. */
function behindScreen(placement, back) {
  const yaw = placement.rotation[1]
  return [
    placement.position[0] - Math.sin(yaw) * back,
    placement.position[1],
    placement.position[2] - Math.cos(yaw) * back,
  ]
}

/**
 * Blender owns the vault: shell, racks, housings, cabling and ceiling
 * services (blender/wall). R3F keeps the fifty-four agent screens, the
 * irradiance patches that carry their aggregate spill onto the vault, and
 * the one broad reflection source. The metric root is scaled once from the
 * exact 520 mm glass contract.
 */
export function AgentVault({ active }) {
  const { scene } = useGLTF(MODEL)
  const plaster = useTexture({
    normalMap: '/textures/painted-plaster/normal.jpg',
    roughnessMap: '/textures/painted-plaster/roughness.jpg',
  })

  const vault = useMemo(() => {
    const root = scene.clone(true)
    const finishers = makeSurfaceFinishers({ plaster })
    const materialCache = new Map()
    const finish = (source) => {
      if (!materialCache.has(source)) {
        const finisher = finishers[source.name]
        if (!finisher) {
          throw new Error(`wall.glb carries a surface with no runtime finish: ${source.name}`)
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
      object.receiveShadow = true
    })
    return root
  }, [plaster, scene])

  const placements = useMemo(
    // Wide spread on purpose: 54 identical brightnesses read as wallpaper,
    // not as 54 separate agents. Some screens run hot, some idle.
    () => seedAgentPlacements(readAgentScreens(scene), 0xa93e17, [0.34, 1.05]),
    [scene]
  )

  const irradiance = useMemo(() => {
    // Each screen's own throw onto the rack panel behind it.
    const screenReturns = placements.map((placement) => ({
      position: behindScreen(placement, 18.9),
      rotation: placement.rotation,
      scale: [17.2, 13.8],
      color: '#d9a94f',
      strength: 0.028 + placement.drive * 0.05,
    }))
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
      // The hero's own return onto its rack panel.
      {
        position: [0, 0, -18.9],
        rotation: [0, 0, 0],
        scale: [17.2, 13.8],
        color: '#d9a94f',
        strength: 0.062,
      },
    ]
  }, [placements])

  return (
    <group>
      <primitive object={vault} scale={METRES_TO_SCENE} />
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

useGLTF.preload(MODEL)
