import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { crtVert, crtFrag, CRT_DEFAULTS } from '../shaders/crt.js'
import {
  CHAR_W,
  FONT_SIZE,
  LINE_H,
  PHOSPHOR,
  TERMINAL,
  ensureFonts,
  font,
} from '../terminal/theme.js'
import { clearWrapCache } from '../terminal/session.js'
import { ensureTerminalAssets } from '../terminal/assets.js'
import {
  createContentTransition,
  paintSession,
  resolveSession,
  sessionProgress,
} from '../terminal/playback.js'
import { useStore } from '../state/useStore.js'
import { slides } from '../slides/index.js'
import {
  chartRowAt,
  hoveredChartRow,
  setHoveredChartRow,
} from '../terminal/hover.js'
import { STAGE_LOOK_PRESETS } from './environment.js'
import { mulberry32 } from '../lib/rng.js'
import {
  QUALITY_AA_PROFILE,
  QUALITY_HANDOFF_MODE,
} from '../qualityProfile.js'
import {
  qualityDiagnosticsEnabled,
  usePresentationRuntime,
} from '../state/presentationRuntime.js'

/**
 * THE MONITOR. One plane, one shader, one canvas texture — and for the first
 * couple of minutes of the talk the audience has no idea it's any of those.
 *
 * The cold open runs with `uTube` at 0, which is a bit-exact passthrough of the
 * canvas: flat, clean, big text, indistinguishable from a screen recording of
 * somebody's terminal. As the camera pulls back, the slide's `crt` params dial
 * the tube up — curvature, shadow mask, halation, bezel — and the thing you
 * were reading turns out to have been a cathode ray tube the whole time.
 *
 * The screen is 16×9 units at the origin facing +z. Camera waypoints do the
 * rest; `fillScreen` on a slide's camera parks it at exactly the distance that
 * covers the viewport (see CameraRig).
 */

export const SCREEN_SIZE = { w: 16, h: 9 }

/**
 * How far the centre of the faceplate swells forward at full tube.
 *
 * Bounded by the housing: the CAD screen pocket is 12mm deep and the glass sits
 * at its floor, so anything past that pokes out through the front of the
 * monitor. 0.22 scene units is ~7mm — a late-era tube is nearly flat anyway,
 * and the point is that the curve EXISTS and agrees with the image, not that
 * it's dramatic.
 */
export const SCREEN_BULGE = 0.22

