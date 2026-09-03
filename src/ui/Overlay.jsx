import { useStore } from '../state/useStore.js'
import { slides } from '../slides/index.js'
import { TalkTimer } from './TalkTimer.jsx'

/**
 * Presenter chrome, and nothing else.
 *
 * The previous deck floated all its readable content here as real DOM over the
 * canvas. This talk has none: every legible thing is drawn into the screen's
 * canvas texture and lives inside the 3D scene (PLAN.md §2 rule 2). So all that
 * survives is a clock for the person driving, and a position readout.
 *
 * The position readout is HIDDEN BY DEFAULT. A slide counter in the corner
 * during the cold open tells the room they're watching a deck, which is the
 * one thing the opening cannot afford. Add `?hud` to the URL when rehearsing.
 * The clock is always on — one small dim number the presenter has to be able
 * to glance at from the lectern (see TalkTimer.jsx).
 */
const SHOW_HUD =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('hud')

export function Overlay() {
  const index = useStore((s) => s.index)
  const step = useStore((s) => s.step)
  const count = useStore((s) => s.count)

  return (
    <>
      <TalkTimer />
      {SHOW_HUD && (
        <footer className="hud">
          <span>
            {slides[index]?.id ?? index} · {index + 1}/{count}
            {slides[index]?.session && ` · ${step + 1}/${slides[index].session.length}`}
          </span>
        </footer>
      )}
    </>
  )
}
