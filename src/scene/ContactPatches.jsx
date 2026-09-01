import { useCallback, useMemo } from 'react'
import * as THREE from 'three'

const patchTextures = new Map()

/**
 * Resident, analytic alpha masks shared by every authored contact patch.
 * These are not fake cast shadows: the real key lights still own direction and
 * penumbra. The patches supply the low-frequency ambient occlusion that a
 * realtime direct-light pass cannot recover where furniture actually meets a
 * desk or floor.
 *
 * TWO footprints, because one was wrong for half the objects. A radial falloff
 * under a keyboard, a notebook, a pedestal or a desk foot pulls away from the
 * corners exactly where the occluder is still touching, so the prop reads as
 * pasted onto the surface no matter how the opacity is tuned. `rect` is a
 * superellipse: flat across the footprint, tight at the perimeter, with corners
 * that stay dark. Round things (mug, lamp base, caster) still take `radial`.
 */
function buildPatchTexture(shape) {
  const size = 128
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = ((x + 0.5) / size) * 2 - 1
      const ny = ((y + 0.5) / size) * 2 - 1
      let core
      if (shape === 'rect') {
        // Superellipse radius: (|x|^n + |y|^n)^(1/n). n=4 keeps the sides
        // straight and the corners rounded at roughly the radius a real
        // object's occlusion wraps.
        const sr = Math.pow(
          Math.pow(Math.abs(nx), 4) + Math.pow(Math.abs(ny), 4),
          0.25
        )
        // MUST reach exactly 0 at sr = 1, or the plateau runs into the quad
        // border and the patch prints its own rectangle on the desk. A wide
        // shoulder (plateau only inside 0.42) keeps the boundary itself
        // undetectable while the core still hugs the footprint's corners.
        const t = THREE.MathUtils.clamp((1 - sr) / 0.58, 0, 1)
        core = Math.pow(t * t * (3 - 2 * t), 1.15)
      } else {
        core = THREE.MathUtils.clamp(1 - Math.hypot(nx, ny), 0, 1)
        core = Math.pow(core, 2.35)
      }
      const offset = (y * size + x) * 4
      data[offset] = 255
      data[offset + 1] = 255
      data[offset + 2] = 255
      data[offset + 3] = Math.round(core * 255)
    }
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  )
  texture.name = `authored-contact-patch-${shape}`
  texture.colorSpace = THREE.NoColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

export function getSoftPatchTexture(shape = 'radial') {
  let texture = patchTextures.get(shape)
  if (!texture) {
    texture = buildPatchTexture(shape)
    patchTextures.set(shape, texture)
  }
  return texture
}

/**
 * Draw many soft contact patches in one call. Patch tuples are
 * [x, y, z, width, depth, yaw?]. Width/depth describe the receiving plane,
 * never the caster silhouette, so the result stays quiet at projector scale.
 */
export function ContactPatches({
  patches,
  opacity = 0.28,
  color = '#020403',
  renderOrder = 1,
  shape = 'radial',
}) {
  const texture = useMemo(() => getSoftPatchTexture(shape), [shape])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const planeRotation = useMemo(
    () => new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      -Math.PI / 2
    ),
    []
  )
  const yawRotation = useMemo(() => new THREE.Quaternion(), [])

  const place = useCallback(
    (mesh) => {
      patches.forEach(([x, y, z, width, depth, yaw = 0], index) => {
        dummy.position.set(x, y, z)
        yawRotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw)
        dummy.quaternion.copy(yawRotation).multiply(planeRotation)
        dummy.scale.set(width, depth, 1)
        dummy.updateMatrix()
        mesh.setMatrixAt(index, dummy.matrix)
      })
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
      mesh.instanceMatrix.needsUpdate = true
    },
    [dummy, patches, planeRotation, yawRotation]
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
        color={color}
        alphaMap={texture}
        opacity={opacity}
        transparent
        depthWrite={false}
        toneMapped={false}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </instancedMesh>
  )
}
