# Set integration: first photographic pass

**Implemented, not stage-approved.** The live Blender session was not saved or
modified. Existing home/office/wall GLBs remain byte-identical to the pre-pass
backups, including the user's earlier geometry changes.

## Changes

- **Postprocessing:** FXAA now occupies an explicit, resident output pass after
  exposure/ACES. The library's FXAA compares `inputColor` with neighbours from
  `inputBuffer`; fusing it after tone mapping gives those samples different
  transfer functions. `src/lib/postOutput.js` protects the boundary. Dither can
  follow FXAA in that pass. The flat opening still bypasses the composer.
- **Agent screens:** GLSL3 flat per-instance identity/phase/drive inputs prevent
  perspective-interpolation rounding from perturbing hash seeds.
- **Contact masks:** RGB now contains the footprint; Three's `alphaMap` samples
  green, not alpha. This fixes the solid-rectangle interpretation shared by
  contact and irradiance patches.
- **Selective Cycles lighting:** the office floor replaces its analytical light
  pool and floor-contact cards with traced direct + indirect diffuse lighting.
  Albedo remains the runtime carpet; specular remains realtime. No extra floor
  mesh, lights or UV channel. The 1024×1418 PNG is about 1.6 MB compressed;
  decoded/mipmapped GPU cost is roughly 7.4 MiB before counting the removed map.
  This is not a claim that the whole resident texture budget has passed.
- **Shared material inputs:** `src/scene/surfaceProfiles.json` is read by both
  Blender's `mapped_surface_material` and the runtime. First migrations: upper
  and lower cubicle fabric, office chair wool, and the home walnut desk. Textile
  albedo is neutral rather than blue; walnut has a broader, less glossy response.
  Blender mapped materials now multiply tint and scalar roughness by their maps,
  matching Three's semantics instead of silently ignoring the scalars.
- **Hero CRT:** the existing pocket gets a low-reflectance inner-return material;
  the face gets a slightly softer finish. No added housing geometry. The harsh
  white outline is reduced; the thin top-edge alias is **not** declared solved.
- **Regression checks:** `pnpm test` runs nine Node tests for pass separation,
  mask sampling, bake composition/encoding, and the shared material contract.

## Reproduce the bake/reference

Commands and texture provenance: [`public/textures/README.md`](../public/textures/README.md).
Re-bake after office geometry, lighting or shared material changes. The JSON
sidecar records source/contract hashes, seed, sample count and radiance range.
The floor has fitted UV0. Do not apply this map setup to tiled/overlapping UVs
on other receivers; those need a dedicated bake UV layout.

`blender/tools/render_reference.py` accepts a camera snapshot extracted from
Swamp's evidence, reproducing its position, quaternion, FOV and zoom. It renders
in a separate Blender process and never saves the source `.blend`. This pass's
matched `cubicle-wide` reference used Cycles, 128 samples and denoising.
AgX and the browser's ACES are still different display transforms; this is a
lighting/material reference, not a pixel-parity oracle.

Local review copies are in `quality-artifacts/set-integration-2026-09-05/`:
`cubicle-before.png`, `cubicle-after.png`, `cubicle-cycles-reference.png`,
`home-before.png`, `home-after.png`, `wall-before.png`, `wall-after.png`.
This directory is ignored; browser evidence is durably archived by Swamp.

## Verification — failures kept visible

All production captures came from validated `talk-quality` workflow runs, not
standalone capture scripts. Builds and capture methods succeeded. The workflow
**failed its transition and unapproved visual assertions**; it was not weakened
to obtain a green result.

- Broad fresh-load production run: `f6ac29b9-c35e-411e-afbe-64c4a67f4db2`,
  `quality-result` v105, archive `evidence-2026-09-05T01-42-55-138Z`.
  20 settled views, 28 forward/backward transition traces; only **3/28 passed**
  all timing checks. All 28 created **zero programs and zero textures during
  navigation**. All 24 traces with a camera-continuity check passed that check.
  No captured console errors, WebGL errors or failed network requests.
- Saved pre-change runtime A/B: `fc01375f-f494-4d5b-8a51-2ae581083f6b`.
  Existing dirty source versions were preserved; temporary baseline files were
  restored afterward and byte-compared. **1/4 transitions passed** even before
  these changes. Cubicle input latency was 108.6/107.9 ms, with 83.4/82.9 ms
  maximum frames.
- Restored implementation, matching fresh-load subset:
  `770eacd4-4d27-49c0-940f-c54902429c5a`, `quality-result` v107,
  archive `evidence-2026-09-05T01-56-07-474Z`. **1/4 passed**. Cubicle input
  latency was 112.3/119.2 ms, maximum frames 83.4/81.4 ms. Both wall directions
  had 18.7 ms maximum frames; backward input latency missed the 50 ms gate at
  54.5 ms. All four had zero navigation allocations and p95 frames ≤18.5 ms.

The baseline also stalls, but this does not make the current failures acceptable
or prove every delay is pre-existing. Input/canvas upload behavior needs profiling.

## Still open

1. Transition latency/frame spikes, including the flat/full-glass beats.
2. Fine geometry/specular aliasing. MSAA comparisons improve rail/drawer edges,
   but no new production AA default was selected: the full Q1 SSIM/reference and
   hardware gates are not established. Quality AA profiles freeze agent activity;
   their timings must not be treated as live-production timing equivalence.
3. More selective, non-overlapping-UV bakes for important office receivers;
   the reference still has better under-desk and partition shading. The remaining
   analytical irradiance has not all been replaced.
4. Further wall lighting/material depth separation after the cubicle approach
   passes performance and visual review.
5. Full material migration, comparable colour management, fallback hardware,
   projector review and the recorded presentation backup.
