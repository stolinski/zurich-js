import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { CRTScreen, SCREEN_SIZE } from './CRTScreen.jsx'
import { DESK_Y } from './Room.jsx'
import { OFFICE_ENVIRONMENT_SPEC, StageDirector } from './Stages.jsx'
import { Dust } from './Dust.jsx'
import { makeRoomEnvironment, STAGE_LOOK_PRESETS } from './environment.js'
import { roomLightLevel, setRoomLightLevel } from './roomLight.js'
import { useStore } from '../state/useStore.js'
import { slides } from '../slides/index.js'
import { QUALITY_AA_PROFILE } from '../qualityProfile.js'
import {
  PRESENTATION_STAGES,
  markShadowWarmupComplete,
  markStageWarmed,
  qualityDiagnosticsEnabled,
  recordShadowEvent,
  usePresentationRuntime,
} from '../state/presentationRuntime.js'

// RectAreaLight needs its BRDF lookup tables uploaded before first use, or it
// renders black. One-time, module level.
RectAreaLightUniformsLib.init()

/**
 * Installs the dark-room environment map. Without one every material's specular
 * term has nothing broad to reflect and the scene resolves to flat diffuse.
 * The faceplate uses its own analytic, unlit version of the same room sources
 * so it cannot reflect the lamp that stands in for its own emission.
 */
function RoomEnvironment({ stage, controller }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const resources = useRef(null)
  const stageRef = useRef(stage)
  stageRef.current = stage

  useLayoutEffect(() => {
    // Build every PMREM before the first presented frame. Stage changes then
    // switch one texture reference instead of generating an environment during
    // a camera move.
    const home = makeRoomEnvironment(gl, 'home')
    const office = makeRoomEnvironment(gl, 'office', OFFICE_ENVIRONMENT_SPEC)
    const wall = makeRoomEnvironment(gl, 'wall')
    resources.current = { home, office, wall }
    const apply = (nextStage) => {
      const next = nextStage === 'cubicle' ? office : nextStage === 'wall' ? wall : home
      const look = STAGE_LOOK_PRESETS[nextStage] ?? STAGE_LOOK_PRESETS.home
      scene.environment = next.texture
      scene.environmentIntensity = look.environment.intensity
      scene.environmentRotation.set(...look.environment.rotation)
    }
    controller.current = { apply }
    apply(stageRef.current)
    if (import.meta.env.DEV) window.__scene = scene
    return () => {
      scene.environment = null
      home.dispose()
      office.dispose()
      wall.dispose()
      resources.current = null
      controller.current = null
    }
  }, [controller, gl, scene])

  useLayoutEffect(() => {
    controller.current?.apply(stage)
  }, [controller, scene, stage])

  return null
}

function StageAtmosphere({ stage }) {
  const scene = useThree((state) => state.scene)
  const fog = useMemo(() => new THREE.FogExp2('#000000', 0), [])

  useLayoutEffect(() => {
    const previous = scene.fog
    scene.fog = fog
    return () => {
      if (scene.fog === fog) scene.fog = previous
    }
  }, [fog, scene])

  useLayoutEffect(() => {
    const look = STAGE_LOOK_PRESETS[stage] ?? STAGE_LOOK_PRESETS.home
    fog.color.set(look.atmosphere.color)
    fog.density = look.atmosphere.density
  }, [fog, stage])

  return null
}

