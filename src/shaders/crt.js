import { QUALITY_HANDOFF_MODE } from '../qualityProfile.js'

/**
 * ────────────────────────── CRT TUBE ──────────────────────────
 * A GLSL port of the `crt-tube` effect from the gfx-computer project
 * (src/lib/pipelines/effects/crt-tube — TypeGPU/WGSL). Same physics, same
 * constants, same tuning; only the language changed, because this deck is
 * WebGL2/Three and that one is WebGPU. The explanatory comments are kept
 * verbatim where they still apply — they're the reason this looks like a tube
 * and not like a scanline filter.
 *
 * Differences from the source:
 *   • The depth-stage `contentScale` compensation is dropped. That existed so a
 *     video-pipeline camera push wouldn't slide strokes across a fixed raster;
 *     here the tube IS geometry in a 3D scene, so the raster magnifies with it
 *     naturally — which is exactly what the "fly into the glass" beat wants.
 *   • Interlace is dropped (it needs their deterministic 30Hz frame clock).
 *   • Added `uTube`: a master 0→1 dial. At 0 this is a bit-exact passthrough of
 *     the source texture — a flat, clean screen recording. At 1 it's a cathode
 *     ray tube. Animating that one uniform IS the reveal. Every output goes
 *     through three's `linearToOutputTexel`, because the passthrough draws
 *     straight to the canvas on flat slides (the composer is off) and the
 *     canvas wants sRGB; inside the composer's linear target the call is the
 *     identity, so the tube path is unchanged.
 *
 * `uResolution` is the TEXTURE's pixel size, not the viewport's — so the
 * phosphor mask is fixed to the glass and magnifies as the camera approaches,
 * the way a real shadow mask does.
 * ──────────────────────────────────────────────────────────────
 */

/**
 * The faceplate's curvature lives HERE, in the geometry — not only in the
 * fragment shader's barrel warp.
 *
 * Warping just the image over a flat plane is what makes the curve read as a
 * filter applied to a panel rather than as a piece of glass: the picture bends
 * but the object doesn't, so the highlight, the silhouette and the parallax all
 * disagree with it. Displacing the surface makes the bend part of the monitor.
 *
 * Scaled by `uTube`, so at 0 the plane is EXACTLY flat and the cold open stays
 * a screen recording — a domed surface head-on would pincushion the text by a
 * few percent, which is precisely the tell that opening cannot afford. The
 * glass physically swells as the tube is revealed.
 */
// One source of truth for the shader → geometry handoff. The broad grille is
// 120 triads / 360 deposits across; rows are only separated after the camera
// has substantially crossed the faceplate so the threshold still reads as one
// continuous curved surface rather than an ordered LED wall.
export const CRT_HANDOFF = Object.freeze({
  columns: 360,
  rows: 96,
  gain: 0.96,
})

