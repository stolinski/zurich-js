import { useEffect, useRef } from 'react'
import { TERMINAL, ensureFonts } from '../terminal/theme.js'
import { clearWrapCache } from '../terminal/session.js'
import { ensureTerminalAssets } from '../terminal/assets.js'
import {
  createContentTransition,
  paintSession,
  resolveSession,
} from '../terminal/playback.js'
import {
  chartRowAt,
  coverPointToTexture,
  setHoveredChartRow,
} from '../terminal/hover.js'
import { useStore } from '../state/useStore.js'
import { slides } from '../slides/index.js'
import { bindReviewNav, reviewSession, reviewStartIndex } from './visualReview.js'

/**
 * The `?flat` renderer — the screen's canvas, painted straight to the page.
 *
 * No Three, no R3F, no WebGL. Just the same session painter the tube uses, at
 * the same authored resolution, so this is pixel-for-pixel what ends up on the
 * glass — minus the tube itself. See flat.js.
 *
 * The canvas keeps its intrinsic 2560×1440 and CSS `object-fit: cover` fits it
 * to the viewport, which matches how CameraRig frames the real screen in the
 * cold open (cover, never letterbox).
 *
 * State is read from the store inside the loop rather than subscribed to, so a
 * tap never restarts the animation clock.
 */
export function FlatScreen() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })

    let raf = 0
    let ready = false
    let last = performance.now()
    let time = 0
    let elapsed = 0
    let lastKey = ''
    // Same sweep semantics as the tube — flat mode is a faithful preview.
    const contentTransition = createContentTransition()

    // `?visual` walks the catalog instead of the deck. See ui/visualReview.js.
    let reviewCursor = reviewStartIndex()
    const unbindReview =
      reviewCursor === null
        ? null
        : bindReviewNav(
            () => reviewCursor,
            (next) => {
              reviewCursor = next
            }
          )

    // Measuring before JetBrains Mono lands silently uses fallback metrics and
    // the grid shifts a beat in. Hold the first paint.
    Promise.all([ensureFonts(), ensureTerminalAssets()]).then(() => {
      clearWrapCache()
      ready = true
    })

    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      // Clamp so a backgrounded tab doesn't fast-forward a whole step on return.
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      time += dt
      if (!ready) return

      const { index, step, answers } = useStore.getState()
      const review = reviewCursor !== null
      const key = review ? `review:${reviewCursor}` : `${index}:${step}`
      if (key !== lastKey) {
        lastKey = key
        elapsed = 0
      }
      const resolved = review
        ? reviewSession(reviewCursor)
        : resolveSession(slides, index, step)
      const showing = resolved ? { ...resolved, answers } : null
      if (showing?.live) elapsed += dt
      const view = contentTransition.update(showing, time)
      paintSession(ctx, view.showing ?? showing, elapsed, time, {
        drawCaret: view.phase === 'steady',
        reveal: view.reveal,
      })
    }

    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      unbindReview?.()
    }
  }, [])

  // Chart hover, same shared state the tube drives — one pointer, one row. The
  // loop above repaints every frame, so there is nothing to invalidate here.
  const trackPointer = (event) => {
    const canvas = ref.current
    if (!canvas) return
    const { x, y } = coverPointToTexture(
      canvas.getBoundingClientRect(),
      event.clientX,
      event.clientY,
      TERMINAL.width,
      TERMINAL.height
    )
    setHoveredChartRow(chartRowAt(x, y))
  }

  return (
    <canvas
      ref={ref}
      className="flat-screen"
      width={TERMINAL.width}
      height={TERMINAL.height}
      onPointerMove={trackPointer}
      onPointerLeave={() => setHoveredChartRow(null)}
    />
  )
}
