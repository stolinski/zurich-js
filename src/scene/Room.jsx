/**
 * The desk metrics every set and prop anchors to.
 *
 * This file used to be the HOME set — a CAD walnut desk, an instanced box
 * envelope, a doorway, a night window, baked floor irradiance and authored
 * contact patches. Since 2026-09-02 the home room is authored in Blender
 * (`blender/home-office/build_scene.py` → `HomeOffice.jsx`), built on the
 * same spatial contract these numbers define, and the CAD set was retired on
 * 2026-09-03 once the Blender one had been through its clipping and lookdev
 * passes. It is all in git if the projector ever disagrees.
 */

/** The top surface of both desks; the monitor and every prop anchor here. */
export const DESK_Y = -8.34
/** 730mm below the office worktop at the scene's millimetre scale. */
export const OFFICE_FLOOR_Y = DESK_Y - 21.2