function ShadowLifecycle() {
  const gl = useThree((state) => state.gl)
  const displayStage = usePresentationRuntime((state) => state.displayStage)
  const stageRevision = usePresentationRuntime((state) => state.stageRevision)
  const pending = useRef(null)
  const nextId = useRef(0)

  useLayoutEffect(() => {
    gl.shadowMap.autoUpdate = false
    return () => {
      gl.shadowMap.autoUpdate = true
    }
  }, [gl])

  useLayoutEffect(() => {
    // Wall/phosphor stages have no shadow-casting light. WebGLShadowMap returns
    // early for that case without clearing needsUpdate, so do not leave a false
    // pending invalidation that can survive indefinitely.
    const needsShadow = displayStage === 'home' || displayStage === 'cubicle'
    if (!needsShadow) {
      gl.shadowMap.needsUpdate = false
      pending.current = null
      recordShadowEvent({
        type: 'skip',
        reason: 'display-stage-has-no-shadow-light',
        stage: displayStage,
        revision: stageRevision,
        frame: gl.info.render.frame,
      })
      return
    }

    // React has completed every host mutation before layout effects run. The
    // newly selected geometry and lights are therefore installed before this
    // one static shadow update is requested, and the next scene render cannot
    // expose the new set with the old set's shadow map.
    const id = ++nextId.current
    gl.shadowMap.needsUpdate = true
    pending.current = id
    recordShadowEvent({
      id,
      type: 'invalidate',
      reason: stageRevision === 0 ? 'initial-display' : 'display-stage-commit',
      stage: displayStage,
      revision: stageRevision,
      frame: gl.info.render.frame,
    })
  }, [displayStage, gl, stageRevision])

  useFrame(() => {
    if (!pending.current || gl.shadowMap.needsUpdate) return
    recordShadowEvent({
      id: pending.current,
      type: 'complete',
      stage: displayStage,
      revision: stageRevision,
      frame: gl.info.render.frame,
    })
    pending.current = null
  })

  return null
}

const presetIntensities = (name) =>
  Object.fromEntries(
    Object.entries(STAGE_LOOK_PRESETS).map(([stage, look]) => [
      stage,
      look.lights[name] ?? 0,
    ])
  )

const GLOBAL_LIGHT_VARIANTS = {
  ambient: {
    stages: ['home', 'cubicle', 'wall'],
    intensities: presetIntensities('ambient'),
  },
  screen: {
    stages: ['home', 'cubicle', 'wall'],
    intensities: presetIntensities('screen'),
  },
  localFill: {
    stages: ['home'],
    intensities: presetIntensities('localFill'),
  },
  doorway: {
    stages: ['home'],
    intensities: presetIntensities('doorway'),
    // The office owns a broad ceiling shadow source. Casting the home doorway
    // spot there rendered a second 1024² VSM map during the hidden swap.
    castShadows: { home: true, cubicle: false, wall: false, phosphor: false },
  },
  oppositeRim: {
    stages: ['home'],
    intensities: presetIntensities('oppositeRim'),
  },
  backWall: {
    stages: ['home'],
    intensities: presetIntensities('backWall'),
  },
  officeSide: {
    stages: ['cubicle'],
    intensities: presetIntensities('officeSide'),
  },
}

// The sources that are the ROOM's light, as opposed to the screen's: these
// follow a slide's `lights` level. The screen rectangle and its local fill are
// the monitor itself and stay on when the room goes dark.
const ROOM_LIGHT_VARIANTS = new Set(['ambient', 'doorway', 'oppositeRim', 'backWall'])

function lightVariant(name) {
  const variant = GLOBAL_LIGHT_VARIANTS[name]
  return {
    presentationStages: variant.stages,
    presentationIntensities: variant.intensities,
    presentationCastShadows: variant.castShadows,
    presentationRoomLight: ROOM_LIGHT_VARIANTS.has(name),
  }
}

function stageIntensity(name, stage) {
  return GLOBAL_LIGHT_VARIANTS[name].intensities[stage] ?? 0
}

/**
 * Eases the room's light level toward the active slide's `lights` cue (1 when
 * a slide says nothing) over that slide's smoothTime, and applies it on the
 * render clock: the room lights scale with it, the environment keeps a
 * quarter of its bounce (the screen still lights the desk), and the baked
 * floor irradiance follows through roomLightLevel(). Identity at 1, which is
 * every slide but the close.
 */
function RoomLightRig() {
  const scene = useThree((state) => state.scene)
  const index = useStore((state) => state.index)
  const displayStage = usePresentationRuntime((state) => state.displayStage)
  const from = useRef(1)
  const elapsed = useRef(0)
  const roomLights = useRef([])

  useLayoutEffect(() => {
    from.current = roomLightLevel()
    elapsed.current = 0
  }, [index])

  useFrame((_, dt) => {
    elapsed.current += dt
    const slide = slides[index]
    const target = slide?.lights ?? 1
    const duration = Math.max(0.001, slide?.camera?.smoothTime ?? 1)
    const progress = Math.min(1, elapsed.current / duration)
    const eased = progress * progress * (3 - 2 * progress)
    const level = progress >= 1 ? target : THREE.MathUtils.lerp(from.current, target, eased)
    setRoomLightLevel(level)

    if (roomLights.current.length === 0) {
      scene.traverse((object) => {
        if (object.userData?.presentationRoomLight && 'intensity' in object) {
          roomLights.current.push(object)
        }
      })
    }
    for (const light of roomLights.current) {
      light.intensity =
        (light.userData.presentationIntensities?.[displayStage] ?? 0) * level
    }
    const look = STAGE_LOOK_PRESETS[displayStage] ?? STAGE_LOOK_PRESETS.home
    scene.environmentIntensity =
      look.environment.intensity * THREE.MathUtils.lerp(0.25, 1, level)
  })

  return null
}

