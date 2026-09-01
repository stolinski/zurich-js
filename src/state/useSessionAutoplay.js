import { useEffect } from 'react'
import { stepDuration } from '../terminal/session.js'
import { slides } from '../slides/index.js'
import { useStore } from './useStore.js'

/**
 * Plays an `autoplay` slide's session by itself, instead of on Enter.
 *
 * The cold-open exchange is not a demo the presenter performs — it is the
 * machine working while Scott talks over it, and asking him to tap Enter seven
 * times to keep a conversation moving puts his hand on a keyboard during the
 * one beat where the audience is supposed to forget there is a deck. Beats that
 * ARE performed keep their key; this is opt-in per slide.
 *
 * ── Timing ──
 * A step is `stepDuration` to play out plus a DWELL before the next one starts.
 * The dwell is the whole design: back-to-back durations run the exchange in
 * eight seconds flat, which is legible to nobody, because a real exchange has
 * silence in it — a pause after a question lands, a longer one after the answer
 * that the room is meant to actually read. Both halves come from the same
 * `stepDuration` the painters use, so the schedule can never drift from what is
 * being drawn.
 *
 * ── Determinism ──
 * Every interval is authored, nothing is random, and both renderers time each
 * step from the moment the store changed it. What you rehearse is what the room
 * sees, and arriving by deep link plays the same as arriving by arrow.
 *
 * ── Handing back ──
 * One press of Enter or Backspace stops the timer for that visit (`handOff`),
 * so the presenter can always take the exchange back — to hold on a line, or to
 * step back and re-read one — without the schedule dragging them forward again.
 * Leaving the slide and returning starts it clean.
 */

/** Seconds of silence after a step has finished playing, by kind. */
const DWELL = {
  // A banner is furniture; it should not hold the room up.
  note: 0.4,
  // Scott's line has landed and the agent has not started yet. This is the
  // beat that makes it read as a conversation rather than a paste.
  user: 0.55,
  tool: 0.5,
  // The answer. Longest by a distance, because it is the only step here whose
  // CONTENT the audience has to finish reading before the next thing moves.
  say: 1.7,
  think: 0.35,
  gap: 0.25,
}
const DEFAULT_DWELL = 0.4

export function useSessionAutoplay() {
  const index = useStore((s) => s.index)
  const step = useStore((s) => s.step)
  const handOff = useStore((s) => s.handOff)

  useEffect(() => {
    const slide = slides[index]
    if (!slide?.autoplay || !slide.session || handOff) return undefined
    if (step >= slide.session.length - 1) return undefined

    const current = slide.session[step]
    const delay = (stepDuration(current) + (DWELL[current.kind] ?? DEFAULT_DWELL)) * 1000
    const timer = setTimeout(() => useStore.getState().advanceAuto(), delay)
    return () => clearTimeout(timer)
  }, [handOff, index, step])
}
