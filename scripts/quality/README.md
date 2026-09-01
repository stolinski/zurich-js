# Presentation quality evidence harness

Swamp-managed production evidence for task `6rex1l71`. The typed
`talk/quality` model owns the build, isolated preview, Chrome lifecycle,
captures, summary, logs, and archived evidence. The dependency-free Node/CDP
files in this directory are implementation details, not the normal entry point.

The harness:

- discovers the slide order by using the deck's real one-key navigation;
- captures direct-URL settled screenshots with PNG and decoded-pixel SHA-256;
- traces every selected adjacent transition forward and backward;
- records the keydown, URL/index change, first sampled visible movement, raw rAF
  intervals, Long Tasks, WebGL allocations/uploads/mipmap generations/draws,
  exposed `renderer.info`, exposed camera/CRT/phosphor values, and exposed
  declared/displayed stage;
- writes `evidence.json`, `report.md`, and PNGs;
- reports unsupported probes as `status: "unsupported"` with a reason. It does
  not infer private production state or turn WebGL interception into fake
  `renderer.info`.

## Requirements

- Swamp initialized in this repository.
- Node 22+, pnpm, and current Chrome/Chromium.
- Real presentation hardware and `browserMode: headed` for acceptance.
  Software-rendered headless Chrome is useful for harness debugging only and is
  **not** photographic or projector acceptance evidence.

## Primary Swamp workflow

Validate before every run:

```bash
swamp workflow validate talk-quality
```

Fast isolated smoke run:

```bash
swamp workflow run talk-quality --input '{"profile":"smoke","viewport":"1280x720"}'
```

Full warm stage run, including a production build:

```bash
swamp workflow run talk-quality --input \
  '{"profile":"full","viewport":"1920x1080","dpr":1,"cache":"warm","browserMode":"headed"}'
```

Retrieve the typed result and archived captures through Swamp:

```bash
swamp data get talk-quality quality-result
swamp workflow history get talk-quality --json
```

The workflow has two separate gates:

- automated transition evidence can pass or fail;
- visual quality remains `manual-review-required` until the archived frames are
  actually reviewed. Timing metrics cannot approve photographic quality.

This is a model plus workflow because the model owns one typed evidence action
while the workflow orchestrates capture and explicit gates, following Swamp's
`design/models.md` and `design/workflow.md` split.

## Low-level harness internals

The commands below are for developing the model/harness itself. Do not use them
as the routine quality entry point.

### 1. Build and serve

```bash
pnpm build
pnpm preview --host 127.0.0.1 --port 4173
```

### 2. Launch an isolated headed Chrome

macOS:

```bash
rm -rf /tmp/mental-health-quality-chrome
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/mental-health-quality-chrome \
  --no-first-run --disable-default-apps about:blank
```

Linux (adjust the executable if it is `chromium`):

```bash
rm -rf /tmp/mental-health-quality-chrome
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/mental-health-quality-chrome \
  --no-first-run --disable-default-apps about:blank
```

Chrome 136+ requires a non-default `--user-data-dir` for remote debugging.
`--cdp 9222` may be omitted when the port is discoverable. Discovery checks
localhost ports 9222, 9223, 9225, 9229, and 9333 in that order.

**Prefer `--url https://ai-health.robo.online`** — the stable local Caddy
domain for this project. The Vite dev port drifts across restarts (and another
project may claim a vacated port), so hardcoded `127.0.0.1:517x` URLs go stale;
the Caddy domain always proxies the live talk server and works with the
harness as-is.

### 3. Run the QUALITY.md reference matrix

Run the fresh command before the corresponding warm command, using the same
Chrome process. `fresh` clears Chrome's HTTP cache; every run still creates an
isolated page target. A fresh HTTP cache does not claim a cold GPU process.

Stage target — 1920×1080 CSS px, DPR 1:

```bash
node scripts/quality/capture.mjs \
  --url http://127.0.0.1:4173 \
  --cdp 9222 --viewport 1920x1080 --dpr 1 \
  --cache fresh --settle-ms 5000 --trace-ms 5000 \
  --slides all --directions both \
  --out quality-artifacts/stage-fresh

node scripts/quality/capture.mjs \
  --url http://127.0.0.1:4173 \
  --cdp 9222 --viewport 1920x1080 --dpr 1 \
  --cache warm --settle-ms 5000 --trace-ms 5000 \
  --slides all --directions both \
  --out quality-artifacts/stage-warm
```

Fallback target — 1280×720 CSS px, DPR 1:

```bash
node scripts/quality/capture.mjs \
  --url http://127.0.0.1:4173 \
  --cdp 9222 --viewport 1280x720 --dpr 1 \
  --cache fresh --settle-ms 5000 --trace-ms 5000 \
  --slides all --directions both \
  --out quality-artifacts/fallback-fresh

node scripts/quality/capture.mjs \
  --url http://127.0.0.1:4173 \
  --cdp 9222 --viewport 1280x720 --dpr 1 \
  --cache warm --settle-ms 5000 --trace-ms 5000 \
  --slides all --directions both \
  --out quality-artifacts/fallback-warm
```

Authoring target — 2560×1440 CSS px. DPR 2 exercises the app's production DPR
cap; confirm the report records a 3200×1800 WebGL backing canvas (1.25×):

```bash
node scripts/quality/capture.mjs \
  --url http://127.0.0.1:4173 \
  --cdp 9222 --viewport 2560x1440 --dpr 2 \
  --cache fresh --settle-ms 5000 --trace-ms 5000 \
  --slides all --directions both \
  --out quality-artifacts/authoring-fresh

node scripts/quality/capture.mjs \
  --url http://127.0.0.1:4173 \
  --cdp 9222 --viewport 2560x1440 --dpr 2 \
  --cache warm --settle-ms 5000 --trace-ms 5000 \
  --slides all --directions both \
  --out quality-artifacts/authoring-warm
```

A focused development run is much faster:

```bash
node scripts/quality/capture.mjs \
  --url http://127.0.0.1:5173 --cdp 9223 \
  --viewport 1280x720 --dpr 1 --cache warm \
  --slides cold-open,reveal --directions both \
  --settle-ms 3500 --trace-ms 3500 \
  --out /tmp/mental-health-quality-smoke
```

Both endpoints of a transition must be selected. `--slides 0-4` captures settled
slides 0–4 and only the adjacent pairs within that range. `--max-transitions 1`
is a smoke-test aid, not an acceptance run.

## Image comparison

`compare-images.mjs` decodes the 8-bit, non-interlaced PNGs produced by Chrome
using Node's built-in zlib. It reports file/pixel hashes, RGB and alpha MAE,
encoded and linear Rec.709 luma/luminance MAE, RMSE, mean brightness change, and
luminance centroid displacement. Results are deterministic.

Direct-vs-navigated identity check:

```bash
node scripts/quality/compare-images.mjs \
  quality-artifacts/stage-warm/settled/01-reveal.png \
  quality-artifacts/stage-warm/transitions/00-cold-open--01-reveal--forward.png \
  --fail-on-difference \
  --json quality-artifacts/stage-warm/compare-reveal.json \
  --report quality-artifacts/stage-warm/compare-reveal.md
```

Handoff region check (replace the crop with an authored shader/geometry region):

```bash
node scripts/quality/compare-images.mjs shader-only.png geometry-only.png \
  --region 640,360,640,360 \
  --min-ssim 0.99 --max-luma-mae 3 \
  --max-centroid-error 0.25 \
  --max-brightness-change 5 \
  --json handoff-compare.json --report handoff-compare.md
```

The utility also computes Wang-style SSIM with pinned `ssim.js@3.5.0` on
8-bit encoded Rec.709 luma (`fast`, 11px window, no downsampling). SSIM remains
separate from MAE/RMSE and can be gated explicitly with `--min-ssim 0.99`.

## Acceptance thresholds copied from QUALITY.md