const glassVert = /* glsl */ `
  varying vec2 vGlassUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vGlassUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const glassFrag = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  uniform float uOffice;
  uniform float uDeskY;
  uniform vec3 uHaze;
  uniform sampler2D uRoughness;
  varying vec2 vGlassUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  /**
   * The desk, reflected.
   *
   * A directional gradient can tell you a faceplate is glossy; only an IMAGE
   * tells you it is glass. The biggest image a desk monitor carries is the lit
   * desk directly below it, interrupted by the silhouettes of whatever is on it
   * — which is exactly the part a pure horizon/cold/bounce wash cannot produce.
   *
   * Analytic ray/plane trace rather than a reflection probe, for the same
   * reason the rest of this shader is analytic: a probe would capture the fake
   * area lamp that stands in for the glass's own emission and paint an
   * impossible hotspot back onto the terminal.
   */
  vec3 deskReflection(vec3 origin, vec3 dir, out float mask) {
    mask = 0.0;
    if (dir.y > -0.02) return vec3(0.0);

    float t = (uDeskY - origin.y) / dir.y;
    if (t <= 0.0) return vec3(0.0);
    vec3 hit = origin + dir * t;

    // Off the front lip or past the sides, the ray leaves the desk entirely.
    float onDesk = step(abs(hit.x), 46.0) * step(-22.0, hit.z) * step(hit.z, 18.0);
    if (onDesk < 0.5) return vec3(0.0);

    // The screen's own pool on the timber: brightest just in front of the
    // glass, falling off across the surface. Same shape the rectAreaLight
    // actually produces, so the reflection agrees with the lighting.
    vec2 fromScreen = hit.xz - vec2(0.0, 6.0);
    float pool = exp(-dot(fromScreen, fromScreen) * 0.0034);
    vec3 timber = vec3(0.20, 0.105, 0.052) * (0.1 + 1.5 * pool);

    // Props read as dark interruptions in that band. Without them the
    // reflection is a clean gradient, and a clean gradient is what a
    // gloss wash already looked like.
    float keyboard = 1.0 - 0.82 * step(abs(hit.x + 0.4), 6.0) * step(abs(hit.z - 9.4), 2.1);
    float notebook = 1.0 - 0.7 * step(abs(hit.x + 9.8), 3.4) * step(abs(hit.z - 7.6), 2.6);
    timber *= keyboard * notebook;

    // Grazing hits far down the desk fuse into the room wash rather than
    // holding a crisp edge, which is also what the deposit roughness expects.
    mask = onDesk * smoothstep(90.0, 26.0, t);
    return timber;
  }

  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float facing = clamp(dot(n, viewDir), 0.0, 1.0);
    float fresnel = 0.042 + 0.958 * pow(1.0 - facing, 5.0);
    vec3 reflected = reflect(-viewDir, n);

    // The same three broad sources painted into environment.js, evaluated
    // analytically so this layer stays UNLIT and can never reflect the fake
    // lamp that stands in for its own emission.
    float horizon = exp(-pow(abs(reflected.y) * 3.2, 2.0));
    vec3 room = vec3(0.035, 0.055, 0.078) * (0.28 + 0.72 * horizon);
    vec3 coldDir = normalize(vec3(-0.72, 0.52, -0.34));
    float cold = pow(max(dot(reflected, coldDir), 0.0), 18.0);
    room += vec3(0.18, 0.30, 0.48) * cold;
    vec3 bounceDir = normalize(vec3(0.0, -0.82, 0.58));
    float bounce = pow(max(dot(reflected, bounceDir), 0.0), 9.0);
    room += vec3(0.24, 0.19, 0.06) * bounce;

    // The cubicle's broad fluorescent ceiling is a different reflection world,
    // not the dark room turned up. Two large panels and a pale horizon make the
    // glass read as the same object moved into an office.
    vec3 office = vec3(0.10, 0.14, 0.145) * (0.7 + 0.3 * horizon);
    vec3 panelA = normalize(vec3(-0.38, 0.62, 0.69));
    vec3 panelB = normalize(vec3(0.42, 0.58, 0.70));
    float panels = pow(max(dot(reflected, panelA), 0.0), 8.0)
      + pow(max(dot(reflected, panelB), 0.0), 9.0);
    office += vec3(0.62, 0.76, 0.73) * panels * 0.42;
    room = mix(room, office, uOffice);

    // The desk image sits ON TOP of the directional wash — it is the near-field
    // part of the same reflection, and it is what makes the lower half of a dark
    // faceplate read as glass rather than as a switched-off rectangle.
    float deskMask = 0.0;
    vec3 desk = deskReflection(vWorldPosition, reflected, deskMask);
    room = mix(room, desk, deskMask * 0.86);

    float deposit = texture2D(uRoughness, vGlassUv).r;
    float clarity = mix(1.06, 0.72, smoothstep(0.22, 0.78, deposit));

    // Bulk haze. A faceplate is thick tinted glass over a grey phosphor layer,
    // so it carries real diffuse reflectance that — unlike the Fresnel term —
    // does NOT fall away at normal incidence. Without it a dark screen viewed
    // head-on resolved to absolute black, which is why the office monitors read
    // as holes cut in the set rather than as switched-on glass showing a dark
    // image. Its level is per-stage ambient (environment.js): low at home, where
    // a black screen in a dark room really is nearly black; amber in the rack
    // vault, where the surrounding light IS the wall; and exactly zero on the
    // phosphor stage, whose measured shader/geometry handoff parity must not be
    // perturbed. The cold open is protected regardless by uOpacity going to 0.
    vec3 reflection = (room * fresnel + uHaze) * clarity;
    gl_FragColor = vec4(reflection, uOpacity);
  }
`

