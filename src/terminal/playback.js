/**
 * Playback semantics for the fake agent harness, in one place.
 *
 * Two very different renderers drive the same session: the 3D tube
 * (scene/CRTScreen.jsx) and the no-WebGL authoring mode (ui/FlatScreen.jsx).
 * They must agree exactly on which session is showing, which step it's on and
 * how far through that step it is — otherwise what you author in flat mode
 * isn't what the room sees. So none of that logic lives in either component.
 *
 * Pure functions; `slideList` is passed in rather than imported so this layer
 * stays ignorant of the talk's structure.
 */

import { buildFrame, stepDuration } from './session.js'
import { paintTerminal } from './paint.js'

/**
 * Which session should be on the glass right now.
 *
 * A slide with a `session` plays live at whatever step Enter has reached. A
 * slide WITHOUT one (the reveal, the room, anything after) falls back to the
 * most recent session before it, played to its end — the transcript stays up
 * while the camera moves. Resolved from the slide list rather than remembered
 * from playback, so deep-linking (`?slide=…`, or the 0–9 jump keys) never lands
 * on a dead screen.
 *
 * @returns {{script: object[], step: number, live: boolean}|null}
 */
export function resolveSession(slideList, index, step) {
  const here = slideList[index]?.session
  if (here) return { script: here, step: Math.min(step, here.length - 1), live: true }
  for (let i = index - 1; i >= 0; i--) {
    const script = slideList[i]?.session
    if (script) return { script, step: script.length - 1, live: false }
  }
  return null
}

/** How far through the current step, 0→1. A held transcript is always complete. */
export function sessionProgress(showing, elapsed) {
  if (!showing?.live) return 1
  const step = showing.script[Math.min(showing.step, showing.script.length - 1)]
  return Math.min(1, elapsed / stepDuration(step))
}

/**
 * Paint one frame. `elapsed` is seconds into the current step; `time` is a
 * free-running clock (caret blink, spinners) that keeps going even when the
 * transcript is held, because a monitor whose cursor has stopped blinking
 * reads as a photograph of a monitor.
 */
export function paintSession(ctx, showing, elapsed, time, options) {
  if (!showing) return null
  const frame = buildFrame(showing.script, showing.step, sessionProgress(showing, elapsed), time)
  paintTerminal(ctx, frame, time, options)
  return frame
}

/* ───────────────────── content draw / undraw ─────────────────────
 * Slide navigation never CUTS the glass to new content. The screen undraws
 * what it was showing — a raster wipe sweeping down, erasing behind a hot
 * scan edge — then draws the next content in behind a second sweep, charts
 * growing their elements as the beam passes. It is the machine repainting its
 * buffer, which is both the period behavior and the transition language.
 *
 * Enter-driven steps within one session are NOT wipes — typing and streaming
 * already are that transition. Only a change of the resolved content identity
 * (a different script, or a different single visual) sweeps.
 *
 * Deep links and reloads initialize steady: a settled slide is pixel-identical
 * whether arrived at or loaded directly, per the deterministic-arrival rule.
 * Both renderers (tube and ?flat) drive this from their own frame clocks, so
 * the choreography is deterministic and cannot drift between them.
 */

export const UNDRAW_SECONDS = 0.42
export const DRAW_SECONDS = 0.78

function contentIdentity(showing) {
  if (!showing) return null
  const step = showing.script[Math.min(showing.step, showing.script.length - 1)]
  if (step?.kind === 'visual' && showing.script.length === 1) {
    return `visual:${step.id}`
  }
  return showing.script
}

/**
 * Per-renderer transition state. `update(showing, time)` returns what to paint
 * this frame: `{ phase, showing, reveal }`, where `reveal` is null once steady
 * and `{ mode: 'out' | 'in', progress }` while sweeping.
 */
export function createContentTransition() {
  let initialized = false
  let currentIdentity = null
  let currentShowing = null
  let previousShowing = null
  let phase = 'steady'
  let phaseStart = 0

  return {
    update(showing, time) {
      const identity = contentIdentity(showing)
      if (!initialized) {
        initialized = true
        currentIdentity = identity
        currentShowing = showing
        return { phase: 'steady', showing, reveal: null }
      }

      if (identity !== currentIdentity) {
        // Undraw whatever the glass holds right now — mid-sweep interruptions
        // erase the partially drawn frame, exactly like a real repaint.
        previousShowing = currentShowing
          ? { ...currentShowing, live: false }
          : null
        currentIdentity = identity
        currentShowing = showing
        phase = previousShowing ? 'undraw' : 'draw'
        phaseStart = time
      } else {
        currentShowing = showing
      }

      if (phase === 'undraw') {
        const progress = (time - phaseStart) / UNDRAW_SECONDS
        if (progress < 1) {
          return {
            phase,
            showing: previousShowing,
            reveal: { mode: 'out', progress },
          }
        }
        phase = 'draw'
        phaseStart = time
      }

      if (phase === 'draw') {
        const progress = (time - phaseStart) / DRAW_SECONDS
        if (progress < 1) {
          return { phase, showing, reveal: { mode: 'in', progress } }
        }
        phase = 'steady'
      }

      return { phase: 'steady', showing, reveal: null }
    },
  }
}
