import { create } from 'zustand'
import { STAGE_IDS } from '../presentation/stages.js'
import { slides } from '../slides/index.js'
import { useStore } from './useStore.js'

export const PRESENTATION_STAGES = STAGE_IDS

const stageForIndex = (index) => slides[index]?.stage ?? 'home'
const durationForIndex = (index) => slides[index]?.camera?.smoothTime ?? 1
const eventTime = () =>
  typeof performance === 'undefined' ? Date.now() : performance.now()
const appendEvent = (events, event, limit = 96) =>
  [...events.slice(-(limit - 1)), { t: eventTime(), ...event }]

const initialIndex = useStore.getState().index
const initialStage = stageForIndex(initialIndex)
const initialDuration = durationForIndex(initialIndex)
const initialFlat = Boolean(slides[initialIndex]?.camera?.fillScreen)

/**
 * Runtime presentation state, separate from navigation/session state.
 *
 * `declaredStage` says what the active slide requests. `displayStage` is the
 * single authority for every rendered stage-dependent system and changes only
 * when StageDirector knows the swap is hidden. Keeping these separate prevents
 * a destination slide from changing the old set's light before its geometry is
 * allowed to change.
 */
export const usePresentationRuntime = create(() => ({
  declaredIndex: initialIndex,
  declaredStage: initialStage,
  displayStage: initialStage,
  pendingStage: null,
  stageRevision: 0,
  stageEvents: [
    {
      t: eventTime(),
      type: 'initial',
      index: initialIndex,
      declaredStage: initialStage,
      displayStage: initialStage,
    },
  ],
  transition: {
    index: initialIndex,
    duration: initialDuration,
    elapsed: initialDuration,
    progress: 1,
    settled: true,
    phase: 'restore',
    fromFlat: initialFlat,
    toFlat: initialFlat,
    from: null,
    to: null,
    startedFrame: null,
    settledFrame: null,
  },
  warmup: {
    stages: Object.fromEntries(PRESENTATION_STAGES.map((stage) => [stage, false])),
    post: false,
    shadows: false,
    evidence: {
      stages: {},
      post: null,
      shadows: null,
    },
    ready: false,
    readyAt: null,
  },
  shadowEvents: [],
}))

/**
 * Navigation updates declared and immediately-safe displayed state in one
 * external-store transaction. React therefore cannot commit a frame where one
 * stage consumer has observed the destination while another still has the old
 * value.
 */
function applySlideNavigation(index, previousIndex) {
  const declaredStage = stageForIndex(index)
  const jump = Math.abs(index - previousIndex) > 1

  usePresentationRuntime.setState((state) => {
    let displayStage = state.displayStage
    let pendingStage = null
    let stageRevision = state.stageRevision
    let type = 'declared'
    let reason = 'same-stage'

    if (declaredStage !== state.displayStage) {
      if (jump) {
        displayStage = declaredStage
        stageRevision += 1
        type = 'display-commit'
        reason = 'nonlocal-jump'
      } else {
        // Every adjacent context change is pending, in either direction. The
        // URL/index still changes synchronously; CameraRig routes through the
        // glass and StageDirector alone is allowed to commit displayStage once
        // the old scenery is fully occluded.
        pendingStage = declaredStage
        type = 'display-pending'
        reason = 'adjacent-stage-change'
      }
    }

    return {
      declaredIndex: index,
      declaredStage,
      displayStage,
      pendingStage,
      stageRevision,
      stageEvents: appendEvent(state.stageEvents, {
        type,
        reason,
        index,
        declaredStage,
        displayStage,
      }),
    }
  })
}

const unsubscribeNavigation = useStore.subscribe((state, previous) => {
  if (state.index !== previous.index) {
    applySlideNavigation(state.index, previous.index)
  }
})

if (import.meta.hot) {
  import.meta.hot.dispose(unsubscribeNavigation)
}

export function commitPendingStage(
  reason = 'glass-covered',
  frame = null,
  evidence = null
) {
  usePresentationRuntime.setState((state) => {
    if (!state.pendingStage) return state
    const displayStage = state.pendingStage
    return {
      displayStage,
      pendingStage: null,
      stageRevision: state.stageRevision + 1,
      stageEvents: appendEvent(state.stageEvents, {
        type: 'display-commit',
        reason,
        frame,
        index: state.declaredIndex,
        declaredStage: state.declaredStage,
        displayStage,
        evidence,
      }),
    }
  })
}

export function beginCameraTransition({
  index,
  duration,
  from,
  to,
  animate,
  phase = animate ? 'direct' : 'restore',
  fromFlat = false,
  toFlat = false,
  frame = null,
}) {
  usePresentationRuntime.setState({
    transition: {
      index,
      duration,
      elapsed: animate ? 0 : duration,
      progress: animate ? 0 : 1,
      settled: !animate,
      phase,
      fromFlat,
      toFlat,
      from,
      to,
      startedFrame: frame,
      settledFrame: animate ? null : frame,
    },
  })
}

export function updateCameraTransition(index, elapsed, frame = null) {
  usePresentationRuntime.setState((state) => {
    const current = state.transition
    if (current.index !== index || current.settled) return state
    const boundedElapsed = Math.min(current.duration, elapsed)
    const progress =
      current.duration <= 0 ? 1 : Math.min(1, boundedElapsed / current.duration)
    const settled = progress >= 1
    return {
      transition: {
        ...current,
        elapsed: boundedElapsed,
        progress,
        settled,
        settledFrame: settled ? frame : null,
      },
    }
  })
}

function updateWarmup(change) {
  usePresentationRuntime.setState((state) => {
    const warmup = { ...state.warmup, ...change }
    const stageEvidenceReady = PRESENTATION_STAGES.every(
      (stage) => warmup.evidence.stages[stage]?.rendered === true
    )
    const ready =
      warmup.post &&
      warmup.shadows &&
      stageEvidenceReady &&
      warmup.evidence.post?.rendered === true &&
      warmup.evidence.shadows?.complete === true &&
      PRESENTATION_STAGES.every((stage) => warmup.stages[stage])
    if (ready && !state.warmup.ready) warmup.readyAt = eventTime()
    warmup.ready = ready
    return { warmup }
  })
}

export function markStageWarmed(stage, evidence) {
  if (!PRESENTATION_STAGES.includes(stage) || evidence?.rendered !== true) return
  const state = usePresentationRuntime.getState()
  if (state.warmup.stages[stage]) return
  updateWarmup({
    stages: { ...state.warmup.stages, [stage]: true },
    evidence: {
      ...state.warmup.evidence,
      stages: { ...state.warmup.evidence.stages, [stage]: evidence },
    },
  })
}

export function markPostWarmed(evidence) {
  if (evidence?.rendered !== true) return
  const state = usePresentationRuntime.getState()
  if (state.warmup.post) return
  updateWarmup({
    post: true,
    evidence: { ...state.warmup.evidence, post: evidence },
  })
}

export function markShadowWarmupComplete(evidence) {
  if (evidence?.complete !== true) return
  const state = usePresentationRuntime.getState()
  if (state.warmup.shadows) return
  updateWarmup({
    shadows: true,
    evidence: { ...state.warmup.evidence, shadows: evidence },
  })
}

export function recordShadowEvent(event) {
  usePresentationRuntime.setState((state) => ({
    shadowEvents: appendEvent(state.shadowEvents, event),
  }))
}

export function qualityDiagnosticsEnabled() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('quality')
}
