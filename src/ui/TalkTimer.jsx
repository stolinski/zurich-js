import { useEffect, useState } from 'react'

/**
 * Presenter clock: how long the talk has been running.
 *
 * Counts up from 0:00 the moment the deck loads and a click resets it, so the
 * routine on stage is: load early, click as you start talking. The start time
 * is kept in localStorage so a mid-talk reload — the `?flat` fallback if WebGL
 * dies on the projector — keeps counting from the same moment instead of
 * handing back 0:00. A start older than STALE_MS is yesterday's rehearsal, not
 * this talk, and is ignored.
 */
const STORAGE_KEY = 'talk-timer-start'
const STALE_MS = 3 * 60 * 60 * 1000

function readStart() {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY))
    if (Number.isFinite(stored) && stored > 0 && Date.now() - stored < STALE_MS) {
      return stored
    }
  } catch (error) {
    console.error('talk timer: could not read the stored start', error)
  }
  return null
}

function writeStart(start) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(start))
  } catch (error) {
    console.error('talk timer: could not store the start', error)
  }
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

export function TalkTimer() {
  const [start, setStart] = useState(() => {
    const stored = readStart()
    if (stored !== null) return stored
    const now = Date.now()
    writeStart(now)
    return now
  })
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(tick)
  }, [])

  const reset = (event) => {
    const fresh = Date.now()
    writeStart(fresh)
    setStart(fresh)
    setNow(fresh)
    // A focused button fires on Enter, which is the deck's session-step key —
    // the click must not leave it focused.
    event.currentTarget.blur()
  }

  return (
    <button className="timer" tabIndex={-1} onClick={reset}>
      {formatElapsed(now - start)}
    </button>
  )
}
