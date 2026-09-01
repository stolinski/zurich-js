import { useCallback, useMemo } from 'react'
import * as THREE from 'three'
import { getSoftPatchTexture } from './ContactPatches.jsx'

/**
 * Authored static irradiance for broad light that has already bounced once.
 * Direct lights still establish direction and cast shadows; these resident
 * cards only return a few percent of source colour onto surfaces that Three's
 * realtime direct-light path would otherwise leave unnaturally dead.
 *
 * Patch objects: { position, rotation?, scale, color, strength }.
 */
export function IrradiancePatches({ patches, renderOrder = 2 }) {
  const texture = useMemo(() => getSoftPatchTexture(), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])

  const place = useCallback(
    (mesh) => {
      patches.forEach((patch, index) => {
        dummy.position.set(...patch.position)
        dummy.rotation.set(...(patch.rotation ?? [0, 0, 0]))
        dummy.scale.set(patch.scale[0], patch.scale[1], 1)
        dummy.updateMatrix()
        mesh.setMatrixAt(index, dummy.matrix)
        color.set(patch.color).multiplyScalar(patch.strength)
        mesh.setColorAt(index, color)
      })
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) {
        mesh.instanceColor.setUsage(THREE.StaticDrawUsage)
        mesh.instanceColor.needsUpdate = true
      }
    },
    [color, dummy, patches]
  )

  return (
    <instancedMesh
      args={[undefined, undefined, patches.length]}
      frustumCulled={false}
      renderOrder={renderOrder}
      onUpdate={place}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        alphaMap={texture}
        vertexColors
        transparent
        opacity={1}
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
