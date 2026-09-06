import { useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF, useTexture } from '@react-three/drei'
import { SCREEN_SIZE } from './CRTScreen.jsx'
import { makeProfiledSurface, SURFACE_PROFILES, SURFACE_TEXTURES } from '../lib/surfaceProfiles.js'

const MODEL = '/models/home-office.glb'
const METRES_TO_SCENE = SCREEN_SIZE.w / 0.52

const SURFACES = {
  'Warm mineral paint': {
    maps: 'plaster',
    color: '#3d4540',
    repeat: [3.8, 2.2],
    normalScale: 0.42,
  },
  'Ceiling mineral paint': {
    maps: 'plaster',
    color: '#3c433f',
    repeat: [4.6, 2.8],
    normalScale: 0.3,
  },
  'Hall wall': {
    maps: 'plaster',
    color: '#313836',
    repeat: [2.2, 2.2],
    normalScale: 0.36,
  },
  'Oiled black walnut': SURFACE_PROFILES['Oiled black walnut'],
  'Smoked oak door': {
    maps: 'wood',
    color: '#594334',
    repeat: [1.2, 2.6],
    normalScale: 0.38,
  },
  'Smoked walnut slats': {
    maps: 'wood',
    color: '#5b3e2b',
    repeat: [0.55, 5],
    normalScale: 0.34,
  },
  'Credenza walnut': {
    maps: 'wood',
    color: '#60432f',
    repeat: [1.8, 1],
    normalScale: 0.32,
  },
  'Linen blind': {
    maps: 'linen',
    color: '#bbb7aa',
    repeat: [3.4, 1.2],
    normalScale: 0.24,
    diffuse: true,
  },
  'Acoustic felt': {
    maps: 'linen',
    color: '#171a18',
    repeat: [5, 4],
    normalScale: 0.28,
  },
  'Wool desk mat': {
    maps: 'linen',
    color: '#171b18',
    repeat: [4, 2],
    normalScale: 0.26,
  },
}

function cloneTexture(source, repeat, colorSpace) {
  const texture = source.clone()
  texture.needsUpdate = true
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(...repeat)
  texture.anisotropy = 8
  texture.colorSpace = colorSpace
  return texture
}

function finishMaterial(source, profile, mapSets) {
  if (profile && profile === SURFACE_PROFILES[source.name]) {
    return makeProfiledSurface(source.name, mapSets)
  }
  const material = source.clone()
  material.envMapIntensity = 0.9
  if (!profile) return material

  const maps = mapSets[profile.maps]
  material.color.set(profile.color)
  material.normalMap = cloneTexture(
    maps.normalMap,
    profile.repeat,
    THREE.NoColorSpace
  )
  material.roughnessMap = cloneTexture(
    maps.roughnessMap,
    profile.repeat,
    THREE.NoColorSpace
  )
  material.normalScale.setScalar(profile.normalScale)
  if (profile.diffuse) {
    material.map = cloneTexture(
      maps.map,
      profile.repeat,
      THREE.SRGBColorSpace
    )
  } else {
    material.map = null
  }
  material.needsUpdate = true
  return material
}

/**
 * Blender owns the home set's architecture, furniture, UVs, and material
 * boundaries. R3F keeps the live CRT, camera, navigation, and shared physical
 * lighting. The metric root is scaled once from the exact 520 mm glass
 * contract; there are no per-prop alignment fudges at runtime.
 */
export function HomeOffice() {
  const { scene } = useGLTF(MODEL)
  const plaster = useTexture({
    normalMap: '/textures/painted-plaster/normal.jpg',
    roughnessMap: '/textures/painted-plaster/roughness.jpg',
  })
  const linen = useTexture(SURFACE_TEXTURES.linen)
  const wood = useTexture(SURFACE_TEXTURES.wood)

  const homeOffice = useMemo(() => {
    const root = scene.clone(true)
    const mapSets = { plaster, linen, wood }
    const materialCache = new Map()

    root.traverse((object) => {
      if (!object.isMesh) return
      const sources = Array.isArray(object.material)
        ? object.material
        : [object.material]
      object.material = sources.map((source) => {
        if (!materialCache.has(source)) {
          materialCache.set(
            source,
            finishMaterial(source, SURFACES[source.name], mapSets)
          )
        }
        return materialCache.get(source)
      })
      if (object.material.length === 1) object.material = object.material[0]
      object.castShadow = true
      object.receiveShadow = true
    })
    return root
  }, [linen, plaster, scene, wood])

  return <primitive object={homeOffice} scale={METRES_TO_SCENE} />
}

useGLTF.preload(MODEL)