/**
 * Temporarily installs one real stage variant for an offscreen warm render.
 * The returned cleanup restores the currently presented React-owned values
 * before R3F draws the visible frame.
 */
function installWarmVariant(scene, stage) {
  const restores = []

  scene.traverse((object) => {
    const stages = object.userData?.presentationStages
    const intensities = object.userData?.presentationIntensities
    const castShadows = object.userData?.presentationCastShadows
    if (Array.isArray(stages)) {
      const visible = object.visible
      object.visible = stages.includes(stage)
      restores.push(() => {
        object.visible = visible
      })
    }
    if (intensities && 'intensity' in object) {
      const intensity = object.intensity
      object.intensity = intensities[stage] ?? 0
      restores.push(() => {
        object.intensity = intensity
      })
    }
    if (castShadows && 'castShadow' in object) {
      const castShadow = object.castShadow
      object.castShadow = Boolean(castShadows[stage])
      restores.push(() => {
        object.castShadow = castShadow
      })
    }
    if (object.isMesh && object.frustumCulled) {
      object.frustumCulled = false
      restores.push(() => {
        object.frustumCulled = true
      })
    }
    const materials = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : []
    for (const material of materials) {
      if (!material.visible) {
        material.visible = true
        restores.push(() => {
          material.visible = false
        })
      }
    }
  })

  // Warm conditionally-visible materials (notably the physical CRT glass), but
  // only inside the selected stage branch. A hidden branch stays hidden; this
  // never reconstructs the old synthetic all-stages scene.
  scene.traverse((object) => {
    if (!object.isMesh || object.visible || object.userData?.presentationStages) return
    let parent = object.parent
    while (parent && parent !== scene && parent.visible) parent = parent.parent
    if (parent && parent !== scene) return
    object.visible = true
    restores.push(() => {
      object.visible = false
    })
  })

  scene.updateMatrixWorld(true)
  return () => {
    for (let index = restores.length - 1; index >= 0; index -= 1) restores[index]()
    scene.updateMatrixWorld(true)
  }
}

function initializeSceneTextures(gl, scene) {
  const textures = new Set()
  const collect = (value) => {
    if (value?.isTexture) textures.add(value)
  }
  scene.traverse((object) => {
    const materials = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : []
    for (const material of materials) {
      for (const value of Object.values(material)) collect(value)
      for (const uniform of Object.values(material.uniforms ?? {})) {
        collect(uniform?.value)
      }
    }
  })
  collect(scene.environment)
  collect(scene.background)
  for (const texture of textures) gl.initTexture(texture)
  return textures.size
}

