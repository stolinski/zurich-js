import * as THREE from 'three'

/** A selective Cycles diffuse bake. Replaces diffuse; never double-lights it.
 * Specular, normal/roughness detail, fog and the live post chain stay realtime.
 * The PNG is sRGB-encoded linear radiance / range, without a display transform.
 */
export function applyBakedDiffuse(material, texture, range) {
  material.lightMap = texture
  material.lightMapIntensity = range
  const previous = material.onBeforeCompile
  const previousKey = material.customProgramCacheKey()
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      #ifdef USE_LIGHTMAP
        reflectedLight.directDiffuse = vec3(0.0);
        reflectedLight.indirectDiffuse = lightMapIrradiance * diffuseColor.rgb;
      #endif`
    )
  }
  material.customProgramCacheKey = () => `${previousKey}|baked-diffuse-v1`
  return material
}

export function configureBakedDiffuse(source) {
  const texture = source.clone()
  texture.flipY = false
  texture.channel = 0
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}