/**
 * A shallow spherical cap — the faceplate. The bulge is small (a late-era tube
 * is nearly flat) but it must not be zero: the whole point is that the specular
 * highlight travels across it as the camera moves.
 */
function makeGlassRoughness(size = 512) {
  const rand = mulberry32(0xface91a7)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')

  // Dark means optically clean under Three's multiplicative roughness map.
  // Broad translucent deposits plus partial arcs read as wiped glass and
  // fingerprints only when a reflection crosses them; they never sit over the
  // terminal as a visible dirt texture.
  ctx.fillStyle = 'rgb(58,58,58)'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 13; i++) {
    const x = rand() * size
    const y = rand() * size
    const radius = 24 + rand() * 70
    const haze = ctx.createRadialGradient(x, y, 0, x, y, radius)
    haze.addColorStop(0, `rgba(205,205,205,${0.09 + rand() * 0.08})`)
    haze.addColorStop(0.55, `rgba(170,170,170,${0.045 + rand() * 0.05})`)
    haze.addColorStop(1, 'rgba(110,110,110,0)')
    ctx.fillStyle = haze
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)

    ctx.strokeStyle = `rgba(220,220,220,${0.04 + rand() * 0.04})`
    ctx.lineWidth = 1 + rand() * 1.4
    for (let ring = 0; ring < 4; ring++) {
      ctx.beginPath()
      ctx.ellipse(
        x,
        y,
        radius * (0.25 + ring * 0.12),
        radius * (0.18 + ring * 0.09),
        rand() * Math.PI,
        rand() * 0.8,
        Math.PI * (1.2 + rand() * 0.55)
      )
      ctx.stroke()
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  texture.anisotropy = 8
  return texture
}

function domedPlane(w, h, bulge, segsX = 48, segsY = 32) {
  const g = new THREE.PlaneGeometry(w, h, segsX, segsY)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / (w / 2)
    const y = pos.getY(i) / (h / 2)
    // Weighted so the curve is gentler across the width than the height, the
    // way a widescreen tube actually is.
    const r2 = Math.min(1, x * x * 0.7 + y * y)
    pos.setZ(i, (1 - r2) * bulge)
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  return g
}

function needsObjectCopyBeforeContentChanges(index) {
  for (let next = index + 1; next < slides.length; next++) {
    // A new Session will replace the canvas before an object-space sampler can
    // use this image, so warming the old transcript would be wasted work.
    if (slides[next].session) return false
    if (!slides[next].camera?.fillScreen) return true
  }
  return false
}

/**
 * HDR drive on the glass for object views. Flat slides force 1 so the settled
 * cold open remains a bit-exact canvas passthrough; everywhere else the stage
 * look decides how far above display white the phosphor sits before ACES.
 */
function resolveEmissiveGain(slide, stage) {
  if (slide?.camera?.fillScreen) return 1
  return STAGE_LOOK_PRESETS[stage]?.post.screenGain ?? 1
}

function resolveHandoff(slide) {
  if (QUALITY_HANDOFF_MODE) {
    return {
      opacity: QUALITY_HANDOFF_MODE === 'shader' ? 1 : 0,
      depth: 0,
    }
  }
  const fieldOpacity = THREE.MathUtils.clamp(slide?.phosphor?.opacity ?? 0, 0, 1)
  return {
    // Geometry opacity is the source of truth. Keeping these exact complements
    // prevents an additive bright pulse even if a slide's redundant
    // screenOpacity value drifts during authoring.
    opacity: 1 - fieldOpacity,
    depth: THREE.MathUtils.clamp(slide?.phosphor?.depth ?? 0, 0, 1),
  }
}

