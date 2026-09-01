import { SCREEN_SIZE } from './CRTScreen.jsx'

/**
 * Millimetres → scene units.
 *
 * Every authored part in `parts/` is modelled at TRUE SCALE in mm, so they all
 * convert through this one number and end up correctly sized relative to each
 * other. A 300mm keyboard next to a 520mm screen is a 300mm keyboard next to a
 * 520mm screen — nobody has to eyeball a fudge factor per prop, and nothing
 * drifts when a part is re-exported.
 *
 * Anchored to the screen because the screen's size is what the whole scene is
 * framed around (see CameraRig's fillScreen).
 */
const CAD_SCREEN_WIDTH_MM = 520 // must match parts/crt_monitor.py

export const MM = SCREEN_SIZE.w / CAD_SCREEN_WIDTH_MM
