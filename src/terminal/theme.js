/**
 * The screen's palette and metrics.
 *
 * Palette is lifted from the gfx-computer `crt-terminal` Pack, and so is its
 * rule: ONE hue, hierarchy is intensity — how hard the phosphor is driven,
 * never a second colour. Alerts are brighter green, not red. Keeping that
 * discipline is most of why this reads as a screen rather than a webpage.
 *
 * Type is JetBrains Mono at a real weight, NOT a bitmap/pixel face. Their
 * aesthetic doc is right about this: pixel faces read retro-game at 4K and
 * fall apart on long body text. The period feel comes from the tube shader —
 * the glow, the raster, the halation — never from the letterforms.
 */

/**
 * Excitation ladder: unlit glass → fully driven phosphor.
 *
 * AMBER, matched to the survey site (ai-health.syntax.fm --accent: #ffd54a) so
 * the talk and the published charts share one identity — and P3 amber is a
 * real phosphor chemistry, which also steps the deck away from the green
 * Matrix cliché ART-DIRECTION forbids. One hue, hierarchy is intensity.
 *
 * The lower rungs are floored for PROJECTION, not for an authoring display. A
 * conference projector with ambient light crushes roughly the bottom 20/255
 * into black and washes the rest, so ghost/dim must sit high enough to survive
 * that — chrome that vanishes on stage leaves the harness looking amputated.
 */
export const PHOSPHOR = {
  glass: '#0b0a06',
  ghost: '#4a3f16',
  dim: '#ad8c2c',
  phosphor: '#ffd54a',
  hot: '#fff2cd',
}

/**
 * What each part of the fake agent harness is driven at. Everything is a step on
 * the ladder above — that's the whole colour system.
 */
export const ROLE = {
  marker: PHOSPHOR.hot, // the ❯ prompt marker
  user: PHOSPHOR.hot, // what Scott types
  agent: PHOSPHOR.phosphor, // the agent's prose
  tool: PHOSPHOR.dim, // tool calls, paths, counts
  meta: PHOSPHOR.ghost, // rules, borders, chrome
  emphasis: PHOSPHOR.hot, // the number the slide is about
  add: PHOSPHOR.phosphor, // diff +
  remove: PHOSPHOR.ghost, // diff −
}

/**
 * Screen geometry. The texture is authored at 2560×1440 — comfortably over any
 * projector, and enough that the shadow mask still has real structure to fly
 * into when the camera pushes through the glass.
 *
 * 16:9 deliberately: in the cold open the glass fills the projector exactly
 * edge to edge, so there is no letterbox to give away that it's a plane in a
 * 3D scene. (The tube gets its 4:3-ish character from the shader's barrel warp
 * and bezel once it's revealed, not from the texture's shape.)
 *
 * 80 columns is the "screen recording with just larger text" look: a normal
 * terminal width, but each glyph is huge on a 1080p projector.
 */
export const TERMINAL = {
  width: 2560,
  height: 1440,
  cols: 80,
  // Keep all legible harness content inside a generous CRT/projector title-safe
  // area. `fillScreen` deliberately covers non-16:9 viewports and the tube warp
  // consumes more edge area, so normal terminal padding is not enough here.
  padX: 176,
  padY: 250,
  lineHeightRatio: 1.5,
  // JetBrains Mono's advance width as a fraction of em. Used to pick a font
  // size that lands exactly `cols` characters across the usable width, so the
  // character grid is pixel-aligned and the raster never beats against it.
  advanceRatio: 0.6,
  family: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
}

const usableWidth = TERMINAL.width - TERMINAL.padX * 2
export const CHAR_W = usableWidth / TERMINAL.cols
export const FONT_SIZE = Math.round(CHAR_W / TERMINAL.advanceRatio)
export const LINE_H = Math.round(FONT_SIZE * TERMINAL.lineHeightRatio)
export const ROWS = Math.floor((TERMINAL.height - TERMINAL.padY * 2) / LINE_H)

/**
 * Safe area for wrapped prose, in columns.
 *
 * The grid is 80 wide, but content must not USE all 80. Two things eat the
 * outer edge once the tube is on:
 *   • the barrel warp overscans — a real CRT never showed you its last few
 *     percent either, which is exactly why broadcast had a title-safe area;
 *   • at an oblique camera the far edge foreshortens into almost nothing, so
 *     the last characters compress to a few pixels and are effectively gone.
 *
 * Short lines (tool output, chrome) are fine at full width because they never
 * get near the edge. It's the wrapped prose that has to be reined in.
 */
export const SAFE_COLS = TERMINAL.cols - 6

/** CSS font shorthand for a weight, e.g. font(600) → '600 51px "JetBrains Mono", …'. */
export const font = (weight = 400) => `${weight} ${FONT_SIZE}px ${TERMINAL.family}`

/**
 * Resolves once JetBrains Mono is actually available. Text measurement before
 * the face loads silently falls back to a different metric, so the first paint
 * has to wait — otherwise the grid shifts under you a beat into the talk.
 */
export function ensureFonts() {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve()
  return Promise.all([
    document.fonts.load(font(400), 'M'),
    document.fonts.load(font(500), 'M'),
    document.fonts.load(font(700), 'M'),
  ]).then(() => document.fonts.ready)
}