function PresentationWarmup({ environmentController, screenTexture }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const displayStage = usePresentationRuntime((state) => state.displayStage)
  const renderTarget = useMemo(
    () =>
      new THREE.WebGLRenderTarget(4, 4, {
        depthBuffer: true,
        stencilBuffer: false,
        type: THREE.HalfFloatType,
      }),
    []
  )
  const startupFrames = useRef(0)
  const queue = useRef(null)
  const texturesInitialized = useRef(false)
  const awaitingRestoredShadow = useRef(false)
  const complete = useRef(false)

  useEffect(() => () => renderTarget.dispose(), [renderTarget])

  useFrame(() => {
    if (complete.current) return
    if (awaitingRestoredShadow.current) {
      if (gl.shadowMap.needsUpdate) return
      recordShadowEvent({
        type: 'warmup-restore-complete',
        stage: displayStage,
        frame: gl.info.render.frame,
      })
      markShadowWarmupComplete({
        complete: true,
        stage: displayStage,
        rendererFrame: gl.info.render.frame,
        programs: gl.info.programs.length,
        textures: gl.info.memory.textures,
      })
      awaitingRestoredShadow.current = false
      complete.current = true
      return
    }
    if (!screenTexture || !environmentController.current) return

    // Let the cold-open canvas reach the projector first. Warming then happens
    // one actual variant per frame into a 4×4 target; the visible frame is drawn
    // normally after every variant has been restored, so startup never becomes
    // a black loading screen.
    startupFrames.current += 1
    if (startupFrames.current < 3) return
    if (!queue.current) {
      queue.current = [
        ...PRESENTATION_STAGES.filter((stage) => stage !== displayStage),
        displayStage,
      ]
    }
    if (!texturesInitialized.current) {
      initializeSceneTextures(gl, scene)
      texturesInitialized.current = true
    }

    const stage = queue.current.shift()
    const previousTarget = gl.getRenderTarget()
    const previousAutoClear = gl.autoClear
    const previousXr = gl.xr.enabled
    const previousShadowAuto = gl.shadowMap.autoUpdate
    const previousShadowNeedsUpdate = gl.shadowMap.needsUpdate
    const previousViewport = gl.getViewport(new THREE.Vector4())
    const previousScissor = gl.getScissor(new THREE.Vector4())
    const previousScissorTest = gl.getScissorTest()
    const restoreVariant = installWarmVariant(scene, stage)

    environmentController.current.apply(stage)
    gl.xr.enabled = false
    gl.autoClear = true
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    recordShadowEvent({
      type: 'warmup-invalidate',
      stage,
      frame: gl.info.render.frame,
    })

    try {
      // This is an actual render of the selected geometry, environment, lights,
      // materials, textures, and shadow casters. Unlike gl.compile(), it really
      // performs texture upload and shadow-map allocation/update. Rendering all
      // stages or all lights together would compile the wrong program variants.
      gl.setRenderTarget(renderTarget)
      gl.clear(true, true, true)
      gl.render(scene, camera)

      // Three compiles a separate output-colour-space program when rendering
      // straight to the default framebuffer (the path used by fill-screen
      // beats). A render target can never warm that variant: Three deliberately
      // treats all non-XR targets as linear. Compile it through a 1×1 scissor;
      // the normal R3F/composer render later in this frame overwrites that pixel
      // before presentation.
      gl.setRenderTarget(null)
      gl.setViewport(0, 0, 1, 1)
      gl.setScissor(0, 0, 1, 1)
      gl.setScissorTest(true)
      gl.render(scene, camera)
      recordShadowEvent({
        type: 'warmup-complete',
        stage,
        frame: gl.info.render.frame,
        shadowComplete: !gl.shadowMap.needsUpdate,
      })
      markStageWarmed(stage, {
        rendered: true,
        rendererFrame: gl.info.render.frame,
        programs: gl.info.programs.length,
        textures: gl.info.memory.textures,
        geometries: gl.info.memory.geometries,
        shadowComplete: !gl.shadowMap.needsUpdate,
      })
    } finally {
      restoreVariant()
      environmentController.current.apply(displayStage)
      gl.setRenderTarget(previousTarget)
      gl.setViewport(previousViewport)
      gl.setScissor(previousScissor)
      gl.setScissorTest(previousScissorTest)
      gl.autoClear = previousAutoClear
      gl.xr.enabled = previousXr
      gl.shadowMap.autoUpdate = previousShadowAuto
      gl.shadowMap.needsUpdate = previousShadowNeedsUpdate
    }

    if (queue.current.length === 0) {
      const needsShadow = displayStage === 'home' || displayStage === 'cubicle'
      if (!needsShadow) {
        gl.shadowMap.needsUpdate = false
        markShadowWarmupComplete({
          complete: true,
          stage: displayStage,
          rendererFrame: gl.info.render.frame,
          programs: gl.info.programs.length,
          textures: gl.info.memory.textures,
          skipped: 'display-stage-has-no-shadow-light',
        })
        complete.current = true
        return
      }
      awaitingRestoredShadow.current = true
      // The last offscreen render may have selected another light's static map.
      // Request one restored-display update before presentation-ready can be
      // observed; ShadowLifecycle records its completion on the next frame.
      gl.shadowMap.needsUpdate = true
      recordShadowEvent({
        type: 'warmup-restore-invalidate',
        stage: displayStage,
        frame: gl.info.render.frame,
      })
    }
  })

  return null
}

