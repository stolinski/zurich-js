import { create } from 'zustand'
import { slides } from '../slides/index.js'

/**
 * Single source of truth for which slide we're on.
 * Lives in zustand so state can be shared across the <Canvas> boundary —
 * the CameraRig (inside the canvas) and the Overlay (DOM, outside it) both read it.
 *
 * next/prev are throttled: a single key intent should never advance two slides,
 * even if the keydown double-fires (OS auto-repeat, or duplicate listeners that
 * accrue during HMR). That was causing the Sentry slide to get skipped.
 */
// Short enough to tap through a typing session at a natural rhythm, long
// enough to still swallow a double-fired keydown (those land within ~1 frame).
const NAV_THROTTLE_MS = 160
const clamp = (i) => Math.max(0, Math.min(i, slides.length - 1))

// Persist the current slide in the URL (?slide=<id>) so a refresh or an HMR
// reload restores the beat you were on instead of snapping back to slide 0.
// Read once at store creation; write (via replaceState — no history spam) on
// every index change. The id is preferred (readable, survives reordering); a
// bare integer is accepted as an index fallback.
const SLIDE_PARAM = 'slide'

const indexFromUrl = () => {
  if (typeof window === 'undefined') return 0
  const raw = new URLSearchParams(window.location.search).get(SLIDE_PARAM)
  if (!raw) return 0
  const byId = slides.findIndex((s) => s.id === raw)
  if (byId !== -1) return byId
  const n = Number(raw)
  return Number.isInteger(n) ? clamp(n) : 0
}

const syncUrl = (index) => {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.set(SLIDE_PARAM, slides[index]?.id ?? String(index))
  window.history.replaceState(null, '', url)
}

/** How many Enter-advanced steps the slide at `i` holds. */
const stepsIn = (i) => slides[i]?.session?.length ?? 0

export const useStore = create((set, get) => ({
  index: indexFromUrl(),
  step: 0,
  count: slides.length,
  lastNavAt: 0,
  // Set the moment the presenter drives a step by hand on an autoplaying
  // slide, and cleared on arrival. Without it, backspacing to re-read a line
  // would be immediately undone by the next scheduled tick — the machine and
  // the person would be fighting over the same counter, and the machine has
  // better reflexes. See state/useSessionAutoplay.js.
  handOff: false,

  /**
   * THE ARROWS ONLY EVER MOVE SLIDES.
   *
   * next/prev change the index and nothing else, so one press is always one
   * slide, `?slide=` always describes where you are, the 0–9 jumps land
   * exactly, and prev is the trivial inverse of next. An earlier version let
   * the arrows walk a session's steps and it broke every one of those.
   *
   * Arriving at a slide resets its session to the start — a deck beat should
   * look the same every time you land on it, whichever direction you came
   * from. Performing the typing is `runStep`, below.
   */
  next: () => {
    const t = performance.now()
    if (t - get().lastNavAt < NAV_THROTTLE_MS) return
    set((s) => ({ index: clamp(s.index + 1), step: 0, lastNavAt: t, handOff: false }))
  },
  prev: () => {
    const t = performance.now()
    if (t - get().lastNavAt < NAV_THROTTLE_MS) return
    set((s) => ({ index: clamp(s.index - 1), step: 0, lastNavAt: t, handOff: false }))
  },
  goto: (i) =>
    set({ index: clamp(i), step: 0, lastNavAt: performance.now(), handOff: false }),

  /**
   * Run the next thing in the fake agent — bound to ENTER, because that's the
   * key you'd actually hit at a terminal, and because the presenter needs to
   * drive the demo's rhythm separately from the deck's. Never bound to an
   * arrow: the arrows belong to the slides.
   */
  runStep: () => {
    const t = performance.now()
    const s = get()
    if (t - s.lastNavAt < NAV_THROTTLE_MS) return
    if (s.step >= stepsIn(s.index) - 1) return
    set({ step: s.step + 1, lastNavAt: t, handOff: true })
  },
  /**
   * Advance one step because the SCRIPT said so, not because a key was pressed.
   *
   * Deliberately outside the nav throttle: that guard exists to swallow a
   * double-fired keydown, and a scheduled tick is neither doubled nor a key.
   * Routing autoplay through `runStep` meant a tick landing within 160ms of a
   * slide change was silently dropped, and since the next tick is scheduled
   * from the step it just set, one drop stalled the rest of the session. It
   * also leaves `lastNavAt` alone, so the machine playing a script can never
   * swallow the presenter's own next press.
   */
  advanceAuto: () => {
    const s = get()
    if (s.handOff) return
    if (s.step >= stepsIn(s.index) - 1) return
    set({ step: s.step + 1 })
  },
  undoStep: () => {
    const t = performance.now()
    const s = get()
    if (t - s.lastNavAt < NAV_THROTTLE_MS) return
    if (s.step === 0) return
    set({ step: s.step - 1, lastNavAt: t, handOff: true })
  },
}))

// Keep ?slide= in sync with the active slide (only when the index actually
// changes — the store also bumps lastNavAt on every nav).
useStore.subscribe((s, prev) => {
  if (s.index !== prev.index) syncUrl(s.index)
})

// Dev-only: reach any slide from the console (the 0–9 keys only cover the first
// ten) — handy for rehearsing a single beat or driving screenshots.
//   __deck.gotoId('html-canvas-reveal')   ·   __deck.goto(33)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__deck = {
    store: useStore,
    goto: (i) => useStore.getState().goto(i),
    gotoId: (id) => useStore.getState().goto(slides.findIndex((s) => s.id === id)),
    ids: () => slides.map((s) => s.id),
  }
}
