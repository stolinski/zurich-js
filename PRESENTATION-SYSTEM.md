# Presentation system

This document protects the talk from becoming a sequence of slide-specific scene
hacks as its content grows. `PLAN.md` owns narrative intent, `QUALITY.md` owns
acceptance, and this file owns the authoring/runtime boundary.

## Direction

Use a finite, compiled slide specification backed by two small catalogs:

1. **Stage catalog** — atomic structural combinations of sets, dressing,
   representations, lighting, environment, post, and shadows.
2. **Cue presets** — reusable settled targets for camera, CRT, phosphor, visual
   layout, and transitions.

A slide selects one stage and declares complete cue targets. Do not introduce a
plugin framework, runtime inheritance, arbitrary callbacks, or dynamically
loaded slide components.

Canonical terms live in `CONTEXT.md`.

## Invariants

- One arrow press is one Slide.
- Enter/Backspace affect only the fake-agent Session.
- `displayStage` is the sole structural scene authority.
- Adjacent Stage changes route through the hero glass in both directions.
- Deep links restore exact settled state rather than replaying history.
- Every Representation stays mounted and is allocated/warmed before readiness.
- Navigation mutates existing references, vectors, uniforms, or resident target
  buffers; it does not create programs, textures, geometry, or materials.
- Missing visual content means no visual content, not “inherit the last one.”
- The cold open remains a hard flat-screen invariant above all stage styling.
- Everything remains deterministic, offline-safe, and available in `?flat` when
  it carries legible content.

## Current authoring contract

`src/slides/index.js` remains the file used to arrange the talk. Today it
contains top-level camera/CRT/phosphor fields for compatibility. New content
should be designed toward this resolved shape:

```js
{
  id: 'weekly-hours',
  beat: 'survey-cost',
  stage: 'phosphor',
  session: WEEKLY_HOURS,
  cues: {
    camera: CAMERA_CUES.insideGlass,
    crt: CRT_CUES.hidden,
    phosphor: {
      source: { visual: 'weekly-hours', view: 'distribution' },
      opacity: 1,
      depth: 1,
    },
  },
  transition: TRANSITIONS.dataMorph,
}
```

A cue describes the destination. It does not contain React components, asset
paths, raw lights, callbacks, or navigation substeps.

## Structural catalog

`src/presentation/stages.js` is the finite catalog of available atomic contexts.
Add a new Stage only when discrete geometry, dressing, representation
availability, lighting, environment, or shadow policy genuinely changes.
Numeric emphasis, opacity, data layout, and morphing remain Cues so the catalog
does not explode.

Lighting values are reusable stage intent, never slide IDs. The current look
presets live in `src/scene/environment.js`; they should eventually move behind a
presentation-level lighting-intent API consumed consistently by Scene, Effects,
CRT glass, environment, and shadow warmup.

## Semantic visuals

Future survey slides should define data once in a closed semantic catalog, for
example:

```js
'weekly-hours': {
  kind: 'distribution',
  values: survey.weeklyHours,
  domain: [0, 80],
  format: 'hours',
}
```

Initially support only visual forms demanded by the talk. The same definition
must drive:

- terminal Canvas 2D output,
- the `?flat` fallback,
- precompiled phosphor morph targets,
- and any later physical Representation.

Do not build a generic chart grammar.

## Transition policy

Slides author duration and easing. Runtime derives the route:

- same Stage → direct camera/cue transition,
- adjacent different Stage → occlude, commit `displayStage`, reveal,
- nonlocal jump/deep link → exact restore.

The existing camera route transition is not a universal slide timeline. If
future visuals need a shared clock, add a separate monotonic cue transition; do
not overload a route that resets at an occlusion commit.

## Phased implementation

### Phase 1 — catalog without visual change

- [x] Add the Stage catalog.
- [x] Validate slide IDs, stages, camera endpoints, and cold-open invariants at
  module initialization.
- [x] Use catalog stage IDs for presentation warmup state.
- [ ] Derive mounted-group warmup annotations from catalog usage instead of
  parallel hand-maintained arrays.
- [ ] Route all stage-dependent consumers through the selected Stage's lighting
  intent.

### Phase 2 — compile complete slide snapshots

- Add frozen camera, CRT, phosphor, and transition presets only where reused or
  where they protect an invariant.
- Move `smoothTime` to `transition.duration` with a temporary compatibility
  accessor.
- Resolve all cue defaults once in `defineSlides()`.
- Remove redundant `screenOpacity`; geometry opacity remains the source of
  truth.
- Keep Session fallback as the only implicit carry-forward behavior.

### Phase 3 — add concrete data visuals

- [ ] Add current survey data to the existing closed visual catalog.
- [x] Add deterministic Session visual steps rendered through Canvas 2D.
- [x] Add terminal bar, distribution, and sparkline renderers.
- [x] Load Syntax, Sentry, and QR artwork into the terminal canvas from local assets.
- [ ] Precompile all phosphor target layouts before presentation-ready.
- [ ] Select resident phosphor targets by ID; never allocate them during navigation.

### Phase 4 — extend from real slide ideas

For each genuinely new material form:

1. add an explicit pre-mounted renderer,
2. add one Representation ID,
3. add or reuse a Stage,
4. add its real warmup/allocation evidence,
5. add a faithful flat fallback where it carries meaning.

## Non-goals

- No plugins or dynamic imports.
- No arbitrary JSX/functions in slide declarations.
- No per-slide raw light intensities.
- No previous-slide visual inheritance.
- No cue timelines that consume arrow presses.
- No unmounting/remounting during the talk.
- No renderer-specific copies of survey values.
- No transition callback capable of bypassing glass occlusion.