function rendererInfoSnapshot(gl) {
  return {
    programs: gl.info.programs.length,
    memory: { ...gl.info.memory },
    render: { ...gl.info.render },
    shadowMap: {
      autoUpdate: gl.shadowMap.autoUpdate,
      needsUpdate: gl.shadowMap.needsUpdate,
      type: gl.shadowMap.type,
    },
  }
}

function PresentationDiagnostics() {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    const quality = qualityDiagnosticsEnabled()
    if (!quality && !import.meta.env.DEV) return undefined

    const previous = {
      renderer: window.__renderer,
      camera: window.__cam,
      stage: window.__stage,
      deck: window.__deck,
      quality: window.__presentationQuality,
    }
    const stageApi = {
      showing: () => usePresentationRuntime.getState().displayStage,
      pending: () => usePresentationRuntime.getState().pendingStage,
      declared: () => usePresentationRuntime.getState().declaredStage,
      transition: () => usePresentationRuntime.getState().transition,
      shadowEvents: () => [...usePresentationRuntime.getState().shadowEvents],
      presentationReady: () => usePresentationRuntime.getState().warmup.ready,
    }

    window.__renderer = gl
    window.__cam = camera
    window.__stage = stageApi

    let deckApi = previous.deck
    if (quality) {
      deckApi = {
        ...(previous.deck ?? {}),
        store: useStore,
        current: () => slides[useStore.getState().index],
      }
      Object.defineProperty(deckApi, 'slide', {
        configurable: true,
        enumerable: true,
        get: () => slides[useStore.getState().index],
      })
      window.__deck = deckApi

      const snapshot = () => {
        const runtime = usePresentationRuntime.getState()
        const context = gl.getContext()
        return {
          version: 1,
          presentationReady: runtime.warmup.ready,
          warmup: runtime.warmup,
          declaredStage: runtime.declaredStage,
          displayStage: runtime.displayStage,
          pendingStage: runtime.pendingStage,
          transition: runtime.transition,
          camera: {
            position: camera.position.toArray(),
            quaternion: camera.quaternion.toArray(),
            fov: camera.fov,
            zoom: camera.zoom,
          },
          rendererInfo: rendererInfoSnapshot(gl),
          antialiasing: QUALITY_AA_PROFILE
            ? {
                ...QUALITY_AA_PROFILE,
                backingWidth: gl.domElement.width,
                backingHeight: gl.domElement.height,
                webgl2: gl.capabilities.isWebGL2,
                maxSamples: gl.capabilities.isWebGL2
                  ? context.getParameter(context.MAX_SAMPLES)
                  : 0,
                multisampledRenderToTexture: Boolean(
                  context.getExtension('WEBGL_multisampled_render_to_texture')
                ),
              }
            : { id: 'production', dpr: gl.getPixelRatio() },
          shadowInvalidationEvents: [...runtime.shadowEvents],
          stageEvents: [...runtime.stageEvents],
        }
      }
      window.__presentationQuality = Object.freeze({
        version: 1,
        renderer: gl,
        camera,
        snapshot,
      })
    }

    return () => {
      if (window.__renderer === gl) {
        if (previous.renderer === undefined) delete window.__renderer
        else window.__renderer = previous.renderer
      }
      if (window.__cam === camera) {
        if (previous.camera === undefined) delete window.__cam
        else window.__cam = previous.camera
      }
      if (window.__stage === stageApi) {
        if (previous.stage === undefined) delete window.__stage
        else window.__stage = previous.stage
      }
      if (quality && window.__deck === deckApi) {
        if (previous.deck === undefined) delete window.__deck
        else window.__deck = previous.deck
      }
      if (quality && window.__presentationQuality?.renderer === gl) {
        if (previous.quality === undefined) delete window.__presentationQuality
        else window.__presentationQuality = previous.quality
      }
    }
  }, [camera, gl])

  return null
}

function AimedSpot({ target = [0, 0, 0], ...props }) {
  const light = useRef()
  const scene = useThree((s) => s.scene)
  useLayoutEffect(() => {
    const l = light.current
    if (!l) return undefined
    l.target.position.set(...target)
    scene.add(l.target)
    l.target.updateMatrixWorld()
    return () => scene.remove(l.target)
  }, [scene, target[0], target[1], target[2]])
  return <spotLight ref={light} {...props} />
}

