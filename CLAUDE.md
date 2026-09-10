<!-- BEGIN swamp managed section - DO NOT EDIT -->
# Project

This repository is managed with [swamp](https://github.com/swamp-club/swamp).

## Rules

1. **Search before you build.** When automating AWS, APIs, or any external service: (a) search community extensions with `swamp extension search <query>` — prefer `@swamp/*` official extensions first, (b) search local/installed types with `swamp model type search <query>`, (c) if a community extension exists, install it with `swamp extension pull <package>` instead of building from scratch, (d) extend an existing type if it covers the domain but lacks the method you need, (e) only create a custom extension model in `extensions/models/` as a last resort. Use the `swamp` skill for guidance. The `command/shell` model is ONLY for ad-hoc one-off shell commands, NEVER for wrapping CLI tools or building integrations.
2. **Extend, don't be clever.** When a model covers the domain but lacks the method you need, extend it with `export const extension` — don't bypass it with shell scripts, CLI tools, or multi-step hacks. One method, one purpose. Use `swamp model type describe <type> --json` to check available methods.
3. **Use the data model.** Once data exists in a model (via `lookup`, `start`, `sync`, etc.), reference it with CEL expressions. Don't re-fetch data that's already available.
4. **CEL expressions everywhere.** Wire models together with CEL expressions. Always prefer `data.latest("<name>", "<dataName>").attributes.<field>` over the deprecated `model.<name>.resource.<spec>.<instance>.attributes.<field>` pattern.
5. **Verify before destructive operations.** Always `swamp model get <name> --json` and verify resource IDs before running delete/stop/destroy methods.
6. **Prefer fan-out methods over loops.** When operating on multiple targets, use a single method that handles all targets internally (factory pattern) rather than looping N separate `swamp model method run` calls against the same model. Multiple parallel calls against the same model contend on the per-model lock, causing timeouts. A single fan-out method acquires the lock once and produces all outputs in one execution. Check `swamp model type describe` for methods that accept filters or produce multiple outputs.
7. **Extension npm deps are bundled, not lockfile-tracked.** Swamp's bundler inlines all npm packages (except zod) into extension bundles at bundle time. `deno.lock` and `package.json` do NOT cover extension model dependencies — this is by design. Always pin explicit versions in `npm:` import specifiers (e.g., `npm:lodash-es@4.17.21`).
8. **Reports for reusable data pipelines.** When the task involves building a repeatable pipeline to transform, aggregate, or analyze model output (security reports, cost analysis, compliance checks, summaries), create a report extension. Use the `swamp` skill for guidance.
9. **"Workflow" means a swamp workflow.** In this repository the word "workflow" (and "create/run/execute/validate/debug workflow", "automate", "orchestrate", "automated/nightly job") refers to a swamp workflow — a declarative YAML DAG of model-method steps authored via `swamp workflow create`. Load and follow the `swamp` skill for these requests. Do NOT interpret these as a request to build an agent task list, spin up worktrees, or schedule a cron/remote agent. Only use those orchestration mechanisms when the user explicitly names one (e.g. "task list", "subagent", "worktree", "cron", "remote agent") or explicitly asks you to do the work yourself step by step rather than author a swamp workflow.
10. **Use swamp, don't bypass it.** Always work through swamp commands — don't go around them with raw shell tools. Use `swamp data query` to find data, not `grep`/`find` on `.swamp/` files. Use model methods to interact with resources, not `curl`/`aws`/`gcloud`/`kubectl` when a model type already wraps that API — check with `swamp model type search`. Use `swamp help` for CLI discovery, not guesswork. Composing with swamp output is fine (e.g. piping `--json` through `jq`) — the anti-pattern is bypassing swamp entirely.
11. **Inspect reports after failures.** When a model method or workflow run fails, inspect its generated reports before retrying or changing definitions. Reports run even on failure and capture structured diagnostics — error messages, execution status, arguments, and data output pointers. Use `swamp report get @swamp/method-summary --model <model> --json` for method failures or `swamp report get @swamp/workflow-summary --workflow <workflow> --json` for workflow failures. Run `swamp help report get` to confirm current retrieval syntax.

## Skills

**IMPORTANT:** Always load swamp skills, even when in plan mode. The skills provide
essential context for working with this repository.

- `swamp` - Swamp CLI — models, workflows, data, vaults, extensions, publishing, repos, reports, issues, and troubleshooting
- `swamp-getting-started` - Interactive onboarding for new swamp users

## Getting Started

**IMPORTANT:** At the start of every conversation, run
`swamp model search --json`. If no models are returned (empty result), you MUST
immediately invoke the `swamp-getting-started` skill before doing anything else.
This walks new users through an interactive onboarding tutorial.

If models already exist, start by using the `swamp` skill to work with
swamp models.

## Commands

Use `swamp --help` to see available commands. For a machine-readable JSON
schema of the CLI (commands, options, arguments) intended for agent
consumption, run `swamp help [<command>...]` — e.g. `swamp help` returns
the full tree, and `swamp help model method run` scopes to a subtree.
<!-- END swamp managed section -->

# CLAUDE.md

## What this is

A conference talk — **"The True Cost of AI Coding"** by Scott Tolinski, on what
AI coding tools do to developers' mental health — rendered as one continuous
camera move through four scales.

It opens on a pixel-flat screen reading **“the true cost of ai coding.”** Syntax
and Sentry load as monochrome local assets, the screen becomes an **AI coding
agent harness** (Scott taps, a user turn types, an agent thinks, a tool runs,
an answer streams back), a post, a disclaimer and a QR code follow, all still
flat — and then the tube wakes on the first survey question, a slot machine
takes the pulls, and a vector chart plots the result. No DOM slide chrome or
perspective. Then the camera moves for the first time and the **cathode ray
tube** turns out to be in a room, and the room turns out to be full of them,
and then you go **into the glass** and the phosphor triads become the material
everything after is built from. (The tube waking on the glass rather than at
the pull-back is Scott's call of 2026-09-02: flat data slides read darker than
tube ones — which turned out to be the flat path presenting linear light,
fixed 2026-09-10 — and the curve gives away nothing about the room. It moved
from the chat window to the survey prompt on 2026-09-10 so the QR code stays
flat and scans; the code comes back flat once more before the close.)

**Read `PLAN.md`, `NARRATIVE.md`, `ART-DIRECTION.md`, `PRESENTATION-SYSTEM.md`,
`CONTEXT.md`, then `QUALITY.md`.** PLAN protects the trick; NARRATIVE is what
the talk actually argues and where every number lands; ART-DIRECTION defines the
photographic corporate-recursion target and explicit anti-patterns;
PRESENTATION-SYSTEM protects future slide ideas from one-off scene hacks;
CONTEXT defines the shared authoring language; QUALITY has the measurable gates.
This file is the working reference; PLAN.md is the intent and QUALITY.md decides
whether a visual pass is actually done.

Run production quality evidence through `swamp workflow validate talk-quality`
and `swamp workflow run talk-quality`; do not treat direct
`scripts/quality/*.mjs` invocations as acceptance runs. Swamp stores the typed
result, logs, and capture archive, while visual approval remains manual.

Backed by a survey of 3,593 developers (<https://ai-health.syntax.fm>) and the
[video](https://www.youtube.com/watch?v=iPUn1Fnfn0k).

> This repo began as a copy of the *This Component Could Have Been A Div* deck.
> That talk's entire world — solar system, planets, galaxy, demos — was removed.
> If you find a reference to planets or a galaxy anywhere, it's a leftover; it's
> all in git at `e1e782b`.

## Stack

- **Vite** + **React 18**
- **React Three Fiber 8** (`@react-three/fiber`) + **drei** + **`@react-three/postprocessing`**
- **zustand** for slide + session-step state (shared across the `<Canvas>` boundary)
- **`@chenglou/pretext`** for text measurement/layout without DOM reflow
- **`@fontsource/jetbrains-mono`** self-hosted (offline-safe)
- Package manager: **pnpm**

```bash
pnpm install
pnpm dev      # http://localhost:5173
pnpm build
pnpm ship     # build + upload dist to Cloudflare Pages (wrangler.toml)
```

The deck is hosted at <https://true-cost-of-ai-coding.pages.dev> (Cloudflare
Pages, direct upload from `dist`, production branch `main`). `pnpm ship`
needs a logged-in wrangler; the build is static, so nothing else is
configured on the Cloudflare side.

## The rules that protect the trick

Breaking one of these costs the cold open, and the cold open is the whole talk.
Full list in PLAN.md §2; the ones that bite while coding:

1. **The cold open is pixel-flat.** All post-processing zeroes on a `fillScreen`
   slide and camera input is disabled. One sliver of background in frame and the
   audience knows they're looking at an object.
2. **Everything is drawn. No DOM, anywhere.** Text goes onto the screen's canvas
   texture. Never an HTML overlay, never `getBoundingClientRect` (it reflows the
   page mid-talk) — measure with pretext.
3. **One hue on the glass, hierarchy is intensity.** Phosphor drives harder or
   softer; it never changes colour. Alerts are brighter amber, not red.
4. **No bitmap/pixel fonts.** The period feel comes from the tube material, never
   the letterforms.
5. **Every procedural lattice needs a Nyquist guard** (see below).
6. **Calm motion.** Slow drift or nothing. No per-frame churn.
7. **Deterministic.** Seeded randomness — what you rehearse is what the room sees.
8. **Offline-safe.** No runtime CDN fetches.

## How it works

### The one file you usually edit

**`src/slides/index.js`** — the whole talk: order, camera waypoints, tube params,
which fake-agent session plays. Start here.

A slide declares where the camera flies, what the tube looks like, optionally a
`session`, and optionally `lights` (the room's light level, 0–1; the close
turns the room off, then shuts the tube off and types the last words on the
dead glass; the screen's own light rig follows `screenGlow()` in
`scene/roomLight.js`, so the desk goes dark with the tube). Navigating tweens the camera and
damps the tube parameters and the light level toward the new slide's values,
so a change between slides plays as a physical transition rather than a cut.

### `src/terminal/` — the fake agent harness

Everything drawn onto the glass.

- `theme.js` — the phosphor ladder (glass `#0b0a06` → ghost → dim → phosphor
  `#ffd54a` → hot `#fff2cd`), screen metrics, font loading. AMBER, matched to
  the survey site's accent (ai-health.syntax.fm) — see ART-DIRECTION. The
  ladder discipline and
  one-hue discipline are lifted from the `crt-terminal` Pack in
  `../../../properties/gfx-computer`.
- `session.js` — the script model. A session is a list of Enter-driven steps
  (`user`, `say`, `think`, `tool`, `note`, `gap` for the transcript; `visual`,
  `pull`, `grill`, `ask`, `plot`, `draw`, `off` for the catalog forms — a
  visual, a slot pull, a grill flip, a typed prompt screen, a chart growing
  under its title, a visual drawing itself in, the tube shutting off), and
  `buildFrame(script, step, progress, time)` turns one into display lines.
  Any step may carry `dwell` seconds for an `autoplay` slide's schedule.
  Session performance state never changes the slide index. Wrapping goes
  through pretext. `COLD_OPEN` lives here.
- `playback.js` — which session is showing and how far through, shared by the
  3D tube and the `?flat` renderer so the two can't drift. Also owns the
  **content sweep**: slide navigation never cuts the glass — the old content
  DECAYS behind the beam like phosphor (luminous trail, then dark) and the new
  content draws in behind a second sweep with a soft-shouldered ghost preview
  and an additive ignition band (charts grow their bars, the title and
  statements type themselves, stats count up). Enter-driven steps never sweep;
  typing is already that transition. Deep links initialize settled, keeping
  direct and navigated arrival pixel-identical.
- `visuals.js` — the closed catalog of full-screen forms: `title`, `asset`,
  `chart`, `statement` (bare glass, lines of driven phosphor), `stat` (one
  enormous odometer number + label), `slot` (three authored reels; a session's
  `pull` steps spin them, one Enter per pull), `grill` (a brain on a grill; a
  session's `grill` steps flip it and ask its questions, answered with Y or
  N), `walk` (a line, over a perspective walk through line trees that moves
  on the free-running clock), and `prompt` (the survey form asked the way a
  terminal asks: a session's `ask` steps type one screen per Enter, large,
  behind a prompt marker — every question worded as respondents saw it, from
  `FORM` in `data/survey.js`, and nothing else; the painter hands back the
  caret's rect, and both renderers blink it), `warning` (a drawn warning
  triangle over one word — the disclaimer), and `quote` (one respondent's
  words, verbatim, wrapped and centred at the largest of a few authored
  sizes that keeps them to four lines). The `qr` asset is drawn a
  thousand pixels wide with smoothing off and no glow, from a 1640 px raster,
  on FLAT slides only: it has to scan from the back of the room. No act marker sits on a
  threshold any more (`act-cubicle` cut 2026-09-09, `phosphor-return`'s
  "losing our skills." cut 2026-09-10): each act opens on its data, and
  CameraRig hides an adjacent stage swap behind the covering glass — as ONE
  move: the occlude leg and the reveal after the commit share a single
  smoothstep over the whole path, the screen and phosphor cues ease over the
  occlude leg (so the picture is back on the glass exactly when it covers),
  and StageDirector swaps only behind a glass that is both covering and
  opaque (`glassFormed`). That is how `synapse-decay` → `return-cubicle`
  pulls back from inside the cloud to the desk without a stop. Numbers come only from
  `data/survey.js` (single source of truth, n = 3,593 from the Aug 28 export;
  the video's older ~1,300-response figures must never be quoted on stage).
- `hover.js` — which chart row the pointer is over, shared by both renderers so
  one pointer can only ever light one row. The chart painters record their row
  rectangles as a byproduct of drawing, so hit-testing can never drift from the
  layout on screen. Hovering moves every element of that row up exactly one rung
  of the phosphor ladder — the one-hue rule applies to interaction too.
- `paint.js` — the Canvas 2D painter. Depth is **glow**, never a shadow (a
  shadow implies an object above paper; a screen has neither). Edges are hard.

The agent is scripted, not live — the screen is a texture in a 3D scene, and a
talk needs the same beat to land the same way at every rehearsal.

### `src/scene/`

- `CRTScreen.jsx` — the monitor. One plane, one shader, one canvas texture.
  Owns the session clock, repaints the canvas each frame, and damps the tube
  uniforms toward the slide's `crt` target. On a deep link it initializes at the
  target directly; navigated transitions snap exactly at the slide duration.
- `CameraRig.jsx` — flies to each slide's waypoint. `camera.fillScreen` solves
  the distance at which the screen plane exactly *covers* the viewport at any
  window aspect (no letterbox, no pillarbox) and disables input. CameraControls'
  response constant is not treated as duration: each flight is bounded and
  lands exactly where the slide declared.
- `Stages.jsx` — home, cubicle, monitor wall, and phosphor contexts. Every set
  stays mounted and its GPU programs are compiled before presentation; a shift
  is only a visibility change, never an asset load. The cubicle stage keeps
  its light rig, baked irradiance receivers and contact patches here;
  everything visible in the cubicle and the wall is a Blender export.
- **All three sets are authored in Blender** (home since 2026-09-02, cubicle
  and wall since 2026-09-03). Each has a build script that rebuilds its
  `.blend` from scratch at true metric scale on the deck's spatial contract
  (32.5 mm per scene unit; desk top at −8.34, office floor −29.54, office
  ceiling 33.3, aisle ±29, bays every 42 from −20; wall cells on a 20 × 16.5
  pitch inside ±94 / ±43 / −42) and an `export_scene.py` that writes the GLB:
  modifiers applied, transforms baked, meshes merged by material set, no
  lights or cameras. The shared kit is `blender/lib/`: `setkit.py`
  (primitives, materials, imports, `seat_on`, world-scale `box_project_uv`,
  fitted UVs, data-level `bake_object_transform`/`crease_by_angle`, lights,
  cameras), `deskprops.py` (the keyboard, mouse and mug every workstation
  carries), `export.py` (the pipeline). `blender/tools/inspect_set.py`
  prints bounds and an AABB clip sweep for a built set; run it before an
  export.
  - `blender/home-office` → `home-office.glb` → `HomeOffice.jsx` (~180k
    triangles). Poly Haven CC0 lamp/notebook/plant/stationery in `assets/`.
  - `blender/office` → `office.glb` → `CubicleOffice.jsx` (~120k). Three
    1.82 m bays per bank behind LOW dividers (880 mm; the outer runs and the
    far panel stay at 1.43 m, the hero bay's sides at 1.02 m), each bay a
    desk against its far divider with the CRT facing the camera and the
    chair's back to us, so from the aisle the office reads as two receding
    rows of lit workstations (Scott, 2026-09-06: the first cut kept the old
    tall dividers and side-facing screens and "looked the same"). A panel
    system with shared posts, caps, raceways, beltline rails and two-tone
    fabric tiles split at the beltline; laminate tops on steel C-frames that
    stand on the floor (columns, feet, rear beam, modesty panel — the first
    pass hung them on panel cleats and the hangers read as legs stopping in
    mid-air); the CAD chair and pedestal stood up and material-bucketed in
    Blender (full-res in the hero bay, decimated in the banks); the hero CRT
    housing decimated into every bay; a suspended ceiling with modelled
    tees, recessed one-by-two-tile troffers and return grilles on the same
    16-unit grid the runtime ceiling map paints (`ceiling.js` `gridOrigin`);
    occupancy dressing (desk phone, waste bins, pinned notes, power strip, a
    copier and a wall clock at the aisle's end) and double doors at the far
    end. The runtime light rig is one rect source per LIT troffer on the
    two driven rows (`OFFICE_FIXTURES` drives), not bars across the aisle:
    pools with dark intervals, and the idle rows over the far bays dark.
  - `blender/wall` → `wall.glb` → `AgentVault.jsx` (~170k). Floor-to-ceiling
    steel racks with shared uprights, a shelf and a decimated hero housing
    per cell, rear panels, per-cell power cables, cable bundles, ladder trays
    overhead, a trench cover on the floor. The wings sit at 72/66/59 rather
    than the old 78/69/60 because a 620 mm rack turned toward the camera
    reaches further than a 270 mm box did, and the cell pitch is 20 units
    rather than 19.2 because a 609 mm housing has to clear the uprights.
  - **Agent screens come from the GLB.** Each set's build writes the screen
    placements (three.js units and yaw) into the scene's `agent_screens`
    extra; `AgentMonitors.jsx` reads them, seeds variant/phase/drive, and
    draws the one instanced shader plane. The housings are in the export, so
    the screens cannot drift from them. The office fixture layout is the one
    thing mirrored in JS (`OFFICE_FIXTURES`), because the environment map and
    the ceiling wash need it before the GLB has loaded.
  - The runtime components re-material every named surface with the talk's
    shared maps (plaster/linen/wood/carpet, the laminate fleck print, the
    carpet tile field, the ceiling maps); a surface with no finish throws, so
    a new Blender material cannot silently ship as white. UVs are authored in
    metres (box projection at one tile per metre, fitted 0–1 on the floor and
    ceiling slabs), so a runtime repeat is tiles per metre. Fitted maps are
    sampled with `flipY` off: the exporter flips V, and that puts a painted
    map's top row at the slab's far end where the painters put it.
  - Every imported prop is placed with `seat_on`, which measures the asset's
    lowest vertex and rests it on the surface — origins in downloaded assets
    are wherever their author left them. The lamp exports as dark painted
    metal because its stock orange enamel would be the one saturated colour
    in an amber room. `Room.jsx` now only supplies `DESK_Y`/`OFFICE_FLOOR_Y`;
    the CAD home set, the procedural cubicle (`OfficeDetails`, `Props`, the
    instanced panel/worktop/frame system) and the box-built wall live in git
    (retired 2026-09-03).
- `Effects.jsx` — restrained bloom, vignette, explicit ACES filmic tone mapping,
  FXAA, and banding dither. **All of it zeroes on a `fillScreen` slide.**
  EffectComposer forces the renderer to `NoToneMapping`, so ACES must live in
  this chain or bright office values clip directly to display white. Screen-space
  AO, depth of field, chromatic aberration, and SMAA were removed because large
  scene/depth changes produced block flashes and contributed more game-render
  look than realism.

### `src/shaders/crt.js` — the tube

A GLSL port of the `crt-tube` effect from `gfx-computer`
(`src/lib/pipelines/effects/crt-tube`, TypeGPU/WGSL). Same physics, same
constants: gaussian-beam scanlines with peak normalization, three phosphor mask
modes each normalized to its analytic mean transmission, halation with a
luminance knee, barrel curvature, rounded-rect tube SDF, vignette.

**`uTube` is the master dial.** At 0 the shader is a bit-exact passthrough of
the canvas — a flat screen recording. At 1 it's a cathode ray tube. Animating
that one uniform IS the reveal. "Bit-exact" is literal since 2026-09-10: the
canvas texture is sRGB, the sampler returns linear light, and on a flat slide
the composer is OFF and the material draws straight to the canvas, so every
output goes through three's per-target `linearToOutputTexel` (the sRGB curve
into the canvas, identity into the composer's linear target). Before that
every flat frame shipped its linear values — a stop darker and more saturated
than the `?flat` renderer, which is why flat slides "read darker than tube
ones" for weeks.

**`uEmissiveGain` keeps the glass emissive under ACES.** The canvas is LDR, so
without HDR headroom the composer's tone map rolls the screen to mid-gray and
the "only light source in the room" reads dimmer than its own spill. Each stage
declares `screenGain` in its look preset (environment.js); flat slides force 1
so the cold open stays a bit-exact canvas, and the phosphor stage stays at 1 so
the measured shader/geometry handoff parity survives. Exposure targets are
gated numerically in QUALITY.md §Q5b — brightness is a gate, not taste.

`uResolution` is the **texture's** pixel size, not the viewport's, so the
phosphor mask is fixed to the glass and magnifies as the camera approaches — the
way a real shadow mask does, and what the into-the-glass beat needs.

**Three things had to be added to the port**, because the original is a
full-frame post-process where one texel is always one screen pixel. As geometry
in a 3D scene that stops being true:

- **Raster and mask alias hard** when the tube is small on screen. Mipmaps don't
  help — those patterns are *computed*, not sampled. Both fade on measured
  screen-pixels-per-period.
- **The scanline taps break mipmapping.** `kA / linesN` is a step function of
  `vUv.y`, so its automatic derivative explodes at every raster boundary and the
  GPU picks a garbage mip along each line — which renders as a **ghosted second
  copy of the text**. Fixed by selecting LOD from the smooth coordinate with
  `textureGrad`, which is why the material is GLSL3.
- **Halation is a NEAR-FIELD effect and ghosts under minification.** 24 point
  samples can only represent a smooth halo while the texture is near 1:1 on
  screen; minified, every tap lands on a blurry mip blob, the taps stop fusing,
  and you get discrete displaced copies of the text — a doubled image, worst on
  high-contrast type, which is all this screen has. Faded on **texels per screen
  pixel**, not on the halo's size in pixels: the halo is still several pixels
  wide long after the taps have stopped fusing, so that metric reads ~0.9
  exactly where the ghost is worst. Strength also dropped from 0.3 to 0.15.
  Scene bloom carries glow at distance; halation returns as the camera pushes
  into the glass, which is where it belongs.

Tune live in dev: `__crt.hold = true; __crt.uMaskStrength.value = 0.8`.

### Shared surfaces and selective baking

`src/scene/surfaceProfiles.json` is the first shared Blender/runtime material
contract: cubicle upper/lower fabric, office chair wool and home walnut. It
specifies local maps, tint × albedo, scalar × roughness, physical repeats and
surface response. `blender/lib/setkit.py` and `src/lib/surfaceProfiles.js` both
consume it; other materials have not all migrated yet.

The office floor uses `blender/office/bake_floor.py`'s Cycles diffuse bake on its
existing fitted UV0. It **replaces** the analytical floor pool/contact cards;
it does not add illumination on top. Re-bake after geometry, light or contract
changes. `public/textures/README.md` documents the radiance encoding and command.

FXAA must remain an explicit output **pass** after ACES (`lib/postOutput.js`),
not a fused effect sampling HDR neighbours against a tone-mapped centre.
`pnpm test` covers these integration contracts; it is not visual acceptance.

First-pass evidence and outstanding timing/AA gates:
[`docs/set-integration-2026-09-05.md`](docs/set-integration-2026-09-05.md).
The current integration is **not stage-approved**.

### The phosphor beats (after the glass)

`PhosphorField.jsx` carries three authored states, morphed by slide cues
`phosphor.form` and `phosphor.decay` (eased like opacity/depth):

Every mote also carries a slow seeded DRIFT, damped hard once the synapse
forms. The time uniform used to reach the fragment shader only, so the cloud was
frozen in space and the beat died the instant the camera stopped — a still field
of dots is a texture, and the volume is the whole point of being inside it.

- **Dream** (`inside-glass`, form 0) — an ethereal cloud of scattered glowing
  motes, deliberately unreal; a seeded sparseness gate keeps only ~8% of the
  34k deposits visible so the dots float in real darkness. They are FIREFLIES:
  each wanders on its own slow seeded Lissajous path and blinks on its own
  rhythm.
- **Synapse** (`synapse`, form 1) — the motes stream into a seeded neural
  network: node cores, filament edges, slow signal beads traveling the
  connections. Each dot has its own formation delay, so the network assembles
  rather than lerps, and the wander damps to nothing as it forms — the
  fireflies settle and stay put.
- **Loss** (`synapse-decay`, decay 1) — connections die one by one on seeded
  cues, signals dying with them, leaving isolated dimming nodes. This is the
  "losing brain connections" image; the beat exists for it.

A per-grain thin-lens model (focus depth 5.0) turns out-of-focus motes into
energy-conserving bokeh discs — the macro-lens look, without the post-process
DoF that was removed for flashing. All of it is gated on `vRestMix`, so the
measured shader/geometry handoff parity at the threshold is untouched.

### `?flat` — authoring without the 3D

`src/ui/FlatScreen.jsx` paints the screen's canvas straight to the page: no R3F
mount, no WebGL context, no shader compile. Same sessions, same painter, same
nav — so it's a faithful preview of what the glass will say, minus the tube and
the camera. Use it to work on content. It's also the stage fallback if WebGL
fails on the projector.

Playback semantics (which session is showing, which step, how far through) live
in `src/terminal/playback.js` and are shared by both renderers, so flat mode and
the tube can't drift apart.

### State

- `src/state/useStore.js` — slide index plus an independent, Enter-driven
  session step. `?slide=<id>` persists across reloads.

  **ONE ARROW PRESS IS ONE SLIDE.** Never let arrows advance session state. The
  moment an arrow advances something *inside* a slide, the counter stops moving,
  `?slide=` can no longer describe where you are, the 0–9 jumps lose position,
  and "go back two" stops meaning anything. Enter/backspace perform the fake
  terminal while arrows remain the trivial inverse of one another.

  If you touch navigation, re-run the check: walk forward to the end recording
  every index, assert each press moved it by exactly one, walk back, and assert
  the sequence is the exact reverse.
- `src/state/useKeyboardNav.js` — → next, ← back, Enter/backspace session
  step, `y`/`n` answer the grill (inert anywhere else), **0–9 jump**, `f`
  fullscreen. Space is deliberately unbound.
- `src/state/useSessionAutoplay.js` — a slide marked `autoplay` plays its
  session on an authored schedule instead of on Enter, for beats the MACHINE
  performs rather than the presenter. One press of Enter or Backspace hands it
  back for the rest of the visit. It never touches the slide index, so the
  arrow invariant above is untouched.

### UI

`src/ui/Overlay.jsx` is presenter chrome only: the clock in the top-left
(`TalkTimer.jsx`: counts up from 0:00 when the deck loads, a click resets it,
the start survives a reload so the `?flat` fallback keeps counting) and the
slide counter in the top-right (`n / N`, always on since 2026-09-10 by Scott's
call). The fuller readout — slide id and session step — stays behind `?hud`,
bottom-right. `src/index.css` is small for the same reason.

## Conventions & gotchas

- **The screen texture is 2560×1440**, 16:9 so it fills a projector exactly edge
  to edge in the cold open. The tube gets its 4:3-ish character from the
  shader's barrel warp and bezel, not from the texture's shape.
- **The stage is always 16:9.** `#root` is a 16:9 box that fits the window
  (`index.css`), letterboxed or pillarboxed on the page background, and both
  renderers fill it. A resize scales the whole picture; it never re-frames it,
  so what you rehearse in a window is what a 16:10 laptop panel or a 4:3
  projector shows, smaller. Anything sized in device pixels (the dust sprites,
  the ceiling-grid moiré fade) follows the drawing buffer, not a constant, so
  720p and 4K outputs match the 1080p reference.
- **80 columns.** Font size is derived so exactly 80 characters land across the
  usable width; the caret is positioned by *measuring* the line, not by
  multiplying a column count, so it can't drift off the end of typed text.
- **Wait for fonts before the first paint.** Text measured before JetBrains Mono
  lands silently uses fallback metrics and the grid shifts a beat into the talk.
  `ensureFonts()` gates it; `clearWrapCache()` after.
- **Nurb GLBs have no UV channel.** Do not box-project a tiled normal over a
  compound prop: projection seams and repeated grain look worse than a clean
  material and de-index the mesh. Macro textures belong on geometry with an
  intentional projection (the office chair's upholstery gets a 620 mm box
  projection in the Blender build; the worktops and partitions carry metre
  UVs). Small CAD props use authored edges plus physically distinct broad
  roughness.
- **Nurb GLBs also ship per-face normals, and `mergeVertices` cannot smooth
  them** — it compares every attribute, so coincident vertices carrying
  different face normals never merge and recomputed normals stay flat. In
  Blender, `crease_by_angle` marks edges over 40° sharp before export (a CAD
  box shaded fully smooth is a gradient blob — the office's first build); at
  runtime the same idea is `lib/propSurface.js`, applied to the hero housing
  and to the exported bay/wall housings: `toCreasedNormals` at 40° (lathe
  facets shade round, chamfers stay crisp), the `weatherGeometry` pass
  (per-vertex cavity darkening, convex-edge wear, seeded mottle — no UVs
  required), and `varyRoughnessByWear`, which drives ROUGHNESS from that same
  vertex data so grimy cavities scatter light and handled edges tighten it.
  Uniform roughness is most of what reads as lifeless clay. The home
  environment map also carries STRUCTURED sources (window panes, door slit)
  because a gradient-only environment gives every specular a shapeless wash.
  The office map's troffer apertures are a reflection budget scaled to the
  fixtures' AREA: when the recessed lenses grew to one tile by two, the
  aperture radiance came down by the same 3.3× or the laminate clipped white.
- **The hero CRT housing is Blender-authored too** (since 2026-09-02):
  `blender/home-office/build_monitor.py` lofts the shell, steps the fascia,
  and exports `public/models/crt-monitor.glb` in the CAD frame (mm, X width,
  Y up, screen facing +Z) that `Monitor.jsx` consumes unchanged. The contract
  it keeps is in that script's docstring: the 523 × 295 opening at Y −17, the
  −12 pocket floor, the −288 stand underside, the chin control positions, and
  four MATERIAL SLOTS — `CRT shell`, `CRT face` (the bezel moulding: front,
  fascia, chin and the sides forward of the mould split), `CRT stand`,
  `CRT inner return` — exported as glTF primitives that `Monitor.jsx` merges
  back into one geometry with groups and finishes BY NAME, like every set.
  It used to bucket triangles by centroid ("stand below Y −180"), and the
  chin, which runs to −242 and was filled with housing-wide sliver
  triangles, came out half stand material: hard-edged lighter wedges on the
  front panel of every room slide (Scott, 2026-09-09). The front annulus is
  now a constrained Delaunay fill over a 32 mm grid and every rounded loop
  subdivides its straight runs, so per-vertex shading has vertices to land
  on and the decimated copies collapse cleanly. The sides are clean — no
  vents: boolean cuts read as torn rims and conformed strips read as
  stickers. Corners are tight (14 mm on the face, 6 mm at the opening); the
  first pass at 38 / 12 read as a rounded 2000s appliance. The same GLB is
  the source for every distant housing: the office and wall builds import
  it (all slots collapsed to one material), crease it, and decimate it to a
  third for the bays and the cells — rebuild and re-export both sets after
  changing the housing.
- **Quality per frame beats brute-force resolution.** DPR caps at 1.25, FXAA
  resolves edges after one shaded scene sample, variance shadow maps update only
  when a stage swaps, and repeated office/monitor assets stay instanced. Preserve
  those economics when adding detail.
- **The render loop is capped at 60 fps.** `FrameCap.jsx` owns the loop
  (`<Canvas frameloop="never">`) and calls R3F's `advance` only once a full
  frame interval has passed, so a 120 Hz laptop panel renders half the frames
  and the 60 Hz projector renders every one. The deck is GPU-bound (a settled
  slide holds Chrome's GPU process at 99%), and load is pixels × frames/s.
  Everything animated eases on `useFrame`'s real delta, so a skipped frame
  moves the picture the same distance as two rendered ones. In never-mode R3F
  derives that delta from the timestamp handed to `advance` in whatever unit it
  is given; FrameCap passes SECONDS (animation-frame timestamps are ms) and
  seeds the clock one frame behind the first timestamp.
- **Do not bolt on progressive path tracing.** Camera flights and the animated
  terminal texture invalidate accumulation, and the wall/phosphor architecture
  depends on instancing that the primary WebGL path tracer does not support.
  Prefer local HDR/PMREM, real PBR map sets, modeled silhouettes, and static or
  baked lighting for this deterministic presentation renderer.
- **Deep-linking works.** A slide with no session of its own resolves the most
  recent session at or before it and paints it complete, so `?slide=` and the
  0–9 jump keys never show a dead screen.
- **The screen must stay alive.** A monitor whose cursor has stopped blinking
  reads as a photograph of a monitor.
- For the live talk: **record a full screen-capture backup run.** Insurance
  against WebGL or projector failure. Non-negotiable.
