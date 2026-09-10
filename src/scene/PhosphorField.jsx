import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mulberry32 } from '../lib/rng.js'
import { useStore } from '../state/useStore.js'
import { slides } from '../slides/index.js'
import { SCREEN_BULGE, SCREEN_SIZE } from './CRTScreen.jsx'
import { CRT_DEFAULTS, CRT_HANDOFF } from '../shaders/crt.js'
import { cueProgress, qualityDiagnosticsEnabled } from '../state/presentationRuntime.js'
import { QUALITY_HANDOFF_MODE } from '../qualityProfile.js'

// The handoff slides widen the shader grille to 32 source texels. The CRT
// shader scales pitch against a 2160-line reference, so at the 2560×1440 screen
// texture this is exactly 120 RGB triads / 360 individual phosphor stripes.
const COLUMNS = CRT_HANDOFF.columns
const ROWS = CRT_HANDOFF.rows
const COUNT = COLUMNS * ROWS
// This physical lattice is mounted only after the glass-filling threshold. At
// its most distant frame a stripe is still ~2.7 screen pixels wide at 960px;
// every later camera move magnifies it. That staging is its Nyquist guard — the
// field never exists in the wall shot where this density would moiré.

const fieldVert = /* glsl */ `
  attribute vec2 aSampleUv;
  attribute vec3 aRestPosition;
  attribute vec3 aSynapsePosition;
  attribute vec3 aSynapseInfo;
  attribute vec2 aGrainScale;
  attribute float aRestFade;
  attribute float aSeed;
  uniform float uDepth;
  uniform float uForm;
  uniform float uBulge;
  uniform float uTime;
  uniform vec2 uHalfSize;
  varying vec2 vCellUv;
  varying vec2 vSampleUv;
  varying float vRelease;
  varying float vRestMix;
  varying float vDepthFade;
  varying float vSeed;
  varying float vDefocus;
  varying float vFormMix;
  varying float vRole;
  varying float vEdgeT;
  varying float vPulsePhase;

  // A released mote's disc, in object units before its grain scale: between
  // the faceplate grain's width and its height, so the round mote carries
  // about the visual weight the tall capsule did and the cloud stays as
  // sparse as it was authored.
  const float MOTE_SIDE = ${(SCREEN_SIZE.w / COLUMNS + (SCREEN_SIZE.h / ROWS - SCREEN_SIZE.w / COLUMNS) * 0.55).toFixed(6)};

  void main() {
    vCellUv = uv;
    vSampleUv = aSampleUv + (uv - 0.5) / vec2(${COLUMNS}.0, ${ROWS}.0);
    vRelease = smoothstep(0.18, 0.72, uDepth);
    vRestMix = smoothstep(0.16, 1.0, uDepth);
    vSeed = aSeed;

    // The depth-zero representation remains the exact curved screen surface.
    // Released grains alone move to a resident, source-row-independent target.
    vec4 instanceCenter = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 n = instanceCenter.xy / uHalfSize;
    float r2 = min(1.0, n.x * n.x * 0.7 + n.y * n.y);
    instanceCenter.z += (1.0 - r2) * uBulge + 0.004;

    vec3 scaledLocal = mat3(instanceMatrix)
      * vec3(position.xy * aGrainScale, 0.0);
    // Dream → synapse: each dot streams to its network position on its own
    // seeded delay, so the formation reads as motes finding their places, not
    // one synchronized lerp.
    vFormMix = smoothstep(aSeed * 0.35, aSeed * 0.35 + 0.65, uForm);
    vRole = aSynapseInfo.x;
    vEdgeT = aSynapseInfo.y;
    vPulsePhase = aSynapseInfo.z;
    vec3 restTarget = mix(aRestPosition, aSynapsePosition, vFormMix);

    // Center and local offset are mixed separately (linear, so identical to
    // the old summed mix) so the released state can run a THIN-LENS model on
    // the center's view depth: out-of-focus grains grow into soft bokeh discs
    // and dim by the same area, exactly like a macro lens. Surface state
    // (vRestMix = 0) keeps scale 1, preserving the measured handoff parity.
    // FIREFLIES. In the dream every mote wanders on its own slow Lissajous
    // path — two incommensurate seeded frequencies per axis — so the cloud
    // reads as a swarm of live things rather than a drifting texture (a still
    // field of dots is a texture; the volume is the whole point of being
    // inside it). The wander damps to NOTHING as the synapse forms for the
    // nodes and threads — a topology whose nodes wander is not a topology —
    // but the STRAYS, the free population that never joins the network, keep
    // drifting once it has formed (Scott, 2026-09-10: "some movement on the
    // stray dots"): the thoughts that did not connect are still moving.
    float stray = 1.0 - step(0.25, aSynapseInfo.x);
    float driftPhase = aSeed * 6.2831853;
    float wanderA = 0.35 + 0.45 * fract(aSeed * 13.7);
    float wanderB = 0.21 + 0.3 * fract(aSeed * 29.3);
    vec3 wander = vec3(
      sin(uTime * wanderA + driftPhase) + 0.5 * sin(uTime * wanderB * 1.7 + driftPhase * 2.3),
      sin(uTime * wanderA * 0.83 + driftPhase * 1.7) + 0.5 * cos(uTime * wanderB + driftPhase),
      cos(uTime * wanderA * 0.67 + driftPhase * 0.6) + 0.5 * sin(uTime * wanderB * 1.3 + driftPhase * 3.1)
    );
    vec3 drift = wander * (0.12 + 0.28 * fract(aSeed * 5.1)) * vRestMix
      * mix(1.0 - vFormMix, 0.6, stray);

    vec3 center = mix(instanceCenter.xyz, restTarget, vRestMix) + drift;

    vec4 centerView = viewMatrix * modelMatrix * vec4(center, 1.0);
    float viewDepth = max(0.001, -centerView.z);
    const float FOCUS_DEPTH = 5.0;
    float coc = abs(viewDepth - FOCUS_DEPTH) / max(viewDepth, 0.6);
    float sizeScale = 1.0 + coc * 0.7 * vRestMix;
    float bokehDim = 1.0 / (sizeScale * sizeScale);
    vDefocus = clamp(coc * 0.55, 0.0, 1.0) * vRestMix;

    // Surface state: the grain stays a plane-aligned capsule on the faceplate.
    // Released state: a camera-facing square of one size. Released motes used
    // to be the same quads spun by a seeded orientation — right for a grain on
    // a curved faceplate, wrong for a point of light seen from inside a
    // volume, where an oblique quad reads as a skewed ellipse (Scott,
    // 2026-09-10: "the dots look skewed"). A mote is a round disc from every
    // angle, so its quad is built in view space.
    vec4 surfaceView = viewMatrix * modelMatrix * vec4(center + scaledLocal * sizeScale, 1.0);
    float moteSide = MOTE_SIDE * aGrainScale.y * sizeScale;
    vec4 moteView = centerView + vec4((uv - 0.5) * moteSide, 0.0, 0.0);
    vec4 viewPosition = mix(surfaceView, moteView, vRestMix);
    float farFade = 1.0 - smoothstep(12.5, 16.0, viewDepth);
    vDepthFade = mix(1.0, aRestFade * farFade * bokehDim, vRestMix);
    gl_Position = projectionMatrix * viewPosition;
  }
`

const fieldFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform float uDecay;
  uniform float uTime;
  varying vec2 vCellUv;
  varying vec2 vSampleUv;
  varying float vRelease;
  varying float vRestMix;
  varying float vDepthFade;
  varying float vSeed;
  varying float vDefocus;
  varying float vFormMix;
  varying float vRole;
  varying float vEdgeT;
  varying float vPulsePhase;

  const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
  const vec3 PHOSPHOR_TINT = vec3(1.0, 0.66, 0.07);

  void main() {
    // A vertical phosphor grain with a circular cap at each end. The row grid
    // remains an addressing mechanism, not a visible LED/voxel construction.
    vec2 p = vCellUv - 0.5;
    const float HALF_SPINE = 0.215;
    const float RADIUS = 0.245;
    vec2 nearest = vec2(0.0, clamp(p.y, -HALF_SPINE, HALF_SPINE));
    vec2 radial = p - nearest;
    float distanceToCapsule = length(radial) - RADIUS;
    float aa = clamp(fwidth(distanceToCapsule) * 0.85, 0.001, 0.12);
    // Bokeh: a defocused grain is not a hard capsule with a blurry rim, it is
    // a soft disc — the whole silhouette melts as the lens model opens up.
    float focusSoftness = mix(0.0, 0.34, vDefocus);
    float coverage = 1.0 - smoothstep(-aa, aa + focusSoftness, distanceToCapsule);

    // SELF-EMISSIVE. Phosphor is the light source, not a lit object: a hot
    // core along the spine falling toward the rim, flattening to an even disc
    // when defocused.
    float coreSharp = 1.0 - 0.5 * smoothstep(0.0, RADIUS, length(radial));
    float core = mix(coreSharp, 0.8, vDefocus);

    // Once released the grain is not a capsule at all — it is an ETHEREAL
    // MOTE: a pure gaussian glow with no silhouette, deliberately unreal.
    // A released mote needs a CORE. One broad gaussian, exp(-r^2 * 3.1), was
    // spread across the whole quad, so every dot was a smudge with no centre and
    // no edge, and 34k of them read as low-resolution mush rather than as
    // points of light. A real out-of-focus highlight has a bright middle and a
    // fast falloff; only a DEFOCUSED one flattens into an even disc, which is
    // what the thin-lens model already tracks. So sharpen with focus.
    vec2 q = p * 2.0;
    float qq = dot(q, q);
    float tight = exp(-qq * 15.0);
    float halo = exp(-qq * 2.4);
    // Halo up from 0.22 / 0.66 (Scott, 2026-09-10: "maybe if they glowed
    // more") — the core still reads as a point, the disc around it is warmer.
    float glow = mix(tight + halo * 0.4, halo * 0.8, vDefocus);
    float shapeAlpha = mix(coverage, min(1.0, glow * 2.0) * 0.8, vRestMix);
    float profile = mix(core, glow * 1.5, vRestMix);

    vec3 sampled = texture2D(uMap, vSampleUv).rgb;
    float sourceDrive = clamp(
      dot(sampled, LUMA) / dot(PHOSPHOR_TINT, LUMA),
      0.0,
      1.0
    );
    // ── DREAM: sparse hot sparks over a soft luminous population. Most motes
    // sit near-invisible (the sparseness gate below) so the visible ones
    // float in real darkness — scattered, not a wall of light. ──
    float dream = 0.24
      + 0.6 * smoothstep(0.45, 0.9, vSeed)
      + 1.05 * smoothstep(0.9, 0.99, vSeed);
    // Fireflies blink: each visible mote pulses on its own seeded rhythm —
    // mostly dim, with a brief bright flash — until the synapse forms and the
    // network's steady drive takes over.
    float blinkRate = 0.6 + 1.1 * fract(vSeed * 17.3);
    float blinkWave = 0.5 + 0.5 * sin(uTime * blinkRate + vSeed * 61.8);
    float blink = 0.3 + 1.1 * pow(blinkWave, 4.0);
    dream *= mix(1.0, blink, 1.0 - vFormMix);
    // RADICAL thinning: ~8% of the population carries the dream as discrete
    // floating dots in real darkness (34k soft discs at any higher fraction
    // read as a glitter wall). The full population condenses back in as the
    // synapse forms — scattered thoughts assembling into a connected mind.
    float dreamSparse = mix(
      1.0,
      0.005 + 0.995 * smoothstep(0.9, 0.97, vSeed),
      vRestMix * (1.0 - vFormMix)
    );

    // ── SYNAPSE: node cores, filament edges, signal beads on the edges ──
    float isNode = step(0.75, vRole);
    float isEdge = step(0.25, vRole) * (1.0 - isNode);
    // A slow bright bead travels each connection — data moving. Calm on
    // purpose; the free-running clock is the same one the caret blinks on.
    float beadPosition = fract(uTime * 0.06 + vPulsePhase);
    float beadDistance = abs(vEdgeT - beadPosition);
    beadDistance = min(beadDistance, 1.0 - beadDistance);
    float bead = exp(-beadDistance * beadDistance * 240.0);
    // LOSING CONNECTIONS: each edge dies on its own seeded cue as uDecay
    // rises; its signal dies with it, and finally the nodes dim toward
    // isolated motes. This is the image the beat exists for.
    float edgeDeath = smoothstep(vPulsePhase * 0.7, vPulsePhase * 0.7 + 0.28, uDecay);
    // Cores read HOT and threads read dim, or the whole field flattens into one
    // value and the topology disappears. The travelling bead is what keeps the
    // dim connections legible — the eye finds the thread because something moves
    // along it, not because the thread itself is bright.
    float edgeDrive = (0.2 + 1.7 * bead) * (1.0 - edgeDeath);
    float nodeDrive = mix(1.75, 0.42, smoothstep(0.35, 1.0, uDecay));
    float synapse = isNode * nodeDrive
      + isEdge * edgeDrive
      + (1.0 - isNode - isEdge) * 0.14;

    float releasedDrive = mix(dream, synapse, vFormMix);
    float floorDrive = 0.05 * vRestMix;
    float drive = max(mix(sourceDrive, releasedDrive, vRestMix), floorDrive);
    float focusEnergy = mix(1.0, 0.8, vDefocus);
    vec3 radiance = PHOSPHOR_TINT
      * drive
      * ${CRT_HANDOFF.gain}
      * profile
      * focusEnergy;

    // Dead connections leave no residue — their motes fade with them rather
    // than lingering as dark smudges over the survivors.
    float deathFade = 1.0 - isEdge * edgeDeath * vFormMix * 0.92;
    float alpha = uOpacity * shapeAlpha * vDepthFade * vRelease * deathFade
      * dreamSparse;
    if (alpha < 0.008) discard;
    // Premultiplied, depth-writing material core: overlapping grains occlude
    // instead of accumulating into the x-ray brightness of additive cards.
    gl_FragColor = vec4(radiance * alpha, alpha);
  }
