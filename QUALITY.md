# Visual quality bars

This deck is not visually finished when a renderer setting exists or a model has
more polygons. It is finished when the presented pixels meet these bars on the
actual camera paths. Every bar is pass/fail; “better than before” is not a pass.

## Reference runs

Judge every release in current Chrome on:

1. **Stage target:** 1920×1080 CSS pixels, DPR 1, the presentation laptop and
   projector/output adapter.
2. **Fallback target:** 1280×720 CSS pixels, DPR 1, integrated GPU.
3. **Authoring target:** 2560×1440 CSS pixels, DPR capped by the app exactly as it
   will be on stage.

Run one fresh-load pass and one already-warm pass. Test every transition forward
and backward. Settled frames from a direct `?slide=` URL and navigation must be
visually identical.

Quality evidence runs through the validated Swamp workflow, not direct one-off
Node commands:

```bash
swamp workflow validate talk-quality
swamp workflow run talk-quality --input \
  '{"profile":"full","viewport":"1920x1080","browserMode":"headed"}'
```

Swamp stores the typed result, logs, and compressed capture archive. An automated
transition pass never changes the visual gate from `manual-review-required`.

## Current gate status

| Gate | Status | Current failure |
| --- | --- | --- |
| Cold-open illusion | Pass | Keep protected by the rules below. Note: the 2026-08 ladder/exposure retune intentionally re-baselined cold-open pixels (PHOSPHOR ghost/dim floors raised for projection); prior bit-exact baselines are superseded. |
| Settled deterministic state | Pass | Direct and navigated state currently match. |
| Aliasing and image stability | **Fail** | Furniture, fixtures, chair details, and CRT patterns visibly stair-step or crawl. |
| Transition performance | **Provisional pass** | Warm 1920×1080 adjacent-transition traces now show zero navigation allocations and ~18ms p95; projector confirmation remains. |
| Models and silhouettes | Pass | User-approved second-pass CRT, mouse, lamp, chair, and pedestal stay within authored triangle budgets. |
| Materials and texture scale | **In verification** | Broad material families are separated; headed/projector review remains. |
| Lighting and grounding | **In verification** | Measured home readability and office rolloff improved; projector contact review remains. |
| Phosphor handoff | Pass | Shader/geometry endpoints now match at 0.003/255 luma MAE, 0.0007px centroid error, and −0.00015% brightness change. |
| Composition and set coverage | **In verification** | Expanded office sets remove the black void; final headed framing awaits approval. |
| No intersections/floating geometry | **In verification** | Office clearances are measured; full moving-path review remains. |
| Offline and fallback safety | Pass | Local assets and `?flat` remain required. |

## Baseline blockers recorded before remediation

Three independent audits established this baseline before the measured implementation pass:

1. `CompileAllStages` warms one synthetic all-lights scene, not the real stage
   variants. Sample context swaps still created **9 textures and 7–10 programs**
   and produced 33–35ms frames.
2. Backward swaps can hold old geometry while environment, lights, and effects
   already use the destination slide. Mixed-stage lighting is a visible jump.
3. The blinking caret triggered **8 full 2560×1440 uploads plus mip generations
   in 3.9 seconds** during a settled sample.
4. The scene is single-sampled before bloom. Final FXAA cannot reconstruct
   subpixel geometry already lost, and bloom enlarges the aliased fixture edges.
5. Procedural agent screens use `floor`/`step` without derivative AA or LOD;
   distant terminal rows collapse into diagonal bands.
6. Phosphor deposits sit on a flat plane while CRT glass is curved, begin depth
   scatter too early, and overlap an opaque CRT rather than crossfading.
7. The chair should be replaced, not filleted again. CRT housing needs segmented
   material response; mouse/lamp spend 23k/33k triangles while retaining weak
   silhouettes and one material each.
8. `cubicle-wide` exposes a black set edge; home foreground props are still
   black-on-black; office values compress into bright tops and a near-black floor.

## Measured remediation evidence

- Warm 1920×1080 production capture exercised all **28 adjacent directions**
  with **zero new programs and zero new textures** during navigation.
- Transition p95 was approximately **17.5–18.6ms**. Twenty-six directions passed
  in the fleet run; both isolated outliers passed **3/3** immediate repetitions.
- Input-to-observable motion is now normally **16–48ms** after moving flight
  setup onto the synchronous store/render clock.
- Settled caret-only animation now causes **zero transcript uploads and zero mip
  generations**, while the caret continues blinking in the shader.
- Agent screens and ceiling grid now fade structural detail by projected size;
  unresolved 1280×720 wall screens collapse to stable occupancy light.
- Context lighting, environment, effects, geometry, and shadows consume one
  atomic `displayStage`; early presses finish an occlusion micro-leg before the
  destination reveal.