function AimedRect({ target = [0, 0, 0], ...props }) {
  const light = useRef()
  useLayoutEffect(() => {
    if (!light.current) return
    light.current.lookAt(...target)
    light.current.updateMatrixWorld()
  }, [target[0], target[1], target[2]])
  return <rectAreaLight ref={light} {...props} />
}

/**
 * Assembles the world.
 *
 * ── Lighting ──
 * At HOME the screen lights the room and almost nothing else does: at 3am the
 * monitor is the only thing on. The CUBICLE deliberately breaks that palette
 * with broad neutral ceiling panels, authored inside Stages.jsx.
 *
 * THE SHAPE OF THE LIGHT IS THE WHOLE JOB. An earlier version used two
 * directional lights for the cold side, and directionals have no falloff —
 * parallel rays hit every surface equally, so nothing tells you where the light
 * is coming from and the room reads as *washed* rather than *lit*. Everything
 * flattened, and no amount of texture or geometry detail survived that.
 *
 * So every source here is POSITIONED and falls off:
 *   • the screen, as a rectangle the size of the glass — the key
 *   • one cold spot standing in for a doorway, raking across the room — it
 *     casts shadows, which is what makes it read as a source rather than fill
 *   • a warm bounce off the desk, which is what brings the timber back
 *   • ambient at almost nothing, because ambient is what flattens a scene
 *
 * The screen light is STEADY — it does not flicker with the content. Tying it
 * to the terminal would violate the calm-motion rule immediately, and a real
 * screen's average luminance barely moves anyway.
 *
 * The screen lamp is also a STAND-IN for the glass's own emission. Anything
 * reflective would reflect it as a hotspot that shouldn't exist, so the
 * faceplate is deliberately not a lit material (see CRTScreen) — Three can't
 * mask a light per object in one pass, because it tests lights against the
 * CAMERA's layers before collecting them.
 */