`

const surfaceVert = /* glsl */ `
  uniform float uBulge;
  uniform vec2 uHalfSize;
  out vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    vec2 n = p.xy / uHalfSize;
    float r2 = min(1.0, n.x * n.x * 0.7 + n.y * n.y);
    p.z += (1.0 - r2) * uBulge;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const surfaceFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform float uDepth;
  uniform float uLines;
  uniform float uFocus;
  in vec2 vUv;
  out vec4 outColor;

  const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

  float handoffDeposit(vec2 sourceUv) {
    vec2 cell = sourceUv * vec2(${COLUMNS}.0, ${ROWS}.0);
    vec2 centered = abs(fract(cell) - 0.5);
    vec2 aa = clamp(fwidth(cell) * 0.75, vec2(0.001), vec2(0.16));
    float stripe = 1.0 - smoothstep(0.41 - aa.x, 0.41 + aa.x, centered.x);
    vec2 periodPx = 1.0 / max(fwidth(cell), vec2(1e-4));
    float resolve = smoothstep(1.5, 2.75, periodPx.x);
    return mix(0.82, stripe, resolve);
  }

  // The CRT surface keeps the scanline beam in alpha even after its RGB has
  // resolved to the handoff image. Reproduce that coverage exactly; using a
  // fully opaque geometry layer fixes background leakage but still changes the
  // bright strokes wherever the beam is below its peak.
  float handoffAlpha(vec2 sourceUv) {
    float linesN = max(uLines, 8.0);
    float lfp = sourceUv.y * linesN;
    float lineFade = 1.0 - smoothstep(0.35, 1.0, fwidth(lfp));
    vec2 ddx = dFdx(sourceUv);
    vec2 ddy = dFdy(sourceUv);
    float kA = floor(lfp - 0.5) + 0.5;
    float kB = kA + 1.0;
    vec3 cA = textureGrad(uMap, vec2(sourceUv.x, kA / linesN), ddx, ddy).rgb;
    vec3 cB = textureGrad(uMap, vec2(sourceUv.x, kB / linesN), ddx, ddy).rgb;
    float sigma0 = mix(0.24, 0.85, uFocus);
    float sigA = sigma0 * (1.0 + 0.65 * dot(cA, LUMA));
    float sigB = sigma0 * (1.0 + 0.65 * dot(cB, LUMA));
    float dA = (lfp - kA) / sigA;
    float dB = (lfp - kB) / sigB;
    float wA = exp(-0.5 * dA * dA);
    float wB = exp(-0.5 * dB * dB);
    float nrm = 1.0 + exp(-0.5 / (sigma0 * sigma0));
    float beamAlpha = (wA + wB) / max(wA + wB, nrm);
    return mix(1.0, beamAlpha, lineFade);
  }

  void main() {
    float aspect = ${SCREEN_SIZE.w / SCREEN_SIZE.h};
    vec2 cN = (vUv - 0.5) * vec2(aspect, 1.0);
    float r2 = dot(cN, cN);
    float rc2 = 0.25 * (aspect * aspect + 1.0);
    float curvature = ${CRT_DEFAULTS.curvature} * 0.42;
    float warp = (1.0 + curvature * r2) / (1.0 + curvature * rc2);
    vec2 cW = cN * warp;
    vec2 sourceUv = cW / vec2(aspect, 1.0) + 0.5;

    vec2 he = vec2(aspect, 1.0) * (0.5 - 0.012);
    float cr = 0.075;
    vec2 q = abs(cW) - (he - cr);
    float dTube = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - cr;
    float tubeA = 1.0 - smoothstep(-0.0015, 0.0015, dTube);

    vec3 sampled = textureGrad(
      uMap,
      sourceUv,
      dFdx(sourceUv),
      dFdy(sourceUv)
    ).rgb;
    vec3 tint = vec3(1.0, 0.66, 0.07);
    vec3 source = tint * clamp(
      dot(sampled, vec3(0.2126, 0.7152, 0.0722))
        / dot(tint, vec3(0.2126, 0.7152, 0.0722)),
      0.0,
      1.0
    ) * ${CRT_HANDOFF.gain};
    float deposit = handoffDeposit(sourceUv);
    float release = smoothstep(0.18, 0.72, uDepth);
    // Match the CRT surface's straight-alpha composite. With additive blending,
    // the geometry endpoint preserved the dim scene behind the glass while the
    // shader endpoint attenuated it; that nearly uniform leaked luminance pulled
    // the full-frame centroid toward the viewport center even though the two
    // phosphor images were spatially aligned.
    float baseAlpha = handoffAlpha(sourceUv) * tubeA;
    float screenAlpha = baseAlpha * (1.0 - uOpacity);
    // Two identical straight-alpha layers normally dip at a 50/50 crossfade.
    // Solve the second layer's alpha so their combined coverage remains exactly
    // baseAlpha: 1-(1-screenAlpha)*(1-surfaceAlpha) = baseAlpha.
    float surfaceAlpha = baseAlpha * uOpacity / max(1.0 - screenAlpha, 1e-4);
    outColor = vec4(
      source * deposit * tubeA,
      surfaceAlpha * (1.0 - release)
    );
  }