- All four required AA candidates and a 2×-linear/4×-pixel supersampled
  reference now run through Swamp with pinned Wang-style SSIM. No candidate
  passed every 0.99 crop; 2× MSAA at DPR 1.25 was closest, so no new production
  AA stack was selected.
- The phosphor field remains monochrome, reconstructs a continuous curved face,
  and releases into row-correlated depth. Matching straight-alpha compositing
  reduced shader/geometry endpoint error from 8.35px to **0.0007px** centroid,
  from 1.54 to **0.003/255** luma MAE, and from +3.35% to **−0.00015%** brightness.
- Second-pass authored assets are user-approved: CRT 20,424 triangles, mouse
  6,356, chair 29,164, pedestal 7,792, and lamp 3,020.
- Stage look presets now centralize environment, motivated lights, exposure,
  bloom, vignette, and dither. Home foreground mean luminance rose without
  clipping; office troffers remain below 200/255 in the measured anchors.
- The photographic-integration pass adds one shared startup-resident contact
  mask, offline-baked home/cubicle irradiance fields projected through three
  simplified receiver draws, material-level exponential atmosphere, and a
  corrected source direction for the wall spill. A full PBR-fragment lightmap
  prototype was rejected after it pushed the cubicle transition to 48–50ms p95;
  the receiver-layer implementation restored 17.6ms p95 with zero navigation
  program/texture creation (`20c6adc4-cf04-481c-b05d-4b533ee1ae37`). It
  deliberately adds no
  screen-space AO, DOF, chromatic aberration, film grain, lens dirt, or generic
  local-contrast convolution. With caret state held equal, cold-open pixels
  remain bit-exact against the prior 1920×1080 baseline.
- The art-direction reset replaces the home void with a complete envelope,
  extends the cubicle into a four-depth aisle, turns the flat wall into a concave
  rack vault, and moves object/office shots from a 50° showroom lens to 32–35°
  human-height compositions. These remain targeted visual-review evidence, not
  an automatic photographic pass.
- The settled inside-glass endpoint no longer extrudes source rows through 14
  scene units. Stable capsule grains occupy a shallow deterministic ribbon with
  depth-writing material cores; the exact depth-zero handoff metrics remain
  unchanged.

These measurements are implementation evidence, not projector acceptance. The
actual stage and backup laptops still have to repeat the matrix.

## Q1 — Aliasing and temporal stability

A pass requires all of the following:

- No visible stair-step edges on the hero CRT, desk, fixtures, chair, mouse, or
  lamp in any settled 1080p reference frame at 100% scale.
- No edge crawl, shimmer, moiré, or subpixel popping during any authored camera
  flight. Judge fixtures, ceiling grid, chair parts, vents, cables, CRT scanlines,
  aperture grille, and phosphor deposits explicitly.
- No modeled line, gap, bevel, caster, vent, or grid member may project below
  **1.5 pixels** on the stage target unless it fades, switches LOD, or becomes a
  filtered texture before that point.
- Every procedural pattern must have a measured screen-space Nyquist guard. A
  mipmap is not a guard for shader-generated lines.
- Transparent/additive phosphor edges must not reveal ordered instance rows or
  hard clipping as the camera crosses the glass. Shader-only and geometry-only
  handoff frames must stay within **3/255 luminance MAE** and **0.25 px centroid
  error**, with less than **5% brightness variation** through the crossfade.
- The cold open remains a bit-flat canvas presentation: no post AA, bloom,
  vignette, tone mapping, or exposed background.

**Required evidence:** settled captures for every slide plus 60fps recordings of
`slot-machine → reveal`, `productivity-paradox → cubicle-wide`, and the
entire phosphor handoff. Compare current FXAA, 2× composer MSAA at DPR 1.25, 4×
composer MSAA at DPR 1, and 2× MSAA+FXAA on identical frames; do not accept an AA
method based on reputation alone. A settled edge-region capture must reach
**SSIM ≥0.99** against a 4× supersampled reference.

## Q2 — Performance and transition continuity

A stage-target pass requires:

- Input-to-first-visible-motion is **≤50ms** for every navigation keypress.
- Warm transitions sustain **p95 frame time ≤20ms** and have **no frame >50ms**.
- Fallback transitions sustain **p95 ≤33ms** and have **no frame >80ms**.
- Camera position, target, CRT uniforms, stage visibility, and phosphor depth are
  monotonic through a transition and land exactly once at the declared duration.
- Geometry, environment, global lights, post effects, and shadow selection always
  consume one atomic `displayStage`; mixed-stage frames are forbidden.
- No shader compilation, GLB/HDR decode, PMREM generation, texture/render-target
  allocation, shadow-map warmup, or React/Suspense mount may occur after the deck
  declares itself presentation-ready. Navigation must add **zero** programs and
  **zero** textures.
