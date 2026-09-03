/**
 * The room's light level: 1 as authored, 0 with only the screen left on.
 *
 * A slide sets `lights` and RoomLightRig (Scene.jsx) eases toward it over the
 * slide's smoothTime, exactly as the tube parameters ease. The value lives
 * here rather than in React state because everything that follows it — the
 * room lights, the environment, the baked bounce — reads it on the render
 * clock, every frame, and none of them should re-render to do so.
 */
let level = 1

export function setRoomLightLevel(next) {
  if (!Number.isFinite(next)) throw new TypeError(`room light level must be a number, got ${next}`)
  level = Math.min(1, Math.max(0, next))
}

export function roomLightLevel() {
  return level
}
