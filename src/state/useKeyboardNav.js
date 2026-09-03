import { useEffect } from 'react'
import { useStore } from './useStore.js'

/**
 * Keyboard-driven, deterministic navigation — the only safe way to drive a talk.
 *
 *   → / ←            SLIDES, and only slides. Every press moves exactly one.
 *   Enter            run the next thing in the fake agent (types a line, fires
 *                    a tool call, streams an answer). Backspace undoes it.
 *   y / n            answer the question on the glass (the grill); nothing
 *                    happens anywhere else
 *   0-9              jump straight to a slide (great for Q&A)
 *   f                fullscreen
 *
 * The split matters: performing the demo and advancing the deck are two
 * different jobs and they need two different keys. Enter is the one you'd hit
 * at a real terminal, so the gesture matches what the audience is watching.
 *
 * Space is deliberately NOT bound. On a remote clicker it usually maps to the
 * same button as the right arrow, and a presenter who thinks they're advancing
 * a slide while actually running a tool call is a bad afternoon.
 */
export function useKeyboardNav() {
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return // ignore held-key auto-repeat
      const { next, prev, goto, runStep, undoStep, answer } = useStore.getState()
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        prev()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        runStep()
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        undoStep()
      } else if (/^[0-9]$/.test(e.key)) {
        goto(Number(e.key))
      } else if (e.key === 'y' || e.key === 'n') {
        answer(e.key === 'y' ? 'yes' : 'no')
      } else if (e.key === 'f') {
        document.documentElement.requestFullscreen?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
