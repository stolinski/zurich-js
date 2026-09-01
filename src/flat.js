/**
 * `?flat` — author the talk without booting the 3D.
 *
 * The screen's content is a 2D canvas, and in flat mode that canvas is painted
 * straight to the page: no Three, no R3F, no WebGL context, no shader compile,
 * no fans. Same sessions, same painter, same fonts, same keyboard nav — so what
 * you write here is exactly what ends up on the glass.
 *
 * What you DON'T get is the tube (curvature, raster, phosphor mask, halation)
 * or any camera move, because those are the 3D. Flat mode is for working on
 * what the screen SAYS; the deck is for what it looks like.
 *
 * It doubles as a stage fallback: if WebGL dies on the projector, `?flat` still
 * gets the cold open on screen, which is the part that has to be legible.
 */
export const FLAT =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('flat')
