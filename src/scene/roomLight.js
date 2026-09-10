/**
 * The room's light level: 1 as authored, 0 with only the screen left on.
 *
 * A slide sets `lights` and RoomLightRig (Scene.jsx) eases toward it over the
 * slide's smoothTime, exactly as the tube parameters ease. The value lives
 * here rather than in React state because everything that follows it — the
 * room lights, the environment, the baked bounce — reads it on the render
 * clock, every frame, and none of them should re-render to do so.
 *
 * The SCREEN's light is the other dial: 1 while the tube carries a picture,
 * 0 once a session has shut it off (the close), and a little again when the
 * last words type on the dead glass. CRTScreen publishes it from the step it
 * is painting; the screen rectangle, its local fill, the environment's screen
 * bounce and the baked irradiance's screen share all read it here, so the
 * room can actually go dark when the tube does.
 */
let level = 1
let glow = 1

export function setRoomLightLevel(next) {
  if (!Number.isFinite(next)) throw new TypeError(`room light level must be a number, got ${next}`)
  level = Math.min(1, Math.max(0, next))
}

export function roomLightLevel() {
  return level
}

export function setScreenGlow(next) {
  if (!Number.isFinite(next)) throw new TypeError(`screen glow must be a number, got ${next}`)
  glow = Math.min(1, Math.max(0, next))
}

export function screenGlow() {
  return glow
}