/**
 * Per-stage faceplate diffuse reflectance; see the `uHaze` note in glassFrag.
 *
 * Cut hard on a COVERING framing. The haze is what stops a dark screen
 * resolving to absolute black head-on, and in a lit office it is genuinely
 * large — the cubicle sits at 0.055–0.062, five times the home value, because
 * a faceplate under ten troffers really does scatter that much back. That is
 * right while you can SEE the office around the monitor: the wash is the room,
 * and reading it as the room is the whole point of modelling it.
 *
 * When the glass covers the entire frame there is no room in shot to motivate
 * it. The same value stops being a reflection and becomes a grey floor over
 * every pixel of a projected slide — measured at p10 46 on the cubicle data
 * beats, which in a dark auditorium is simply a washed-out image. The physical
 * claim is unchanged; it is only being asked to hold up a frame that contains
 * no evidence for it.
 */
const COVERING_HAZE_SCALE = 0.2

function stageGlassHaze(stage, covering = false) {
  const look = STAGE_LOOK_PRESETS[stage] ?? STAGE_LOOK_PRESETS.home
  const haze = look.glassHaze ?? STAGE_LOOK_PRESETS.home.glassHaze
  if (!covering) return haze
  return haze.map((channel) => channel * COVERING_HAZE_SCALE)
}

