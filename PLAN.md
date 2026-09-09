# The True Cost of AI Coding — build plan

A conference talk that opens on a title inside a flat screen, becomes an AI
agent harness, and ends up somewhere else entirely. This document is what we're
building and the order we're building it
in. It is a working file — edit it as decisions land. `ART-DIRECTION.md` defines
what the rendered world must feel like; the durable slide/scene authoring
boundary is defined in `PRESENTATION-SYSTEM.md`; canonical terms live in
`CONTEXT.md`.

Source material: the [video](https://www.youtube.com/watch?v=iPUn1Fnfn0k) and the
[survey](https://ai-health.syntax.fm) (n = 3,593, Aug 28 refresh). The
argument built from them is in [`NARRATIVE.md`](./NARRATIVE.md).

---

## 1. The idea

The talk is one continuous camera move through four scales, and each transition
recontextualises everything before it.

**① The cold open — a screen, then an agent harness.**
Full screen. The first image is only “the true cost of ai coding.” Syntax,
Sentry, and the talk QR then load as monochrome local assets inside the same
screen. The interface resolves into an AI coding harness—not a shell prompt:
Scott taps, a user turn types, an agent thinks, a tool runs, an answer streams
back, and the harness plots the result in old-computer vector graphics. There is
no DOM slide chrome or perspective.

**② The pull-back — it was a CRT.**
The camera moves for the first time. The tube comes up as it goes: the text
that was flat a second ago bends into a barrel warp, a shadow mask resolves out
of the phosphor, the glass edge appears. The terminal was an object.

**③ The room — it was one of many.**
Keep pulling. The monitor is on a desk, the desk is in an office, and the
office is full of monitors, each one running its own agent. This is where the
talk's argument about productivity pressure gets made in the environment rather
than on a slide.

**④ Into the glass — the Matrix beat.**
Push back in, past the surface. The phosphor triads that were texture at 1×
become structure at 100×, and the subpixels are what the charts and imagery are
built out of from here.

**⑤ Grow from there.** — open. See §7.

The through-line: every level of this talk is something you thought you were
looking at, seen from one step further out. That is also the argument.

---

## 2. Rules that protect the trick

These are load-bearing. Breaking one costs the cold open, and the cold open is
the whole talk.

1. **The cold open is pixel-flat.** No bloom, no vignette, no chromatic
   aberration, no dither, no perspective, no visible screen edge at any window
   aspect. All post-processing zeroes on a `fillScreen` slide and camera input
   is disabled. One sliver of background in frame and the audience knows.
2. **Everything is drawn. No DOM, anywhere.** The screen is a canvas texture in
   a 3D scene. Text is painted with Canvas 2D and measured with
   [`pretext`](https://github.com/chenglou/pretext) — never measured against the
   DOM (that reflows the page mid-talk) and never rendered as an HTML overlay.
3. **One hue on the glass, hierarchy is intensity.** Phosphor is driven harder
   or softer; it never changes colour. Alerts are brighter amber, not red.
   (Amber since 2026-08: matched to ai-health.syntax.fm's `--accent #ffd54a`.)
   (From the `crt-terminal` Pack in `gfx-computer`.)
4. **No bitmap/pixel fonts.** JetBrains Mono at real weights. The period feel
   comes from the tube material — glow, raster, halation — never the
   letterforms. Pixel faces read retro-game at 4K and fail on long body text.
5. **Every procedural lattice needs a Nyquist guard.** Anything computed in the
   shader — raster lines, phosphor mask, halation rings — moirés the moment the
   tube is small on screen. Fade on measured screen-pixels-per-period. See §6.
6. **Calm motion.** Slow drift or nothing. No per-frame churn, no twinkle, no
   grain. Inherited from the previous deck, where animated noise was the single
   biggest source of visual cheapness.
7. **Deterministic.** Seeded randomness everywhere. What you rehearse is what
   the room sees.
8. **Offline-safe.** Fonts self-hosted, no CDN fetches at runtime. Conference
   wifi is not a dependency.

---

## 3. Architecture

```
src/
  terminal/          the fake agent harness — everything drawn onto the glass
    theme.js         phosphor palette, screen metrics, font loading
    session.js       script model, step timing, frame builder, wrapping
    paint.js         Canvas 2D painter (glow, caret, roles)
  shaders/
    crt.js           the tube: raster, phosphor mask, halation, curvature, bezel
  scene/
    CRTScreen.jsx    screen mesh + canvas texture + tube material
    CameraRig.jsx    slide waypoints; `fillScreen` solves the covering distance
    Stages.jsx       home, cubicle, wall, phosphor + occluded set swaps
    Effects.jsx      post; zeroes itself on flat slides
  slides/index.js    THE TALK — beats, camera, tube params, sessions
  state/             slide index + Enter-driven session step (arrows only slide)
```

**Content flows one way:** a slide declares a `session`; the presenter's taps
advance a step; `buildFrame` turns (script, step, progress) into display lines;
`paintTerminal` draws them; the tube shader makes it a screen; the camera
decides how much of a screen you can tell it is.

### Key mechanism: `uTube`

One uniform, 0→1. At 0 the fragment shader is a bit-exact passthrough of the
canvas. At 1 it's a cathode ray tube. **Animating that dial is the reveal in
movement ②.** Everything else (`curvature`, `maskStrength`, `halation`, `bezel`,
`vignette`, `focus`, `lines`) is art direction on top, declared per slide.

---

## 4. Status

**Visual acceptance is governed by [`QUALITY.md`](./QUALITY.md).** “Improved” is
not “passed”; its image, transition, asset, material, lighting, and clearance
bars must all be evidenced on the target presentation hardware.

**Working now** — `pnpm dev`, then → / ←.

| Piece | State |
|---|---|
| Terminal painter, palette, metrics | done |
| Session scripting + tap-to-advance | done |
| Tube shader (GLSL port + 3 Nyquist guards) | done |
| Flat cold open (post zeroed, aspect-solved framing) | done |
| Reveal (`uTube` 0→1) | done |
| Dev handle `window.__crt` for live tube tuning | done |
| Phase 0 demolition | done |
| `?flat` authoring mode (no WebGL) | done |
| Monitor body, room, lighting | photographic pass in progress |
| Home/cubicle/monitor-wall stages | first pass done |
| Into-the-glass handoff | first pass done |
| Terminal title + agent-harness UI | first pass done |
| Syntax/Sentry/QR terminal asset screens | first pass done |
| On-glass chart engine | first pass done (bar, distribution, sparkline) |
| Content draw/undraw sweep (ghost preview, ignition band, phosphor-decay undraw) | done |
| Measured exposure/emissive pass (QUALITY.md Q5b anchors) | first pass done |
| `statement`/`stat` visual forms + threshold act markers (placeholder copy) | done |
| Amber palette matched to ai-health.syntax.fm across every tint | done |
| Phosphor morph system (`phosphor.form`/`decay` cues + thin-lens bokeh) | done |
| Movement ⑥: dream motes → synapse network → connections dying | first pass done |
| Survey data layer (`src/data/survey.js`, n = 3,593) | done |
| Talk narrative + beat sheet (`NARRATIVE.md`) | done |
| Full 49-slide spine (`slides/index.js`, NARRATIVE beat sheet) | done |
| 20 survey visuals wired to the frozen data | done |
| `series` + `diagram` visual forms | done |
| `?visual` catalog review mode (`ui/visualReview.js`) | done |
| `quadrant` phosphor morph (slide 39 ships as a ranked bar) | **not started** |
| Prop surface pass: densified mouse shell, 64-side lamp members, chair fabric UVs + margin-safe segmentation | done |
| Prop materiality: creased normals (40°) + per-vertex cavity/wear/mottle weathering + firmer desk contact | done |
| Surface life: wear-driven roughness, structured home env (window/door shapes), monitor housing finished + vent louvers | done |
| Scott's real usage numbers + personal stories | **blocked on Scott** |
| Final copy (all statements/sessions are draft) | **not started** |

### Deterministic arrival

A slide has one settled frame regardless of path. Deep links install camera,
CRT, stage, and phosphor targets immediately. Navigated flights treat
`camera.smoothTime` as a bounded duration, drive CameraControls with a faster
response constant, and snap the final sub-pixel remainder at that duration.
CRT and phosphor uniforms settle on the same boundary.

All four stages stay mounted and local assets plus GPU programs are resolved
before presentation; context changes are visibility flips. Screen-space AO,
depth of field, chromatic aberration, and asynchronous SMAA were removed after
large set/depth changes produced white block flashes and path-dependent blur.
The stable post stack is half-resolution bloom, a small vignette, explicit ACES
filmic tone mapping, final FXAA, and static sub-LSB dither; flat slides bypass
the composer entirely. ACES must be an effect: EffectComposer intentionally
sets the renderer itself to `NoToneMapping`.

---

## 5. Phases

### Phase 0 — Demolition ✅

The repo was a copy of *This Component Could Have Been A Div*. None of its world
survived. All of it is in git at `e1e782b` if it's ever wanted back.

**Removed:** the 11 old scene components (`Universe`, `Planet`, `Galaxy`, `Sun`,
`Nebula`, `Sandworm`, `ReactAtom`, `BrowserSupport`, `LogoConstellation`,
`HtmlPanel`, `DissolveCard`) and `scene/layout.js`; all 17 platform demos;
`lib/htmlInCanvas.js`; `ui/CodeBlock.jsx`; the browser-support logos and
`anchor.png`; `public/fonts/` (JetBrains Mono now ships via `@fontsource`); and
~2030 lines of `index.css`.

**`?flat` was removed and then put back** — it was cut on the mistaken reasoning
that it existed to author DOM content. It doesn't: it exists to work on the talk
without booting the 3D, which is if anything more useful now. Rebuilt in
`ui/FlatScreen.jsx` — the screen's canvas painted straight to the page, no R3F
mount, no WebGL context, no shader compile. Playback semantics moved to
`terminal/playback.js` so the flat and 3D renderers cannot drift. It doubles as
a stage fallback if WebGL dies on the projector.

**Kept:** `shaders/snoise.js` (fbm noise — wanted for room materials, dust and
glass imperfection in phase 1) and `public/logos/{syntax,sentry,qr}.svg`.

**Content is data, and stays data.** A session is a plain array of step objects
in `terminal/session.js`; `paint.js` is a renderer that knows nothing about the
talk; `slides/index.js` is pure config. No talk content lives inside rendering
code, which is what makes flat mode a faithful preview rather than a second
implementation.

**Also done:** `ui/Overlay.jsx` reduced to a presenter HUD that is **hidden
unless you pass `?hud`** — a slide counter in the corner during the cold open
tells the room they're watching a deck. `CLAUDE.md` rewritten against this plan;
it described the solar-system talk in full and would have misled every future
session.

### Phase 1 — The monitor as an object ✅ (first pass)

**Settled: a widescreen Trinitron, FW900-alike.** Black, heavy, professional —
not a beige 1997 CRT, which would turn the reveal into a retro gag in a talk
about burnout. Black also lets the reveal arrive in stages out of a dark room
rather than announcing the whole object in one frame. Repaint via `SHELL` in
`Monitor.jsx`. A 16:9 tube isn't a cheat — widescreen CRTs existed, and it's why
the cold open fills a projector with no letterbox.

**Built:** a Blender-authored monitor housing and home room (`blender/home-office`,
`scene/HomeOffice.jsx`), a Blender-authored office and wall on the same kit
(`blender/office` → `scene/CubicleOffice.jsx`, `blender/wall` →
`scene/AgentVault.jsx`, since 2026-09-03), `scene/Scene.jsx` (composition + stage-aware lighting), and a single
square-on `reveal` where the housing arriving around an already-accepted image
is the point. The three-quarter and profile waypoints that once followed it were
cut: they re-explained the same fact from two more angles, and the punchline
only lands once.

**Lighting principle:** at HOME the screen is the only real light source. That's
not styling, it's the argument — at 3am the monitor is the only thing on. A
phosphor-tinted lamp at the glass, ambient near zero, plus a cold doorway rim.
The CUBICLE breaks that palette on purpose: broad neutral fluorescent panels,
a pale office reflection environment, and a large soft shadow source make it
feel exposed and institutional rather than like the home set with partitions.

**Three fixes this shook out:**
- **The bezel intruded into the cold open.** Standing proud of the glass put it
  nearer the camera than the screen it frames, so at the covering distance it
  subtended a wider angle and crept into frame as a dark border. Now extruded
  backward, flush with the glass, with a wider opening; `CameraRig` also
  overscans 2%.
- **Content could run off the tube.** The barrel warp overscans and oblique
  angles foreshorten the far edge, so prose now wraps to `SAFE_COLS`, not the
  full grid. Same reason broadcast has a title-safe area.
- **The screen went dead between taps** — which is most of the talk, since
  that's when Scott is speaking. There's now an idle prompt with a blinking
  cursor, shown only once the agent's *turn* is over (looking ahead past blank
  lines for the next `user` step), never mid-tool-call.

**Second pass landed:** local CC0 PBR timber/plaster, deterministic glass
roughness, Fresnel-only unlit faceplate reflection, dust, paired housing vents,
chin seams/controls, restrained post, and genuinely distinct 30°/70° reveal
angles.

**Material/lighting pass landed:** the walnut desk gets intentional directional
UVs; tiled box projection was removed from compound CAD props after its seams
made plastic, notebook and keycaps look patterned. Small objects rely on their
authored edge response and broad roughness. Home uses warm veneer and dim shaped
light. Cubicle uses a separate rounded physical laminate worktop, real CC0 PBR
carpet/linen sets, a local CC0 HDR office PMREM, a modeled ceiling grid, and
modeled/instanced task chairs, filing pedestals, and recessed fluorescent
troffers. The office floor is now at an actual 730mm desk-height relationship;
chairs clear desk fronts rather than intersecting them.

**Quality-per-frame pass landed:** keycaps dropped from 13,404 CAD triangles to a
purpose-built 300-triangle dished mesh while remaining one instanced draw; four
office fixtures use two broad area sources; point-light cube shadows are gone;
static variance shadow maps update only on set swaps; DPR caps at 1.25; one
final FXAA pass replaces 2× scene MSAA; bloom uses four half-resolution levels; full-screen
terminal typing does not regenerate mipmaps. The flat→tube wake is now a staged
2.4s choreography: raster first, then curvature/glass/bezel, avoiding a flat and
warped glyph being crossfaded over one another. Progressive path tracing is not
the route for this renderer: every camera flight and terminal upload invalidates
sample accumulation, while the wall and phosphor field depend on instancing.
Static/baked light, HDR image-based lighting, PBR maps, and stronger modeling
provide deterministic quality instead.

### Interlude — the 2026-08 exposure and transition pass

Three systemic fixes landed together; the lessons are load-bearing:

- **The canvas is LDR, and ACES eats LDR.** On object slides the composer's
  tone map rolled a 1.0-peaked screen down to mid-gray, so the "only light on
  at 3am" was the dimmest thing in its own frame. `screenGain` in the stage
  look presets now drives the glass into HDR before ACES (flat slides force 1
  so the cold open stays bit-exact). The same idea applies to every emissive:
  troffer diffusers and wall agents sit above 1.0 pre-tonemap. QUALITY.md Q5b
  turns this into numeric anchors so it cannot silently drift back.
- **Never `sin()` a large hash argument in a shader, and never let an
  instanced attribute go undefined.** A dropped `phase` field fed NaN into
  `vPhase` and silently blanked 24 wall screens (NaN poisons every downstream
  `fract`/`step`, and `clamp(NaN)` differs per GPU); the agent-screen hash now
  uses a range-safe polynomial (no `sin`), which is also bit-stable on
  whatever GPU the projector laptop has.
- **Content changes sweep; they never cut.** `playback.js` owns a
  deterministic undraw→draw raster wipe (hot scan edge, charts grow their
  elements behind it, title types itself) shared by the tube and `?flat`.
  Enter-driven steps inside a session never sweep — typing IS that
  transition. Deep links initialize settled, so direct and navigated arrival
  stay pixel-identical.
- **Authoring cameras near the glass:** barrel warp plus the dome shifts
  visible content up to ~0.9 world units at close range — aim below the
  region that should fill the frame, and verify with a capture, never with
  plane-intersection arithmetic.

### Phase 2 — Repeatable contexts and the wall ✅ (first pass)

`scene/Stages.jsx` lets every slide declare
`stage: 'home' | 'cubicle' | 'wall' | 'phosphor'`.
The hero monitor never changes; the surrounding context reclassifies it:

1. **Home office** — one person alone with the screen.
2. **Cubicle** — the same behavior becomes institutional and repeatable.
3. **Agent wall** — 54 procedural agents surround the full-resolution hero,
   turning individual productivity pressure into infrastructure.

Each context change happens behind the covering glass: a glass-filling slide
sits on at least one side of it, and when the camera is not already at the
cover point CameraRig pushes into the glass first (the home → cubicle change,
since `cubicle-threshold` was cut on 2026-09-09). The stage director keeps the
old set mounted until the projected hero glass covers the viewport, then swaps
while occluded. This works forward and backward; nonlocal 0–9/dev jumps resolve
immediately. It preserves one-press/one-slide navigation and avoids a visible
scenery cross-fade.

**The architecture that makes this affordable:** distant sessions are rendered
for **silhouette and rhythm**, not legibility. The wall's racks and housings
are one Blender export merged by material (a dozen draws), and every screen
is one instanced custom-shader draw whose placements the export carries as a
scene extra. Seeded per-instance phase, line shape, and drive make every agent
differ without 54 canvases, textures, or lights. A single broad area source
represents their already-fused aggregate spill. The hero keeps its
full-resolution session canvas and full tube shader.

### Phase 3 — Into the glass ✅ (first pass)

The handoff runs in three real slide beats:

1. **Approach.** The mask pitch is defined in *texture* space, so triads
   magnify on screen automatically as the camera closes. Push `maskStrength` up
   and `focus` tight so they resolve into crisp discrete cells.
2. **Threshold.** At a set distance, hand the shader's triads off to real
   geometry — an `InstancedMesh` of phosphor cells positioned to exactly match
   where the shader was drawing them, coloured from the same texture.
   Cross-fade at matched scale and the seam is invisible.
3. **Through.** Camera continues past the plane. You are now inside a 3D lattice
   of glowing RGB cells, and those cells are the material for everything after.

`scene/PhosphorField.jsx` now supplies 34,560 instanced deposits: 360
subpixel columns × 96 rows. Handoff slides widen the shader grille to exactly
120 triads / 360 stripes, so geometry and shader share pitch. Every deposit
samples the live terminal canvas at its own UV and drives only its R, G, or B
phosphor channel. At the threshold all instances still sit on the glass; once
the camera crosses, seeded depth offsets release them into the volume behind it.

**Still open:** chart morph targets. The field is now the correct live material
for them rather than a placeholder dot cloud.

### Phase 4 — The chart engine

Charts live in two places and need two renderers:

- **On the glass** (`terminal/charts.js`) — **first pass done.** Bar,
  distribution, and sparkline forms draw into the session canvas in the same
  phosphor palette. `terminal/visuals.js` is the closed semantic catalog; the
  opening usage plot and transcript share `data/agentUsage.js` so they cannot
  drift. Thick vector strokes and the CRT material—not a pixel font—supply the
  old-computer character.
- **In phosphor space** (`scene/PhosphorField.jsx` morph targets) — charts built
  out of the subpixel cells themselves, for after the Matrix beat. This is the
  payoff for going inside.

`gfx-computer` has `unit-grid-chart` and `dot-field-chart` blocks worth reading
before writing either.

**Settled: Canvas 2D, and html-in-canvas is not being used.** `drawElementImage`
was tested in Chrome 151 — it exists, doesn't throw, and paints nothing without
the flag. The previous deck had to ship a complete hand-drawn Canvas 2D fallback
for that reason, meaning two renderers where the fallback is the one that
actually ships. For a monospace grid HTML solves no layout problem anyway, and
the screen repaints every frame (caret, typing, spinners), so rasterizing a DOM
subtree at 2560×1440 per frame would cost orders of magnitude more than the
~20 `fillText` calls it replaces.

If chart authoring ever gets genuinely painful, the no-flag escape hatch is
SVG → `Image` → `drawImage`: declarative, works everywhere, at the cost of
embedding fonts as data URIs. Not needed unless it is.

### Phase 5 — Data ✅

- `src/data/survey.js` — the survey as the single source of truth. **No number
  appears on screen except from here.** Populated 2026-08-28 from the published
  aggregate export at `https://ai-health.syntax.fm/dashboard-data.json`
  ("Aug 28 refresh", n = **3,593**, window Jul 31–Aug 28 2026): all six
  distributions, means, the Spearman pairs the talk uses, five cohort splits,
  agent-count outcomes, the drive quadrants, and the external studies.
- **The video's numbers are stale and must never be quoted on stage.** It was
  cut against the ~1,300 export; every headline moved (stopping 46→52%,
  pressure 65→71%, skills 59→63%, enjoyment 54→57%, the sleep split 58/17 →
  63/23). The file carries the mapping in its header.
- Per-respondent records were never published, so **nothing may render 3,593
  discrete marks** — a dot-per-person plot would be fabricated. Aggregates only.
  Documented loudly in the file.
- **Frozen at n = 3,593.** The form may stay open and the dashboard may move;
  the talk does not chase it. The stat slide shows the dataset label beside the
  count so the figure reads as dated. Re-pulling is a deliberate decision that
  invalidates the shares quoted throughout NARRATIVE.md.

### Phase 6 — Content

Technical work above is scaffolding for this. **All copy is Scott's.**

**[`NARRATIVE.md`](./NARRATIVE.md) is the argument** — thesis, scale-to-question
mapping, a ~42-beat sheet against the existing slide IDs, and the honesty rules
the content has to obey. Written 2026-08-28 from the survey and the video (data,
relationships and advice only; no interview footage). Its copy is draft.

Settled there:
- **Two pillars carry the talk**, and they bookend the descent: the *slot
  machine* (why prompting is hard to stop, and what it does to sleep) at HOME,
  and the *atrophy* (why the skill goes, and why you cannot feel it going)
  INSIDE THE GLASS. Cubicle and wall are the context that makes neither
  optional.
- The video's six chapters map onto the movements by **scale, not order**: home
  carries the pull (q1/q5), cubicle the pressure (q3), the wall the throttle
  (agents), inside the glass the self (q4/q2).
- The slot machine is **performed** — Scott pulls the lever with Enter on the
  glass (`slot-machine`, a catalog form with authored reels), so the spin is
  deterministic and the churn lasts exactly one pull. Restored 2026-09-02 after
  a cut that named the mechanism without showing it.
- **No interviewee from the video is named or shown** — not on the glass, not
  aloud, not in the resources. Where the video used a person's framing the idea
  is re-argued in Scott's voice or dropped. Published work (the 2026 AI Index
  studies, the 3R paper) is a citation, not an interview, and stays.
- **The ending is the return trip** — back out through wall, cubicle and home,
  each level holding one layer of the fix, landing on slide 1's title with the
  tube on. Resolves §7 #1.
- Chart / statement / silence is decided per finding. Notably: the correlation
  matrix is **not** drawn — its three near-zero cells become a bare-glass
  statement instead.

**The rhythm the spine settled on:** data beats FILL THE GLASS, reveal beats sit
in the room. Verified, not assumed — a chart framed inside the set is not
readable from the back of a hall. The alternation is also the thesis: reading
the number puts you in the same trance as the person at the desk, and the pull
back shows you where they were sitting.

**And it alternates per ACT, not per beat.** The first cut applied the rule to
every slide and the camera yo-yoed — 28 flights, several of them out and
straight back in to say one sentence. Grouping the room work per act took it to
20. Caveats now HOLD the frame (a qualification is the same thought as its
chart), escalating room beats run uninterrupted (a chart had been scheduled
inside the wall's "one, two, four" reveal, cutting it in half), and the return
visits two rooms rather than three. The rule and its three corollaries are
written into the `slides/index.js` header, where they are load-bearing.

Still to do:
- Finish the agent sessions. The fake agent's answers carry the argument, so
  this is script-writing, not lorem; `LEVER` and `COLD_OPEN` are drafted.
- The `quadrant` phosphor morph (NARRATIVE.md §6) — the last place the
  phosphor field still owes real data work.
- Replace the placeholder act-marker copy with Scott's.

### Phase 7 — Stage readiness

- Record a full screen-capture backup run. Insurance against WebGL or projector
  failure — carried over from the last talk and it stays non-negotiable.
- Verify at the real projector aspect and resolution.
- Confirm the deck runs with no network.
- Rehearse the tap rhythm: the cold open's credibility depends entirely on the
  typing landing like a person doing a demo.

---

## 6. Notes on the tube shader

`shaders/crt.js` is a GLSL port of the `crt-tube` effect from `gfx-computer`
(TypeGPU/WGSL). Same physics, same constants. Three things had to be **added**,
because the original is a full-frame post-process where one texel is always one
screen pixel — as geometry in a 3D scene that stops being true:

- **Raster and mask alias hard** when the tube is small on screen. Mipmaps don't
  help; those patterns are computed, not sampled. Both now fade on measured
  screen-pixels-per-period.
- **The scanline taps broke mipmapping.** `kA / linesN` is a step function of
  `vUv.y`, so its automatic derivative explodes at every raster boundary and the
  GPU picks a garbage mip along each line — which renders as a ghosted second
  copy of the text. Fixed by selecting LOD from the smooth coordinate with
  `textureGrad`, which is why the material is GLSL3.
- **Halation at the source's 0.3 smears** over mip-filtered text into a visible
  displaced copy. Dropped to 0.15, plus a distance fade.

The first two are latent in `gfx-computer` the moment that effect meets a depth
stage. Worth telling whoever owns it.

Tune live in dev: `__crt.hold = true; __crt.uMaskStrength.value = 0.8`.

---

## 7. Open decisions

Ranked by how much downstream work they block.

1. ~~**Where the talk ends.**~~ **Settled 2026-08:** the return trip. Back out
   through wall, cubicle and home — each level carrying one layer of the fix —
   landing on slide 1's title with the tube on. See NARRATIVE.md §4.
2. **Phosphor from frame one?** (Now amber.) Current title, asset loader,
   harness, and chart are phosphor even when flat. The alternative—an ordinary modern harness
   palette that *becomes* phosphor as the tube comes up—makes the reveal do more
   work, but weakens the one-hue continuity across the identity sequence.
3. **Is the fake agent branded?** Currently unbranded. Recognisable gets a laugh
   and instant buy-in; generic ages better and doesn't cast a specific vendor as
   the villain.
4. ~~**Where does the current survey export live?**~~ **Settled 2026-08:**
   `https://ai-health.syntax.fm/dashboard-data.json`, fetched by the site at
   runtime. Transcribed into `src/data/survey.js`; re-pull before stage.
5. **Is the cold open's usage chart Scott's real week?** `data/agentUsage.js`
   is marked rehearsal copy, but the open presents it as "my week." Either make
   it real or reframe the line. (NARRATIVE.md §8.)