export function Scene() {
  const [screenTexture, setScreenTexture] = useState(null)
  const environmentController = useRef(null)
  const index = useStore((state) => state.index)
  const displayStage = usePresentationRuntime((state) => state.displayStage)
  const slide = slides[index]
  const flat = Boolean(slide?.camera?.fillScreen)
  const stage = displayStage

  return (
    <>
      {/* Home gets almost nothing; the office gets a small floor only. Its real
          brightness and soft shadows come from shaped ceiling sources. */}
      <ambientLight
        visible={GLOBAL_LIGHT_VARIANTS.ambient.stages.includes(stage)}
        intensity={stageIntensity('ambient', stage)}
        userData={lightVariant('ambient')}
      />

      {/* ── KEY: the screen ──
          A rectangle the size of the glass, COPLANAR WITH IT.

          The plane matters as much as the size. Sitting the emitter in front of
          the glass floods the flat front of the bezel head-on, at an even value
          across its whole face — which is exactly the hard bright rectangle
          that reads as a box-shadow around the picture. Real glass emits from
          its own surface, so the bezel's flat face is edge-on to it and catches
          almost nothing, while the inner chamfer angled back toward the picture
          catches a lot. That difference is the gradient, and the gradient is
          what makes it look like light rather than a border. */}
      <rectAreaLight
        visible={GLOBAL_LIGHT_VARIANTS.screen.stages.includes(stage)}
        position={[0, 0, 0.02]}
        rotation={[0, Math.PI, 0]}
        width={SCREEN_SIZE.w}
        height={SCREEN_SIZE.h}
        color="#ffe4a8"
        intensity={stageIntensity('screen', stage)}
        userData={lightVariant('screen')}
      />

      {/* A very low local fill keeps the glass-to-chin seam from closing up.
          The correctly oriented screen rectangle now does the real foreground
          work; this point is deliberately too weak to flatten the desk. */}
      <pointLight
        visible={GLOBAL_LIGHT_VARIANTS.localFill.stages.includes(stage)}
        position={[0, 0.4, 1.15]}
        color="#ffdf9e"
        intensity={stageIntensity('localFill', stage)}
        distance={56}
        decay={2}
        userData={lightVariant('localFill')}
      />

      {/* ── SEPARATION: a doorway, off to the left and behind ──
          A cold SPOT, not a directional. The cone gives falloff and an edge, so
          the light lands as a shaped pool with a direction you can read, and it
          casts — which is what stops it reading as ambient fill. This is what
          rims the tube and keeps the silhouette off the back wall. */}
      <AimedSpot
        visible={GLOBAL_LIGHT_VARIANTS.doorway.stages.includes(stage)}
        position={[-46, 40, -30]}
        target={[4, DESK_Y, 4]}
        color="#b3c0bd"
        intensity={stageIntensity('doorway', stage)}
        distance={170}
        angle={0.62}
        penumbra={0.85}
        decay={2}
        castShadow={Boolean(
          GLOBAL_LIGHT_VARIANTS.doorway.castShadows[stage]
        )}
        userData={lightVariant('doorway')}
        // This is the shadow you actually look at — the lamp's, across the desk.
        //
        // `radius` is the PCF kernel width. It was 18 (tuned for the VSM blur
        // this Canvas no longer uses), which smeared every occluder's contact
        // edge into nothing: props sat in light with no darkening where they met
        // the desk. A real penumbra widens with distance from the occluder, which
        // needs PCSS; at this scale a narrow constant blur that PRESERVES contact
        // beats a wide one that erases it.
        //
        // The frustum is clamped to the desk volume rather than the light's full
        // 170-unit reach. Shadow texel density is what resolves a contact edge,
        // and spending the map on empty room behind the desk is why 1024² could
        // not resolve one.
        shadow-mapSize={[1536, 1536]}
        shadow-radius={3}
        shadow-camera-near={26}
        shadow-camera-far={130}
        shadow-bias={-0.0006}
        shadow-normalBias={0.03}
      />

      {/* Broad doorway return on the opposite side. A rectangle gives the CRT
          housing one long controlled highlight instead of a point-light dot. */}
      <AimedRect
        visible={GLOBAL_LIGHT_VARIANTS.oppositeRim.stages.includes(stage)}
        position={[34, 17, -18]}
        target={[2, -2, -5]}
        width={18}
        height={28}
        color="#909b98"
        intensity={stageIntensity('oppositeRim', stage)}
        userData={lightVariant('oppositeRim')}
      />

      {/* ── BOUNCE IS THE ENVIRONMENT MAP, NOT A LIGHT ──
          The exception is a very broad, dim wall return. It gives the black
          housing a background value to separate from without putting another
          punctual hotspot on the desk. */}
      <AimedRect
        visible={GLOBAL_LIGHT_VARIANTS.backWall.stages.includes(stage)}
        position={[-8, 10, -44]}
        target={[-8, 10, -62]}
        width={50}
        height={32}
        color="#6c7671"
        intensity={stageIntensity('backWall', stage)}
        userData={lightVariant('backWall')}
      />

      {/* The cubicle already owns its troffers and one shadow source. This
          large aisle-side return adds a single off-axis highlight family so
          plastic, laminate, ceramic, and metal do not share one overhead tone. */}
      <AimedRect
        visible={GLOBAL_LIGHT_VARIANTS.officeSide.stages.includes(stage)}
        position={[-40, 13, 24]}
        target={[0, -5, -6]}
        width={30}
        height={42}
        color="#cbd9dc"
        intensity={stageIntensity('officeSide', stage)}
        userData={lightVariant('officeSide')}
      />

      <RoomEnvironment stage={stage} controller={environmentController} />
      <RoomLightRig />
      <StageAtmosphere stage={stage} />
      <ShadowLifecycle />
      <CRTScreen onTexture={setScreenTexture} deskY={DESK_Y} />
      <StageDirector screenTexture={screenTexture} />

      {/* Dust hangs in the pool of light IN FRONT of the glass — which during
          the cold open is between the camera and the screen. Keep it mounted so
          its shader is resident before navigation, but atomically hide it from
          flat or non-room stages. */}
      <group
        visible={!flat && (stage === 'home' || stage === 'cubicle')}
        userData={{ presentationStages: ['home', 'cubicle'] }}
      >
        <Dust />
      </group>

      <PresentationWarmup
        environmentController={environmentController}
        screenTexture={screenTexture}
      />
      <PresentationDiagnostics />
    </>
  )
}
