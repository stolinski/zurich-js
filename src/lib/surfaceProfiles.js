import * as THREE from 'three'
import contract from '../scene/surfaceProfiles.json' with { type: 'json' }

// The same named profiles are read by Blender's mapped_surface_material.
// Colours and scalar roughness MULTIPLY their maps in both renderers; repeats
// are tiles per metre on the sets' metric UVs. Display transforms stay separate.
export const SURFACE_TEXTURES = contract.textureSets
export const SURFACE_PROFILES = contract.surfaces

export function makeProfiledSurface(name, mapSets) {
  const profile = SURFACE_PROFILES[name]
  if (!profile) throw new Error(`Unknown shared surface: ${name}`)
  const { maps, repeat, normalScale, diffuse, ...parameters } = profile
  const material = new THREE.MeshPhysicalMaterial(parameters)
  material.name = name
  for (const [slot, colorSpace] of [
    ['map', THREE.SRGBColorSpace],
    ['normalMap', THREE.NoColorSpace],
    ['roughnessMap', THREE.NoColorSpace],
  ]) {
    if (slot === 'map' && !diffuse) continue
    const source = mapSets[maps]?.[slot]
    if (!source) throw new Error(`${name}: missing ${maps}.${slot}`)
    const texture = source.clone()
    texture.colorSpace = colorSpace
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(...repeat)
    texture.anisotropy = 8
    texture.needsUpdate = true
    material[slot] = texture
  }
  material.normalScale.setScalar(normalScale)
  return material
}
