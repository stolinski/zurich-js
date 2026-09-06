/** Three's alphaMap samples GREEN, not A. Keep the footprint in RGB. */
export function createContactMaskData(size, shape) {
  const data = new Uint8Array(size * size * 4)
  const clamp = (value) => Math.max(0, Math.min(1, value))
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = ((x + 0.5) / size) * 2 - 1
      const ny = ((y + 0.5) / size) * 2 - 1
      let core
      if (shape === 'rect') {
        // A superellipse hugs rectangular objects without square corners.
        const radius = (Math.abs(nx) ** 4 + Math.abs(ny) ** 4) ** 0.25
        // Reach zero at the perimeter; never print the receiving quad.
        const t = clamp((1 - radius) / 0.58)
        core = (t * t * (3 - 2 * t)) ** 1.15
      } else {
        core = clamp(1 - Math.hypot(nx, ny)) ** 2.35
      }
      const offset = (y * size + x) * 4
      const mask = Math.round(core * 255)
      data[offset] = mask
      data[offset + 1] = mask
      data[offset + 2] = mask
      data[offset + 3] = 255
    }
  }
  return data
}
