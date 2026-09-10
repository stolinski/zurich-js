import { useEffect, useRef } from 'react'
import { CameraControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../state/useStore.js'
import { slides } from '../slides/index.js'
import { bypassesPost } from '../presentation/defineSlides.js'
import { TERMINAL } from '../terminal/theme.js'
import { SCREEN_SIZE } from './CRTScreen.jsx'
import {
  beginCameraTransition,
  commitPendingStage,
  updateCameraTransition,
  usePresentationRuntime,
} from '../state/presentationRuntime.js'

/**
 * Distance at which the screen plane exactly COVERS the viewport — no letterbox,
 * no pillarbox, at any window aspect. Solved rather than hand-tuned because the
 * cold open's whole trick is that there is no visible edge to the screen: one
 * sliver of background at the top of the frame and the audience knows they're
 * looking at an object.
 */
// Sit closer than an exact fit. Exact cover puts the glass edge — and the bezel
// just outside it — right on the frame boundary, where a rounding error or an
// odd projector aspect shows a hard dark sliver and gives the whole thing away.
//
// 5.5% overscan crops ~2.75% off each side. That's what lets the bezel aperture
// sit SNUG against the glass (a visible gap between frame and picture reads as
// a badly fitted panel) while the cold open still shows nothing but screen. At
// 16:9 that stays inside the terminal's title-safe area—6.9% horizontal and
// 17.4% vertical—so harness content survives both cover-cropping and the tube
// warp; on narrower viewports screenContentDistance below is what protects the
// content. If you tighten the bezel further, widen terminal/theme.js first.
const OVERSCAN = 0.945

/**
 * How far past the painted safe area (TERMINAL.padX/padY) the tube's barrel
 * warp can push edge content, per side, as a fraction of the texture. Measured
 * at 16:10 against the TUBE_FULL header: warp cost ~1.6% at the top corners.
 */
const WARP_ALLOWANCE = 0.025
const CONTENT_FRACTION_W = 1 - 2 * (TERMINAL.padX / TERMINAL.width - WARP_ALLOWANCE)
const CONTENT_FRACTION_H = 1 - 2 * (TERMINAL.padY / TERMINAL.height - WARP_ALLOWANCE)

function screenFillDistance(fovDeg, aspect) {
  const visible = 2 * Math.tan((fovDeg * Math.PI) / 360)
  return (Math.min(SCREEN_SIZE.h, SCREEN_SIZE.w / aspect) / visible) * OVERSCAN
}

/**
 * The reading distance for revealed-tube glass slides: the cover solve, backed
 * off only as far as needed to keep the painted safe area (plus warp allowance)
 * inside the frame. At 16:9 the cover solve already shows more than the safe
 * area, so this returns the exact cover distance and the projector framing is
 * bit-identical. On a narrower window (a 16:10 laptop, a half-screen browser)
 * cover-cropping would eat legible content — headers, right-column values — so
 * legibility wins and slivers of bezel may appear instead. Flat slides never
 * use this: the cold open's trick requires strict cover (see PLAN.md §2).
 */
function screenContentDistance(fovDeg, aspect) {
  const visible = 2 * Math.tan((fovDeg * Math.PI) / 360)
  return Math.max(
    screenFillDistance(fovDeg, aspect),
    (CONTENT_FRACTION_W * SCREEN_SIZE.w) / (aspect * visible),
    (CONTENT_FRACTION_H * SCREEN_SIZE.h) / visible
  )
}

/**
 * Locks or unlocks USER input without touching `enabled`.
 *
 * `controls.enabled = false` disables the whole controller — including its
 * transitions — so a slide that locks input can never be flown TO. That made
 * navigation non-deterministic: going forward off the cold open worked, going
 * back to it silently did nothing and left the camera wherever it was. It only
 * ever looked right on first load because the initial camera happened to sit at
 * the covering distance already.
 *
 * Clearing the action bindings instead leaves the rig fully able to drive
 * itself while making mouse and touch inert.
 */
const smoothstep = (t) => t * t * (3 - 2 * t)
/** The t at which smoothstep reaches `s` — closed form, no iteration. */
const inverseSmoothstep = (s) => 0.5 - Math.sin(Math.asin(1 - 2 * s) / 3)

function setInputLocked(controls, locked) {
  const { ACTION } = controls.constructor
  const none = ACTION.NONE
  controls.mouseButtons.left = locked ? none : ACTION.ROTATE
  controls.mouseButtons.middle = locked ? none : ACTION.DOLLY
  controls.mouseButtons.right = locked ? none : ACTION.TRUCK
  controls.mouseButtons.wheel = locked ? none : ACTION.DOLLY
  controls.touches.one = locked ? none : ACTION.TOUCH_ROTATE
  controls.touches.two = locked ? none : ACTION.TOUCH_DOLLY_TRUCK
  controls.touches.three = locked ? none : ACTION.TOUCH_TRUCK
}

/**
 * Flies the camera to the active slide's waypoint whenever the index changes.
 * The authored `smoothTime` is an exact render-clock duration: each frame is an
 * absolute interpolation from the captured start to the declared endpoint.
 * There is no wall-clock callback and no last-frame corrective snap.
 *
 * EVERY slide re-frames from its own declaration, forwards or backwards. A
 * slide's appearance must not depend on how you arrived at it — going back to
 * the cold open has to give you the cold open, every time.
 *
 * A slide can set `camera.fillScreen` instead of a z position: the rig parks
 * head-on (recomputed on resize) and makes mouse/touch inert, so nothing can
 * nudge the illusion loose mid-demo. Flat slides park at exactly the covering
 * distance; revealed-tube slides park at the content-safe solve, which is the
 * same distance at 16:9 and only backs off where cover would crop content.
 */
export function CameraRig() {
  const controls = useRef(null)
  const didInitialize = useRef(false)
  const lastIndex = useRef(null)
  const lastPendingStage = useRef(null)
  const flight = useRef(null)
  // The shared easing schedule of a flight split in two by a stage swap: set
  // when the occlude leg starts, consumed when the reveal leg picks it up.
  const splitSchedule = useRef(null)
  const position = useRef(new THREE.Vector3())
  const target = useRef(new THREE.Vector3())
  const viewport = useRef({ width: 0, height: 0 })
  const { camera, gl, size } = useThree()

  const configureFlight = (index, pendingStage) => {
    const activeControls = controls.current
    const cam = slides[index].camera
    if (!activeControls) return

    const aspect = size.width / size.height
    const destinationFov = cam.fov ?? 50
    // Once the tube is revealed the glass parks at the content-safe solve; the
    // flat cold-open block keeps strict cover. Identical at 16:9 either way.
    const glassSolve =
      (slides[index].crt?.tube ?? 0) > 0 ? screenContentDistance : screenFillDistance
    const destinationPosition = new THREE.Vector3(
      ...(cam.fillScreen ? [0, 0, glassSolve(destinationFov, aspect)] : cam.pos)
    )
    const destinationTarget = new THREE.Vector3(...cam.target)
    // Occlusion is always the STRICT cover point — a stage swap is only hidden
    // while the glass fills the whole frame, content-safe backoff or not.
    const occlusionPosition = new THREE.Vector3(
      0,
      0,
      screenFillDistance(destinationFov, aspect)
    )
    const occlusionTarget = new THREE.Vector3(0, 0, 0)
    const matchesGlassPoint = (positionValue, targetValue, fovValue, solve) => {
      const glassPosition = new THREE.Vector3(0, 0, solve(fovValue, aspect))
      return (
        positionValue.distanceToSquared(glassPosition) < 1e-8 &&
        targetValue.distanceToSquared(occlusionTarget) < 1e-8
      )
    }
    const isCoveredEndpoint = (positionValue, targetValue, fovValue) =>
      matchesGlassPoint(positionValue, targetValue, fovValue, screenFillDistance)
    // Either head-on glass endpoint AND a slide that actually bypasses post.
    // Effects zeroes post only at a flat PASSTHROUGH, so flights must report
    // the same thing at each end or the post mix pops on settle. The camera
    // geometry alone is not enough: a glass-filling slide with the tube on is
    // still a fully post-processed frame.
    const isGlassEndpoint = (positionValue, targetValue, fovValue, slideIndex) =>
      (matchesGlassPoint(positionValue, targetValue, fovValue, screenFillDistance) ||
        matchesGlassPoint(positionValue, targetValue, fovValue, screenContentDistance)) &&
      bypassesPost(slides[slideIndex])
    const authoredDuration = Math.max(0, cam.smoothTime ?? 1)
    const firstFrame = !didInitialize.current
    const indexChanged = lastIndex.current !== index
    const previousIndex = lastIndex.current
    const previousPendingStage = lastPendingStage.current
    const stageJustCommitted =
      !pendingStage && Boolean(previousPendingStage) && !indexChanged
    const activeFlight = flight.current
    lastIndex.current = index
    lastPendingStage.current = pendingStage

    activeControls.enabled = true
    activeControls.stop()
    setInputLocked(activeControls, Boolean(cam.fillScreen || pendingStage))

    const installExact = (
      destination,
      lookAt,
      fov = destinationFov,
      phase = 'restore'
    ) => {
      flight.current = null
      camera.fov = fov
      camera.updateProjectionMatrix()
      activeControls.setLookAt(...destination, ...lookAt, false)
      const covered = isGlassEndpoint(destination, lookAt, fov, index)
      beginCameraTransition({
        index,
        duration: authoredDuration,
        from: null,
        to: {
          position: destination.toArray(),
          target: lookAt.toArray(),
          fov,
        },
        animate: false,
        phase,
        fromFlat: covered,
        toFlat: covered,
        frame: gl.info.render.frame,
      })
    }

    const startFlight = (
      destination,
      lookAt,
      duration,
      phase,
      fov = destinationFov,
      curve = smoothstep
    ) => {
      const startPosition = camera.position.clone()
      const startTarget = activeControls.getTarget(new THREE.Vector3())
      const startFov = camera.fov
      flight.current = {
        index,
        phase,
        duration,
        elapsed: 0,
        startPosition,
        startTarget,
        startFov,
        destinationPosition: destination,
        destinationTarget: lookAt,
        destinationFov: fov,
        curve,
      }
      beginCameraTransition({
        index,
        duration,
        from: {
          position: startPosition.toArray(),
          target: startTarget.toArray(),
          fov: startFov,
        },
        to: {
          position: destination.toArray(),
          target: lookAt.toArray(),
          fov,
        },
        animate: duration > 0,
        phase,
        fromFlat: isGlassEndpoint(startPosition, startTarget, startFov, previousIndex),
        toFlat: isGlassEndpoint(destination, lookAt, fov, index),
        frame: gl.info.render.frame,
      })
      if (duration === 0) installExact(destination, lookAt, fov, phase)
    }

    // A refreshed deep link is restoration, not navigation. A resize without a
    // stage commit is also exact so a fill-screen frame cannot expose a sliver.
    if (firstFrame) {
      installExact(destinationPosition, destinationTarget, destinationFov)
      didInitialize.current = true
      return
    }
    if (!indexChanged && !stageJustCommitted) {
      installExact(
        pendingStage ? occlusionPosition : destinationPosition,
        pendingStage ? occlusionTarget : destinationTarget,
        destinationFov,
        pendingStage ? 'occlude' : 'restore'
      )
      return
    }

    if (pendingStage) {
      splitSchedule.current = null
      const alreadyOccluded = isCoveredEndpoint(
        camera.position,
        activeControls.getTarget(target.current),
        camera.fov
      )
      if (alreadyOccluded) {
        // Threshold slides are already at the exact solved cover point. Commit
        // synchronously with navigation instead of waiting 2–3 render frames
        // for StageDirector to rediscover that fact from projected corners.
        commitPendingStage('already-covered', gl.info.render.frame, {
          exactOcclusionEndpoint: true,
        })
        return
      }
      if (activeFlight) {
        // The presenter advanced while a flight was in progress: preserve that
        // flight's remaining render-clock time for the occlusion leg. Repeated
        // early presses retarget the eventual reveal but do not bypass or
        // restart the occlusion gate from scratch.
        const remaining = Math.max(0, activeFlight.duration - activeFlight.elapsed)
        startFlight(occlusionPosition, occlusionTarget, remaining, 'occlude')
        return
      }
      // ONE MOVE through the glass. The occlude leg and the reveal that follows
      // the commit used to be two independently eased flights, so the camera
      // came to rest on the cover point, the set swapped, and it set off again
      // — a visible stop halfway through what the room reads as a single
      // pull-back (Scott, 2026-09-10: from the decayed synapse to the cubicle
      // desk "not stopping in between"). Now both legs share one smoothstep
      // over the whole path: the occlude leg runs the curve up to the cover
      // point's share of the distance, the reveal leg picks it up where it left
      // off, and velocity is continuous across the commit. A destination that
      // IS the glass (a room shot into a data beat) gets the whole authored
      // duration for its push-in, which is what its smoothTime always meant.
      const legOne = camera.position.distanceTo(occlusionPosition)
      const legTwo = occlusionPosition.distanceTo(destinationPosition)
      const junctionShare = Math.min(1, legOne / Math.max(1e-6, legOne + legTwo))
      const junctionTime = inverseSmoothstep(junctionShare)
      splitSchedule.current = { junctionShare, junctionTime, total: authoredDuration }
      startFlight(
        occlusionPosition,
        occlusionTarget,
        authoredDuration * junctionTime,
        'occlude',
        destinationFov,
        (t) => smoothstep(t * junctionTime) / Math.max(junctionShare, 1e-6)
      )
      return
    }

    // StageDirector has just committed displayStage while the glass covers the
    // frame. Only now may the destination reveal begin — on the second half of
    // the shared curve if this flight was split, otherwise (same-stage and
    // nonlocal navigation) as the usual authored-duration flight.
    const schedule = splitSchedule.current
    splitSchedule.current = null
    if (stageJustCommitted && schedule && schedule.junctionShare < 1 - 1e-4) {
      const { junctionShare, junctionTime, total } = schedule
      startFlight(
        destinationPosition,
        destinationTarget,
        total * (1 - junctionTime),
        'reveal',
        destinationFov,
        (t) =>
          (smoothstep(junctionTime + t * (1 - junctionTime)) - junctionShare) /
          (1 - junctionShare)
      )
      return
    }
    if (stageJustCommitted && schedule) {
      // The destination was the glass itself: the occlude leg already flew the
      // whole way, so the reveal is exact.
      startFlight(destinationPosition, destinationTarget, 0, 'reveal')
      return
    }
    startFlight(destinationPosition, destinationTarget, authoredDuration, 'reveal')
  }

  useFrame((_, delta) => {
    // Read navigation/runtime stores exactly once on the render clock. Do not
    // also subscribe imperatively: a stage declaration can synchronously commit
    // displayStage while Zustand is still notifying navigation listeners. The
    // duplicate callback then sees an "unchanged" destination and restores it
    // exactly, collapsing a 2.4s reveal into a one-frame cut. One render-clock
    // owner preserves ordering and still responds within the first frame.
    const index = useStore.getState().index
    const pendingStage = usePresentationRuntime.getState().pendingStage
    const resized =
      viewport.current.width !== size.width ||
      viewport.current.height !== size.height
    if (
      !didInitialize.current ||
      lastIndex.current !== index ||
      lastPendingStage.current !== pendingStage ||
      resized
    ) {
      viewport.current = { width: size.width, height: size.height }
      configureFlight(index, pendingStage)
    }

    const current = flight.current
    const activeControls = controls.current
    if (!current || !activeControls) return

    current.elapsed = Math.min(current.duration, current.elapsed + delta)
    const progress =
      current.duration <= 0 ? 1 : current.elapsed / current.duration
    // Cubic smoothstep leaves both endpoints at zero velocity while producing
    // visible motion on the first rendered frame. The previous quintic curve's
    // near-zero opening acceleration made a healthy transition look delayed for
    // 50–60ms even though frames were being delivered on time. A flight split
    // by a stage swap carries its share of one curve instead (see
    // configureFlight), so the two legs read as a single move.
    const eased = Math.min(1, Math.max(0, current.curve(progress)))
    position.current.lerpVectors(
      current.startPosition,
      current.destinationPosition,
      eased
    )
    target.current.lerpVectors(
      current.startTarget,
      current.destinationTarget,
      eased
    )
    camera.fov = THREE.MathUtils.lerp(
      current.startFov,
      current.destinationFov,
      eased
    )
    camera.updateProjectionMatrix()
    activeControls.setLookAt(...position.current, ...target.current, false)
    updateCameraTransition(current.index, current.elapsed, gl.info.render.frame)

    if (progress >= 1) flight.current = null
  })

  // Dev handles for framing work, alongside __deck / __crt / __scene.
  useEffect(() => {
    if (import.meta.env.DEV) {
      window.__cam = camera
      window.__controls = controls.current
    }
  }, [camera])

  return <CameraControls ref={controls} makeDefault smoothTime={0.25} />
}