`

function inverseBarrelPosition(u, v) {
  const aspect = SCREEN_SIZE.w / SCREEN_SIZE.h
  const targetX = (u - 0.5) * aspect
  const targetY = v - 0.5
  const curvature = CRT_DEFAULTS.curvature * 0.42
  const referenceRadius2 = 0.25 * (aspect * aspect + 1)
  let x = targetX
  let y = targetY
  // CRT sampling warps geometry UV → source UV. Deposits are indexed by source
  // UV, so invert that radial mapping to put each physical stripe under the
  // exact shader stripe it replaces.
  for (let iteration = 0; iteration < 4; iteration++) {
    const radius2 = x * x + y * y
    const warp = (1 + curvature * radius2) / (1 + curvature * referenceRadius2)
    x = targetX / warp
    y = targetY / warp
  }
  return [(x / aspect) * SCREEN_SIZE.w, y * SCREEN_SIZE.h]
}

/* ── the dream field and the synapse ──
 * Once through the glass the deposits are not architecture, they are a DREAM:
 * an ethereal cloud of scattered glowing dots. On the next beats the dots
 * stream into a SYNAPSE network — nodes joined by filament edges with signal
 * beads traveling the connections — and then the connections die one by one
 * (`decay`), leaving isolated dots. That last image is the argument: losing
 * brain connections. Everything is seeded; the pulses ride the same
 * free-running clock as the caret blink.
 */
const CLOUD_CENTER = [0, 1.2, -7.6]
const CLOUD_EXTENT = [6.6, 3.9, 3.4]
const CLOUD_CLUSTERS = 16
const NODE_COUNT = 55
const NODE_LINKS = 2

function makeSynapseLayout() {
  const rand = mulberry32(0x5e9a75e)
  // Triangular sampling pulls nodes gently toward the middle of the slab, the
  // way a real culture clusters, without a visible boundary.
  const sample = () => rand() + rand() - 1
  const nodes = []
  for (let index = 0; index < NODE_COUNT; index++) {
    nodes.push([
      CLOUD_CENTER[0] + sample() * CLOUD_EXTENT[0],
      CLOUD_CENTER[1] + sample() * CLOUD_EXTENT[1],
      CLOUD_CENTER[2] + sample() * CLOUD_EXTENT[2],
    ])
  }
  const edges = []
  const seen = new Set()
  nodes.forEach((a, ai) => {
    nodes
      .map((b, bi) => ({
        bi,
        d: Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
      }))
      .filter(({ bi }) => bi !== ai)
      .sort((x, y) => x.d - y.d)
      .slice(0, NODE_LINKS)
      .forEach(({ bi }) => {
        const key = ai < bi ? `${ai}:${bi}` : `${bi}:${ai}`
        if (!seen.has(key)) {
          seen.add(key)
          edges.push([ai, bi])
        }
      })
  })
  return { nodes, edges }
}

function makeFieldGeometry() {
  const cellW = SCREEN_SIZE.w / COLUMNS
  const cellH = SCREEN_SIZE.h / ROWS
  // One filtered quad remains the cheapest carrier: capsule (surface state)
  // and soft gaussian dot (dream state) both resolve in the fragment shader.
  const geometry = new THREE.PlaneGeometry(cellW, cellH)
  const sampleUvs = new Float32Array(COUNT * 2)
  const restPositions = new Float32Array(COUNT * 3)
  const synapsePositions = new Float32Array(COUNT * 3)
  // (role: 0 floater · 0.5 edge · 1 node, position along edge, pulse phase)
  const synapseInfos = new Float32Array(COUNT * 3)
  const grainScales = new Float32Array(COUNT * 2)
  const restFades = new Float32Array(COUNT)
  const seeds = new Float32Array(COUNT)

  const grainRand = mulberry32(0x51a77e)
  const { nodes, edges } = makeSynapseLayout()
  const edgePhases = Float32Array.from({ length: edges.length }, () =>
    grainRand()
  )
  const clusterRand = mulberry32(0xc01a75)
  const clusters = Array.from({ length: CLOUD_CLUSTERS }, () => [
    CLOUD_CENTER[0] + (clusterRand() + clusterRand() - 1) * CLOUD_EXTENT[0] * 0.9,
    CLOUD_CENTER[1] + (clusterRand() + clusterRand() - 1) * CLOUD_EXTENT[1] * 0.9,
    CLOUD_CENTER[2] + (clusterRand() + clusterRand() - 1) * CLOUD_EXTENT[2] * 0.9,
  ])

  let i = 0
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++, i++) {
      sampleUvs[i * 2] = (col + 0.5) / COLUMNS
      sampleUvs[i * 2 + 1] = (row + 0.5) / ROWS

      // ── dream cloud: clustered, with a loose free population ──
      const scatter = grainRand()
      let cx
      let cy
      let cz
      if (scatter < 0.75) {
        const cluster = clusters[Math.floor(grainRand() * CLOUD_CLUSTERS)]
        cx = cluster[0] + (grainRand() + grainRand() - 1) * 1.7
        cy = cluster[1] + (grainRand() + grainRand() - 1) * 1.25
        cz = cluster[2] + (grainRand() + grainRand() - 1) * 1.15
      } else {
        cx = CLOUD_CENTER[0] + (grainRand() * 2 - 1) * CLOUD_EXTENT[0] * 1.12
        cy = CLOUD_CENTER[1] + (grainRand() * 2 - 1) * CLOUD_EXTENT[1] * 1.12
        cz = CLOUD_CENTER[2] + (grainRand() * 2 - 1) * CLOUD_EXTENT[2] * 1.12
      }
      restPositions[i * 3] = cx
      restPositions[i * 3 + 1] = cy
      restPositions[i * 3 + 2] = cz

      // ── synapse target: node cores, filament edges, a few free motes ──
      // The camera sits INSIDE this volume by design, so the network can only
      // read as a network through value hierarchy — hot compact cores joined by
      // thin threads. At a 0.34 core radius each node dispersed into a cloud the
      // size of its own gaps, and 34k grains of equal weight resolved as gold
      // confetti: the exact endpoint ART-DIRECTION rules out.
      const rolePick = grainRand()
      if (rolePick < 0.24) {
        const node = nodes[Math.floor(grainRand() * NODE_COUNT)]
        synapsePositions[i * 3] = node[0] + (grainRand() + grainRand() - 1) * 0.18
        synapsePositions[i * 3 + 1] = node[1] + (grainRand() + grainRand() - 1) * 0.18
        synapsePositions[i * 3 + 2] = node[2] + (grainRand() + grainRand() - 1) * 0.18
        synapseInfos[i * 3] = 1
        synapseInfos[i * 3 + 1] = 0
        synapseInfos[i * 3 + 2] = grainRand()
      } else if (rolePick < 0.96) {
        const edgeIndex = Math.floor(grainRand() * edges.length)
        const [ai, bi] = edges[edgeIndex]
        const t = grainRand()
        synapsePositions[i * 3] =
          nodes[ai][0] + (nodes[bi][0] - nodes[ai][0]) * t +
          (grainRand() + grainRand() - 1) * 0.055
        synapsePositions[i * 3 + 1] =
          nodes[ai][1] + (nodes[bi][1] - nodes[ai][1]) * t +
          (grainRand() + grainRand() - 1) * 0.055
        synapsePositions[i * 3 + 2] =
          nodes[ai][2] + (nodes[bi][2] - nodes[ai][2]) * t +
          (grainRand() + grainRand() - 1) * 0.055
        synapseInfos[i * 3] = 0.5
        synapseInfos[i * 3 + 1] = t
        synapseInfos[i * 3 + 2] = edgePhases[edgeIndex]
      } else {
        synapsePositions[i * 3] = cx * 1.06
        synapsePositions[i * 3 + 1] = cy * 1.06
        synapsePositions[i * 3 + 2] = cz
        synapseInfos[i * 3] = 0
        synapseInfos[i * 3 + 1] = 0
        synapseInfos[i * 3 + 2] = grainRand()
      }

      // Three draws that used to seed a per-mote orientation. Released motes
      // face the camera now, but the draws stay so every later seed — sizes,
      // fades, blink phases — is the same field Scott has been looking at.
      grainRand()
      grainRand()
      grainRand()
      const motesSize = 0.85 + grainRand() * 1.15
      grainScales[i * 2] = motesSize
      grainScales[i * 2 + 1] = motesSize * (0.92 + grainRand() * 0.16)
      restFades[i] =
        1 -
        THREE.MathUtils.smoothstep(
          Math.hypot(
            (cx - CLOUD_CENTER[0]) / CLOUD_EXTENT[0],
            (cy - CLOUD_CENTER[1]) / CLOUD_EXTENT[1]
          ),
          1.15,
          1.5
        )
      seeds[i] = grainRand()
    }
  }

  geometry.setAttribute('aSampleUv', new THREE.InstancedBufferAttribute(sampleUvs, 2))
  geometry.setAttribute(
    'aRestPosition',
    new THREE.InstancedBufferAttribute(restPositions, 3)
  )
  geometry.setAttribute(
    'aSynapsePosition',
    new THREE.InstancedBufferAttribute(synapsePositions, 3)
  )
  geometry.setAttribute(
    'aSynapseInfo',
    new THREE.InstancedBufferAttribute(synapseInfos, 3)
  )
  geometry.setAttribute(
    'aGrainScale',
    new THREE.InstancedBufferAttribute(grainScales, 2)
  )
  geometry.setAttribute('aRestFade', new THREE.InstancedBufferAttribute(restFades, 1))
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
  return geometry
}

export function PhosphorField({ texture }) {
  const material = useRef()
  const transitionElapsed = useRef(0)
  const transitionFrom = useRef(null)
  // The slide whose cues already ran on an occlude leg (see cueProgress).
  const occludedFor = useRef(null)
  const index = useStore((state) => state.index)
  const authoredTarget = slides[index]?.phosphor ?? {
    opacity: 0,
    depth: 0,
    form: 0,
    decay: 0,
  }
  const target = QUALITY_HANDOFF_MODE
    ? {
        opacity: QUALITY_HANDOFF_MODE === 'geometry' ? 1 : 0,
        depth: 0,
        form: 0,
        decay: 0,
      }
    : authoredTarget
  const initial = useRef(target).current
  const crtTarget = {
    lines: slides[index]?.crt?.lines ?? CRT_DEFAULTS.lines,
    focus: slides[index]?.crt?.focus ?? CRT_DEFAULTS.focus,
  }
  const initialCrt = useRef(crtTarget).current
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const geometry = useMemo(() => makeFieldGeometry(), [])
  const surfaceGeometry = useMemo(
    () => new THREE.PlaneGeometry(SCREEN_SIZE.w, SCREEN_SIZE.h, 64, 40),
    []
  )
  const uniforms = useMemo(
    () => ({
      uMap: { value: texture },
      uOpacity: { value: initial.opacity ?? 0 },
      uDepth: { value: initial.depth ?? 0 },
      uForm: { value: initial.form ?? 0 },
      uDecay: { value: initial.decay ?? 0 },
      uTime: { value: 0 },
      uLines: { value: initialCrt.lines },
      uFocus: { value: initialCrt.focus },
      uBulge: { value: SCREEN_BULGE },
      uHalfSize: {
        value: new THREE.Vector2(SCREEN_SIZE.w / 2, SCREEN_SIZE.h / 2),
      },
    }),
    [texture, initial, initialCrt]
  )

  useEffect(() => {
    if (!import.meta.env.DEV && !qualityDiagnosticsEnabled()) return undefined
    const previous = window.__phosphor
    window.__phosphor = uniforms
    return () => {
      if (window.__phosphor !== uniforms) return
      if (previous === undefined) delete window.__phosphor
      else window.__phosphor = previous
    }
  }, [uniforms])

  useLayoutEffect(() => {
    const u = material.current?.uniforms
    transitionFrom.current = u
      ? {
          opacity: u.uOpacity.value,
          depth: u.uDepth.value,
          form: u.uForm.value,
          decay: u.uDecay.value,
          lines: u.uLines.value,
          focus: u.uFocus.value,
        }
      : {
          opacity: target.opacity ?? 0,
          depth: target.depth ?? 0,
          form: target.form ?? 0,
          decay: target.decay ?? 0,
          lines: crtTarget.lines,
          focus: crtTarget.focus,
        }
    transitionElapsed.current = 0
    occludedFor.current = null
  }, [
    index,
    target.depth,
    target.opacity,
    target.form,
    target.decay,
    crtTarget.focus,
    crtTarget.lines,
  ])

  useFrame((_, dt) => {
    if (!material.current || uniforms.hold) return
    transitionElapsed.current += dt
    const u = material.current.uniforms
    // The signal beads ride a free-running clock, like the caret blink.
    u.uTime.value += dt
    const duration = Math.max(0.001, slides[index]?.camera?.smoothTime ?? 1)
    // Over the slide's own duration — or over the camera's occlude leg when a
    // stage swap is pending, so the motes have faded and the picture is back
    // on the glass exactly when it covers the frame (cueProgress).
    const progress = cueProgress(index, transitionElapsed.current, duration, occludedFor)
    const eased = progress * progress * (3 - 2 * progress)
    const from = transitionFrom.current ?? target
    u.uOpacity.value =
      progress >= 1
        ? target.opacity ?? 0
        : THREE.MathUtils.lerp(from.opacity ?? 0, target.opacity ?? 0, eased)
    u.uDepth.value =
      progress >= 1
        ? target.depth ?? 0
        : THREE.MathUtils.lerp(from.depth ?? 0, target.depth ?? 0, eased)
    u.uForm.value =
      progress >= 1
        ? target.form ?? 0
        : THREE.MathUtils.lerp(from.form ?? 0, target.form ?? 0, eased)
    u.uDecay.value =
      progress >= 1
        ? target.decay ?? 0
        : THREE.MathUtils.lerp(from.decay ?? 0, target.decay ?? 0, eased)
    u.uLines.value =
      progress >= 1
        ? crtTarget.lines
        : THREE.MathUtils.lerp(from.lines ?? crtTarget.lines, crtTarget.lines, eased)
    u.uFocus.value =
      progress >= 1
        ? crtTarget.focus
        : THREE.MathUtils.lerp(from.focus ?? crtTarget.focus, crtTarget.focus, eased)
  })

  if (!texture) return null

  return (
    <group>
      {/* At the exact handoff the physical field is still one curved face.
          It tessellates into deposits only as depth releases, avoiding a
          visible grid/centroid jump before the camera crosses the glass. */}
      <mesh geometry={surfaceGeometry} renderOrder={1}>
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={surfaceVert}
          fragmentShader={surfaceFrag}
          glslVersion={THREE.GLSL3}
          transparent
          depthWrite={false}
          blending={THREE.NormalBlending}
          toneMapped={false}
        />
      </mesh>
      <instancedMesh
      args={[geometry, undefined, COUNT]}
      frustumCulled={false}
      renderOrder={1}
      onUpdate={(instances) => {
        let i = 0
        for (let row = 0; row < ROWS; row++) {
          for (let col = 0; col < COLUMNS; col++, i++) {
            const u = (col + 0.5) / COLUMNS
            const v = (row + 0.5) / ROWS
            const [x, y] = inverseBarrelPosition(u, v)
            const [left] = inverseBarrelPosition(col / COLUMNS, v)
            const [right] = inverseBarrelPosition((col + 1) / COLUMNS, v)
            const [, bottom] = inverseBarrelPosition(u, row / ROWS)
            const [, top] = inverseBarrelPosition(u, (row + 1) / ROWS)
            dummy.position.set(x, y, 0)
            // Inverse barrel mapping is non-uniform. Scaling every cell to its
            // transformed boundaries prevents the grid-sized cracks that a
            // constant quad left between independently warped centers.
            dummy.scale.set(
              (right - left) / (SCREEN_SIZE.w / COLUMNS),
              (top - bottom) / (SCREEN_SIZE.h / ROWS),
              1
            )
            dummy.updateMatrix()
            instances.setMatrixAt(i, dummy.matrix)
          }
        }
        instances.instanceMatrix.needsUpdate = true
      }}
    >
      {/* Non-depth-writing: released motes are soft gaussians whose light
          should ACCUMULATE where they overlap — premultiplied over black is
          near-additive, which is the ethereal look. Depth writes with soft
          alpha would clip halos into hard rings. The threshold's image parity
          is carried by the surface mesh, where the instances are still
          invisible. */}
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={fieldVert}
        fragmentShader={fieldFrag}
        transparent
        premultipliedAlpha
        depthWrite={false}
        depthTest
        blending={THREE.NormalBlending}
        toneMapped={false}
      />
      </instancedMesh>
    </group>
  )
}
