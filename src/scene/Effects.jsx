import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Uniform } from 'three'
import {
  EffectComposer,
  Bloom,
  Vignette,
} from '@react-three/postprocessing'
import {
  Effect,
  FXAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing'
import { useStore } from '../state/useStore.js'
import { slides } from '../slides/index.js'
import { bypassesPost } from '../presentation/defineSlides.js'
import {
  markPostWarmed,
  usePresentationRuntime,
} from '../state/presentationRuntime.js'
import { QUALITY_AA_PROFILE } from '../qualityProfile.js'
import { createOutputPass } from '../lib/postOutput.js'
import { STAGE_LOOK_PRESETS } from './environment.js'

/**
 * The render pass — for the beats where you are looking at a monitor as an
 * OBJECT. This is most of what separates a lit test scene from a shot.
 *
 * ── Why each of these earns its place ──
 *
 * Grounding comes from the scene's actual contact shadows. Screen-space AO was
 * removed: it rebuilt depth history around large set swaps, produced blocky
 * white flashes on some GPUs, and its dark halos were part of the game-render
 * look this pass is trying to leave behind.
 *
 * Depth of field is deliberately absent for now. Changing focus targets at the
 * start of a long camera flight blurred emissive monitor rectangles into large
 * flashing squares before the camera arrived. A future lens pass must follow
 * camera progress, not slide index.
 *
 * Bloom, restrained. The screen is genuinely emissive, but a large soft halo
 * must not bleach the desk into a game-render glow. The threshold admits the
 * phosphor and rejects lit materials; scene lighting carries the rest.
 *
 * The whole stack still zeroes on a `fillScreen` slide — every one of these is
 * a tell that you're looking through a camera at an object, which is exactly
 * what the cold open needs the audience not to suspect.
 */

/**
 * Final-output dither: the composer runs in 16-bit float, but the canvas is
 * 8-bit, and this deck lives in ultra-dark gradients that quantize into visible
 * banding. A fraction of one LSB of STATIC triangular noise (hashed from pixel
 * coords, no time term — so no flicker, per the house rule) breaks the steps below the
 * threshold of vision. Must stay the LAST effect.
 */
const ditherFrag = /* glsl */ `
  uniform float amount;
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 p = uv * resolution;
    float r1 = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    float r2 = fract(sin(dot(p + 0.5, vec2(26.651, 21.134))) * 28001.8384);
    float tri = (r1 + r2 - 1.0) / 255.0;
    outputColor = vec4(inputColor.rgb + tri * amount, inputColor.a);
  }
`

class DitherEffect extends Effect {
  constructor() {
    super('DitherEffect', ditherFrag, {
      uniforms: new Map([['amount', new Uniform(1)]]),
    })
  }
}

const exposureFrag = /* glsl */ `
  uniform float exposure;
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    outputColor = vec4(inputColor.rgb * exposure, inputColor.a);
  }
`

class ExposureEffect extends Effect {
  constructor() {
    super('ExposureEffect', exposureFrag, {
      uniforms: new Map([['exposure', new Uniform(1)]]),
    })
  }
}

export function Effects() {
  const composer = useRef(null)
  const bloom = useRef(null)
  const vignette = useRef(null)
  const warmupFrames = useRef(0)
  const postWarmed = useRef(false)
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const index = useStore((state) => state.index)
  const displayStage = usePresentationRuntime((state) => state.displayStage)
  const slide = slides[index]
  // A flat PASSTHROUGH, not merely a covering framing — see bypassesPost.
  const flat = bypassesPost(slide)
  const look = STAGE_LOOK_PRESETS[displayStage] ?? STAGE_LOOK_PRESETS.home
  const initialPostMix = useRef(flat ? 0 : 1)
  const postMix = useRef(initialPostMix.current)
  const [composerEnabled, setComposerEnabled] = useState(!flat)
  const composerEnabledRef = useRef(!flat)

  const exposure = useMemo(() => new ExposureEffect(), [])
  const dither = useMemo(() => new DitherEffect(), [])
  const fxaa = useMemo(() => {
    const effect = new FXAAEffect()
    effect.blendMode.opacity.value = initialPostMix.current
    return effect
  }, [])
  const toneMapping = useMemo(() => {
    const effect = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })
    effect.blendMode.opacity.value = initialPostMix.current
    return effect
  }, [])
  // Explicit, resident pass boundary: FXAA's centre and neighbours must both
  // be tone-mapped. Do not turn this back into consecutive <primitive> effects.
  const outputPass = useMemo(
    () => createOutputPass(camera, (QUALITY_AA_PROFILE?.fxaa ?? true) ? fxaa : null, dither),
    [camera, dither, fxaa]
  )

  useLayoutEffect(() => {
    // Leaving a settled glass-covering slide must enable the resident composer
    // before post begins fading in. Entering one keeps it alive until the final
    // neutral frame, then bypasses it so the settled cold open remains bit-flat.
    if (!flat && !composerEnabledRef.current) {
      composerEnabledRef.current = true
      setComposerEnabled(true)
    }
  }, [flat])

  useFrame(() => {
    const transition = usePresentationRuntime.getState().transition
    // Navigation and CameraRig share the same frame clock. If React rendered the
    // destination declaration before CameraRig authored its transition, hold
    // the previous values instead of treating that one frame as settled.
    if (transition.index !== index) return

    let mix = flat ? 0 : 1
    if (!transition.settled) {
      const progress = Math.min(1, Math.max(0, transition.progress))
      const eased = progress * progress * (3 - 2 * progress)
      const from = transition.fromFlat ? 0 : 1
      const to = transition.toFlat ? 0 : 1
      mix = from + (to - from) * eased
    }
    postMix.current = mix

    // A full LSB over an almost-black frame reads as static film grain on a
    // projector. Every stage value, including ACES and FXAA themselves, follows
    // one physical camera-derived mix rather than snapping on slide declaration.
    exposure.uniforms.get('exposure').value = 1 + (look.post.exposure - 1) * mix
    dither.uniforms.get('amount').value = look.post.dither * mix
    toneMapping.blendMode.opacity.value = mix
    fxaa.blendMode.opacity.value = mix
    if (bloom.current) bloom.current.intensity = look.post.bloom * mix
    if (vignette.current) vignette.current.darkness = look.post.vignette * mix

    // Enabling the composer is not free of consequence even with every effect
    // at zero opacity: the chain renders through its own target instead of
    // straight to the canvas, and the image that comes back is not the image
    // that goes in. So it may only be alive when post has something to do.
    //
    // `!transition.settled` alone turned it on for EVERY transition, including
    // one glass-filling slide to the next — where both endpoints are flat, mix
    // is pinned at 0 from start to finish, and there is nothing to fade. The
    // result was that most of the data run flashed brighter for the length of
    // the flight and then dropped back as the composer switched off, which
    // reads exactly like a chart being written and then dimmed. Keep the
    // "stay alive while post fades" guarantee, but only for a transition that
    // actually has a non-flat end.
    const fading = !transition.settled && !(transition.fromFlat && transition.toFlat)
    const shouldEnable = !flat || fading || mix > 1e-4
    if (shouldEnable !== composerEnabledRef.current) {
      composerEnabledRef.current = shouldEnable
      setComposerEnabled(shouldEnable)
    }
  })

  // EffectComposer rebuilds its EffectPass whenever the `children` object
  // changes. Keep one resident chain and animate only existing uniforms and
  // blend opacities; a slide change never creates post programs or targets.
  const chain = useMemo(
    () => (
      <>
        <primitive object={exposure} />
        {/* Threshold sits where driven phosphor lives (post-gain, pre-ACES),
            not only at clipping: a monitor in a dark room needs a HALO, and at
            0.96 only the hottest rims ever fed it. Lit room surfaces stay
            below it. */}
        <Bloom
          ref={bloom}
          intensity={0}
          luminanceThreshold={0.84}
          luminanceSmoothing={0.18}
          mipmapBlur
          levels={4}
          resolutionScale={0.5}
          radius={0.58}
        />
        <Vignette ref={vignette} offset={0.34} darkness={0} eskil={false} />
        <primitive object={toneMapping} />
        <primitive object={outputPass} />
      </>
    ),
    [exposure, outputPass, toneMapping]
  )

  useFrame(() => {
    if (postWarmed.current || !composer.current) return
    warmupFrames.current += 1
    if (warmupFrames.current < 2) return

    if (flat) {
      // The cold open must bypass post completely. Warm the actual composer
      // into the canvas before R3F's normal render in this same frame; that
      // normal render immediately overwrites it, so no processed pixel is ever
      // presented while the post programs and render targets become resident.
      composer.current.render(0)
    }
    // On a non-flat deep link the enabled composer rendered on the preceding
    // frame. Either path has now exercised the real post chain, not merely
    // instantiated Effect objects and assumed their GPU programs were ready.
    postWarmed.current = true
    markPostWarmed({
      rendered: true,
      rendererFrame: gl.info.render.frame,
      programs: gl.info.programs.length,
      textures: gl.info.memory.textures,
    })
  })

  // Shade every pixel once, then resolve geometry edges with FXAA. A 2× MSAA
  // composer shaded the whole room twice before bloom, while SMAA's async lookup
  // textures had already proved unsafe during scene transitions.
  return (
    <EffectComposer
      ref={composer}
      enabled={composerEnabled}
      disableNormalPass
      multisampling={QUALITY_AA_PROFILE?.multisampling ?? 0}
    >
      {chain}
    </EffectComposer>
  )
}
