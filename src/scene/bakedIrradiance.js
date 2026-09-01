import * as THREE from 'three'

export function configureIrradianceTexture(texture) {
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.anisotropy = 8
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export const IRRADIANCE_BOUNDS = Object.freeze({
  cubicle: Object.freeze({ minX: -130, minZ: -260, width: 260, depth: 360 }),
  home: Object.freeze({ minX: -78, minZ: -64, width: 156, depth: 99 }),
})