export const crtVert = /* glsl */ `
  uniform float uTube;
  uniform float uBulge;
  uniform vec2 uHalfSize;
  out vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    vec2 n = p.xy / uHalfSize;
    // Gentler across the width than the height, the way a widescreen tube is.
    float r2 = min(1.0, n.x * n.x * 0.7 + n.y * n.y);
    // Raster appears first; physical glass swells only in the latter two thirds.
    float shapeMix = smoothstep(0.28, 1.0, uTube);
    p.z += (1.0 - r2) * uBulge * shapeMix;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

export const crtFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform vec2  uResolution;
  uniform float uTube;        // 0 = flat passthrough, 1 = full tube
  uniform float uLines;       // raster line count
  uniform float uFocus;       // beam spot size (0 tight … 1 soft)
  uniform float uMaskMode;    // 0 slot · 1 shadow · 2 aperture grille
  uniform float uMaskPitchPx;
  uniform float uMaskStrength;
  uniform float uCurvature;
  uniform float uBezel;
  uniform float uHalation;
  uniform float uVignette;
  uniform float uHandoffOpacity;
  uniform float uHandoffDepth;
  uniform float uEmissiveGain; // HDR drive for object views; 1.0 on flat slides
  uniform vec4  uCaretRect;
  uniform vec3  uCaretColor;
  uniform float uCaretVisible;
  in vec2 vUv;
  out vec4 outColor;

  const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
  const vec2 HANDOFF_GRID = vec2(${CRT_HANDOFF.columns}.0, ${CRT_HANDOFF.rows}.0);
  const float HANDOFF_GAIN = ${CRT_HANDOFF.gain};
  const float QUALITY_HANDOFF_SURFACE = ${QUALITY_HANDOFF_MODE === 'shader' ? '1.0' : '0.0'};

  vec4 compositeCaret(vec4 base, vec2 uv) {
    vec2 px = uv * uResolution;
    vec2 lo = uCaretRect.xy * uResolution;
    vec2 hi = uCaretRect.zw * uResolution;
    vec2 outside = max(max(lo - px, px - hi), vec2(0.0));
    float distancePx = length(outside);
    float aa = max(0.75, max(fwidth(px.x), fwidth(px.y)));
    float core = (1.0 - smoothstep(0.0, aa, distancePx)) * uCaretVisible;
    float glow = exp(-0.5 * distancePx * distancePx / 52.0)
      * (1.0 - core) * uCaretVisible * 0.32;
    base.rgb += uCaretColor * glow;
    base.rgb = mix(base.rgb, uCaretColor, core);
    base.a = max(base.a, core);
    return base;
  }

  vec3 monochromePhosphor(vec3 source) {
    // #ffd54a in linear — the P3-amber chemistry shared with theme.js.
    const vec3 tint = vec3(1.0, 0.66, 0.07);
    float drive = dot(source, LUMA) / dot(tint, LUMA);
    return tint * clamp(drive, 0.0, 1.0);
  }

  // A resolved phosphor deposit. The terminal is deliberately one hue, so the
  // mask modulates drive only; splitting that green source back into display
  // primaries turns the ending into RGB confetti instead of magnified glass.
  float periodicDeposit(float coordinate, float halfWidth) {
    float distanceToCenter = abs(fract(coordinate) - 0.5);
    float aa = clamp(fwidth(coordinate) * 0.75, 0.001, 0.16);
    return 1.0 - smoothstep(halfWidth - aa, halfWidth + aa, distanceToCenter);
  }

  float handoffDeposit(vec2 sourceUv, float depth) {
    vec2 cell = sourceUv * HANDOFF_GRID;
    vec2 centered = abs(fract(cell) - 0.5);
    vec2 aa = clamp(fwidth(cell) * 0.75, vec2(0.001), vec2(0.16));
    float stripe = 1.0 - smoothstep(0.41 - aa.x, 0.41 + aa.x, centered.x);

    // Keep the threshold as continuous vertical phosphor. Row separation only
    // develops once almost all of the shader surface has faded, at the same
    // time deterministic depth offsets destroy the original row ordering.
    float release = smoothstep(0.42, 1.0, depth);
    float rowHalf = mix(0.5, 0.36, release);
    float row = 1.0 - smoothstep(rowHalf - aa.y, rowHalf + aa.y, centered.y);
    float detailed = stripe * mix(1.0, row, release);

    // If a cell ever approaches the sampling limit, collapse it to its mean
    // occupancy rather than fading the entire surface or letting gaps shimmer.
    vec2 periodPx = 1.0 / max(fwidth(cell), vec2(1e-4));
    float xResolve = smoothstep(1.5, 2.75, periodPx.x);
    float yResolve = smoothstep(1.5, 2.75, periodPx.y);
    float resolve = xResolve * mix(1.0, yResolve, release);
    float meanOccupancy = 0.82 * mix(1.0, 0.72, release);
    return mix(meanOccupancy, detailed, resolve);
  }

  void main() {
    vec4 flatSample = compositeCaret(texture(uMap, vUv), vUv);

    // Uniform branch — coherent across the draw, so the cold open costs nothing.
    //
    // The canvas texture is tagged sRGB, so the sampler hands back LINEAR
    // light. Inside the composer that is what the chain expects and its
    // output pass re-encodes; on a flat slide the composer is off and this
    // material draws straight to the canvas, so it must re-encode itself or
    // the "bit-exact" cold open ships the linear values — every flat frame a
    // stop darker and more saturated than the ?flat renderer (#ffd54a came out
    // as rgb(255, 170, 17)). Three defines linearToOutputTexel per program
    // from the current target's colour space: identity into the composer's
    // linear target, the sRGB curve into the canvas. Found 2026-09-10 while
    // making the QR code scan.
    if (uTube < 0.001) {
      outColor = linearToOutputTexel(vec4(flatSample.rgb, flatSample.a * uHandoffOpacity));
      return;
    }

    // One continuous press, but not one simultaneous crossfade. Raster wakes
    // first on an unchanged image; curvature, rounded glass, and bezel follow.
    // This avoids blending a flat glyph with a displaced copy of itself.
    float rasterMix = smoothstep(0.03, 0.62, uTube);
    float shapeMix = smoothstep(0.28, 1.0, uTube);

    vec2 res = uResolution;
    float aspect = res.x / res.y;
    float refScale = min(res.x, res.y) / 2160.0;

    // ----- Tube curvature: barrel-warp the sampling coordinate -----
    vec2 cN = (vUv - vec2(0.5)) * vec2(aspect, 1.0);
    float r2 = dot(cN, cN);
    float rc2 = 0.25 * (aspect * aspect + 1.0);
    float kCurv = uCurvature * shapeMix * 0.42;
    float warp = (1.0 + kCurv * r2) / (1.0 + kCurv * rc2);
    vec2 cW = cN * warp;
    vec2 uvW = cW / vec2(aspect, 1.0) + vec2(0.5);

    // ----- Glass bounds: rounded-rect SDF in warped space + inner shadow -----
    float bez = uBezel * shapeMix;
    vec2 he = vec2(aspect, 1.0) * (0.5 - 0.012 * bez);
    float cr = mix(0.008, 0.075, bez);
    vec2 q = abs(cW) - (he - vec2(cr));
    float dTube = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - cr;
    float tubeA = bez < 0.001 ? 1.0 : 1.0 - smoothstep(-0.0015, 0.0015, dTube);
    float innerShade = 1.0 - 0.45 * bez * smoothstep(-0.06, -0.005, dTube);

    // ----- Nyquist guards -----
    // The source effect is a full-frame post-process: one texel is always one
    // screen pixel, so its procedural raster and mask can never alias. Here the
    // tube is GEOMETRY — pull the camera back and a mask pitch of 8 texels can
    // land inside a single screen pixel, which moirés hard. Mipmaps don't help
    // (these patterns are computed, not sampled), so measure the on-screen size
    // of each lattice with derivatives and fade it out as it approaches the
    // sampling limit. Up close both are 1.0 and this costs nothing.
    // Both fades ramp on SCREEN PIXELS PER PERIOD of the lattice: full strength
    // once a period is comfortably resolvable, off before it hits Nyquist.
    // (A linear period/2*texel ramp isn't enough — it still sits at ~0.8 when
    // a period covers under two pixels, which is where the moire actually is.)
    vec2 dpx = fwidth(uvW * res);
    float linesN = max(uLines, 8.0);
    float lfp = uvW.y * linesN;
    float lineFade = 1.0 - smoothstep(0.35, 1.0, fwidth(lfp));

    // ----- Scanlines: gaussian beam over the two nearest raster lines -----
    // The tap coordinate STEPS (kA jumps by one at every raster boundary), so
    // its automatic derivative is meaningless and the hardware would pick a
    // near-lowest mip along every line edge — which reads as a ghosted second
    // copy of the text. Select LOD from the smooth coordinate instead.
    vec2 ddx = dFdx(uvW);
    vec2 ddy = dFdy(uvW);
    float kA = floor(lfp - 0.5) + 0.5;
    float kB = kA + 1.0;
    vec2 uvA = vec2(uvW.x, kA / linesN);
    vec2 uvB = vec2(uvW.x, kB / linesN);
    vec4 cA = compositeCaret(textureGrad(uMap, uvA, ddx, ddy), uvA);
    vec4 cB = compositeCaret(textureGrad(uMap, uvB, ddx, ddy), uvB);

    float sigma0 = mix(0.24, 0.85, uFocus);
    // Beam current defocuses the spot: bright lines swell.
    float sigA = sigma0 * (1.0 + 0.65 * dot(cA.rgb, LUMA));
    float sigB = sigma0 * (1.0 + 0.65 * dot(cB.rgb, LUMA));
    float dA = (lfp - kA) / sigA;
    float dB = (lfp - kB) / sigB;
    float wA = exp(-0.5 * dA * dA);
    float wB = exp(-0.5 * dB * dB);
    // Peak-normalize so line centers hold brightness; overlapping fat beams
    // flatten instead of over-brightening, tight beams leave dark gaps.
    float nrm = 1.0 + exp(-0.5 / (sigma0 * sigma0));
    float beamDenom = max(wA + wB, nrm);
    // Below Nyquist the beam collapses to the plain (mip-filtered) sample, which
    // is what an unresolvable raster actually averages to.
    vec4 resolved = compositeCaret(texture(uMap, uvW), uvW);
    vec3 col = mix(resolved.rgb, (cA.rgb * wA + cB.rgb * wB) / beamDenom, lineFade);
    float aBeam = mix(resolved.a, (cA.a * wA + cB.a * wB) / beamDenom, lineFade);

    // ----- Phosphor mask in warped tube pixels -----
    // The source palette already represents one green phosphor chemistry. The
    // physical mask therefore changes transmission, never hue. Keeping the
    // peak at 1.0 also leaves real headroom for halation instead of relying on
    // out-of-gamut values that clip when shader and geometry overlap.
    float pitch = max(uMaskPitchPx * refScale, 3.0);
    float stripePitch = pitch / 3.0;
    vec2 pxW = uvW * res;
    float maskLevel = 1.0;
    float verticalResolve = 1.0;

    if (uMaskMode > 1.5) {
      // Aperture grille: continuous vertical deposits plus two restrained
      // damping wires. Deposits carry the source hue; they are not RGB lights.
      maskLevel = periodicDeposit(pxW.x / stripePitch, 0.41);
      float wireDistPx = min(
        abs(pxW.y - res.y * 0.335),
        abs(pxW.y - res.y * 0.665)
      );
      float wireWidthPx = max(1.0, 1.25 * refScale);
      float wire = 1.0 - smoothstep(
        wireWidthPx,
        wireWidthPx + max(dpx.y, 0.75),
        wireDistPx
      );
      float wireResolve = smoothstep(0.85, 1.65, wireWidthPx / max(dpx.y, 1e-4));
      maskLevel *= 1.0 - wire * wireResolve * 0.28;
    } else if (uMaskMode > 0.5) {
      // Shadow mask: staggered deposits, still from one phosphor ladder.
      float rowH = pitch * 0.866;
      float rowIdx = floor(pxW.y / rowH);
      float xOff = mod(rowIdx, 2.0) * 0.5 * pitch;
      float dotW = periodicDeposit(pxW.y / rowH, 0.20);
      maskLevel = periodicDeposit((pxW.x + xOff) / stripePitch, 0.41) * dotW;
      verticalResolve = smoothstep(1.5, 3.0, rowH * 0.4 / max(dpx.y, 1e-4));
    } else {
      // Slot mask: stripe columns broken by staggered horizontal gaps.
      float colIdx = floor(pxW.x / pitch);
      float slotH = pitch * 2.0;
      float slotCoordinate =
        (pxW.y + mod(colIdx, 2.0) * 0.5 * slotH) / slotH;
      float slotW = periodicDeposit(slotCoordinate, 0.41);
      maskLevel = periodicDeposit(pxW.x / stripePitch, 0.41) * slotW;
      verticalResolve = smoothstep(1.5, 3.0, slotH * 0.82 / max(dpx.y, 1e-4));
    }

    // Guard the individual deposit, not the larger three-deposit pitch.
    float depositWidthPx = stripePitch * 0.82 / max(dpx.x, 1e-4);
    float maskFade = smoothstep(1.5, 3.0, depositWidthPx) * verticalResolve;
    float transmission = mix(0.14, 1.0, maskLevel);
    col *= mix(1.0, transmission, uMaskStrength * maskFade);

    // ----- Halation: bright-pass glass scatter (three overlapping rings) -----
    // Small radii + a luminance knee: only driven phosphor scatters. Three
    // staggered rings with distance falloff fuse into a smooth halo — sparse
    // wide rings on high-contrast content read as discrete displaced copies,
    // not glow.
    vec3 hal = vec3(0.0);
    float halNorm = 0.0;
    vec2 rHal = vec2(14.0 * refScale) / res;
    for (int i = 0; i < 24; i++) {
      float ring = float(i / 8);
      float ang = ((float(i) + 0.5 * ring) / 8.0) * 6.2831853;
      vec2 off = vec2(cos(ang), sin(ang)) * rHal * (1.0 + 0.7 * ring);
      float wRing = 1.0 - 0.3 * ring;
      vec4 s = compositeCaret(texture(uMap, uvW + off), uvW + off);
      hal += s.rgb * max(dot(s.rgb, LUMA) - 0.18, 0.0) * wRing;
      halNorm += wRing;
    }
    // Third Nyquist guard, and the one that matters most in practice.
    //
    // Halation is a NEAR-FIELD effect: 24 point samples can represent a smooth
    // halo only while the texture is close to 1:1 on screen. Under minification
    // every tap lands on a blurry mip blob, the taps stop fusing, and what you
    // get is discrete displaced copies of the text — a visible ghost image, at
    // its worst on high-contrast type, which is all this screen has.
    //
    // Fade on MINIFICATION (texels per screen pixel), not on the halo's size in
    // pixels — the halo stays several pixels wide long after the taps have
    // stopped fusing, so that metric reads ~0.9 exactly where the ghost is
    // worst. Scene bloom carries glow at distance; halation comes back as the
    // camera pushes into the glass, which is where it belongs.
    float texelsPerPixel = max(max(dpx.x, dpx.y), 1e-4);
    float halFade = 1.0 - smoothstep(1.0, 2.5, texelsPerPixel);
    vec3 haloDrive = clamp(
      uHalation * halFade * 0.9 * (hal / max(halNorm, 1.0)) * aBeam,
      vec3(0.0),
      vec3(1.0)
    );
    // Scatter fills available channel headroom instead of pushing bright type
    // above display white. This keeps bloom alive without a clipped plateau.
    col += (vec3(1.0) - col) * haloDrive;

    // ----- Vignette, bezel shade, glass trim -----
    // Frame-normalized falloff so it weights corners, not edge-midpoints.
    vec2 cent = uvW - vec2(0.5);
    float vig = 1.0 - uVignette * smoothstep(0.35, 0.85, length(cent) * 1.4142);
    col = col * vig * innerShade * tubeA;

    // HDR drive, object views only. The canvas is LDR; without headroom above
    // 1.0 the composer's ACES rolls the glass down to mid-gray and it stops
    // reading as the light source the scene claims it is. Applied before the
    // handoff mix so both phosphor endpoints stay at their measured parity.
    col *= uEmissiveGain;

    // Once physical deposits contribute, the shader resolves to the exact same
    // monochrome cell surface: same warped source UV, same 360×96 occupancy,
    // same gain, and the same delayed row release. Field opacity is the
    // complement of uHandoffOpacity, so additive geometry replaces rather than
    // brightens this image.
    float handoffMix = max(
      QUALITY_HANDOFF_SURFACE,
      smoothstep(0.015, 0.16, 1.0 - uHandoffOpacity)
    );
    vec4 handoffSample = textureGrad(uMap, uvW, ddx, ddy);
    float deposit = handoffDeposit(uvW, uHandoffDepth);
    vec3 handoffCol = monochromePhosphor(handoffSample.rgb)
      * deposit * HANDOFF_GAIN * tubeA;
    col = mix(col, handoffCol, handoffMix);

    float aOut = clamp(aBeam * tubeA, 0.0, 1.0);
    // Identity inside the composer's linear target, where every tube frame is
    // drawn; here for the same reason as the passthrough, so no render path
    // can ever present linear light as sRGB.
    outColor = linearToOutputTexel(vec4(
      max(mix(flatSample.rgb, col, rasterMix), vec3(0.0)),
      mix(flatSample.a, aOut, rasterMix) * uHandoffOpacity
    ));
  }
`

/**
 * The "on" look. `uTube` crossfades the whole effect between a flat
 * passthrough and these values, so this is what a fully-revealed tube is.
 * Slides override individual entries via their `crt` field.
 */
export const CRT_DEFAULTS = {
  lines: 480,
  focus: 0.55,
  // The hero housing is FW900/Trinitron-inspired, so the physical mask must be
  // its aperture grille rather than a generic slot or shadow mask.
  maskMode: 2, // aperture grille
  maskPitchPx: 8,
  maskStrength: 0.5,
  curvature: 0.18,
  bezel: 0.3,
  // Source default is 0.3, tuned for a full-frame post-process where one texel
  // is one pixel. On a tube being viewed as an OBJECT the halo lands over
  // mip-filtered text and smears into a visible second copy; 0.15 keeps the
  // phosphor bloom without the ghost.
  halation: 0.15,
  vignette: 0.28,
}
