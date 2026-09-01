/**
 * Deterministic randomness. Every random thing in the deck — where a dust mote
 * starts, how the plastic is worn — is seeded, so the scene is identical on
 * every reload. A talk you rehearse has to look the same on stage as it did in
 * practice.
 */

/** Small, fast, well-distributed PRNG. Returns a [0,1) generator. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
