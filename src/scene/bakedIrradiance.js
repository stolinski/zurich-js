import * as THREE from 'three'

export function configureIrradianceTexture(texture) {
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.anisotropy = 8
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// The home set carried its own bounds until the Blender room replaced the
// CAD one; only the cubicle projects baked irradiance now.
export const IRRADIANCE_BOUNDS = Object.freeze({
  cubicle: Object.freeze({ minX: -130, minZ: -260, width: 260, depth: 360 }),
})
