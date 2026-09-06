import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'

/**
 * Caps the render loop at `fps`. The stage is a 60 Hz projector, and a
 * ProMotion laptop panel asks for 120 frames a second — twice the GPU work
 * for motion the show can never have (the deck is GPU-bound: a settled
 * slide keeps Chrome's GPU process at 99%).
 *
 * R3F's own loop renders on every animation frame, so this takes the loop
 * over (`frameloop: 'never'`) and calls `advance` only when a full frame
 * interval has passed since the last render. On a 60 Hz display every
 * frame qualifies and nothing changes; on 120 Hz every other frame is
 * skipped. Everything animated in the deck eases on the real elapsed time
 * (`useFrame`'s delta), so a skipped frame moves the picture the same
 * distance as two rendered ones.
 *
 * In manual-advance mode R3F derives that delta from the timestamp handed
 * to `advance` (`timestamp - clock.elapsedTime`), in whatever unit it is
 * given. Animation-frame timestamps are milliseconds and every `useFrame`
 * in the deck expects seconds, so the loop advances in seconds, and seeds
 * the clock one frame behind the first timestamp so the first delta is a
 * frame rather than the time since page load.
 *
 * The tolerance absorbs vsync jitter: two 60 Hz frames can arrive 15.9 ms
 * apart, and treating that as "too soon" would drop a frame the display
 * had room for.
 */
export function FrameCap({ fps = 60 }) {
  const advance = useThree((state) => state.advance)
  const setFrameloop = useThree((state) => state.setFrameloop)
  const clock = useThree((state) => state.clock)

  useEffect(() => {
    setFrameloop('never')
    const interval = 1000 / fps
    const tolerance = 2
    let last = -Infinity
    let handle = 0
    const loop = (timestamp) => {
      handle = requestAnimationFrame(loop)
      if (timestamp - last < interval - tolerance) return
      if (last === -Infinity) clock.elapsedTime = (timestamp - interval) / 1000
      last = timestamp
      advance(timestamp / 1000)
    }
    handle = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(handle)
      setFrameloop('always')
    }
  }, [advance, clock, fps, setFrameloop])

  return null
}
