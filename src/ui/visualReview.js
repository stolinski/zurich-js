import { TERMINAL_VISUALS } from '../terminal/visuals.js'

/**
 * `?visual` — a contact sheet for the closed visual catalog.
 *
 * Authoring tool, not part of the talk. A visual has to be judged on the glass
 * long before it earns a slide, and wiring drafts into `slides/index.js` to
 * look at them would churn the deck's structure and its navigation invariant
 * for what is really just a preview.
 *
 * So this walks `terminal/visuals.js` directly and has NO connection to the
 * deck: it never reads or writes the slide store, and it swallows its own
 * arrow keys at capture so deck navigation cannot also react to them. Nothing
 * here can affect what the room sees.
 *
 *   ?flat&visual            first entry in the catalog
 *   ?flat&visual=q-stopping that entry, and arrows walk from there
 *
 * Each visual is handed over as a one-step script, so `playback.js` sees a new
 * content identity per entry and plays the real draw/undraw sweep between
 * them — the choreography is most of what needs judging.
 */

const PARAM = 'visual'

export const REVIEW_IDS = Object.keys(TERMINAL_VISUALS)

/** The requested entry, or null when the deck should render normally. */
export function reviewStartIndex() {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  if (!params.has(PARAM)) return null
  const found = REVIEW_IDS.indexOf(params.get(PARAM) ?? '')
  return found === -1 ? 0 : found
}

/**
 * Walk the catalog with the arrow keys. Returns an unsubscribe function.
 * `onChange` receives the new cursor; the URL is kept in step so a reload or a
 * shared link lands on the same entry.
 */
export function bindReviewNav(getCursor, onChange) {
  const handler = (event) => {
    const forward = event.key === 'ArrowRight' || event.key === ' '
    const back = event.key === 'ArrowLeft'
    if (!forward && !back) return
    // Capture-phase, stopped here: the deck's own nav must never see these.
    event.preventDefault()
    event.stopPropagation()
    const total = REVIEW_IDS.length
    const next = (getCursor() + (forward ? 1 : total - 1)) % total
    const url = new URL(window.location.href)
    url.searchParams.set(PARAM, REVIEW_IDS[next])
    window.history.replaceState(null, '', url)
    onChange(next)
  }
  window.addEventListener('keydown', handler, true)
  return () => window.removeEventListener('keydown', handler, true)
}

/** The catalog entry at `cursor`, shaped as a session the painter understands. */
export function reviewSession(cursor) {
  return {
    script: [{ kind: 'visual', id: REVIEW_IDS[cursor % REVIEW_IDS.length] }],
    step: 0,
    live: true,
  }
}