- A stage swap may invalidate one static shadow update while fully occluded, but
  that work must complete before scenery becomes visible.
- Caret-only animation must not upload or regenerate mipmaps for the full
  2560×1440 transcript texture. Transcript uploads must not stall camera frames.
- Ten forward/back loops produce no growing GPU memory, duplicate event handlers,
  or progressively worse frame times.

**Required evidence:** one checked-in transition trace that records keypress,
first camera movement, rAF deltas, long tasks, stage swap, shadow update, texture
uploads, and settled time for all adjacent transitions in both directions.
Absolute FPS from software-rendered headless Chrome is not acceptance evidence.

## Q3 — Foreground model quality

A foreground asset passes only when its silhouette, construction, and contact
remain credible in its closest authored view. Primitive geometry is acceptable
only where the manufactured object is actually primitive. Audit baseline:
**CRT B+, keyboard B, desk B−, mouse C, lamp C−, chair C−, office C−/D+ at the
wide angle.** A quality-bar pass requires A-level evidence, not a relative bump.

### Hero CRT

- Housing has intentional compound curvature, tight 90s corners, panel breaks,
  recessed controls, labeled/legible control hierarchy, strain relief, cable
  route, stand articulation, base contact, and a bezel opening that matches the
  live glass numerically and visually.
- Plastic highlights flow across the housing without faceting, box-projection
  seams, or one uniform roughness response.
- The cold-open framing remains unaffected by any housing improvement.

### Chair

- Use a local, provenance-clear production task-chair GLB rather than another
  block/fillet clearance proxy. It must show a believable ergonomic shell,
  upholstery, frame, lift, five-star base, and casters at `cubicle-wide`.
- Seat, back, frame, and hardware need distinct material responses.
- No chair volume intersects a desktop, pedestal, panel, or floor at any camera
  waypoint or during any transition.

### Mouse

- Must include separate upper/lower shell construction, button split, wheel and
  wheel recess, side break, believable underside contact, and cable/receiver
  logic appropriate to the chosen design.
- It must read as a mouse from silhouette before texture or lighting is added.

### Lamp

- Must include shade wall thickness and interior finish, bulb/socket or LED
  source logic, articulated joints/fasteners, arm construction, cable route,
  weighted-base seams, and stable desk contact.
- The light source and modeled fixture must agree even when the lamp is off.

### Desk props and office

- Keyboard, mug, notebook/paper, pedestals, fixtures, desk supports, partitions,
  and ceiling system need plausible scale and construction gaps.
- No hero-camera asset may use visibly low-sided cylinders, razor edges, floating
  decals, or coplanar layers.

**Starting caps, not targets:** hero CRT 20k triangles; chair 20–35k; mouse 6k;
lamp 12k; desk 8–12k; pedestal 3k; fixture 2k; full opaque cubicle frame ≤250k.
Spend geometry on silhouette and highlight-carrying curvature, not hidden CAD
booleans. Total resident textures—including PMREM—must stay ≤80 MiB; local
compressed texture payload ≤20 MiB; no 4K map without projector evidence.

## Q4 — Materials and textures

- Large visible surfaces use authored UVs and correlated base-color, normal, and
  roughness information where the real material varies at visible scale.
- Hero texel density is approximately **1024 px/m**; background density is
  **256–512 px/m**. Adjacent objects must not imply wildly different material
  scale.
- No recognizable texture feature repeats within a hero camera frame.
- Color maps are sRGB. Normal, roughness, metalness, AO, and lightmaps remain
  linear data. Normal-map handedness is verified rather than assumed.
- Roughness is material-specific and spatially credible; it is not one scalar
  used to distinguish every object.
- Fabric, coated metal, injection-molded plastic, rubber, ceramic, paper,
  laminate, painted wall, and glass remain distinguishable under a neutral-light
  material test.
- Macro detail belongs in geometry or displacement where silhouette/parallax
  exposes it. Microdetail belongs in filtered maps. Neither substitutes for the
  other.

## Q5 — Lighting, shadows, and photographic response

- Every visible object has readable contact with the surface supporting it; no
  chair, monitor, pedestal, keyboard, or mug floats.
- Shadow softness follows source size and distance. No fluorescent fixture casts
  a sun-like edge, and broad fill does not erase all contact.
- Only emissive glass and fixture apertures may deliberately reach the tone-map
  shoulder. Large diffuse walls/desks must retain highlight detail rather than
  clipping to flat white.
- Home remains monitor-led and dark; office remains neutral and exposed. The two
  stages must not differ only by brightness or background color.
- A neutral-clay diagnostic render must show convincing form before textures and
  bloom are restored.
