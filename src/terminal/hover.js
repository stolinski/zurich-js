/**
 * Which chart row the pointer is over.
 *
 * A presenter pointing at a bar is the one live interaction this deck wants:
 * standing at a lectern saying "this row" while thirty rows sit at identical
 * brightness asks the room to find it, and they will still be looking for it
 * when the next sentence arrives. Highlighting where the cursor is answers
 * that in the one currency the glass has — intensity.
 *
 * Module state rather than component state, for the same reason `playback.js`
 * is: the tube and the `?flat` renderer paint the SAME canvas layout from two
 * independent frame clocks, and a hover that lived in either one could show a
 * different row from the other. There is exactly one pointer.
 *
 * `regions` is a byproduct of painting — the chart painters record the row
 * rectangles they just drew, in texture pixels — so hit-testing never
 * re-derives a layout that could drift from the one on screen. Row rectangles
 * do not depend on the draw sweep's progress (only the BAR inside a row grows),
 * so this stays correct mid-transition.
 */

let regions = []
let hovered = null

/** Called by the painter with the rows it drew, every frame. */
export function recordChartRegions(next) {
  regions = next ?? []
}

export function hoveredChartRow() {
  return hovered
}

/** Returns true when the value actually changed, so a caller can repaint. */
export function setHoveredChartRow(index) {
  if (index === hovered) return false
  hovered = index
  return true
}

/** Texture-space hit test. `null` when the pointer is over no row. */
export function chartRowAt(x, y) {
  for (const region of regions) {
    if (
      x >= region.x &&
      x <= region.x + region.w &&
      y >= region.y &&
      y <= region.y + region.h
    ) {
      return region.index
    }
  }
  return null
}

/**
 * Client point → texture pixel, for a canvas displayed with `object-fit:
 * cover`. Cover scales by the LARGER ratio and centres, so part of the canvas
 * is cropped and the offset is negative on the overflowing axis — using the
 * element rect directly would drift further from the truth the wider the
 * window got.
 */
export function coverPointToTexture(rect, clientX, clientY, width, height) {
  const scale = Math.max(rect.width / width, rect.height / height)
  return {
    x: (clientX - rect.left - (rect.width - width * scale) / 2) / scale,
    y: (clientY - rect.top - (rect.height - height * scale) / 2) / scale,
  }
}
