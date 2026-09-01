# Art direction — corporate recursion

The talk should feel like documentary photography of a restrained corporate
nightmare, not a realtime graphics showcase.

**One intimate pool of human light → the workstation repeated into fluorescent
bureaucracy → those bays compressed into infrastructure → ordered phosphor
becomes evidence.**

Amber is the only chromatic accent — P3 amber phosphor, matched to the survey
site's `--accent: #ffd54a` (ai-health.syntax.fm) so the talk and the published
charts share one identity, and deliberately not Matrix green. Architecture,
repetition, scale, absence, and intensity carry the dread.

## The photographic test

A frame fails if it reads first as any of these:

- a furniture showroom or asset turntable,
- a room assembled from isolated props on infinite planes,
- a game level viewed from a high, wide camera,
- a contact sheet of monitor rectangles,
- a particle demo, star field, voxel terrain, or “Matrix” imitation,
- post-processing used to imitate lighting that the space does not contain.

Extra polygons, material parameters, bloom, and AA cannot rescue a failed frame.

## Set grammar

### Home

- Intimate and occupied, with a complete room envelope rather than black void.
- At least three readable depth planes in every reveal composition.
- The monitor is the dominant source; one motivated doorway return may separate
  silhouettes.
- Architecture and foreground parallax establish scale before extra clutter.

### Cubicle

- A real aisle with the hero bay and at least three receding bays.
- Continuous partition, ceiling, floor, and support architecture.
- Foreground partition/chair edges may obstruct the frame; the whole set should
  not be displayed like a product listing.
- Visible troffers create pools separated by negative fill.

### Wall

- Workstation cells become infrastructure in depth.
- Racks, bays, or cells recede and compress spatially; monitors are not a flat
  11×5 contact sheet.
- Near and wide shots must communicate different scale, not merely different
  crop.

### Phosphor

- Begin as a literal continuous Trinitron-style coating on curved glass.
- Preserve ordered topology while crossing the faceplate.
- Resolve into rounded physical grains only after the measured handoff.
- The endpoint is an ordered, shallow material field ready to become a specific
  data visual—not confetti, blocks, or an extruded terminal bitmap.

## Camera grammar

- Object and office shots use approximately **32–35° vertical FOV**.
- Cameras sit near human eye height and look near the monitor horizon.
- Prefer off-center vanishing points, foreground occlusion, and three depth
  planes.
- Avoid high downward views, wide-angle dollhouse distortion, axial particle
  fly-throughs, and profile turntables.
- Glass-covering waypoints remain exact; lens changes animate on the same frame
  clock as position and target.

## Lighting grammar

- Light the architecture, not each asset.
- Every pool must be attributable to a visible or narratively established
  source.
- Static indirect illumination or authored irradiance grounds walls, desks,
  furniture, and floor contact. PMREM reflections alone are not GI.
- Vertical planes must remain readable; bright tops over dead sides fail.
- Use negative fill and dark intervals instead of adding more weak fill lights.
- Stage/post changes follow physical glass coverage, never slide declaration.

## Compositing policy

- Integrate the photographed world; never cover a weak render with grime.
- Contact patches and offline-baked irradiance fields are world-space,
  source-motivated, static, and resident before presentation readiness. The
  fields project onto simplified receiver planes rather than taxing every PBR
  fragment or pretending PMREM is indirect diffuse light.
- Atmospheric falloff belongs in standard materials so it costs no full-screen
  depth pass and leaves the custom monochrome screens untouched.
- The finishing chain stays restrained: exposure, highlight diffusion,
  vignette, ACES, FXAA, and sub-LSB static dither.
- No film grain, lens dirt, scratches, chromatic aberration, generic local
  contrast, or unstable depth of field.

## Material priorities

Only four families receive detailed look development until wide shots pass:

1. CRT plastic and faceplate,
2. desk/HPL,
3. cubicle fabric,
4. carpet/floor.

They need visible-scale roughness and macro variation in the actual camera, not
merely different scalar values in code. Occupancy wear is localized and quiet.

## Stop spending time on

- more CRT vents, controls, bevels, or chair polygons,
- more mouse/lamp topology,
- further material segmentation invisible in the composed frame,
- random desk clutter before architecture works,
- more runtime lights,
- speculative bloom, grain, halation, DOF, or AA tuning,
- technical metrics presented as aesthetic approval.

## Targeted approval frames

Review these individually; do not substitute a continuous headed run:

1. Home three-quarter beauty: three depth planes, readable boundaries, no void.
2. Cubicle wide beauty plus matching clay: foreground obstruction, hero bay,
   three receding bays, off-center vanishing point.
3. Cubicle light-only: motivated pools, readable verticals, grounded furniture.
4. Wall near/wide pair: obvious spatial infrastructure and scale escalation.
5. Four-frame phosphor strip: intact terminal → physical lattice → ordered depth
   → unmistakable first data image, with no confetti phase.

A targeted frame is approved by reviewed pixels, not by a build, triangle count,
or transition timer.