- A light-only diagnostic must prove each direct light earns its runtime cost.
  Static indirect light should be baked or supplied by matched IBL rather than
  accumulated from many runtime lights.

## Q5b — Luminance anchors

The 2026-08 exposure audit found every stage failing photographically while all
numeric gates passed: timing, aliasing, and handoff precision never measured
BRIGHTNESS, and the deck had drifted to a state where no pixel in the wide
agent wall exceeded 112/255 and the phosphor threshold peaked at 64/255 — both
effectively black on a projector. These anchors make exposure a gate. Verify on
settled 1920×1080 captures with Rec.709 luma (the capture harness plus
`compare-images.mjs`-style decoding is sufficient); all values are 0–255.

| Slide | Anchor |
| --- | --- |
| `reveal` | glass content reaches ≥ 250; frame p50 in 8–18 (room readable, still night) |
| `q-stopping` / `stopping-sleep` / `skills-enjoyment` (the glass-filling DATA run — since 2026-09-02 the tube wakes at `agent-session`, so every glass beat from the chat window on belongs to this family) | frame p50 in 4–26 AND p99.9 ≥ 200. Both, because they fail in opposite directions: p50 keeps the glass between the marks black, p99.9 keeps the marks at reading brightness. p99.9 rather than p99 — p99 tracks bright AREA and so moves with a chart's SHAPE, scoring a two-row cohort split at 168 against a five-bar scale's 205 when both were equally legible. This family had no anchor until 2026-08-31, which is how it shipped with post bypassed. |
| `cubicle-wide` | troffer apertures clip (255 allowed); frame p50 in 40–62; pixels below 10 luma under 1% |
| `agent-wall-near` | frame p95 ≥ 100; hero screen contains ≥ 250 |
| `agent-wall` | frame p95 ≥ 95 (54 lit CRTs may not photograph as a dark room) |
| `inside-glass` | p99.9 ≥ 130 with visible near-field grains ≥ 3× the size of mid-field grains |
| flat slides (`cold-open`, `intro-syntax`, `intro-sentry`) and the `?flat` fallback | hot rungs ≥ 220; ghost rung ≥ 45 (the PHOSPHOR ladder floor is a projector constraint, not styling) |

Emissive hierarchy is part of the gate: on every stage the brightest surface
must be a screen or a fixture aperture, never a lit prop. The hero glass gets
`screenGain` HDR drive per stage (environment.js) — except the phosphor stage,
where both handoff representations stay ungained so their measured parity
survives; that stage earns brightness through exposure and bloom only.

## Q6 — Acceptance capture matrix

The following evidence is mandatory before calling a visual pass complete:

| Beat | Evidence |
| --- | --- |
| `cold-open` | Fresh-load and warm title capture at all three reference sizes |
| `intro-syntax`, `intro-sentry`, `intro-qr` | Local asset decode, monochrome treatment, and title-safe clearance |
| `agent-session` | Harness legibility, vector stability, and the AUTOPLAY schedule: the exchange drives itself now, so the evidence is a recording of the whole ~12s run, not a settled still. One press of Enter or Backspace must still take it back. |
| `reveal` | Settled still plus one continuous `slot-machine → reveal` recording: the tube ramp and the pull-back are ONE move now, so early/mid/late frames of the flight are what prove no doubled glyphs and no late shader compile |
| `cubicle-wide` | Settled stills, clearance overlay, clay render, light-only render |
| `agent-wall` | Settled still and moving shimmer/LOD check |
| `inside-glass` | Frame sequence through the complete handoff, which is now ONE flight — the two held threshold waypoints in front of it were cut |
| Every adjacent pair | Forward/back transition trace against Q2 thresholds |

## Q7 — Implementation constraints that remain non-negotiable

- One navigation press is one slide. Enter/backspace alone drive the fake agent.
- No DOM content in the presentation image.
- All assets remain local and deterministic.
- Stage changes remain hidden behind glass and work in both directions.
- No quality technique may make direct URLs differ from navigated arrival.
- Progressive path tracing is not the default renderer: moving cameras, animated
  terminal textures, and instanced wall/phosphor geometry invalidate its core
  assumptions. Baked lightmaps, matched HDR IBL, better assets, and measured AA
  are preferred unless a separate static-only mode proves itself on stage hardware.

## Source notes

The performance guidance in [Discover three.js: Tips and Tricks](https://discoverthreejs.com/tips-and-tricks/)
is treated as hypotheses to benchmark, as the author recommends. Relevant items
for this deck include minimizing render-loop work, reusing objects/materials,
keeping camera and shadow frusta tight, freezing static shadows, avoiding point
shadows, testing built-in MSAA against post AA, minimizing direct lights and
post passes, using LOD/instancing, baking static lighting, and measuring CPU vs
GPU limits with a basic-material override.
