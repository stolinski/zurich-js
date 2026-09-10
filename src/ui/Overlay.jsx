import { useStore } from '../state/useStore.js'
import { slides } from '../slides/index.js'
import { TalkTimer } from './TalkTimer.jsx'

/**
 * Presenter chrome, and nothing else.
 *
 * The previous deck floated all its readable content here as real DOM over the
 * canvas. This talk has none: every legible thing is drawn into the screen's
 * canvas texture and lives inside the 3D scene (PLAN.md §2 rule 2). So all that
 * survives is a clock for the person driving, a position counter, and an
 * opt-in readout.
 *
 * The clock (top-left) and the counter (top-right, `n / N`) are always on —
 * two small dim numbers the presenter has to be able to glance at from the
 * lectern (Scott, 2026-09-10, for the counter; see TalkTimer.jsx for the
 * clock). The fuller readout — slide id and the step within a session — stays
 * behind `?hud`, bottom-right, for rehearsal.
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
      <span className="counter">
        {index + 1} / {count}
      </span>
      {SHOW_HUD && (
        <footer className="hud">
          <span>
            {slides[index]?.id ?? index}
            {slides[index]?.session && ` · ${step + 1}/${slides[index].session.length}`}
          </span>
        </footer>
      )}
    </>
  )
}
