import { useCallback, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { roomLightLevel } from './roomLight.js'

const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;

  void main() {
    vec4 localPosition = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      localPosition = instanceMatrix * localPosition;
    #endif
    vec4 worldPosition = modelMatrix * localPosition;
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uIrradiance;
  uniform vec4 uBounds;
  uniform float uIntensity;
  varying vec3 vWorldPosition;

  void main() {
    vec2 uv = (vWorldPosition.xz - uBounds.xy) * uBounds.zw;
    float inside =
      step(0.0, uv.x) * step(uv.x, 1.0) *
      step(0.0, uv.y) * step(uv.y, 1.0);
    vec3 irradiance = texture2D(uIrradiance, clamp(uv, 0.0, 1.0)).rgb;
    gl_FragColor = vec4(irradiance * uIntensity * inside, inside);
  }
`

/**
 * Project one offline world-space irradiance field onto simplified receiver
 * planes. The lit scene keeps its real PBR materials and direct shadows; this
 * layer adds only the broad, already-bounced energy in one cheap instanced draw.
 */
export function BakedIrradianceLayer({
  texture,
  bounds,
  intensity,
  placements,
  renderOrder = 2,
}) {
  const material = useRef(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const uniforms = useMemo(
    () => ({
      uIrradiance: { value: texture },
      uBounds: {
        value: new THREE.Vector4(
          bounds.minX,
          bounds.minZ,
          1 / bounds.width,
          1 / bounds.depth
        ),
      },
      uIntensity: { value: intensity },
    }),
    [bounds, intensity, texture]
  )
  // Baked bounce is mostly the room's light come back off the floor, so it
  // follows the room's light level — keeping a share for the screen's own
  // spill, which stays on when the room goes dark.
  useFrame(() => {
    if (!material.current) return
    material.current.uniforms.uIntensity.value =
      intensity * THREE.MathUtils.lerp(0.35, 1, roomLightLevel())
  })

  const place = useCallback(
    (mesh) => {
      placements.forEach(({ position, rotation, scale }, index) => {
        dummy.position.set(...position)
        dummy.rotation.set(...rotation)
        dummy.scale.set(scale[0], scale[1], 1)
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
      args={[undefined, undefined, placements.length]}
      frustumCulled={false}
      renderOrder={renderOrder}
      onUpdate={place}
    >
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-2}
      />
    </instancedMesh>
  )
}