export function CRTScreen({ onTexture, deskY }) {
  const mat = useRef()
  const glass = useRef()
  const glassMat = useRef()
  const index = useStore((s) => s.index)
  const step = useStore((s) => s.step)
  const displayStage = usePresentationRuntime((state) => state.displayStage)
  const slide = slides[index]
  // Initial uniforms come from the deep-linked slide itself. Navigation still
  // damps between targets, but a refresh must restore the settled state rather
  // than replay every physical transition from tube=0.
  const initialHandoff = useRef(resolveHandoff(slide)).current
  const initialCrt = useRef({
    ...CRT_DEFAULTS,
    tube: 0,
    ...(slide?.crt ?? {}),
    handoffOpacity: initialHandoff.opacity,
    handoffDepth: initialHandoff.depth,
    emissiveGain: resolveEmissiveGain(slide, slide?.stage ?? 'home'),
  }).current
  const { gl } = useThree()

  // Animation clocks. `elapsed` runs the current step's reveal; `time` is the
  // free-running clock the caret blink and spinners read.
  const elapsed = useRef(0)
  const time = useRef(0)
  const transitionElapsed = useRef(0)
  const transitionFrom = useRef(null)
  const lastSlide = useRef('')
  const lastPaint = useRef('')
  const lastObjectPaint = useRef('')
  const caret = useRef(null)
  const ready = useRef(false)
  // Slide navigation sweeps content off and on the glass (see playback.js).
  const contentTransition = useRef(null)
  if (!contentTransition.current) {
    contentTransition.current = createContentTransition()
  }

  // Which session is on the glass, and how far through it. Shared with the
  // ?flat authoring renderer so the two can't drift — see terminal/playback.js.
  const showing = useMemo(() => resolveSession(slides, index, step), [index, step])

  const initialNeedsMips = useRef(!slide?.camera?.fillScreen).current
  const { canvas, ctx, flatTexture, objectTexture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = TERMINAL.width
    canvas.height = TERMINAL.height
    const ctx = canvas.getContext('2d', { alpha: false })
    const makeTexture = (mipmapped) => {
      const value = new THREE.CanvasTexture(canvas)
      value.colorSpace = THREE.SRGBColorSpace
      value.minFilter = mipmapped
        ? THREE.LinearMipmapLinearFilter
        : THREE.LinearFilter
      value.magFilter = THREE.LinearFilter
      value.generateMipmaps = mipmapped
      value.anisotropy = mipmapped
        ? gl.capabilities.getMaxAnisotropy?.() ?? 1
        : 1
      return value
    }
    // Sampler state is immutable during the talk. Changing one CanvasTexture
    // between mipmapped and non-mipmapped modes made Three recreate its GL
    // texture on every fill-screen boundary. Both share the same canvas; the
    // flat copy uploads live typing without a mip chain, while the object copy
    // refreshes once whenever transcript content settles.
    return {
      canvas,
      ctx,
      flatTexture: makeTexture(false),
      objectTexture: makeTexture(true),
    }
    // Deep-link initialization only. Later slides switch the shader's sampler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Matched to the screen's dome, so the two surfaces are concentric and the
  // reflection sits ON the picture rather than slicing through it. Slightly
  // UNDER size, not over: the glass lives inside the housing's recess, and a
  // faceplate even a fraction larger punches into the pocket walls and z-fights
  // as a dashed line along the edges.
  const glassGeo = useMemo(
    () => domedPlane(SCREEN_SIZE.w * 0.994, SCREEN_SIZE.h * 0.994, SCREEN_BULGE),
    []
  )
  const glassRoughness = useMemo(() => makeGlassRoughness(), [])
  const glassUniforms = useMemo(
    () => ({
      uOpacity: { value: initialCrt.tube * 0.68 },
      uOffice: { value: displayStage === 'cubicle' ? 1 : 0 },
      // Passed in rather than imported: Room → scale → CRTScreen is already a
      // cycle, and scale.js needs SCREEN_SIZE at module-eval time.
      uDeskY: { value: deskY },
      uHaze: { value: new THREE.Vector3(...stageGlassHaze(displayStage)) },
      uRoughness: { value: glassRoughness },
    }),
    [deskY, glassRoughness, initialCrt.tube]
  )

  const uniforms = useMemo(
    () => ({
      uMap: { value: initialNeedsMips ? objectTexture : flatTexture },
      uResolution: { value: new THREE.Vector2(TERMINAL.width, TERMINAL.height) },
      uTube: { value: initialCrt.tube },
      uBulge: { value: SCREEN_BULGE },
      uHalfSize: {
        value: new THREE.Vector2(SCREEN_SIZE.w / 2, SCREEN_SIZE.h / 2),
      },
      uLines: { value: initialCrt.lines },
      uFocus: { value: initialCrt.focus },
      uMaskMode: { value: initialCrt.maskMode },
      uMaskPitchPx: { value: initialCrt.maskPitchPx },
      uMaskStrength: { value: initialCrt.maskStrength },
      uCurvature: { value: initialCrt.curvature },
      uBezel: { value: initialCrt.bezel },
      uHalation: { value: initialCrt.halation },
      uVignette: { value: initialCrt.vignette },
      uHandoffOpacity: { value: initialCrt.handoffOpacity },
      uHandoffDepth: { value: initialCrt.handoffDepth },
      uEmissiveGain: { value: initialCrt.emissiveGain },
      uCaretRect: { value: new THREE.Vector4(0, 0, 0, 0) },
      uCaretColor: { value: new THREE.Color(PHOSPHOR.hot) },
      uCaretVisible: { value: 0 },
    }),
    [flatTexture, initialCrt, initialNeedsMips, objectTexture]
  )

  // Text measurement before JetBrains Mono lands silently uses fallback metrics,
  // which shifts the whole grid a beat into the talk. Hold the first paint.
  useEffect(() => {
    let alive = true
    Promise.all([ensureFonts(), ensureTerminalAssets()]).then(() => {
      if (!alive) return
      clearWrapCache()
      ready.current = true
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    uniforms.uMap.value = slide?.camera?.fillScreen ? flatTexture : objectTexture
  }, [flatTexture, objectTexture, slide?.camera?.fillScreen, uniforms])

  useLayoutEffect(() => {
    // Allocate both immutable sampler variants during startup. Their pixels can
    // change later, but navigation must never create a new WebGL texture.
    gl.initTexture(flatTexture)
    gl.initTexture(objectTexture)
    // The physical phosphor field always wants the mip-safe object copy.
    onTexture?.(objectTexture)
    return () => onTexture?.(null)
  }, [flatTexture, gl, objectTexture, onTexture])

  useEffect(
    () => () => {
      flatTexture.dispose()
      objectTexture.dispose()
      glassGeo.dispose()
      glassRoughness.dispose()
    },
    [flatTexture, glassGeo, glassRoughness, objectTexture]
  )

  // Dev-only handle for tuning the tube live, in the same spirit as
  // window.__deck in state/useStore.js. Poke a uniform and watch it:
  //   __crt.uHalation.value = 0     ·   __crt.uMaskMode.value = 2
  // Values are re-damped toward the slide's `crt` target each frame, so pin
  // one with __crt.hold = true to stop it snapping back.
  useEffect(() => {
    if (!import.meta.env.DEV && !qualityDiagnosticsEnabled()) return undefined
    const previous = window.__crt
    window.__crt = uniforms
    return () => {
      if (window.__crt !== uniforms) return
      if (previous === undefined) delete window.__crt
      else window.__crt = previous
    }
  }, [uniforms])

  // Restart the reveal whenever the slide OR the Enter-driven step changes.
  useLayoutEffect(() => {
    const key = `${index}:${step}`
    if (key === lastSlide.current) return
    const u = mat.current?.uniforms
    transitionFrom.current = u
      ? {
          tube: u.uTube.value,
          lines: u.uLines.value,
          focus: u.uFocus.value,
          maskStrength: u.uMaskStrength.value,
          maskPitchPx: u.uMaskPitchPx.value,
          curvature: u.uCurvature.value,
          bezel: u.uBezel.value,
          halation: u.uHalation.value,
          vignette: u.uVignette.value,
          handoffOpacity: u.uHandoffOpacity.value,
          handoffDepth: u.uHandoffDepth.value,
          emissiveGain: u.uEmissiveGain.value,
        }
      : initialCrt
    elapsed.current = 0
    transitionElapsed.current = 0
    lastSlide.current = key
  }, [index, initialCrt, step])

  useFrame((_, dt) => {
    time.current += dt
    transitionElapsed.current += dt

    if (ready.current && showing) {
      if (showing.live) elapsed.current += dt

      // Which content is actually on the glass this frame: the settled session,
      // or a sweep undrawing/redrawing between two of them.
      const view = contentTransition.current.update(showing, time.current)
      const painted = view.showing ?? showing

      // Repaint only when the IMAGE would actually differ. Uploading a
      // 2560×1440 canvas and regenerating its mipmap chain is one of the more
      // expensive things in the frame, and most of the talk is spent on a
      // settled transcript where the only thing moving is the caret blinking
      // twice a second. Painting that 60 times a second is 30× the work for an
      // identical image.
      //
      // The key covers everything that can change the picture: which step,
      // how far through it, the caret's blink phase, the spinner's frame
      // while one is actually running, and the content sweep's progress.
      const step = painted.script[Math.min(painted.step, painted.script.length - 1)]
      const progress = sessionProgress(painted, elapsed.current)
      const spinning = painted.live && progress < 1 && step?.kind === 'think'
      const staticVisual = step?.kind === 'visual'
      const animatedStep = ['user', 'say', 'think', 'tool'].includes(step?.kind)
      const staticFrame = staticVisual || !animatedStep
      const identity = staticVisual ? `visual:${step.id}` : step?.kind ?? 'empty'
      const sourceSlide = slides.findIndex((candidate) => candidate.session === painted.script)
      const phase = staticVisual
        ? 'static'
        : !animatedStep
          ? !painted.live || progress >= 1
            ? 'done'
            : 'active'
          : painted.live
            ? progress.toFixed(2)
            : '1.00'
      const key =
        `${sourceSlide}:${identity}|${painted.step}|${phase}` +
        `|${spinning ? Math.floor(time.current * 12) : ''}` +
        `|${view.reveal ? `${view.reveal.mode}:${view.reveal.progress.toFixed(3)}` : ''}` +
        // Without this the repaint cache would hold the un-highlighted frame:
        // the pointer changes the image, so it belongs in the image's identity.
        `|h${hoveredChartRow() ?? ''}`

      if (key !== lastPaint.current) {
        lastPaint.current = key
        const frame = paintSession(ctx, painted, elapsed.current, time.current, {
          drawCaret: false,
          reveal: view.reveal,
        })
        // Chrome can defer Canvas 2D glyph rasterization until the backing store
        // is read. Flush settled/static frames before WebGL snapshots them; the
        // cached glyphs then remain intact while typing without a readback on
        // every character frame.
        if (staticFrame || progress >= 1) ctx.getImageData(0, 0, 1, 1)
        caret.current = frame?.caret ?? null
        if (caret.current) {
          ctx.font = font(500)
          const x = TERMINAL.padX + ctx.measureText(caret.current.prefix).width
          const y =
            TERMINAL.padY +
            caret.current.row * LINE_H +
            (LINE_H - FONT_SIZE) * 0.5
          // Canvas rows start at the top; plane UVs start at the bottom.
          uniforms.uCaretRect.value.set(
            x / TERMINAL.width,
            1 - (y + FONT_SIZE) / TERMINAL.height,
            (x + CHAR_W) / TERMINAL.width,
            1 - y / TERMINAL.height
          )
        }
        const activeUsesMips = !slide?.camera?.fillScreen
        const activeTexture = activeUsesMips ? objectTexture : flatTexture
        activeTexture.needsUpdate = true
        if (activeUsesMips) lastObjectPaint.current = key

        if (
          progress >= 1 &&
          view.phase === 'steady' &&
          needsObjectCopyBeforeContentChanges(index) &&
          lastObjectPaint.current !== key
        ) {
          // Warm the mip-safe copy only when this exact canvas image will
          // survive into an object-space slide. Logo-to-logo navigation used to
          // regenerate a 2560×1440 mip chain that could never be displayed.
          objectTexture.needsUpdate = true
          gl.initTexture(objectTexture)
          lastObjectPaint.current = key
        }
      }
      // No cursor while the machine repaints its buffer — the sweep owns the
      // screen; the caret returns with the settled frame.
      uniforms.uCaretVisible.value = caret.current && view.phase === 'steady'
        ? QUALITY_AA_PROFILE || Math.floor(time.current * 1.9) % 2 === 0
          ? 1
          : 0
        : 0
    }

    // Ease the tube toward whatever this slide asks for. `tube: 0` is a flat
    // screen recording; `tube: 1` is a CRT. Everything between is the reveal.
    // This is an authored ease-in-out, not exponential damping: damping made
    // the first 100ms do most of the visual work, so the terminal appeared to
    // crumple suddenly and then spent a second creeping toward its final shape.
    const handoff = resolveHandoff(slide)
    const target = {
      ...CRT_DEFAULTS,
      tube: 0,
      ...(slide?.crt ?? {}),
      handoffOpacity: handoff.opacity,
      handoffDepth: handoff.depth,
      emissiveGain: resolveEmissiveGain(slide, displayStage),
    }
    const u = mat.current?.uniforms
    if (u && !uniforms.hold) {
      const duration = Math.max(0.001, slide?.camera?.smoothTime ?? 1)
      const progress = Math.min(1, transitionElapsed.current / duration)
      const eased = progress * progress * (3 - 2 * progress)
      const from = transitionFrom.current ?? target
      const ease = (key, to) =>
        progress >= 1 ? to : THREE.MathUtils.lerp(from[key] ?? to, to, eased)
      u.uTube.value = ease('tube', target.tube)
      u.uLines.value = ease('lines', target.lines)
      u.uFocus.value = ease('focus', target.focus)
      u.uMaskStrength.value = ease('maskStrength', target.maskStrength)
      u.uMaskPitchPx.value = ease('maskPitchPx', target.maskPitchPx)
      u.uCurvature.value = ease('curvature', target.curvature)
      u.uBezel.value = ease('bezel', target.bezel)
      u.uHalation.value = ease('halation', target.halation)
      u.uVignette.value = ease('vignette', target.vignette)
      u.uHandoffOpacity.value = ease('handoffOpacity', target.handoffOpacity)
      u.uHandoffDepth.value = ease('handoffDepth', target.handoffDepth)
      u.uEmissiveGain.value = ease('emissiveGain', target.emissiveGain)
      // Mask pattern is a discrete choice, not a blend — snap it.
      u.uMaskMode.value = target.maskMode

      // The faceplate arrives with the tube. Hidden outright below a threshold
      // so the cold open can never pick up a stray punctual highlight.
      const t = u.uTube.value
      const physical = THREE.MathUtils.smoothstep(t, 0.28, 1)
      if (glass.current) glass.current.visible = physical > 0.01
      if (glassMat.current) {
        glassMat.current.uniforms.uOpacity.value = QUALITY_HANDOFF_MODE
          ? 0
          : physical * 0.68 * u.uHandoffOpacity.value
        glassMat.current.uniforms.uOffice.value = displayStage === 'cubicle' ? 1 : 0
        glassMat.current.uniforms.uHaze.value.set(
          ...stageGlassHaze(displayStage, Boolean(slide?.camera?.fillScreen))
        )
      }
    }
  })

  return (
    <group>
      {/* Segmented, because the vertex shader domes it — a 1×1 plane has no
          interior vertices to displace and would stay flat however hard the
          shader pushes. */}
      {/* Pointer hover on the charts. The plane's UV is the canvas, so a
          raycast hit converts straight to texture pixels and the row rectangles
          the painter recorded can be hit-tested directly.

          The UV comes from the UNDEFORMED plane, while the shader barrel-warps
          what you see, so at full tube the hit drifts from the drawn row toward
          the edges of the glass. Charts live in the middle of the frame where
          that drift is under a row, and the beats where a presenter actually
          points at data are glass-filling and flat. Not worth inverting the
          curvature for. */}
      <mesh
        renderOrder={0}
        onPointerMove={(event) => {
          if (!event.uv) return
          setHoveredChartRow(
            chartRowAt(event.uv.x * TERMINAL.width, (1 - event.uv.y) * TERMINAL.height)
          )
        }}
        onPointerOut={() => setHoveredChartRow(null)}
      >
        <planeGeometry args={[SCREEN_SIZE.w, SCREEN_SIZE.h, 64, 40]} />
        {/* GLSL3 so the scanline taps can use textureGrad — see shaders/crt.js. */}
        <shaderMaterial
          ref={mat}
          uniforms={uniforms}
          vertexShader={crtVert}
          fragmentShader={crtFrag}
          glslVersion={THREE.GLSL3}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* THE GLASS. A real tube's faceplate is thick and you can see the room in
          it — that reflection is most of why a CRT reads as an object rather
          than a lit rectangle. Gently domed, because the highlight sliding
          across a curve as the camera moves is the thing that sells it; a flat
          pane just gets a static bright patch.

          ADDITIVE, with a black base colour: reflection is light arriving on top
          of what's behind, so the glass can only ever ADD. A conventional
          transparent dark pane would dim the phosphor it sits over, which is
          the opposite of what glass does.

          Tied to the SAME dial as the tube shader: at `tube: 0` it contributes
          nothing, because a reflection over the cold open is a reflection on a
          screen recording. The physicality all arrives together. */}
      <mesh
        ref={glass}
        geometry={glassGeo}
        position={[0, 0, 0.05]}
        renderOrder={2}
        visible={initialCrt.tube > 0.02}
      >
        {/* Analytic room reflection, never scene lighting: a lit PBR pane also
            reflects the fake area lamp representing its own emission, which
            creates an impossible white hotspot over the terminal. This shader
            keeps physical Fresnel and deterministic deposit roughness while
            remaining blind to every punctual light. Additive blending is
            deliberate: reflected room light arrives on top of the phosphor. */}
        <shaderMaterial
          ref={glassMat}
          uniforms={glassUniforms}
          vertexShader={glassVert}
          fragmentShader={glassFrag}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
