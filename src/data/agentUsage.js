/**
 * Scripted personal usage shown in the opening agent exchange.
 * This is rehearsal copy, not survey data; keeping it here prevents the
 * transcript and its terminal chart from drifting apart.
 */
export const AGENT_WEEK = Object.freeze({
  sessions: 61,
  activeMinutes: 38 * 60 + 12,
  afterMidnightMinutes: 14 * 60,
})

export function formatUsageDuration(minutes) {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours} hours ${remainder} minutes` : `${hours} hours`
}
