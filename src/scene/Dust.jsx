import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mulberry32 } from '../lib/rng.js'

/**
 * Dust in the air in front of the screen.
 *
 * A dark room lit by one source is full of this, and its absence is why a
 * render reads as vacuum. It costs almost nothing and it does two things no
 * amount of surface detail can: it makes the LIGHT visible as a volume rather
 * than just an effect on surfaces, and it puts specks at every depth for the
 * lens to throw out of focus — which is what tells the eye the shot has a real
 * focal plane.
 *
 * Concentrated in the pool in front of the glass, because that's the only place
 * a mote would actually catch enough light to be seen.
 *
 * Motion is a very slow convection drift, not twinkle. The house rule against
 * per-frame churn stands: this must read as air, never as particles.
 */

const COUNT = 900

const vert = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform vec3 uLight;      // world position of the screen lamp
  uniform float uReach;     // how far its pool of light carries
  attribute float aSeed;
  attribute float aScale;
  varying float vFade;
  void main() {
    vec3 p = position;
    // Slow convection: rising, with a lazy lateral wander. Periods are prime-ish
    // so no two motes ever fall into step.
    float t = uTime * 0.055 + aSeed * 6.2831;
    p.y += mod(uTime * 0.16 * (0.4 + aScale), 14.0) - 7.0;
    p.x += sin(t * 0.7) * 0.9;
    p.z += cos(t * 0.53) * 0.7;

    // THE important part: a mote is only visible where there is light to catch.
    // Without this every speck glows the same in open darkness and the whole
    // thing reads as a starfield sitting in front of the scene, not as air.
    float lit = 1.0 - smoothstep(0.0, uReach, distance(p, uLight));
    lit *= lit;

    // Fade at the extremes of the rise so motes never pop in or out.
    float travel = smoothstep(7.0, 4.0, abs(p.y - position.y));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vFade = lit * travel;
    gl_PointSize = uSize * aScale / max(-mv.z, 0.001);
    gl_Position = projectionMatrix * mv;
  }
`

const frag = /* glsl */ `
  uniform vec3 uColor;
  varying float vFade;
  void main() {
    // Soft round mote; no hard edge, or they read as snow.
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.06, d) * vFade;
    if (a < 0.004) discard;
    // Very low: dust should be something you notice second, not a snowfall.
    gl_FragColor = vec4(uColor, a * 0.16);
  }
`

export function Dust() {
  const mat = useRef()

  const geometry = useMemo(() => {
    const rand = mulberry32(0xd057)
    const pos = new Float32Array(COUNT * 3)
    const seed = new Float32Array(COUNT)
    const scale = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      // A slab hugging the front of the tube, where the light actually is.
      pos[i * 3] = (rand() - 0.5) * 42
      pos[i * 3 + 1] = (rand() - 0.5) * 22 - 1
      pos[i * 3 + 2] = rand() * 26 - 2
      seed[i] = rand()
      scale[i] = 0.35 + rand() * 1.5
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    g.setAttribute('aScale', new THREE.BufferAttribute(scale, 1))
    return g
  }, [])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSize: { value: 22 },
      uColor: { value: new THREE.Color('#ffe7b0') },
      // Matches the screen lamp in Scene.jsx.
      uLight: { value: new THREE.Vector3(0, 0.5, 4) },
      uReach: { value: 20 },
    }),
    []
  )

  useFrame((_, dt) => {
    if (mat.current) mat.current.uniforms.uTime.value += dt
  })

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={vert}
        fragmentShader={frag}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