The harness surfaces evidence for these exact numeric gates; it does not waive
the visual/manual parts:

### Q1 — aliasing and temporal stability

- No modeled line, gap, bevel, caster, vent, or grid member may project below
  **1.5 px** at the stage target unless it fades, switches LOD, or becomes a
  filtered texture first.
- Shader-only and geometry-only phosphor handoff frames: **≤3/255 luminance
  MAE**, **≤0.25 px centroid error**, and **<5% brightness variation** through
  the crossfade.
- Settled edge-region capture: **SSIM ≥0.99** against a 4× supersampled
  reference. The pinned comparison utility records the implementation, options,
  crop, and exact score.
- Required motion evidence is **60fps recording** for the named transition
  sequences. The JSON rAF trace and still sequence do not claim to be that
  recording.

### Q2 — performance and transition continuity

- Every navigation keypress: input-to-first-visible-motion **≤50ms**.
- Stage target warm transitions: **p95 frame time ≤20ms**, **no frame >50ms**.
- Fallback warm transitions: **p95 frame time ≤33ms**, **no frame >80ms**.
- After presentation-ready, navigation adds **zero programs** and **zero
  textures**.
- A hidden stage swap may invalidate **one** static shadow update, completed
  before scenery is visible.
- Ten forward/back loops must show no growing GPU memory, duplicate event
  handlers, or worsening frame times. This harness records one trace per
  adjacent direction; run repeated full captures or extend the run before
  claiming the ten-loop gate.

The 1920×1080 and 2560×1440 reports apply the stage frame-time thresholds; the
1280×720 report applies fallback thresholds. Exact raw rAF deltas remain in JSON.

### Q3/Q4 resource starting caps (not targets)

- Hero CRT **20k triangles**; chair **20–35k**; mouse **6k**; lamp **12k**;
  desk **8–12k**; pedestal **3k**; fixture **2k**; full opaque cubicle frame
  **≤250k**.
- Total resident textures, including PMREM: **≤80 MiB**. Local compressed
  texture payload: **≤20 MiB**. No 4K map without projector evidence.
- Approximate texel density: hero **1024 px/m**; background **256–512 px/m**.

CDP/WebGL totals cannot attribute triangles or bytes to individual assets; those
caps still require an asset audit.

## Evidence semantics and limitations

- `firstVisibleMovement` uses a 28×16 RGB canvas sample until the first frame
  whose MAE from the pre-key baseline meets `--motion-threshold` (default
  0.5/255). The synchronous readback is marked `intrusive: true` and stops after
  the first changed frame. Use `--visual-probe off` for a cleaner frame-time
  diagnostic; latency then becomes explicitly unsupported.
- `rendererInfo` is only `available` if the page exposes a real
  `THREE.WebGLRenderer`. Current production builds do not. The independent
  `webglInterception` probe counts actual WebGL API allocations, uploads,
  mipmaps, draws, and estimated primitive triangles; it is labeled separately.
- Production `?quality` exposes bounded camera, stage, uniform, renderer, and
  AA diagnostics explicitly; normal presentation URLs expose none of them.
- Navigation traces wait for the production presentation-ready gate, then use
  the configured fixed settle window. The runtime exposes atomic
  declared/displayed stage, shadow lifecycle, and transition settlement rather
  than requiring React-internal scraping.
- Camera transitions with different endpoints must show at least four moving
  frames, an animated non-restore phase, monotonic progress, no first/individual
  step above 20%/25% of the route, and ≤0.5% final endpoint error. This rejects a
  one-frame camera cut even when timing, allocations, and the final screenshot
  otherwise pass.
- WebGL wrappers and Long Task observers add some overhead. Acceptance remains a
  headed real-hardware judgment, corroborated by the trace rather than replaced
  by it.
- The blinking caret intentionally keeps some settled pixels alive. A hash
  mismatch identifies non-identity but does not diagnose whether the difference
  is the caret or a path-dependent renderer state; inspect the images and run a
  region comparison.
