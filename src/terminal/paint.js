/**
 * Draws the fake agent harness onto the canvas that becomes the CRT image.
 * Everything remains monochrome and local: hierarchy comes from phosphor
 * intensity, while the tube shader supplies the physical period character.
 */

import { getTerminalAsset } from './assets.js'
import { drawTerminalChart } from './charts.js'
import { hoveredChartRow, recordChartRegions } from './hover.js'
import {
  PHOSPHOR,
  ROLE,
  TERMINAL,
  CHAR_W,
  FONT_SIZE,
  LINE_H,
  font,
} from './theme.js'

const GLOW = {
  user: 1,
  agent: 0.75,
  emphasis: 1,
  tool: 0.35,
  meta: 0.2,
  add: 0.75,
  remove: 0.2,
}

const GLOW_RADIUS = 22 * (TERMINAL.width / 3840)
const BASELINE = (LINE_H - FONT_SIZE) * 0.5
const FRAME = Object.freeze({
  left: 148,
  right: TERMINAL.width - 148,
  top: 128,
  bottom: TERMINAL.height - 128,
  header: 218,
  footer: TERMINAL.height - 218,
})

function screenFont(size, weight = 500) {
  return `${weight} ${size}px ${TERMINAL.family}`
}

function resetScreen(ctx) {
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.shadowBlur = 0
  ctx.fillStyle = PHOSPHOR.glass
  ctx.fillRect(0, 0, TERMINAL.width, TERMINAL.height)
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
}

function rule(ctx, x1, y1, x2, y2, color = PHOSPHOR.ghost, width = 2) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineWidth = width
  ctx.strokeStyle = color
  ctx.stroke()
}

function chromeText(ctx, text, x, y, options = {}) {
  ctx.font = screenFont(options.size ?? 28, options.weight ?? 500)
  ctx.fillStyle = options.color ?? PHOSPHOR.dim
  ctx.textAlign = options.align ?? 'left'
  ctx.textBaseline = options.baseline ?? 'top'
  ctx.fillText(text, x, y)
}

function drawHarnessChrome(ctx, options = {}) {
  ctx.strokeStyle = PHOSPHOR.ghost
  ctx.lineWidth = 2
  ctx.strokeRect(
    FRAME.left,
    FRAME.top,
    FRAME.right - FRAME.left,
    FRAME.bottom - FRAME.top
  )
  rule(ctx, FRAME.left, FRAME.header, FRAME.right, FRAME.header)
  rule(ctx, FRAME.left, FRAME.footer, FRAME.right, FRAME.footer)

  chromeText(ctx, options.section ?? 'AGENT HARNESS / SESSION 01', TERMINAL.padX, 158, {
    size: 29,
    weight: 700,
    color: PHOSPHOR.phosphor,
  })
  chromeText(
    ctx,
    options.detail ?? 'MODEL REASONING · TOOLS ENABLED · SANDBOX WORKSPACE',
    FRAME.right - 34,
    160,
    { size: 24, align: 'right', color: PHOSPHOR.dim }
  )

  chromeText(ctx, 'LOCAL / OFFLINE', TERMINAL.padX, FRAME.footer + 31, {
    size: 25,
    color: PHOSPHOR.dim,
  })
  chromeText(ctx, options.footerRight ?? 'ENTER  RUN   ·   BACKSPACE  UNDO', FRAME.right - 34, FRAME.footer + 31, {
    size: 25,
    align: 'right',
    color: PHOSPHOR.ghost,
  })
}

/** Smooth authored ease shared by every draw-in element. */
const easeInOut = (t) => {
  const clamped = Math.min(1, Math.max(0, t))
  return clamped * clamped * (3 - 2 * clamped)
}

function drawTitle(ctx, visual, draw = 1) {
  // The title TYPES itself in during a draw sweep — character-count reveal,
  // the same period gesture as the session's user turns.
  const shown =
    draw >= 1
      ? visual.text
      : visual.text.slice(0, Math.ceil(visual.text.length * easeInOut(draw)))
  if (!shown) return
  ctx.font = screenFont(92, 700)
  ctx.fillStyle = PHOSPHOR.hot
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = PHOSPHOR.phosphor
  ctx.shadowBlur = GLOW_RADIUS * 0.8
  // Anchored center: measure the full line once so the reveal grows in place
  // rather than re-centering every frame.
  const fullWidth = ctx.measureText(visual.text).width
  ctx.textAlign = 'left'
  ctx.fillText(shown, (TERMINAL.width - fullWidth) / 2, TERMINAL.height / 2)
  ctx.shadowBlur = 0

  // The byline arrives only once the title has finished typing — it is an
  // attribution, not part of the line, and racing it in alongside the title
  // would read as one sentence that happens to contain a name.
  if (!visual.byline || draw < 1) return
  chromeText(ctx, visual.byline, TERMINAL.width / 2, TERMINAL.height / 2 + 108, {
    size: 52,
    weight: 500,
    align: 'center',
    // One rung under the title, not three. The title still dominates, and a
    // byline nobody past the fourth row can read is not attribution.
    color: PHOSPHOR.phosphor,
  })
}

/**
 * A full-screen written statement — the talk speaking in the machine's own
 * voice. Lines type on sequentially during a draw sweep; the settled frame is
 * identical to a deep link. Bare glass on purpose: the strongest beats in
 * this deck are one line of driven phosphor and nothing else.
 */
// A line alone on the glass grows to fill it: the return's question is read
// off a monitor in a room shot, not off a full frame, so it takes the largest
// of these that still leaves a margin.
const STATEMENT_SOLO_SIZES = Object.freeze([170, 150, 130, 115, 100])

function soloStatementSize(ctx, text) {
  for (const size of STATEMENT_SOLO_SIZES) {
    ctx.font = screenFont(size, 700)
    if (ctx.measureText(text).width <= TERMINAL.width * 0.8) return size
  }
  return STATEMENT_SOLO_SIZES[STATEMENT_SOLO_SIZES.length - 1]
}

function drawStatementVisual(ctx, visual, draw = 1) {
  const lines = visual.lines
  // These are the beats with nothing else on the glass. If a line cannot be
  // read from the back of the room there is no second thing for the room to
  // look at instead.
  const size =
    lines.length > 3
      ? 74
      : lines.length > 2
        ? 86
        : lines.length > 1
          ? 100
          : soloStatementSize(ctx, lines[0].text)
  const lineHeight = size * 1.7
  const startY = TERMINAL.height / 2 - ((lines.length - 1) * lineHeight) / 2

  const totalChars = lines.reduce((sum, line) => sum + line.text.length, 0)
  const typeProgress = draw >= 1 ? 1 : easeInOut((draw - 0.1) / 0.8)
  let budget = Math.ceil(totalChars * typeProgress)

  ctx.textBaseline = 'middle'
  for (let index = 0; index < lines.length; index++) {
    if (budget <= 0) break
    const line = lines[index]
    const shown = line.text.slice(0, budget)
    budget -= line.text.length
    const color = line.role === 'hot' ? PHOSPHOR.hot : PHOSPHOR.phosphor
    ctx.font = screenFont(size, 700)
    ctx.fillStyle = color
    ctx.shadowColor = PHOSPHOR.phosphor
    ctx.shadowBlur = GLOW_RADIUS * 0.8
    // Anchored to the full line's centered box so the type-on grows in place.
    const fullWidth = ctx.measureText(line.text).width
    ctx.textAlign = 'left'
    ctx.fillText(shown, (TERMINAL.width - fullWidth) / 2, startY + index * lineHeight)
  }
  ctx.shadowBlur = 0
}

/**
 * One enormous number — the conference-slide staple, in phosphor. The value
 * counts up while the sweep draws it (deterministic, driven by progress, so
 * every rehearsal lands the same), odometer-anchored so digits do not wander.
 */
function drawStatVisual(ctx, visual, draw = 1) {
  const countProgress = draw >= 1 ? 1 : easeInOut((draw - 0.08) / 0.72)
  const value = Math.round(visual.value * countProgress)
  const finalText = `${visual.approximate ? '~' : ''}${visual.value.toLocaleString('en-US')}${visual.suffix ?? ''}`
  const shownText = `${visual.approximate ? '~' : ''}${value.toLocaleString('en-US')}${visual.suffix ?? ''}`

  ctx.textBaseline = 'middle'
  ctx.font = screenFont(230, 700)
  ctx.fillStyle = PHOSPHOR.hot
  ctx.shadowColor = PHOSPHOR.phosphor
  ctx.shadowBlur = GLOW_RADIUS * 1.4
  // Right-anchor against the FINAL string's centered box: the count-up reads
  // as an odometer instead of a re-centering jitter.
  const finalWidth = ctx.measureText(finalText).width
  ctx.textAlign = 'right'
  ctx.fillText(shownText, (TERMINAL.width + finalWidth) / 2, TERMINAL.height / 2 - 60)
  ctx.shadowBlur = 0

  if (countProgress >= 1) {
    chromeText(ctx, visual.label, TERMINAL.width / 2, TERMINAL.height / 2 + 150, {
      size: 44,
      weight: 700,
      align: 'center',
      color: PHOSPHOR.phosphor,
    })
    if (visual.sub) {
      chromeText(ctx, visual.sub, TERMINAL.width / 2, TERMINAL.height / 2 + 224, {
        size: 27,
        align: 'center',
        color: PHOSPHOR.dim,
      })
    }
  }
}

/**
 * A slot machine on the glass — three reels, a payline, and the prompt as the
 * lever.
 *
 * `visual.pull` is the pull in progress (undefined for the idle machine) and
 * `visual.progress` is 0→1 through it. Every reel position is a pure function
 * of those two, so each rehearsal spins and lands identically. The reels stop
 * in turn on an ease-out; a moving reel is driven dim, a settled reel drives
 * its symbol up the ladder, and a paying line goes hot. Intensity is still the
 * only hierarchy — the machine is drawn with the same three rungs as a chart.
 */
const REEL = Object.freeze({ width: 300, height: 380, gap: 64, pitch: 250 })
// Fraction of the pull at which each reel comes to rest — left to right, the
// last one late enough that the near-miss is watched, not glimpsed.
const REEL_STOPS = Object.freeze([0.55, 0.75, 0.95])

function reelPosition(visual, reel, pull, progress) {
  const count = visual.symbols.length
  const startSymbol = pull === 0 ? visual.idle[reel] : visual.pulls[pull - 1][reel]
  const start = visual.symbols.indexOf(startSymbol)
  const target = visual.symbols.indexOf(visual.pulls[pull][reel])
  if (start < 0 || target < 0) {
    throw new Error(`Slot machine pull ${pull} names a symbol that is not on the reel strip`)
  }
  const local = Math.min(1, Math.max(0, progress / REEL_STOPS[reel]))
  const eased = 1 - Math.pow(1 - local, 3)
  // Later reels spin longer, and every reel always travels forward to its
  // target so the strip never appears to reverse.
  const travel = (3 + reel) * count + ((target - start + count) % count)
  return { position: start + travel * eased, settled: local >= 1 }
}

function drawSlotVisual(ctx, visual, draw = 1) {
  const idle = visual.pull === undefined
  const progress = idle ? 1 : Math.min(1, visual.progress ?? 1)
  const count = visual.symbols.length
  const total = REEL.width * 3 + REEL.gap * 2
  const left = (TERMINAL.width - total) / 2
  const top = TERMINAL.height / 2 - REEL.height / 2 - 40
  const centerY = top + REEL.height / 2
  const frameProgress = draw >= 1 ? 1 : easeInOut((draw - 0.05) / 0.4)
  const symbolProgress = draw >= 1 ? 1 : easeInOut((draw - 0.4) / 0.5)
  const outcome = idle ? visual.idle : visual.pulls[visual.pull]
  const paying =
    !idle && progress >= 1 && outcome.every((symbol) => symbol === outcome[0])

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let reel = 0; reel < 3; reel++) {
    const x = left + reel * (REEL.width + REEL.gap)
    const { position, settled } = idle
      ? { position: visual.symbols.indexOf(visual.idle[reel]), settled: true }
      : reelPosition(visual, reel, visual.pull, progress)

    if (symbolProgress > 0) {
      ctx.save()
      ctx.globalAlpha = symbolProgress
      ctx.beginPath()
      ctx.rect(x + 4, top + 4, REEL.width - 8, REEL.height - 8)
      ctx.clip()
      ctx.font = screenFont(190, 700)
      ctx.fillStyle = !settled ? PHOSPHOR.dim : paying ? PHOSPHOR.hot : PHOSPHOR.phosphor
      ctx.shadowColor = PHOSPHOR.phosphor
      ctx.shadowBlur = !settled ? 0 : GLOW_RADIUS * (paying ? 1.4 : 0.8)
      const first = Math.floor(position) - 1
      for (let index = first; index <= first + 3; index++) {
        const symbol = visual.symbols[((index % count) + count) % count]
        ctx.fillText(symbol, x + REEL.width / 2, centerY + (index - position) * REEL.pitch)
      }
      ctx.shadowBlur = 0
      // The drum: the strip curves away above and below the payline.
      const veil = ctx.createLinearGradient(0, top, 0, top + REEL.height)
      veil.addColorStop(0, 'rgba(11, 10, 6, 0.9)')
      veil.addColorStop(0.3, 'rgba(11, 10, 6, 0)')
      veil.addColorStop(0.7, 'rgba(11, 10, 6, 0)')
      veil.addColorStop(1, 'rgba(11, 10, 6, 0.9)')
      ctx.fillStyle = veil
      ctx.fillRect(x, top, REEL.width, REEL.height)
      ctx.restore()
    }

    if (frameProgress > 0) {
      ctx.globalAlpha = frameProgress
      ctx.lineWidth = 3
      ctx.strokeStyle = PHOSPHOR.ghost
      ctx.strokeRect(x, top, REEL.width, REEL.height)
      ctx.globalAlpha = 1
    }
  }

  // The payline, marked outside the reels so it never sits over a symbol.
  if (frameProgress > 0) {
    ctx.globalAlpha = frameProgress
    const lineColor = paying ? PHOSPHOR.hot : PHOSPHOR.ghost
    rule(ctx, left - 72, centerY, left - 24, centerY, lineColor, 4)
    rule(ctx, left + total + 24, centerY, left + total + 72, centerY, lineColor, 4)
    ctx.globalAlpha = 1
  }

  // The lever is the prompt. Idle, the machine waits on Enter like the harness
  // does; a pull types the prompt in over its first fifth and leaves it dim.
  if (symbolProgress <= 0) return
  const promptY = top + REEL.height + 110
  ctx.globalAlpha = symbolProgress
  if (idle) {
    chromeText(ctx, 'ENTER  PULL', TERMINAL.width / 2, promptY, {
      size: 30,
      align: 'center',
      color: PHOSPHOR.ghost,
    })
  } else {
    const line = `❯ ${visual.prompt}`
    const shown = line.slice(0, Math.ceil(line.length * Math.min(1, progress / 0.2)))
    ctx.font = screenFont(46, 500)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = progress >= 1 ? PHOSPHOR.dim : PHOSPHOR.hot
    ctx.shadowColor = PHOSPHOR.phosphor
    ctx.shadowBlur = progress >= 1 ? 0 : GLOW_RADIUS * 0.8
    const fullWidth = ctx.measureText(line).width
    ctx.fillText(shown, (TERMINAL.width - fullWidth) / 2, promptY)
    ctx.shadowBlur = 0
  }
  ctx.globalAlpha = 1
}

/**
 * GRILL ME — a brain on a grill, in the slot machine's line-drawing idiom.
 *
 * `visual.question` is the question this step lands on (null once nothing is
 * left) and `visual.progress` is 0→1 through the step: the brain is in the
 * air for the first part and the question types in once it has landed. The
 * answer that launched the flip (`visual.answers[step − 1]`) is stamped on
 * the previous question while the brain is up. Pure in progress and the
 * answers, so a rehearsal lands the same way every time.
 */
const GRILL = Object.freeze({
  width: 920,
  top: 900, // the front rim of the grate
  depth: 110,
  bars: 8,
  legs: 96,
  brain: 150, // half-width of the outline
  jump: 330,
  airShare: 0.68,
})

/**
 * Walks an ellipse arc from `from` to `to` (canvas angles, clockwise) in
 * `bumps` scallops, each bulging outward by `bulge` — the cauliflower edge
 * that makes a silhouette read as a brain at any size.
 */
function traceScallops(ctx, X, Y, cx, cy, rx, ry, from, to, bumps, bulge) {
  const sweep = (to - from) / bumps
  const at = (angle, scale = 1) => [
    cx + Math.cos(angle) * rx * scale,
    cy + Math.sin(angle) * ry * scale,
  ]
  const [sx, sy] = at(from)
  ctx.moveTo(X(sx, sy), Y(sx, sy))
  for (let bump = 0; bump < bumps; bump++) {
    const start = from + sweep * bump
    const [mx, my] = at(start + sweep / 2, 1 + bulge)
    const [ex, ey] = at(start + sweep)
    ctx.quadraticCurveTo(X(mx, my), Y(mx, my), X(ex, ey), Y(ex, ey))
  }
}

/**
 * A brain in side profile, as line art: scalloped cerebrum, the meandering
 * gyri inside it, a striped cerebellum tucked under the back, and the stem.
 * Unit space is x −1…1, y −1 (top) … 1 (bottom), rotated by `angle` about
 * the centre so the same drawing flips through the air.
 */
function drawBrain(ctx, cx, cy, size, angle, color, glow) {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const X = (x, y) => cx + (x * cos - y * sin) * size
  const Y = (x, y) => cy + (x * sin + y * cos) * size
  const line = (x1, y1, x2, y2) => {
    ctx.beginPath()
    ctx.moveTo(X(x1, y1), Y(x1, y1))
    ctx.lineTo(X(x2, y2), Y(x2, y2))
    ctx.stroke()
  }

  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.shadowColor = PHOSPHOR.phosphor
  ctx.shadowBlur = glow

  // Cerebrum: one scalloped arc from where the cerebellum tucks in, under,
  // up the front, over the top and down the back.
  ctx.beginPath()
  traceScallops(ctx, X, Y, -0.05, -0.15, 1.0, 0.72, Math.PI * 0.42, Math.PI * 2.1, 17, 0.14)
  ctx.stroke()

  // The lateral fissure: the fold that separates the temporal lobe, sweeping
  // back from the front. It is the single line that most says "brain".
  ctx.lineWidth = 3.5
  ctx.beginPath()
  ctx.moveTo(X(-0.98, 0.0), Y(-0.98, 0.0))
  ctx.bezierCurveTo(X(-0.62, 0.08), Y(-0.62, 0.08), X(-0.3, 0.3), Y(-0.3, 0.3), X(0.12, 0.34), Y(0.12, 0.34))
  ctx.stroke()

  // Gyri: winding folds that follow the lobes as broken concentric rings,
  // each wobbling on its own period so no two run parallel.
  ctx.lineWidth = 2.6
  const rings = [
    { radius: 0.3, from: Math.PI * 0.62, to: Math.PI * 1.98, wobble: 5, gaps: 2 },
    { radius: 0.52, from: Math.PI * 0.58, to: Math.PI * 2.02, wobble: 7, gaps: 3 },
    { radius: 0.74, from: Math.PI * 0.6, to: Math.PI * 2.0, wobble: 9, gaps: 3 },
  ]
  for (const ring of rings) {
    const span = ring.to - ring.from
    const segments = ring.gaps + 1
    for (let segment = 0; segment < segments; segment++) {
      const start = ring.from + (span * segment) / segments + 0.08
      const end = ring.from + (span * (segment + 1)) / segments - 0.08
      ctx.beginPath()
      for (let i = 0; i <= 18; i++) {
        const angle = start + ((end - start) * i) / 18
        const radius = ring.radius * (1 + 0.1 * Math.sin(angle * ring.wobble + ring.radius * 20))
        const x = -0.05 + Math.cos(angle) * radius * 1.0
        const y = -0.15 + Math.sin(angle) * radius * 0.72
        if (i === 0) ctx.moveTo(X(x, y), Y(x, y))
        else ctx.lineTo(X(x, y), Y(x, y))
      }
      ctx.stroke()
    }
  }

  // Cerebellum: a smaller scalloped lobe under the back, with its stripes.
  ctx.lineWidth = 4
  ctx.beginPath()
  traceScallops(ctx, X, Y, 0.6, 0.54, 0.36, 0.26, 0, Math.PI * 2, 9, 0.16)
  ctx.closePath()
  ctx.stroke()
  ctx.lineWidth = 2.5
  line(0.42, 0.42, 0.52, 0.72)
  line(0.56, 0.36, 0.68, 0.74)
  line(0.72, 0.36, 0.84, 0.7)

  // Stem.
  ctx.lineWidth = 4
  line(0.18, 0.66, 0.08, 1.02)
  line(0.34, 0.74, 0.26, 1.02)
  line(0.08, 1.02, 0.26, 1.02)
  ctx.shadowBlur = 0
}

/**
 * The grill: charcoal fire underneath, tongues licking up between the bars,
 * the grate in shallow perspective, and heat shimmer rising off it. The fire
 * flickers gently on the free-running clock — fire that does not move is not
 * fire — but nothing else here does.
 */
function drawGrill(ctx, left, time) {
  const { width, top, depth, bars, legs } = GRILL
  const inset = 44

  // Flames first, so the grate is drawn over them and they read as coming up
  // through it. Each tongue sways and breathes on its own phase.
  for (let flame = 0; flame < 6; flame++) {
    const x = left + width * (0.16 + 0.136 * flame)
    const sway = Math.sin(time * 5.7 + flame * 1.9) * 12
    const breath = Math.sin(time * 4.1 + flame * 2.6) * 22
    const base = top + legs * 0.62
    // Tall enough to clear the back rim: the tongues come up THROUGH the
    // grate, and the grate is drawn over them so the bars cut across the fire.
    // One rung under the brain on the ladder, so the fire frames it rather
    // than competing with it.
    const tip = top - depth - 44 - breath
    const wide = 32
    ctx.lineWidth = 3
    ctx.strokeStyle = PHOSPHOR.dim
    ctx.beginPath()
    ctx.moveTo(x - wide, base)
    ctx.bezierCurveTo(x - wide * 1.15, base - 100, x + sway - 12, tip + 130, x + sway, tip)
    ctx.bezierCurveTo(x + sway + 12, tip + 130, x + wide * 1.15, base - 100, x + wide, base)
    ctx.stroke()
    // The brighter core of the tongue.
    ctx.lineWidth = 2.5
    ctx.strokeStyle = PHOSPHOR.phosphor
    ctx.beginPath()
    ctx.moveTo(x - wide * 0.4, base)
    ctx.bezierCurveTo(x - wide * 0.5, base - 50, x + sway * 0.6 - 5, tip + 150, x + sway * 0.6, tip + 90)
    ctx.bezierCurveTo(x + sway * 0.6 + 5, tip + 150, x + wide * 0.5, base - 50, x + wide * 0.4, base)
    ctx.stroke()
  }
  // The coals: a row of dim stones between the legs.
  ctx.strokeStyle = PHOSPHOR.dim
  ctx.lineWidth = 3
  for (let coal = 0; coal < 9; coal++) {
    const x = left + 110 + coal * ((width - 220) / 8)
    ctx.beginPath()
    ctx.ellipse(x, top + legs * 0.62, 26, 14, 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Grate: rims front and back with the sides joining them, so the brain has
  // a surface to sit ON rather than a line.
  const grate = PHOSPHOR.dim
  rule(ctx, left, top, left + width, top, grate, 5)
  rule(ctx, left + inset, top - depth, left + width - inset, top - depth, grate, 3)
  rule(ctx, left, top, left + inset, top - depth, grate, 3)
  rule(ctx, left + width, top, left + width - inset, top - depth, grate, 3)
  for (let bar = 1; bar <= bars; bar++) {
    const t = bar / (bars + 1)
    rule(ctx, left + t * width, top, left + inset + t * (width - inset * 2), top - depth, grate, 2)
  }
  rule(ctx, left + 70, top, left + 70, top + legs, grate, 5)
  rule(ctx, left + width - 70, top, left + width - 70, top + legs, grate, 5)
  rule(ctx, left + 70, top + legs, left + width - 70, top + legs, grate, 3)

  // Heat: short broken wisps rising off the grate either side of the brain,
  // drifting upward on the clock. Dashed and ghost-dim so they read as air,
  // not as lines.
  ctx.strokeStyle = PHOSPHOR.ghost
  ctx.lineWidth = 2
  ctx.setLineDash([7, 11])
  ctx.lineDashOffset = -time * 40
  for (const x of [left + 170, left + width - 170]) {
    ctx.beginPath()
    for (let y = top - depth - 14; y > top - depth - 150; y -= 6) {
      const rise = (top - depth - 14 - y) / 136
      const wave = Math.sin(y * 0.05 + time * 2.2 + x) * 8 * (1 - rise * 0.5)
      if (y === top - depth - 14) ctx.moveTo(x + wave, y)
      else ctx.lineTo(x + wave, y)
    }
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.lineDashOffset = 0
}

function drawGrillVisual(ctx, visual, draw = 1, time = 0) {
  const step = visual.step ?? 0
  const progress = Math.min(1, visual.progress ?? 1)
  const answers = visual.answers ?? []
  const left = (TERMINAL.width - GRILL.width) / 2
  const frameProgress = draw >= 1 ? 1 : easeInOut((draw - 0.05) / 0.5)
  if (frameProgress <= 0) return

  ctx.globalAlpha = frameProgress
  chromeText(ctx, visual.title, TERMINAL.width / 2, 250, {
    size: 92,
    weight: 700,
    align: 'center',
    baseline: 'middle',
    color: PHOSPHOR.hot,
  })
  drawGrill(ctx, left, time)

  // The flip: up, one full turn, and down onto the grate; then the question.
  // It cooks UPSIDE DOWN — crown on the bars, stem in the air — so the rest
  // pose is a half turn and every flip is one full turn from there. The crown
  // of the scalloped cerebrum is 0.97 of the size below the centre once it is
  // inverted; that is what sits on the grate's mid-depth.
  const air = Math.min(1, progress / GRILL.airShare)
  const restY = GRILL.top - GRILL.depth * 0.5 - GRILL.brain * 0.97
  const brainY = restY - GRILL.jump * Math.sin(Math.PI * air)
  const landed = air >= 1
  drawBrain(
    ctx,
    TERMINAL.width / 2,
    brainY,
    GRILL.brain,
    Math.PI + Math.PI * 2 * air,
    landed ? PHOSPHOR.hot : PHOSPHOR.dim,
    landed ? GLOW_RADIUS * 0.9 : 0
  )

  const lineY = GRILL.top + GRILL.legs + 120
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (!landed && step > 0) {
    // The answer that launched this flip, stamped on the question it answered
    // and fading as the brain climbs.
    const previous = visual.questions[step - 1]
    const answer = answers[step - 1]
    ctx.globalAlpha = frameProgress * (1 - air)
    ctx.font = screenFont(44, 500)
    const stamp = answer ? `   ${answer.toUpperCase()}` : ''
    const line = `❯ ${previous}`
    const width = ctx.measureText(line + stamp).width
    ctx.textAlign = 'left'
    ctx.fillStyle = PHOSPHOR.dim
    ctx.fillText(line, (TERMINAL.width - width) / 2, lineY)
    if (answer) {
      ctx.fillStyle = PHOSPHOR.hot
      ctx.shadowColor = PHOSPHOR.phosphor
      ctx.shadowBlur = GLOW_RADIUS * 0.8
      ctx.fillText(stamp, (TERMINAL.width - width) / 2 + ctx.measureText(line).width, lineY)
      ctx.shadowBlur = 0
    }
  } else if (landed && visual.question !== null && visual.question !== undefined) {
    // Landed: the question types in, then the two keys that answer it.
    const typing = Math.min(1, (progress - GRILL.airShare) / (1 - GRILL.airShare))
    const line = `❯ ${visual.questions[visual.question]}`
    const shown = line.slice(0, Math.ceil(line.length * easeInOut(typing)))
    ctx.font = screenFont(44, 500)
    ctx.textAlign = 'left'
    ctx.fillStyle = PHOSPHOR.hot
    ctx.shadowColor = PHOSPHOR.phosphor
    ctx.shadowBlur = GLOW_RADIUS * 0.8
    const fullWidth = ctx.measureText(line).width
    ctx.fillText(shown, (TERMINAL.width - fullWidth) / 2, lineY)
    ctx.shadowBlur = 0
    if (typing >= 1) {
      chromeText(ctx, 'Y  YES   ·   N  NO', TERMINAL.width / 2, lineY + 74, {
        size: 28,
        align: 'center',
        baseline: 'middle',
        color: PHOSPHOR.ghost,
      })
    }
  } else if (landed) {
    // Nothing left to ask: the tally, dim, and the brain at rest.
    const yes = answers.filter((answer) => answer === 'yes').length
    const no = answers.filter((answer) => answer === 'no').length
    chromeText(ctx, `${yes} yes   ·   ${no} no`, TERMINAL.width / 2, lineY, {
      size: 34,
      align: 'center',
      baseline: 'middle',
      color: PHOSPHOR.dim,
    })
  }
  ctx.globalAlpha = 1
}

/**
 * GO FOR A WALK — one line over a perspective line drawing of a path through
 * simple line trees, walked along at walking pace. The only catalog form that
 * moves on the free-running clock; every tree's place and height is seeded
 * from its index, so the walk is the same walk every time.
 */
const WALK = Object.freeze({
  horizon: 720,
  focal: 760,
  eyeHeight: 1.7,
  pathHalf: 1.6,
  treeOffset: 3.8,
  spacing: 7,
  depth: 84,
  near: 1.4,
  speed: 1.5, // units per second — an unhurried walk
})

function drawTree(ctx, baseX, baseY, height, scale, color, alpha) {
  const trunkWidth = Math.max(1.5, 3.2 * scale)
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = trunkWidth
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(baseX, baseY)
  ctx.lineTo(baseX, baseY - height)
  ctx.stroke()
  // Four bare branches, alternating sides, each a straight stroke angled up.
  ctx.lineWidth = Math.max(1, trunkWidth * 0.6)
  for (let branch = 0; branch < 4; branch++) {
    const at = baseY - height * (0.42 + branch * 0.15)
    const side = branch % 2 === 0 ? -1 : 1
    const reach = height * (0.3 - branch * 0.05)
    ctx.beginPath()
    ctx.moveTo(baseX, at)
    ctx.lineTo(baseX + side * reach, at - reach * 0.75)
    ctx.stroke()
  }
}

function drawWalkVisual(ctx, visual, draw = 1, time = 0) {
  const cx = TERMINAL.width / 2
  const sceneProgress = draw >= 1 ? 1 : easeInOut((draw - 0.05) / 0.5)
  const project = (x, y, z) => ({
    x: cx + (x / z) * WALK.focal,
    y: WALK.horizon + ((WALK.eyeHeight - y) / z) * WALK.focal,
    scale: WALK.focal / z,
  })

  if (sceneProgress > 0) {
    ctx.globalAlpha = sceneProgress
    // Horizon and the path's two edges, converging on the vanishing point.
    rule(ctx, FRAME.left, WALK.horizon, FRAME.right, WALK.horizon, PHOSPHOR.ghost, 2)
    for (const side of [-1, 1]) {
      const near = project(side * WALK.pathHalf, 0, WALK.near)
      rule(ctx, near.x, near.y, cx, WALK.horizon, PHOSPHOR.dim, 3)
    }

    // Trees, far to near so the close ones overdraw. Each recycles to the far
    // end of the depth as it walks past the camera.
    const count = Math.floor(WALK.depth / WALK.spacing)
    const trees = []
    for (let side of [-1, 1]) {
      for (let index = 0; index < count; index++) {
        const seed = ((index * 97 + (side > 0 ? 41 : 0)) * 2654435761) % 1000 / 1000
        const travel = (index * WALK.spacing - time * WALK.speed) % WALK.depth
        const z = ((travel % WALK.depth) + WALK.depth) % WALK.depth + WALK.near
        trees.push({
          side,
          z,
          x: side * (WALK.treeOffset + seed * 2.4),
          height: 3.0 + seed * 2.4,
        })
      }
    }
    trees.sort((a, b) => b.z - a.z)
    for (const tree of trees) {
      const base = project(tree.x, 0, tree.z)
      const top = project(tree.x, tree.height, tree.z)
      const distanceFade = 1 - smoothRange(tree.z, WALK.depth * 0.35, WALK.depth)
      const nearFade = smoothRange(tree.z, WALK.near, WALK.near + 2.4)
      drawTree(
        ctx,
        base.x,
        base.y,
        base.y - top.y,
        base.scale / (WALK.focal / WALK.near),
        PHOSPHOR.phosphor,
        sceneProgress * distanceFade * nearFade
      )
    }
    ctx.globalAlpha = 1
  }

  // The line, typed in as a statement is.
  const typeProgress = draw >= 1 ? 1 : easeInOut((draw - 0.1) / 0.8)
  const shown = visual.text.slice(0, Math.ceil(visual.text.length * typeProgress))
  if (!shown) return
  ctx.font = screenFont(100, 700)
  ctx.fillStyle = PHOSPHOR.hot
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = PHOSPHOR.phosphor
  ctx.shadowBlur = GLOW_RADIUS * 0.8
  const fullWidth = ctx.measureText(visual.text).width
  ctx.fillText(shown, (TERMINAL.width - fullWidth) / 2, 300)
  ctx.shadowBlur = 0
}

function smoothRange(value, edge0, edge1) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Labelled nodes joined by directed edges — the closing 3R image.
 *
 * Node positions are authored in the catalog as fractions of the screen, so the
 * form stays declarative and the same definition can drive a later phosphor
 * representation. Edges carry their own drive: the shortcut from a result
 * straight to a response exists and is drawn dim, and the path that routes
 * through responsibility is the hot one. That contrast IS the argument, so it
 * is a property of the data rather than of this renderer.
 */
function drawDiagramVisual(ctx, visual, draw = 1) {
  const nodes = new Map(visual.nodes.map((node) => [node.id, node]))
  const at = (node) => ({
    x: node.x * TERMINAL.width,
    y: node.y * TERMINAL.height,
  })
  const nodeProgress = draw >= 1 ? 1 : easeInOut((draw - 0.06) / 0.5)
  const edgeProgress = draw >= 1 ? 1 : easeInOut((draw - 0.42) / 0.55)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = screenFont(38, 700)
  const boxes = visual.nodes.map((node) => {
    const center = at(node)
    const width = ctx.measureText(node.label).width + 68
    return { node, center, width, height: 96 }
  })

  if (edgeProgress > 0) {
    for (const edge of visual.edges) {
      const from = boxes.find((box) => box.node.id === edge.from)
      const to = boxes.find((box) => box.node.id === edge.to)
      if (!from || !to) throw new Error(`Diagram edge references a missing node`)
      const hot = edge.role === 'hot'
      // Stop the stroke at each box's edge rather than its centre, so the
      // arrowhead lands against the node instead of inside it.
      const dx = to.center.x - from.center.x
      const dy = to.center.y - from.center.y
      const length = Math.hypot(dx, dy) || 1
      const inset = (box) =>
        Math.min(box.width / 2 + 20, box.height / 2 + 20 + Math.abs(dx / length) * 40)
      const startX = from.center.x + (dx / length) * inset(from)
      const startY = from.center.y + (dy / length) * inset(from)
      const endX = to.center.x - (dx / length) * inset(to)
      const endY = to.center.y - (dy / length) * inset(to)
      const tipX = startX + (endX - startX) * edgeProgress
      const tipY = startY + (endY - startY) * edgeProgress

      ctx.save()
      ctx.strokeStyle = hot ? PHOSPHOR.phosphor : PHOSPHOR.ghost
      ctx.lineWidth = hot ? 6 : 4
      if (!hot) ctx.setLineDash([16, 14])
      ctx.shadowColor = PHOSPHOR.phosphor
      ctx.shadowBlur = hot ? GLOW_RADIUS * 0.5 : 0
      ctx.beginPath()
      ctx.moveTo(startX, startY)
      ctx.lineTo(tipX, tipY)
      ctx.stroke()
      ctx.restore()

      if (edgeProgress < 1) continue
      const angle = Math.atan2(endY - startY, endX - startX)
      ctx.fillStyle = hot ? PHOSPHOR.phosphor : PHOSPHOR.ghost
      ctx.beginPath()
      ctx.moveTo(endX, endY)
      ctx.lineTo(
        endX - Math.cos(angle - 0.4) * 26,
        endY - Math.sin(angle - 0.4) * 26
      )
      ctx.lineTo(
        endX - Math.cos(angle + 0.4) * 26,
        endY - Math.sin(angle + 0.4) * 26
      )
      ctx.closePath()
      ctx.fill()
    }
  }

  if (nodeProgress <= 0) return
  for (const box of boxes) {
    const hot = box.node.role === 'hot'
    const w = box.width * nodeProgress
    const x = box.center.x - w / 2
    const y = box.center.y - box.height / 2
    ctx.fillStyle = PHOSPHOR.glass
    ctx.fillRect(x, y, w, box.height)
    ctx.strokeStyle = hot ? PHOSPHOR.hot : PHOSPHOR.dim
    ctx.lineWidth = hot ? 5 : 3
    ctx.strokeRect(x, y, w, box.height)
    if (nodeProgress < 1) continue
    ctx.font = screenFont(38, 700)
    ctx.fillStyle = hot ? PHOSPHOR.hot : PHOSPHOR.phosphor
    ctx.shadowColor = PHOSPHOR.phosphor
    ctx.shadowBlur = GLOW_RADIUS * 0.6
    ctx.fillText(box.node.label, box.center.x, box.center.y)
    ctx.shadowBlur = 0
  }

  if (nodeProgress >= 1 && visual.caption) {
    chromeText(ctx, visual.caption, TERMINAL.width / 2, TERMINAL.height * 0.78, {
      size: 34,
      align: 'center',
      color: PHOSPHOR.dim,
    })
  }
}

function drawImageContain(ctx, image, bounds) {
  const scale = Math.min(bounds.w / image.width, bounds.h / image.height)
  const width = image.width * scale
  const height = image.height * scale
  const x = bounds.x + (bounds.w - width) / 2
  const y = bounds.y + (bounds.h - height) / 2
  ctx.shadowColor = PHOSPHOR.phosphor
  ctx.shadowBlur = 18
  ctx.drawImage(image, x, y, width, height)
  ctx.shadowBlur = 0
}

function drawCornerMarks(ctx, bounds) {
  const length = 34
  const corners = [
    [bounds.x, bounds.y, 1, 1],
    [bounds.x + bounds.w, bounds.y, -1, 1],
    [bounds.x, bounds.y + bounds.h, 1, -1],
    [bounds.x + bounds.w, bounds.y + bounds.h, -1, -1],
  ]
  for (const [x, y, xDirection, yDirection] of corners) {
    rule(ctx, x, y, x + length * xDirection, y, PHOSPHOR.dim, 4)
    rule(ctx, x, y, x, y + length * yDirection, PHOSPHOR.dim, 4)
  }
}

/**
 * A QR code at scanning size, with crisp modules: dark modules on an amber
 * panel (a light-on-dark code only decodes on scanners that bother to try
 * inverted polarity), no glow (the halo softens the module edges the scanner
 * is looking for), no smoothing (nearest-neighbour keeps every module a hard
 * square whatever the scale), and the count and the address in a column
 * beside it rather than under it, so the code itself can take the height of
 * the glass. The panel is phosphor, not white: one hue, and the brightest
 * thing on the glass is still the number.
 */
function drawCodeVisual(ctx, visual) {
  const side = 1040
  // With a count beside it the code sits left; alone, it sits in the middle.
  const left = visual.headline ? TERMINAL.padX : (TERMINAL.width - side) / 2
  const box = { x: left, y: (TERMINAL.height - side) / 2, w: side, h: side }
  drawCornerMarks(ctx, { x: box.x - 30, y: box.y - 30, w: side + 60, h: side + 60 })
  const image = getTerminalAsset(visual.asset)
  if (image) {
    ctx.save()
    ctx.fillStyle = PHOSPHOR.phosphor
    ctx.beginPath()
    ctx.roundRect(box.x, box.y, box.w, box.h, 28)
    ctx.fill()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(image, box.x, box.y, box.w, box.h)
    ctx.restore()
  } else {
    chromeText(ctx, 'DECODING LOCAL ASSET…', box.x + side / 2, box.y + side / 2, {
      size: 34,
      align: 'center',
      color: PHOSPHOR.dim,
    })
  }

  if (!visual.headline) return

  // The number, then what it counts, then where to scan — the reason to reach
  // for a phone, read from the back of the room.
  const columnX = (box.x + side + TERMINAL.width - TERMINAL.padX) / 2
  chromeText(ctx, visual.headline, columnX, 520, {
    size: 176,
    weight: 700,
    align: 'center',
    color: PHOSPHOR.hot,
  })
  chromeText(ctx, visual.caption, columnX, 712, {
    size: 46,
    weight: 500,
    align: 'center',
    color: PHOSPHOR.phosphor,
  })
  chromeText(ctx, visual.label.toUpperCase(), columnX, 800, {
    size: 44,
    weight: 700,
    align: 'center',
    color: PHOSPHOR.hot,
  })
}

/**
 * DISCLAIMER. A warning triangle and one word on flat glass — the sign a room
 * reads before it reads anything else. Drawn, not a glyph: JetBrains Mono has
 * no ⚠, and a fallback face would be the only foreign letterform in the deck.
 * Phosphor triangle, hot mark and word; the triangle fades up over the first
 * half of the draw sweep and the word types on over the second, the way the
 * title does. Everything Scott says under it is spoken, not written.
 */
function drawWarningVisual(ctx, visual, draw = 1) {
  const cx = TERMINAL.width / 2
  const cy = 540
  const side = 400
  const corner = 36
  const height = (side * Math.sqrt(3)) / 2
  const top = { x: cx, y: cy - (2 * height) / 3 }
  const left = { x: cx - side / 2, y: cy + height / 3 }
  const right = { x: cx + side / 2, y: cy + height / 3 }

  ctx.save()
  ctx.globalAlpha = draw >= 1 ? 1 : easeInOut(draw / 0.5)
  ctx.lineWidth = 26
  ctx.lineJoin = 'round'
  ctx.strokeStyle = PHOSPHOR.phosphor
  ctx.shadowColor = PHOSPHOR.phosphor
  ctx.shadowBlur = GLOW_RADIUS
  ctx.beginPath()
  ctx.moveTo((top.x + left.x) / 2, (top.y + left.y) / 2)
  ctx.arcTo(top.x, top.y, right.x, right.y, corner)
  ctx.arcTo(right.x, right.y, left.x, left.y, corner)
  ctx.arcTo(left.x, left.y, top.x, top.y, corner)
  ctx.closePath()
  ctx.stroke()

  ctx.fillStyle = PHOSPHOR.hot
  ctx.shadowColor = PHOSPHOR.hot
  const barWidth = 44
  ctx.beginPath()
  ctx.roundRect(cx - barWidth / 2, cy - 118, barWidth, 156, barWidth / 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy + 100, 28, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  const shown =
    draw >= 1
      ? visual.text
      : visual.text.slice(0, Math.ceil(visual.text.length * easeInOut((draw - 0.4) / 0.6)))
  if (!shown) return
  ctx.font = screenFont(132, 700)
  ctx.fillStyle = PHOSPHOR.hot
  ctx.shadowColor = PHOSPHOR.phosphor
  ctx.shadowBlur = GLOW_RADIUS * 0.8
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const fullWidth = ctx.measureText(visual.text).width
  ctx.fillText(shown, (TERMINAL.width - fullWidth) / 2, 1000)
  ctx.shadowBlur = 0
}

/**
 * A QUOTE — one respondent's words, large and alone on the glass. Wrapped and
 * centred at the largest size that keeps it to four lines, in hot, with
 * typographic marks around it; it types on over the draw sweep the way a
 * statement does, and the settled frame is identical to a deep link. Sizes
 * step down rather than scale continuously so every quote lands on one of a
 * few authored sizes.
 */
const QUOTE_SIZES = Object.freeze([96, 88, 80, 72, 64, 56, 48, 44])
/** Where a quote's line illustration lives: the right third of the glass. */
const QUOTE_PANEL = Object.freeze({ x: 1660, y: 220, w: 724, h: 1000 })

const smoothRamp = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}
/** Seeded 0–1 value for an integer, so a feed or a grid varies without ever changing. */
const seeded = (k, salt = 0) => {
  const value = Math.sin(k * 12.9898 + salt * 78.233) * 43758.5453
  return value - Math.floor(value)
}

function drawQuoteVisual(ctx, visual, draw = 1, time = 0) {
  const text = `“${visual.text}”`
  const illustrated = Boolean(visual.illustration)
  // With a drawing beside it the quote takes the left two thirds and may run
  // to five lines; alone it takes the width and stops at four. A long quote
  // steps down to the small sizes, where seven lines (six alone) still sit
  // inside the glass with room around them.
  const left = TERMINAL.padX
  const right = illustrated ? QUOTE_PANEL.x - 100 : TERMINAL.width - TERMINAL.padX - 60
  const maxWidth = right - left - (illustrated ? 0 : 60)
  const linesAllowed = (candidate) =>
    candidate >= 64 ? (illustrated ? 5 : 4) : illustrated ? 7 : 6
  let size = QUOTE_SIZES[QUOTE_SIZES.length - 1]
  let lines = []
  for (const candidate of QUOTE_SIZES) {
    ctx.font = screenFont(candidate, 700)
    size = candidate
    lines = wrapToWidth(ctx, text, maxWidth)
    if (lines.length <= linesAllowed(candidate)) break
  }
  const lineHeight = size * 1.42
  const startY = TERMINAL.height / 2 - ((lines.length - 1) * lineHeight) / 2
  const totalChars = lines.reduce((sum, line) => sum + line.length, 0)
  const typeProgress = draw >= 1 ? 1 : easeInOut((draw - 0.1) / 0.8)
  let budget = Math.ceil(totalChars * typeProgress)

  ctx.font = screenFont(size, 700)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = PHOSPHOR.hot
  ctx.shadowColor = PHOSPHOR.phosphor
  ctx.shadowBlur = GLOW_RADIUS * 0.8
  const centreX = (left + right) / 2
  for (let index = 0; index < lines.length && budget > 0; index++) {
    const line = lines[index]
    const shown = line.slice(0, budget)
    budget -= line.length
    // Anchored to the full line's centred box so the type-on grows in place.
    const fullWidth = ctx.measureText(line).width
    ctx.fillText(shown, centreX - fullWidth / 2, startY + index * lineHeight)
  }
  ctx.shadowBlur = 0

  if (illustrated) QUOTE_ILLUSTRATIONS[visual.illustration](ctx, QUOTE_PANEL, time)
}

/*
 * ── Quote illustrations ──
 * Line drawings in the walk's idiom — phosphor strokes on bare glass, hot
 * only where something happens — that move on the free-running clock beside
 * a respondent's words (Scott, 2026-09-10: "some kind of visual for each of
 * these quotes, like doomscrolling, a puzzle"). Every cycle is authored and
 * seeded, so a loop looks the same at every rehearsal; nothing in them is
 * random at run time.
 */

/** A phone whose feed never ends: cards rise past the screen at one every ~1.4 s. */
function drawDoomscroll(ctx, panel, time) {
  const phone = { w: 430, h: 880 }
  const x = panel.x + (panel.w - phone.w) / 2
  const y = panel.y + (panel.h - phone.h) / 2
  ctx.save()
  ctx.lineWidth = 5
  ctx.strokeStyle = PHOSPHOR.dim
  ctx.beginPath()
  ctx.roundRect(x, y, phone.w, phone.h, 64)
  ctx.stroke()
  ctx.fillStyle = PHOSPHOR.dim
  ctx.beginPath()
  ctx.roundRect(x + phone.w / 2 - 60, y + 28, 120, 12, 6)
  ctx.fill()

  const screen = { x: x + 26, y: y + 64, w: phone.w - 52, h: phone.h - 104 }
  ctx.beginPath()
  ctx.rect(screen.x, screen.y, screen.w, screen.h)
  ctx.clip()
  const pitch = 218
  const offset = time * 150
  const first = Math.floor((offset - screen.h) / pitch) - 1
  for (let k = first; k < first + 7; k++) {
    const top = screen.y + screen.h + k * pitch - offset
    if (top > screen.y + screen.h || top + pitch < screen.y) continue
    const card = { x: screen.x + 14, y: top, w: screen.w - 28, h: pitch - 28 }
    ctx.lineWidth = 3
    ctx.strokeStyle = PHOSPHOR.ghost
    ctx.beginPath()
    ctx.roundRect(card.x, card.y, card.w, card.h, 22)
    ctx.stroke()
    // Avatar, a name, a handle.
    ctx.fillStyle = PHOSPHOR.dim
    ctx.beginPath()
    ctx.arc(card.x + 44, card.y + 44, 22, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(card.x + 82, card.y + 30, 90 + seeded(k, 1) * 70, 10)
    ctx.fillStyle = PHOSPHOR.ghost
    ctx.fillRect(card.x + 82, card.y + 50, 60 + seeded(k, 2) * 40, 8)
    // Three lines of something, then an image every third card or so.
    const hasImage = seeded(k, 3) > 0.55
    const bodyTop = card.y + 84
    for (let row = 0; row < (hasImage ? 2 : 3); row++) {
      const width = (card.w - 44) * (0.55 + 0.45 * seeded(k, 10 + row))
      ctx.fillRect(card.x + 22, bodyTop + row * 22, width, 9)
    }
    if (hasImage) {
      ctx.strokeStyle = PHOSPHOR.ghost
      ctx.beginPath()
      ctx.roundRect(card.x + 22, bodyTop + 52, card.w - 44, card.h - 84 - 52 - 16, 12)
      ctx.stroke()
    }
    // Now and then something hot in the feed — the thing the thumb was after.
    if (seeded(k, 4) > 0.86) {
      ctx.fillStyle = PHOSPHOR.hot
      ctx.beginPath()
      ctx.arc(card.x + card.w - 30, card.y + 30, 7, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

/** One edge of a jigsaw piece: flat, a tab out, or a blank in. */
function jigsawEdge(ctx, ax, ay, bx, by, type, knob) {
  if (type === 0) {
    ctx.lineTo(bx, by)
    return
  }
  const dx = bx - ax
  const dy = by - ay
  const length = Math.hypot(dx, dy)
  const ux = dx / length
  const uy = dy / length
  // Outward normal for a clockwise path in canvas coordinates.
  const ox = uy * type
  const oy = -ux * type
  const mx = ax + dx / 2
  const my = ay + dy / 2
  const neck = knob * 0.55
  const p0x = mx - ux * neck
  const p0y = my - uy * neck
  const p1x = mx + ux * neck
  const p1y = my + uy * neck
  const tipX = mx + ox * knob * 1.7
  const tipY = my + oy * knob * 1.7
  ctx.lineTo(p0x, p0y)
  ctx.bezierCurveTo(
    p0x + ox * knob * 0.9 - ux * knob * 0.55,
    p0y + oy * knob * 0.9 - uy * knob * 0.55,
    tipX - ux * knob * 0.95,
    tipY - uy * knob * 0.95,
    tipX,
    tipY
  )
  ctx.bezierCurveTo(
    tipX + ux * knob * 0.95,
    tipY + uy * knob * 0.95,
    p1x + ox * knob * 0.9 + ux * knob * 0.55,
    p1y + oy * knob * 0.9 + uy * knob * 0.55,
    p1x,
    p1y
  )
  ctx.lineTo(bx, by)
}

function jigsawPiecePath(ctx, x, y, s, edges, knob) {
  ctx.beginPath()
  ctx.moveTo(x, y)
  jigsawEdge(ctx, x, y, x + s, y, edges.top, knob)
  jigsawEdge(ctx, x + s, y, x + s, y + s, edges.right, knob)
  jigsawEdge(ctx, x + s, y + s, x, y + s, edges.bottom, knob)
  jigsawEdge(ctx, x, y + s, x, y, edges.left, knob)
  ctx.closePath()
}

// The order the pieces arrive in: corners, then edges, then the middle last.
const PUZZLE_ORDER = Object.freeze([0, 8, 2, 6, 1, 7, 3, 5, 4])

/**
 * A three-by-three jigsaw assembling itself: pieces slide in one by one from
 * off the panel and lock, the whole thing flares hot for a beat when the last
 * one lands, then it clears and starts again. Somebody else is solving it.
 */
function drawPuzzle(ctx, panel, time) {
  const n = 3
  const s = 176
  const knob = 24
  const gx = panel.x + (panel.w - n * s) / 2
  const gy = panel.y + (panel.h - n * s) / 2
  const cycle = 10.5
  const t = time % cycle
  const gap = 0.72
  const arrive = 0.55
  const solvedAt = 0.6 + (n * n - 1) * gap + arrive
  const fadeOut = 1 - smoothRamp(cycle - 1.4, cycle - 0.3, t)
  const flare = t > solvedAt ? Math.exp(-(t - solvedAt) * 2.2) : 0

  // Tabs alternate by parity so every interior edge has one tab and one blank.
  const belowTab = (r, c) => ((r + c) % 2 === 0 ? 1 : -1)
  const rightTab = (r, c) => ((r * 3 + c) % 2 === 0 ? 1 : -1)
  const edgesOf = (r, c) => ({
    top: r === 0 ? 0 : -belowTab(r - 1, c),
    bottom: r === n - 1 ? 0 : belowTab(r, c),
    left: c === 0 ? 0 : -rightTab(r, c - 1),
    right: c === n - 1 ? 0 : rightTab(r, c),
  })

  ctx.save()
  ctx.globalAlpha = fadeOut
  ctx.lineJoin = 'round'
  // The outline of where the puzzle will be, faint, so the empty board reads.
  ctx.lineWidth = 3
  ctx.strokeStyle = PHOSPHOR.ghost
  ctx.setLineDash([14, 14])
  ctx.strokeRect(gx, gy, n * s, n * s)
  ctx.setLineDash([])

  PUZZLE_ORDER.forEach((cell, order) => {
    const startAt = 0.6 + order * gap
    if (t < startAt) return
    const r = Math.floor(cell / n)
    const c = cell % n
    const p = Math.min(1, (t - startAt) / arrive)
    const eased = p * p * (3 - 2 * p)
    // From off the panel — alternately from the right and from below — to home.
    const fromX = gx + c * s + (order % 2 === 0 ? panel.w * 0.7 : 0)
    const fromY = gy + r * s + (order % 2 === 0 ? 0 : panel.h * 0.6)
    const x = fromX + (gx + c * s - fromX) * eased
    const y = fromY + (gy + r * s - fromY) * eased
    const locked = p >= 1
    jigsawPiecePath(ctx, x, y, s, edgesOf(r, c), knob)
    ctx.lineWidth = locked ? 5 : 4
    ctx.strokeStyle = locked ? PHOSPHOR.phosphor : PHOSPHOR.dim
    if (flare > 0) {
      ctx.strokeStyle = PHOSPHOR.hot
      ctx.shadowColor = PHOSPHOR.phosphor
      ctx.shadowBlur = GLOW_RADIUS * 1.5 * flare
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  })
  ctx.restore()
}

/**
 * Output up, energy down: the pile of things done grows a bar at a time while
 * the battery beside it drains, flickering at the bottom; then both clear and
 * it starts again.
 */
function drawBattery(ctx, panel, time) {
  const cycle = 11.5
  const t = time % cycle
  const fadeOut = 1 - smoothRamp(cycle - 1.3, cycle - 0.3, t)
  ctx.save()
  ctx.globalAlpha = fadeOut
  ctx.lineJoin = 'round'

  // The battery.
  const battery = { w: 220, h: 560 }
  const bx = panel.x + panel.w * 0.66 - battery.w / 2
  const by = panel.y + (panel.h - battery.h) / 2 + 20
  ctx.lineWidth = 5
  ctx.strokeStyle = PHOSPHOR.dim
  ctx.beginPath()
  ctx.roundRect(bx, by, battery.w, battery.h, 26)
  ctx.stroke()
  ctx.fillStyle = PHOSPHOR.dim
  ctx.beginPath()
  ctx.roundRect(bx + battery.w / 2 - 44, by - 34, 88, 30, 8)
  ctx.fill()
  const level = 1 - 0.95 * smoothRamp(0.4, 9.2, t)
  const inner = { x: bx + 18, y: by + 18, w: battery.w - 36, h: battery.h - 36 }
  const fillHeight = inner.h * level
  // Nearly empty, it flickers.
  const flicker = level < 0.18 ? 0.55 + 0.45 * (Math.sin(time * 21) > 0.2 ? 1 : 0.3) : 1
  ctx.fillStyle = PHOSPHOR.phosphor
  ctx.globalAlpha = fadeOut * (0.55 + 0.45 * level) * flicker
  ctx.beginPath()
  ctx.roundRect(inner.x, inner.y + inner.h - fillHeight, inner.w, fillHeight, 12)
  ctx.fill()
  ctx.globalAlpha = fadeOut

  // The pile of things done.
  const bar = { w: 250, h: 34, gap: 14 }
  const px = panel.x + panel.w * 0.24 - bar.w / 2
  const baseline = by + battery.h
  const count = Math.min(11, Math.floor((t - 0.2) / 0.8) + 1)
  for (let i = 0; i < count; i++) {
    const appearedAt = 0.2 + i * 0.8
    const pop = Math.min(1, (t - appearedAt) / 0.3)
    const scale = 0.6 + 0.4 * (pop * pop * (3 - 2 * pop))
    const y = baseline - (i + 1) * (bar.h + bar.gap)
    const w = bar.w * scale
    ctx.lineWidth = 4
    ctx.strokeStyle = PHOSPHOR.phosphor
    ctx.beginPath()
    ctx.roundRect(px + (bar.w - w) / 2, y, w, bar.h, 8)
    ctx.stroke()
    if (pop >= 1) {
      // A tick: done.
      ctx.strokeStyle = PHOSPHOR.hot
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(px + 24, y + bar.h / 2)
      ctx.lineTo(px + 36, y + bar.h / 2 + 9)
      ctx.lineTo(px + 56, y + bar.h / 2 - 10)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/**
 * A day on a clock, and the reminders that go unheeded: the hands sweep twelve
 * hours in one cycle; at noon and at six a "stop and eat" popup rises under
 * the clock, waits, and is dismissed with a hot ×, and the hands keep going.
 */
function drawPopups(ctx, panel, time) {
  const cycle = 12
  const t = time % cycle
  const cx = panel.x + panel.w / 2
  const cy = panel.y + 300
  const r = 170
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // The face.
  ctx.lineWidth = 5
  ctx.strokeStyle = PHOSPHOR.dim
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 4
  for (let hour = 0; hour < 12; hour++) {
    const angle = (hour / 12) * Math.PI * 2 - Math.PI / 2
    const inner = hour % 3 === 0 ? r - 30 : r - 16
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
    ctx.lineTo(cx + Math.cos(angle) * (r - 6), cy + Math.sin(angle) * (r - 6))
    ctx.stroke()
  }
  // Hands: one revolution of the hour hand per cycle, twelve of the minute hand.
  const hourAngle = (t / cycle) * Math.PI * 2 - Math.PI / 2
  const minuteAngle = ((t * 12) / cycle) * Math.PI * 2 - Math.PI / 2
  ctx.strokeStyle = PHOSPHOR.phosphor
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(hourAngle) * r * 0.55, cy + Math.sin(hourAngle) * r * 0.55)
  ctx.stroke()
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(minuteAngle) * r * 0.82, cy + Math.sin(minuteAngle) * r * 0.82)
  ctx.stroke()
  ctx.fillStyle = PHOSPHOR.hot
  ctx.beginPath()
  ctx.arc(cx, cy, 9, 0, Math.PI * 2)
  ctx.fill()

  // The reminders: one at noon, one at six, each up for a while, then dismissed.
  const card = { w: 400, h: 170 }
  const cardX = cx - card.w / 2
  const restY = cy + r + 110
  for (const [at, label] of [
    [0.3, 'LUNCH'],
    [6.3, 'DINNER'],
  ]) {
    const life = t - at
    if (life < 0 || life > 2.4) continue
    const rise = smoothRamp(0, 0.45, life)
    const dismiss = smoothRamp(1.9, 2.4, life)
    const y = restY + (1 - rise) * 120 + dismiss * 60
    ctx.globalAlpha = rise * (1 - dismiss)
    ctx.lineWidth = 4
    ctx.strokeStyle = PHOSPHOR.phosphor
    ctx.beginPath()
    ctx.roundRect(cardX, y, card.w, card.h, 22)
    ctx.stroke()
    // A bell, a line of text, the label.
    ctx.fillStyle = PHOSPHOR.phosphor
    ctx.beginPath()
    ctx.arc(cardX + 52, y + 56, 18, Math.PI, 0)
    ctx.lineTo(cardX + 74, y + 74)
    ctx.lineTo(cardX + 30, y + 74)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = PHOSPHOR.dim
    ctx.fillRect(cardX + 96, y + 44, 190, 10)
    ctx.fillRect(cardX + 96, y + 66, 120, 8)
    chromeText(ctx, `STOP FOR ${label}`, cardX + 96, y + 108, {
      size: 26,
      weight: 700,
      color: PHOSPHOR.phosphor,
    })
    // The ×, hot as it is hit.
    const hit = life > 1.75
    ctx.strokeStyle = hit ? PHOSPHOR.hot : PHOSPHOR.dim
    ctx.lineWidth = hit ? 6 : 4
    ctx.beginPath()
    ctx.moveTo(cardX + card.w - 54, y + 34)
    ctx.lineTo(cardX + card.w - 30, y + 58)
    ctx.moveTo(cardX + card.w - 30, y + 34)
    ctx.lineTo(cardX + card.w - 54, y + 58)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

/**
 * A break, forbidden: a mug with steam rising on its own slow clock, and a
 * "no" sign — the circle, then the bar — stroking itself on around it, hot,
 * holding, and letting go before it starts again.
 */
function drawForbiddenBreak(ctx, panel, time) {
  const cycle = 6.5
  const t = time % cycle
  const cx = panel.x + panel.w / 2
  const cy = panel.y + panel.h / 2 + 30
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // The mug.
  const mug = { w: 250, h: 230 }
  const mx = cx - mug.w / 2 - 30
  const my = cy - mug.h / 2 + 40
  ctx.lineWidth = 6
  ctx.strokeStyle = PHOSPHOR.phosphor
  ctx.beginPath()
  ctx.roundRect(mx, my, mug.w, mug.h, [14, 14, 44, 44])
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(mx + mug.w + 8, my + 100, 62, -Math.PI / 2, Math.PI / 2)
  ctx.stroke()
  ctx.lineWidth = 4
  ctx.strokeStyle = PHOSPHOR.dim
  ctx.beginPath()
  ctx.moveTo(mx + 18, my + 44)
  ctx.lineTo(mx + mug.w - 18, my + 44)
  ctx.stroke()
  // Steam: three wisps, each a slow sine that rises and fades.
  for (let wisp = 0; wisp < 3; wisp++) {
    const x0 = mx + 55 + wisp * 70
    const phase = time * 0.9 + wisp * 2.1
    ctx.strokeStyle = PHOSPHOR.dim
    ctx.lineWidth = 4
    ctx.beginPath()
    for (let step = 0; step <= 24; step++) {
      const f = step / 24
      const x = x0 + Math.sin(phase + f * 5.5) * 14 * (0.4 + f)
      const y = my - 20 - f * 150
      if (step === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.globalAlpha = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(phase * 0.7))
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // The sign: the circle draws on, then the bar, then it holds, then it goes.
  const radius = 300
  const circleOn = smoothRamp(0.6, 1.7, t)
  const barOn = smoothRamp(1.6, 2.2, t)
  const fade = 1 - smoothRamp(5.2, 6.1, t)
  ctx.globalAlpha = fade
  ctx.strokeStyle = PHOSPHOR.hot
  ctx.shadowColor = PHOSPHOR.phosphor
  ctx.shadowBlur = GLOW_RADIUS * 1.2
  ctx.lineWidth = 16
  if (circleOn > 0) {
    ctx.beginPath()
    ctx.arc(cx, cy, radius, -Math.PI * 0.75, -Math.PI * 0.75 + Math.PI * 2 * circleOn)
    ctx.stroke()
  }
  if (barOn > 0) {
    const ax = cx - Math.cos(Math.PI / 4) * radius
    const ay = cy - Math.sin(Math.PI / 4) * radius
    const bx = cx + Math.cos(Math.PI / 4) * radius
    const by = cy + Math.sin(Math.PI / 4) * radius
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(ax + (bx - ax) * barOn, ay + (by - ay) * barOn)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Great things, started: a column of tracks, each with a finish line. One
 * after another a bar leaps out of the gate — hot while it runs — and stalls
 * a fraction of the way along, and the next one starts underneath it. None
 * of them reaches the line.
 */
function drawStarts(ctx, panel, time) {
  const rows = 7
  const stagger = 1.4
  const cycle = rows * stagger + 2.6
  const t = time % cycle
  const x0 = panel.x + 40
  const x1 = panel.x + panel.w - 40
  const top = panel.y + 140
  const pitch = 118
  const fade = 1 - smoothRamp(cycle - 0.9, cycle - 0.1, t)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.globalAlpha = fade
  for (let row = 0; row < rows; row++) {
    const y = top + row * pitch
    // The track and its finish line.
    ctx.strokeStyle = PHOSPHOR.ghost
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x1, y)
    ctx.stroke()
    ctx.strokeStyle = PHOSPHOR.dim
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(x1, y - 22)
    ctx.lineTo(x1, y + 22)
    ctx.stroke()
    // The run: out of the gate fast, then nothing.
    const life = t - row * stagger
    if (life <= 0) continue
    const stall = 0.16 + seeded(row, 1) * 0.28
    const fill = stall * (1 - Math.exp(-life * 4.5))
    const running = smoothRamp(0.9, 0.3, life)
    const end = x0 + (x1 - x0) * fill
    ctx.strokeStyle = PHOSPHOR.phosphor
    ctx.lineWidth = 14
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(end, y)
    ctx.stroke()
    if (running > 0) {
      ctx.globalAlpha = fade * running
      ctx.fillStyle = PHOSPHOR.hot
      ctx.shadowColor = PHOSPHOR.phosphor
      ctx.shadowBlur = GLOW_RADIUS
      ctx.beginPath()
      ctx.arc(end, y, 12, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.globalAlpha = fade
    }
  }
  ctx.restore()
}

/**
 * The last ten percent: one big bar with a readout. It races to the high
 * eighties in a second and a half, then creeps — the number ticks up one at a
 * time and slower every time — and never touches the hundred mark.
 */
function drawNinety(ctx, panel, time) {
  const cycle = 12
  const t = time % cycle
  const x0 = panel.x + 40
  const x1 = panel.x + panel.w - 40
  const y = panel.y + panel.h / 2 + 40
  const h = 84
  const fade = 1 - smoothRamp(cycle - 1.0, cycle - 0.2, t)
  const sprint = 0.88 * smoothRamp(0.2, 1.6, t)
  const creep = t > 1.6 ? 0.11 * (1 - Math.exp(-(t - 1.6) / 3.2)) : 0
  const fill = sprint + creep
  ctx.save()
  ctx.lineCap = 'round'
  ctx.globalAlpha = fade
  // The bar's outline and its marks.
  ctx.strokeStyle = PHOSPHOR.dim
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(x0, y - h / 2, x1 - x0, h, 16)
  ctx.stroke()
  for (const [mark, label, align, nudge] of [
    [0, '0', 'left', -2],
    [0.5, '50', 'center', 0],
    [0.9, '90', 'center', 0],
    [1, '100', 'right', 10],
  ]) {
    const x = x0 + (x1 - x0) * mark
    ctx.strokeStyle = mark === 1 ? PHOSPHOR.phosphor : PHOSPHOR.dim
    ctx.lineWidth = mark === 1 ? 5 : 3
    ctx.beginPath()
    ctx.moveTo(x, y + h / 2 + 10)
    ctx.lineTo(x, y + h / 2 + 34)
    ctx.stroke()
    chromeText(ctx, label, x + nudge, y + h / 2 + 76, {
      size: 24,
      weight: 700,
      align,
      color: mark === 1 ? PHOSPHOR.phosphor : PHOSPHOR.dim,
    })
  }
  // The fill, and the stretch it cannot close, hatched.
  if (fill > 0) {
    ctx.fillStyle = PHOSPHOR.phosphor
    ctx.beginPath()
    ctx.roundRect(x0 + 8, y - h / 2 + 8, (x1 - x0 - 16) * fill, h - 16, 10)
    ctx.fill()
  }
  const gapStart = x0 + 8 + (x1 - x0 - 16) * Math.max(fill, 0.9)
  ctx.save()
  ctx.beginPath()
  ctx.rect(gapStart, y - h / 2 + 8, x1 - 8 - gapStart, h - 16)
  ctx.clip()
  ctx.strokeStyle = PHOSPHOR.ghost
  ctx.lineWidth = 3
  for (let x = gapStart - h; x < x1; x += 18) {
    ctx.beginPath()
    ctx.moveTo(x, y + h / 2)
    ctx.lineTo(x + h, y - h / 2)
    ctx.stroke()
  }
  ctx.restore()
  // The readout.
  chromeText(ctx, `${Math.floor(fill * 100)}%`, (x0 + x1) / 2, y - h / 2 - 70, {
    size: 150,
    weight: 800,
    align: 'center',
    baseline: 'bottom',
    color: fill > 0.9 ? PHOSPHOR.hot : PHOSPHOR.phosphor,
  })
  ctx.restore()
}

/**
 * Two people, drifting: a pair of line figures start shoulder to shoulder
 * and walk away from each other across a bare floor, the line between them
 * stretching thin and going out, until they stand alone at the edges.
 */
function drawApart(ctx, panel, time) {
  const cycle = 11
  const t = time % cycle
  const cx = panel.x + panel.w / 2
  const floorY = panel.y + panel.h / 2 + 200
  const drift = smoothRamp(0.6, 8.2, t)
  const gap = 42 + 262 * drift
  const moving = drift > 0.002 && drift < 0.998
  const fade = 1 - smoothRamp(cycle - 1.1, cycle - 0.2, t)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = fade
  // The floor.
  ctx.strokeStyle = PHOSPHOR.ghost
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(panel.x + 20, floorY)
  ctx.lineTo(panel.x + panel.w - 20, floorY)
  ctx.stroke()
  // The thread between them, thinning as it stretches.
  const bond = 1 - smoothRamp(0.25, 0.8, drift)
  if (bond > 0) {
    ctx.globalAlpha = fade * bond
    ctx.strokeStyle = PHOSPHOR.dim
    ctx.lineWidth = 3 + 3 * bond
    ctx.setLineDash([10, 14])
    ctx.beginPath()
    ctx.moveTo(cx - gap + 30, floorY - 160)
    ctx.lineTo(cx + gap - 30, floorY - 160)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = fade
  }
  // The two figures, each facing away, legs swinging only while they walk.
  for (const side of [-1, 1]) {
    const x = cx + side * gap
    const swing = moving ? Math.sin(time * 7 + (side + 1) * 1.3) * 22 : 0
    ctx.strokeStyle = PHOSPHOR.phosphor
    ctx.lineWidth = 6
    // Head.
    ctx.beginPath()
    ctx.arc(x, floorY - 250, 26, 0, Math.PI * 2)
    ctx.stroke()
    // Body.
    ctx.beginPath()
    ctx.moveTo(x, floorY - 222)
    ctx.lineTo(x, floorY - 110)
    ctx.stroke()
    // Arms, hanging slightly toward the way they are going.
    ctx.beginPath()
    ctx.moveTo(x, floorY - 200)
    ctx.lineTo(x + side * 18 + swing * 0.4, floorY - 120)
    ctx.moveTo(x, floorY - 200)
    ctx.lineTo(x - side * 14 - swing * 0.4, floorY - 122)
    ctx.stroke()
    // Legs.
    ctx.beginPath()
    ctx.moveTo(x, floorY - 110)
    ctx.lineTo(x + swing, floorY)
    ctx.moveTo(x, floorY - 110)
    ctx.lineTo(x - swing, floorY)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Fewer things at once: five tracks, each with a bead darting back and forth
 * on its own rhythm, fold down into one line with one bead that drifts — and
 * hold there — before the churn comes back and folds again.
 */
function drawCalmer(ctx, panel, time) {
  const cycle = 12
  const t = time % cycle
  const x0 = panel.x + 60
  const x1 = panel.x + panel.w - 60
  const cy = panel.y + panel.h / 2
  const lanes = 5
  const pitch = 110
  const fold = smoothRamp(4.2, 6.6, t)
  const fade = 1 - smoothRamp(cycle - 0.8, cycle - 0.1, t)
  ctx.save()
  ctx.lineCap = 'round'
  for (let lane = 0; lane < lanes; lane++) {
    const restY = cy + (lane - (lanes - 1) / 2) * pitch
    const y = restY + (cy - restY) * fold
    const alpha = lane === 2 ? 1 : 1 - fold
    if (alpha <= 0.01) continue
    ctx.globalAlpha = fade * alpha
    ctx.strokeStyle = PHOSPHOR.dim
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x1, y)
    ctx.stroke()
    // The bead: its own quick rhythm while the lanes are apart, one slow
    // drift once they have folded.
    const wild = Math.sin(time * (1.7 + lane * 0.55) + lane * 1.9)
    const calm = Math.sin(time * 0.35)
    const u = 0.5 + 0.42 * (wild * (1 - fold) + calm * fold)
    ctx.fillStyle = fold > 0.9 ? PHOSPHOR.hot : PHOSPHOR.phosphor
    ctx.shadowColor = PHOSPHOR.phosphor
    ctx.shadowBlur = GLOW_RADIUS * (0.5 + fold)
    ctx.beginPath()
    ctx.arc(x0 + (x1 - x0) * u, y, 11, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }
  ctx.restore()
}

/**
 * One project at a time, planned: the goal is drawn first — a ring, then the
 * dot — then one frame under it, then three sessions light up inside the
 * frame and each runs a line up to the goal. The frames outside it fade.
 */
function drawOneProject(ctx, panel, time) {
  const cycle = 11
  const t = time % cycle
  const cx = panel.x + panel.w / 2
  const goal = { x: cx, y: panel.y + 200, r: 46 }
  const frame = { x: cx - 260, y: panel.y + 400, w: 520, h: 400 }
  const fade = 1 - smoothRamp(cycle - 0.9, cycle - 0.1, t)
  const goalOn = smoothRamp(0.3, 1.4, t)
  const frameOn = smoothRamp(1.3, 2.2, t)
  const strays = 1 - smoothRamp(1.8, 3.0, t)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // The other projects, going.
  if (strays > 0) {
    ctx.globalAlpha = fade * strays * 0.8
    ctx.strokeStyle = PHOSPHOR.ghost
    ctx.lineWidth = 4
    ctx.setLineDash([12, 12])
    for (const x of [panel.x + 30, panel.x + panel.w - 230]) {
      ctx.beginPath()
      ctx.roundRect(x, frame.y + frame.h + 50, 200, 130, 16)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }
  // The goal.
  if (goalOn > 0) {
    ctx.globalAlpha = fade
    ctx.strokeStyle = PHOSPHOR.hot
    ctx.lineWidth = 7
    ctx.shadowColor = PHOSPHOR.phosphor
    ctx.shadowBlur = GLOW_RADIUS
    ctx.beginPath()
    ctx.arc(goal.x, goal.y, goal.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * goalOn)
    ctx.stroke()
    if (goalOn >= 1) {
      ctx.fillStyle = PHOSPHOR.hot
      ctx.beginPath()
      ctx.arc(goal.x, goal.y, 12, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.shadowBlur = 0
  }
  // The one frame.
  if (frameOn > 0) {
    ctx.globalAlpha = fade * frameOn
    ctx.strokeStyle = PHOSPHOR.phosphor
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.roundRect(frame.x, frame.y, frame.w, frame.h, 24)
    ctx.stroke()
  }
  // The sessions inside it, each wired up to the goal as it lights.
  const nodeY = frame.y + frame.h * 0.66
  for (let session = 0; session < 3; session++) {
    const on = smoothRamp(2.6 + session * 0.9, 3.2 + session * 0.9, t)
    if (on <= 0) continue
    const x = cx + (session - 1) * 150
    ctx.globalAlpha = fade * on
    ctx.fillStyle = PHOSPHOR.phosphor
    ctx.beginPath()
    ctx.roundRect(x - 44, nodeY - 34, 88, 68, 12)
    ctx.fill()
    // The line runs from the session to the frame's top edge, then on to the
    // goal, drawing upward as the session comes on.
    const wire = smoothRamp(3.0 + session * 0.9, 3.9 + session * 0.9, t)
    if (wire > 0) {
      const top = { x: goal.x, y: goal.y + goal.r + 10 }
      const start = { x, y: nodeY - 34 }
      const corner = { x, y: frame.y - 60 }
      const total = start.y - corner.y + Math.hypot(top.x - corner.x, top.y - corner.y)
      let remaining = total * wire
      ctx.strokeStyle = PHOSPHOR.dim
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      const leg = Math.min(remaining, start.y - corner.y)
      ctx.lineTo(start.x, start.y - leg)
      remaining -= leg
      if (remaining > 0) {
        const span = Math.hypot(top.x - corner.x, top.y - corner.y)
        const f = Math.min(1, remaining / span)
        ctx.lineTo(corner.x + (top.x - corner.x) * f, corner.y + (top.y - corner.y) * f)
      }
      ctx.stroke()
    }
  }
  ctx.restore()
}

/**
 * Outside: the walk, in the panel — the horizon, the path converging on it,
 * a sun, and the bare line trees coming past at walking pace on the
 * free-running clock, the way the full-frame walk did.
 */
function drawOutside(ctx, panel, time) {
  const cx = panel.x + panel.w / 2
  const horizon = panel.y + panel.h * 0.46
  const focal = 300
  const project = (x, y, z) => ({
    x: cx + (x / z) * focal,
    y: horizon + ((WALK.eyeHeight - y) / z) * focal,
  })
  ctx.save()
  ctx.beginPath()
  ctx.rect(panel.x, panel.y, panel.w, panel.h)
  ctx.clip()
  rule(ctx, panel.x, horizon, panel.x + panel.w, horizon, PHOSPHOR.ghost, 2)
  ctx.strokeStyle = PHOSPHOR.dim
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(cx + 210, horizon - 190, 44, 0, Math.PI * 2)
  ctx.stroke()
  for (const side of [-1, 1]) {
    const near = project(side * WALK.pathHalf, 0, WALK.near)
    rule(ctx, near.x, near.y, cx, horizon, PHOSPHOR.dim, 3)
  }
  const count = Math.floor(WALK.depth / WALK.spacing)
  const trees = []
  for (const side of [-1, 1]) {
    for (let index = 0; index < count; index++) {
      const seed = (((index * 97 + (side > 0 ? 41 : 0)) * 2654435761) % 1000) / 1000
      const travel = (index * WALK.spacing - time * WALK.speed) % WALK.depth
      const z = ((travel % WALK.depth) + WALK.depth) % WALK.depth + WALK.near
      // Closer to the path than the full-frame walk keeps them, so the near
      // trees stay inside the panel instead of being cut at its edge.
      trees.push({ z, x: side * (2.6 + seed * 1.2), height: 3.0 + seed * 2.4 })
    }
  }
  trees.sort((a, b) => b.z - a.z)
  for (const tree of trees) {
    const base = project(tree.x, 0, tree.z)
    const top = project(tree.x, tree.height, tree.z)
    const distanceFade = 1 - smoothRange(tree.z, WALK.depth * 0.35, WALK.depth)
    const nearFade = smoothRange(tree.z, WALK.near, WALK.near + 2.4)
    drawTree(ctx, base.x, base.y, base.y - top.y, WALK.near / tree.z, PHOSPHOR.phosphor, distanceFade * nearFade)
  }
  ctx.globalAlpha = 1
  ctx.restore()
}

/**
 * Not checking: a hammock slung between two of the walk's trees, swaying,
 * with a head at one end and feet at the other; the phone lies face down on
 * the ground below it, buzzes now and then, and stays where it is.
 */
function drawHammock(ctx, panel, time) {
  const groundY = panel.y + panel.h - 160
  const left = panel.x + 90
  const right = panel.x + panel.w - 90
  const sway = Math.sin(time * 0.9) * 12
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  rule(ctx, panel.x + 20, groundY, panel.x + panel.w - 20, groundY, PHOSPHOR.ghost, 3)
  drawTree(ctx, left, groundY, 560, 1, PHOSPHOR.phosphor, 1)
  drawTree(ctx, right, groundY, 600, 1, PHOSPHOR.phosphor, 1)
  ctx.globalAlpha = 1
  // The hammock: a sagging curve between the trunks, a head, two feet.
  const tieY = groundY - 300
  const sagX = (left + right) / 2 + sway
  const sagY = groundY - 150
  ctx.strokeStyle = PHOSPHOR.phosphor
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(left, tieY)
  ctx.quadraticCurveTo(sagX, sagY + 60, right, tieY)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(sagX - 150, sagY - 62 + sway * 0.2, 26, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(sagX + 130, sagY - 50 + sway * 0.2)
  ctx.lineTo(sagX + 175, sagY - 78 + sway * 0.2)
  ctx.moveTo(sagX + 150, sagY - 44 + sway * 0.2)
  ctx.lineTo(sagX + 195, sagY - 70 + sway * 0.2)
  ctx.stroke()
  // The phone, face down on the ground, seen from above: a back with a lens.
  const phone = { x: left + 90, y: groundY - 100, w: 74, h: 140 }
  ctx.strokeStyle = PHOSPHOR.dim
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(phone.x, phone.y, phone.w, phone.h, 14)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(phone.x + 20, phone.y + 22, 8, 0, Math.PI * 2)
  ctx.stroke()
  // The buzz: three quick arcs off each side, three times a cycle.
  const cycle = 9
  const t = time % cycle
  const buzz = t < 6.5 && t % 2.6 < 0.5 ? 1 - (t % 2.6) / 0.5 : 0
  if (buzz > 0) {
    ctx.globalAlpha = buzz
    ctx.strokeStyle = PHOSPHOR.hot
    ctx.lineWidth = 4
    const jitter = Math.sin(time * 60) * 3
    for (let ring = 0; ring < 3; ring++) {
      const offset = 22 + ring * 14
      ctx.beginPath()
      ctx.arc(phone.x - 6 + jitter, phone.y + phone.h / 2, offset, Math.PI * 0.7, Math.PI * 1.3)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(phone.x + phone.w + 6 + jitter, phone.y + phone.h / 2, offset, -Math.PI * 0.3, Math.PI * 0.3)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

/**
 * Nine to five: a clock hand sweeps from nine to five over the cycle,
 * lighting the arc it has covered, and stops there. The hours past five stay
 * dark and the centre goes out.
 */
function drawNineToFive(ctx, panel, time) {
  const cycle = 10
  const t = time % cycle
  const cx = panel.x + panel.w / 2
  const cy = panel.y + panel.h / 2
  const r = 250
  const fade = 1 - smoothRamp(cycle - 0.8, cycle - 0.1, t)
  const sweep = smoothRamp(0.6, 7.4, t)
  const done = smoothRamp(7.6, 8.2, t)
  const from = Math.PI
  const to = from + (Math.PI * 4) / 3
  const hand = from + (to - from) * sweep
  ctx.save()
  ctx.lineCap = 'round'
  ctx.globalAlpha = fade
  ctx.strokeStyle = PHOSPHOR.dim
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 4
  for (let hour = 0; hour < 12; hour++) {
    const angle = (hour / 12) * Math.PI * 2 - Math.PI / 2
    const inner = hour % 3 === 0 ? r - 34 : r - 18
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
    ctx.lineTo(cx + Math.cos(angle) * (r - 6), cy + Math.sin(angle) * (r - 6))
    ctx.stroke()
  }
  for (const [hour, label] of [
    [9, '9'],
    [5, '5'],
  ]) {
    const angle = (hour / 12) * Math.PI * 2 - Math.PI / 2
    chromeText(ctx, label, cx + Math.cos(angle) * (r + 64), cy + Math.sin(angle) * (r + 64), {
      size: 44,
      weight: 700,
      align: 'center',
      baseline: 'middle',
      color: PHOSPHOR.phosphor,
    })
  }
  // The hours covered, lit on the rim.
  if (sweep > 0) {
    ctx.strokeStyle = PHOSPHOR.phosphor
    ctx.lineWidth = 16
    ctx.shadowColor = PHOSPHOR.phosphor
    ctx.shadowBlur = GLOW_RADIUS * 0.8
    ctx.beginPath()
    ctx.arc(cx, cy, r + 26, from, hand)
    ctx.stroke()
    ctx.shadowBlur = 0
  }
  // The hand, hot while it moves, dim once it has stopped.
  ctx.strokeStyle = done > 0.5 ? PHOSPHOR.dim : PHOSPHOR.hot
  ctx.lineWidth = 9
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(hand) * r * 0.72, cy + Math.sin(hand) * r * 0.72)
  ctx.stroke()
  ctx.globalAlpha = fade * (1 - done)
  ctx.fillStyle = PHOSPHOR.hot
  ctx.beginPath()
  ctx.arc(cx, cy, 10, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * A ship every day: two weeks of seven day cells. In the top row one or two
 * ships land, unhurried. In the bottom row a ship stamps hot into every cell
 * in turn, one after another, and the row fills.
 */
function drawShipEveryDay(ctx, panel, time) {
  const cycle = 10
  const t = time % cycle
  const cell = 84
  const gap = 12
  const width = 7 * cell + 6 * gap
  const x0 = panel.x + (panel.w - width) / 2
  const fade = 1 - smoothRamp(cycle - 0.8, cycle - 0.1, t)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.globalAlpha = fade
  const rows = [
    { y: panel.y + 300, label: 'BEFORE', ships: [[1, 0.8], [4, 2.4]], hot: false },
    {
      y: panel.y + 620,
      label: 'NOW',
      ships: [0, 1, 2, 3, 4, 5, 6].map((day) => [day, 3.4 + day * 0.5]),
      hot: true,
    },
  ]
  for (const row of rows) {
    chromeText(ctx, row.label, x0, row.y - 64, { size: 24, weight: 700, color: PHOSPHOR.dim })
    ctx.strokeStyle = row.hot ? PHOSPHOR.dim : PHOSPHOR.ghost
    ctx.lineWidth = 3
    for (let day = 0; day < 7; day++) {
      ctx.beginPath()
      ctx.roundRect(x0 + day * (cell + gap), row.y, cell, cell, 10)
      ctx.stroke()
    }
    for (const [day, at] of row.ships) {
      const life = t - at
      if (life < 0) continue
      const land = smoothRamp(0, 0.3, life)
      const scale = 1.5 - 0.5 * land
      const cx = x0 + day * (cell + gap) + cell / 2
      const cy = row.y + cell / 2
      const side = 40 * scale
      ctx.globalAlpha = fade * land
      ctx.fillStyle = row.hot ? PHOSPHOR.hot : PHOSPHOR.phosphor
      if (row.hot) {
        ctx.shadowColor = PHOSPHOR.phosphor
        ctx.shadowBlur = GLOW_RADIUS * (1.6 - land)
      }
      ctx.beginPath()
      ctx.roundRect(cx - side / 2, cy - side / 2, side, side, 6)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.globalAlpha = fade
    }
  }
  ctx.restore()
}

/**
 * The system nobody knows any more: a grid of boxes wired together, built
 * fast, one box after another. As it grows its inside fades to ghost —
 * connected, but unknown — and then somewhere in the middle a fault pulses
 * hot, with a crack through it, and nothing around it is lit to reach it by.
 */
function drawArchitecture(ctx, panel, time) {
  const cycle = 12
  const t = time % cycle
  const cols = 4
  const rowsN = 4
  const pitchX = 160
  const pitchY = 190
  const box = { w: 64, h: 46 }
  const x0 = panel.x + (panel.w - (cols - 1) * pitchX) / 2
  const y0 = panel.y + (panel.h - (rowsN - 1) * pitchY) / 2
  const fade = 1 - smoothRamp(cycle - 0.8, cycle - 0.1, t)
  const unknown = smoothRamp(4.5, 7.5, t)
  const fault = t > 7.8 ? 0.5 + 0.5 * Math.sin((t - 7.8) * 7) : 0
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const at = (i) => ({ col: i % cols, row: Math.floor(i / cols) })
  const centre = (i) => {
    const { col, row } = at(i)
    return { x: x0 + col * pitchX, y: y0 + row * pitchY }
  }
  const interior = (i) => {
    const { col, row } = at(i)
    return col > 0 && col < cols - 1 && row > 0 && row < rowsN - 1
  }
  for (let i = 0; i < cols * rowsN; i++) {
    const on = smoothRamp(0.3 + i * 0.32, 0.6 + i * 0.32, t)
    if (on <= 0) continue
    const c = centre(i)
    const dimmed = interior(i) ? unknown : 0
    ctx.globalAlpha = fade * on * (1 - dimmed * 0.75)
    // Wires back to the box on the left and the one above.
    ctx.strokeStyle = PHOSPHOR.dim
    ctx.lineWidth = 3
    const { col, row } = at(i)
    if (col > 0) {
      const l = centre(i - 1)
      ctx.beginPath()
      ctx.moveTo(l.x + box.w / 2, l.y)
      ctx.lineTo(c.x - box.w / 2, c.y)
      ctx.stroke()
    }
    if (row > 0) {
      const u = centre(i - cols)
      ctx.beginPath()
      ctx.moveTo(u.x, u.y + box.h / 2)
      ctx.lineTo(c.x, c.y - box.h / 2)
      ctx.stroke()
    }
    ctx.strokeStyle = PHOSPHOR.phosphor
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.roundRect(c.x - box.w / 2, c.y - box.h / 2, box.w, box.h, 8)
    ctx.stroke()
  }
  // The fault, deep inside.
  if (fault > 0) {
    const c = centre(9)
    ctx.globalAlpha = fade * fault
    ctx.strokeStyle = PHOSPHOR.hot
    ctx.lineWidth = 5
    ctx.shadowColor = PHOSPHOR.phosphor
    ctx.shadowBlur = GLOW_RADIUS
    ctx.beginPath()
    ctx.roundRect(c.x - box.w / 2, c.y - box.h / 2, box.w, box.h, 8)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(c.x - 26, c.y - 30)
    ctx.lineTo(c.x - 6, c.y - 4)
    ctx.lineTo(c.x + 8, c.y - 10)
    ctx.lineTo(c.x + 4, c.y + 12)
    ctx.lineTo(c.x + 24, c.y + 30)
    ctx.stroke()
    ctx.shadowBlur = 0
  }
  ctx.restore()
}

/**
 * The usage limit: two gauges under one limit line. Yours fills in steps and
 * stops when you sleep — a moon comes up over it and the room left under the
 * limit hatches hot. Theirs, under a sun, keeps filling to the line. Then the
 * reset drops both to nothing and it starts again.
 */
function drawUsageLimit(ctx, panel, time) {
  const cycle = 11
  const t = time % cycle
  const gauge = { w: 120, h: 600 }
  const top = panel.y + 240
  const bottom = top + gauge.h
  const yours = panel.x + panel.w / 2 - 150
  const theirs = panel.x + panel.w / 2 + 150
  const fade = 1 - smoothRamp(cycle - 0.7, cycle - 0.1, t)
  const asleep = t > 4.6
  const reset = smoothRamp(7.8, 8.3, t)
  const yourFill = (asleep ? 0.62 : Math.min(0.62, Math.floor(t / 0.45) * 0.062)) * (1 - reset)
  const theirFill = Math.min(1, Math.floor(t / 0.45) * 0.062) * (1 - reset)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.globalAlpha = fade
  // The limit.
  ctx.strokeStyle = PHOSPHOR.phosphor
  ctx.lineWidth = 4
  ctx.setLineDash([14, 12])
  ctx.beginPath()
  ctx.moveTo(panel.x + 40, top)
  ctx.lineTo(panel.x + panel.w - 40, top)
  ctx.stroke()
  ctx.setLineDash([])
  chromeText(ctx, 'LIMIT', panel.x + 40, top - 40, { size: 24, weight: 700, color: PHOSPHOR.dim })
  for (const [x, fill, hot] of [
    [yours, yourFill, false],
    [theirs, theirFill, true],
  ]) {
    ctx.strokeStyle = PHOSPHOR.dim
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.roundRect(x - gauge.w / 2, top, gauge.w, gauge.h, 16)
    ctx.stroke()
    if (fill > 0) {
      ctx.fillStyle = hot && fill >= 1 ? PHOSPHOR.hot : PHOSPHOR.phosphor
      const h = (gauge.h - 16) * fill
      ctx.beginPath()
      ctx.roundRect(x - gauge.w / 2 + 8, bottom - 8 - h, gauge.w - 16, h, 10)
      ctx.fill()
    }
  }
  // Asleep: the moon over your gauge, and the room you left hatched hot.
  if (asleep && reset < 1) {
    const wake = smoothRamp(4.6, 5.4, t) * (1 - reset)
    ctx.globalAlpha = fade * wake
    ctx.strokeStyle = PHOSPHOR.phosphor
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.arc(yours, top - 120, 36, Math.PI * 0.15, Math.PI * 1.55)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(yours + 18, top - 128, 30, Math.PI * 0.35, Math.PI * 1.45, true)
    ctx.stroke()
    const pulse = 0.5 + 0.5 * Math.sin(t * 5)
    ctx.globalAlpha = fade * wake * (0.35 + 0.5 * pulse)
    ctx.save()
    ctx.beginPath()
    ctx.rect(yours - gauge.w / 2 + 8, top + 8, gauge.w - 16, (gauge.h - 16) * (1 - 0.62))
    ctx.clip()
    ctx.strokeStyle = PHOSPHOR.hot
    ctx.lineWidth = 3
    for (let y = top - gauge.w; y < top + gauge.h; y += 18) {
      ctx.beginPath()
      ctx.moveTo(yours - gauge.w / 2, y + gauge.w)
      ctx.lineTo(yours + gauge.w / 2, y)
      ctx.stroke()
    }
    ctx.restore()
  }
  // The sun over theirs, always up.
  ctx.globalAlpha = fade
  ctx.strokeStyle = PHOSPHOR.dim
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(theirs, top - 120, 30, 0, Math.PI * 2)
  ctx.stroke()
  for (let ray = 0; ray < 8; ray++) {
    const angle = (ray / 8) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(theirs + Math.cos(angle) * 42, top - 120 + Math.sin(angle) * 42)
    ctx.lineTo(theirs + Math.cos(angle) * 56, top - 120 + Math.sin(angle) * 56)
    ctx.stroke()
  }
  ctx.restore()
}

/** A flame: two curves meeting at a tip that leans with the flicker. */
function flamePath(ctx, x, baseY, height, width, lean) {
  ctx.beginPath()
  ctx.moveTo(x - width / 2, baseY)
  ctx.bezierCurveTo(x - width * 0.6, baseY - height * 0.45, x + lean - width * 0.1, baseY - height * 0.7, x + lean, baseY - height)
  ctx.bezierCurveTo(x + lean + width * 0.1, baseY - height * 0.7, x + width * 0.6, baseY - height * 0.45, x + width / 2, baseY)
  ctx.closePath()
}

/**
 * The spark, lost: a flame burns on a wick, flickering, and dwindles over the
 * cycle to an ember and a wisp of smoke, while coins stack up beside it, one
 * for every bit of flame that goes.
 */
function drawEmber(ctx, panel, time) {
  const cycle = 11
  const t = time % cycle
  const cx = panel.x + panel.w / 2 - 110
  const baseY = panel.y + panel.h / 2 + 120
  const fade = 1 - smoothRamp(cycle - 0.7, cycle - 0.1, t)
  const life = 1 - smoothRamp(1.5, 7.5, t)
  const flicker = Math.sin(time * 9) * 0.5 + Math.sin(time * 23) * 0.3
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = fade
  // The wick, and its holder.
  ctx.strokeStyle = PHOSPHOR.dim
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(cx - 70, baseY + 20)
  ctx.lineTo(cx + 70, baseY + 20)
  ctx.moveTo(cx, baseY + 20)
  ctx.lineTo(cx, baseY - 10)
  ctx.stroke()
  if (life > 0.02) {
    const height = 40 + 220 * life
    const width = 30 + 90 * life
    ctx.fillStyle = PHOSPHOR.phosphor
    ctx.shadowColor = PHOSPHOR.phosphor
    ctx.shadowBlur = GLOW_RADIUS * (0.6 + life)
    flamePath(ctx, cx, baseY - 10, height * (1 + flicker * 0.08), width, flicker * 12 * life)
    ctx.fill()
    ctx.fillStyle = PHOSPHOR.hot
    ctx.shadowBlur = 0
    flamePath(ctx, cx, baseY - 10, height * 0.5, width * 0.45, flicker * 6 * life)
    ctx.fill()
  } else {
    // The ember, and the smoke.
    const ember = 0.5 + 0.5 * Math.sin(time * 3)
    ctx.globalAlpha = fade * (0.4 + 0.5 * ember)
    ctx.fillStyle = PHOSPHOR.dim
    ctx.beginPath()
    ctx.arc(cx, baseY - 14, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = fade * 0.6
    ctx.strokeStyle = PHOSPHOR.ghost
    ctx.lineWidth = 4
    ctx.beginPath()
    for (let step = 0; step <= 20; step++) {
      const f = step / 20
      const x = cx + Math.sin(time * 1.1 + f * 5) * 16 * (0.3 + f)
      const y = baseY - 30 - f * 170
      if (step === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.globalAlpha = fade
  }
  // The coins, stacking as the flame goes.
  const coins = Math.min(7, Math.floor((1 - life) * 7.99))
  const coinX = panel.x + panel.w / 2 + 170
  ctx.strokeStyle = PHOSPHOR.phosphor
  ctx.lineWidth = 4
  for (let coin = 0; coin < coins; coin++) {
    const y = baseY + 6 - coin * 26
    ctx.beginPath()
    ctx.ellipse(coinX, y, 64, 14, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(coinX - 64, y)
    ctx.lineTo(coinX - 64, y + 14)
    ctx.moveTo(coinX + 64, y)
    ctx.lineTo(coinX + 64, y + 14)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * The spark, found: a strike, a burst of short hot rays, and a flame that
 * catches and stays lit — and out of it, branches fan upward and outward,
 * each forking as it goes, into things nobody would have started before.
 */
function drawIgnition(ctx, panel, time) {
  const cycle = 10
  const t = time % cycle
  const cx = panel.x + panel.w / 2
  const baseY = panel.y + panel.h - 200
  const fade = 1 - smoothRamp(cycle - 0.7, cycle - 0.1, t)
  const strike = smoothRamp(0.2, 0.6, t)
  const burst = t > 0.5 && t < 1.4 ? 1 - smoothRamp(0.7, 1.4, t) : 0
  const flame = smoothRamp(0.9, 2.2, t)
  const flicker = Math.sin(time * 9) * 0.5 + Math.sin(time * 23) * 0.3
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = fade
  // The strike: a short hot stroke coming down to the point.
  if (strike > 0 && flame < 1) {
    ctx.globalAlpha = fade * (1 - flame)
    ctx.strokeStyle = PHOSPHOR.hot
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(cx - 120 + 120 * strike, baseY - 140 + 140 * strike)
    ctx.lineTo(cx - 60 + 60 * strike, baseY - 70 + 70 * strike)
    ctx.stroke()
    ctx.globalAlpha = fade
  }
  if (burst > 0) {
    ctx.strokeStyle = PHOSPHOR.hot
    ctx.lineWidth = 4
    ctx.shadowColor = PHOSPHOR.phosphor
    ctx.shadowBlur = GLOW_RADIUS
    for (let ray = 0; ray < 10; ray++) {
      const angle = (ray / 10) * Math.PI * 2 + 0.3
      const inner = 20 + 40 * (1 - burst)
      const outer = inner + 30 + 50 * (1 - burst)
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * inner, baseY - 20 + Math.sin(angle) * inner)
      ctx.lineTo(cx + Math.cos(angle) * outer, baseY - 20 + Math.sin(angle) * outer)
      ctx.stroke()
    }
    ctx.shadowBlur = 0
  }
  if (flame > 0) {
    const height = 200 * flame
    const width = 100 * flame
    ctx.fillStyle = PHOSPHOR.phosphor
    ctx.shadowColor = PHOSPHOR.phosphor
    ctx.shadowBlur = GLOW_RADIUS * 1.2
    flamePath(ctx, cx, baseY, height * (1 + flicker * 0.08), width, flicker * 12)
    ctx.fill()
    ctx.fillStyle = PHOSPHOR.hot
    ctx.shadowBlur = 0
    flamePath(ctx, cx, baseY, height * 0.5, width * 0.45, flicker * 6)
    ctx.fill()
  }
  // The branches: from the flame's tip, forking upward, drawn on in turn.
  const grow = smoothRamp(2.4, 7.4, t)
  if (grow > 0) {
    ctx.strokeStyle = PHOSPHOR.phosphor
    ctx.lineWidth = 4
    const tip = { x: cx, y: baseY - 210 }
    const branch = (x, y, angle, length, depth, start) => {
      const local = Math.min(1, Math.max(0, (grow - start) / 0.28))
      if (local <= 0) return
      const ex = x + Math.cos(angle) * length * local
      const ey = y + Math.sin(angle) * length * local
      ctx.globalAlpha = fade * (0.45 + 0.55 * (1 - depth / 4))
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(ex, ey)
      ctx.stroke()
      if (local >= 1 && depth < 3) {
        const spread = 0.42 + seeded(depth * 7 + Math.round(x), 3) * 0.2
        branch(ex, ey, angle - spread, length * 0.72, depth + 1, start + 0.24)
        branch(ex, ey, angle + spread, length * 0.72, depth + 1, start + 0.24)
      }
    }
    branch(tip.x, tip.y, -Math.PI / 2 - 0.5, 150, 0, 0)
    branch(tip.x, tip.y, -Math.PI / 2 + 0.5, 150, 0, 0.1)
  }
  ctx.restore()
}

const QUOTE_ILLUSTRATIONS = Object.freeze({
  doomscroll: drawDoomscroll,
  puzzle: drawPuzzle,
  battery: drawBattery,
  ember: drawEmber,
  ignition: drawIgnition,
  popups: drawPopups,
  break: drawForbiddenBreak,
  starts: drawStarts,
  ninety: drawNinety,
  apart: drawApart,
  ship: drawShipEveryDay,
  architecture: drawArchitecture,
  'usage-limit': drawUsageLimit,
  calmer: drawCalmer,
  'one-project': drawOneProject,
  outside: drawOutside,
  hammock: drawHammock,
  'nine-to-five': drawNineToFive,
})

/**
 * A CRT shutting off around whatever it was showing: the picture collapses
 * toward the centre line, brightening as it goes (the beam's energy squeezed
 * into fewer lines), holds as one hot line, then the line contracts to a dot
 * and dies. Nothing else is drawn — after this the glass is dark.
 */
function drawPowerOff(ctx, visual, time) {
  const p = Math.min(1, Math.max(0, visual.progress ?? 1))
  const cy = TERMINAL.height / 2
  const collapse = easeInOut(Math.min(1, p / 0.62))
  const squeeze = Math.max(0.004, 1 - collapse)
  if (p < 0.62) {
    ctx.save()
    ctx.translate(0, cy)
    ctx.scale(1, squeeze)
    ctx.translate(0, -cy)
    drawVisual(ctx, visual.source, 1, time)
    ctx.restore()
    // The squeezed picture drives the phosphor harder as it collapses.
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = collapse * 0.55
    ctx.fillStyle = PHOSPHOR.phosphor
    ctx.fillRect(0, cy - 3 - 40 * squeeze, TERMINAL.width, 6 + 80 * squeeze)
    ctx.restore()
  }
  // One hot line, then a dot.
  const lineLife = 1 - THREE_SMOOTH(0.62, 1, p)
  const width = TERMINAL.width * lineLife
  if (width > 1) {
    ctx.save()
    ctx.fillStyle = PHOSPHOR.hot
    ctx.shadowColor = PHOSPHOR.phosphor
    ctx.shadowBlur = GLOW_RADIUS * 1.6
    ctx.globalAlpha = 0.6 + 0.4 * lineLife
    ctx.fillRect((TERMINAL.width - width) / 2, cy - 3, width, 6)
    ctx.restore()
  }
}

const THREE_SMOOTH = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function drawAssetVisual(ctx, visual) {
  // The code is not pretending to be a file in a viewer: it is the thing to
  // scan, and the harness chrome around it only made it smaller.
  if (visual.asset === 'qr') return drawCodeVisual(ctx, visual)

  drawHarnessChrome(ctx, {
    section: 'AGENT HARNESS / ASSET VIEWER',
    detail: visual.detail,
    footerRight: 'ARROWS  NAVIGATE',
  })

  chromeText(ctx, `LOAD  ${visual.path}`, TERMINAL.padX, 250, {
    size: 32,
    color: PHOSPHOR.phosphor,
  })
  chromeText(ctx, '[READY / MEMORY]', FRAME.right - 34, 254, {
    size: 25,
    align: 'right',
    color: PHOSPHOR.hot,
  })

  const preview = { x: 176, y: 310, w: TERMINAL.width - 352, h: 740 }
  ctx.strokeStyle = PHOSPHOR.ghost
  ctx.lineWidth = 2
  ctx.strokeRect(preview.x, preview.y, preview.w, preview.h)
  drawCornerMarks(ctx, preview)

  const image = getTerminalAsset(visual.asset)
  if (image) {
    drawImageContain(ctx, image, {
      x: preview.x + 110,
      y: preview.y + 74,
      w: preview.w - 220,
      h: preview.h - 220,
    })
  } else {
    chromeText(ctx, 'DECODING LOCAL ASSET…', TERMINAL.width / 2, 640, {
      size: 34,
      align: 'center',
      color: PHOSPHOR.dim,
    })
  }

  chromeText(ctx, visual.label.toUpperCase(), TERMINAL.width / 2, 1090, {
    size: 34,
    weight: 700,
    align: 'center',
    color: PHOSPHOR.hot,
  })
  chromeText(ctx, 'SVG → CANVAS BUFFER · PHOSPHOR MONOCHROME · 100% LOCAL', TERMINAL.width / 2, 1142, {
    size: 24,
    align: 'center',
    color: PHOSPHOR.ghost,
  })
}

/** Greedy wrap against the painter's own metrics, at whatever size is set. */
function wrapToWidth(ctx, text, maxWidth) {
  const lines = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * A post, quoted on the glass.
 *
 * The Rob beat is a real thing a real person published, and the reason the
 * survey exists is the reply thread under it. It was rendered as four lines of
 * authored poetry — "the all-nighter. / the hospital. / i got off easy." —
 * which is a talk ABOUT a post rather than the post, and the room has no reason
 * to believe a paraphrase. Quote it.
 *
 * Drawn rather than embedded: there is no DOM on this screen and nothing may be
 * fetched at runtime, so a live embed is not available at any price. A drawn
 * quote also stays on the phosphor ladder, which a full-colour screenshot would
 * not — see `postAsset` below for the screenshot route if that is preferred.
 */
/**
 * A post, as the post — avatar, name, verified badge, handle, the words, the
 * photograph that came with it, and the counts underneath.
 *
 * Quoting the text alone was still a talk ABOUT a tweet. The thing that makes
 * the beat land is that the room recognises the object: someone actually
 * published this, at a time, with a photo attached, and eight hundred people
 * replied. So the card is drawn as a card.
 *
 * Duotone rather than full colour — see assets.js. The layout is what makes it
 * read as a post; the palette is what keeps it on the glass, and a full-colour
 * rectangle in the middle of a phosphor talk would read as a screenshot pasted
 * over the deck rather than as something on the monitor.
 *
 * Text and body run left, media right, which is not X's stacked layout — on a
 * 16:9 projector stacking costs the body about a third of its size, and the
 * body is the part that has to be read from the back.
 */
function drawTweetVisual(ctx, visual, draw = 1) {
  const left = TERMINAL.padX
  const bodyWidth = 1360
  const avatar = getTerminalAsset('robAvatar')
  const photo = getTerminalAsset('robPhoto')

  // ── Identity row ──
  const avatarSize = 116
  const avatarY = 168
  if (avatar) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(left + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(avatar, left, avatarY, avatarSize, avatarSize)
    ctx.restore()
  }
  const nameX = left + avatarSize + 34
  chromeText(ctx, visual.author, nameX, avatarY + 6, {
    size: 48,
    weight: 700,
    color: PHOSPHOR.hot,
  })
  if (visual.verified) {
    ctx.save()
    ctx.font = screenFont(48, 700)
    const badgeX = nameX + ctx.measureText(visual.author).width + 42
    const badgeY = avatarY + 30
    ctx.beginPath()
    ctx.arc(badgeX, badgeY, 19, 0, Math.PI * 2)
    ctx.fillStyle = PHOSPHOR.phosphor
    ctx.fill()
    ctx.strokeStyle = PHOSPHOR.glass
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(badgeX - 8, badgeY)
    ctx.lineTo(badgeX - 2, badgeY + 7)
    ctx.lineTo(badgeX + 9, badgeY - 7)
    ctx.stroke()
    ctx.restore()
  }
  chromeText(ctx, visual.handle, nameX, avatarY + 66, {
    size: 40,
    weight: 500,
    color: PHOSPHOR.dim,
  })

  // ── The words ──
  const size = 52
  const lineHeight = size * 1.4
  const paragraphGap = size * 0.6
  ctx.font = screenFont(size, 500)
  const blocks = visual.paragraphs.map((text) => wrapToWidth(ctx, text, bodyWidth))
  const total = blocks.flat().reduce((sum, line) => sum + line.length, 0)
  let budget = Math.ceil(total * (draw >= 1 ? 1 : easeInOut((draw - 0.1) / 0.8)))

  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  let y = 360
  for (const block of blocks) {
    for (const line of block) {
      if (budget > 0) {
        ctx.font = screenFont(size, 500)
        ctx.fillStyle = PHOSPHOR.phosphor
        ctx.shadowColor = PHOSPHOR.phosphor
        ctx.shadowBlur = GLOW_RADIUS * 0.8
        ctx.fillText(line.slice(0, budget), left, y)
        budget -= line.length
      }
      y += lineHeight
    }
    y += paragraphGap
  }
  ctx.shadowBlur = 0

  // ── The photograph that came with it ──
  if (photo) {
    const frame = { x: left + bodyWidth + 120, y: 360, w: 700, h: 525 }
    ctx.save()
    ctx.beginPath()
    const r = 26
    ctx.moveTo(frame.x + r, frame.y)
    ctx.arcTo(frame.x + frame.w, frame.y, frame.x + frame.w, frame.y + frame.h, r)
    ctx.arcTo(frame.x + frame.w, frame.y + frame.h, frame.x, frame.y + frame.h, r)
    ctx.arcTo(frame.x, frame.y + frame.h, frame.x, frame.y, r)
    ctx.arcTo(frame.x, frame.y, frame.x + frame.w, frame.y, r)
    ctx.closePath()
    ctx.clip()
    drawImageContain(ctx, photo, frame)
    ctx.restore()
    ctx.strokeStyle = PHOSPHOR.ghost
    ctx.lineWidth = 3
    ctx.stroke()
  }

  // ── Counts ──
  chromeText(ctx, visual.meta, left, 1180, {
    size: 38,
    weight: 700,
    color: PHOSPHOR.hot,
  })
  chromeText(ctx, visual.url, left, 1246, {
    size: 30,
    weight: 500,
    color: PHOSPHOR.dim,
  })
}

/**
 * The survey, asked the way a terminal asks: one question per Enter, typed at
 * the harness's own speed behind a prompt marker, large enough to be read
 * from the back of the room, and nothing else on the glass — no scales, no
 * anchors, no counts. Arrival is an idle prompt, so the presenter owns the
 * timing of every question; the last press types two prompts (the agent
 * count and the open field, which the form asked together at the end).
 *
 * `visual.question` is the screen being typed (null: the idle prompt) and
 * `visual.progress` is 0→1 through it, so the frame is a pure function of the
 * step and a deep link lands on the settled text. The caret is recorded as a
 * byproduct of drawing — only the painter knows where the typed text ends —
 * and handed back for the renderer to blink, exactly like the transcript's.
 */
// 80 px, up from 64 (Scott, 2026-09-10: "make font larger"): the longest
// question still wraps to three lines at 43 characters, and the two-prompt
// last screen still sits inside the title-safe area from `top`.
const PROMPT_TYPE = Object.freeze({ size: 80, lineHeight: 1.36, gap: 0.6, top: 470, marker: '❯' })

function drawPromptVisual(ctx, visual) {
  const { size } = PROMPT_TYPE
  const screens = visual.screens
  // `?visual` review hands the catalog entry over bare: the last screen, settled.
  const asked = visual.question === undefined ? screens.length - 1 : visual.question
  const progress = visual.progress ?? 1
  chromeText(
    ctx,
    asked === null
      ? `${visual.header} · ${screens.length} QUESTIONS`
      : `${visual.header} · QUESTION ${asked + 1} OF ${screens.length}`,
    TERMINAL.padX,
    150,
    { size: 40, weight: 700, color: PHOSPHOR.dim }
  )

  const lineHeight = size * PROMPT_TYPE.lineHeight
  const left = TERMINAL.padX + Math.round(size * 1.25)
  ctx.font = screenFont(size, 500)
  const blocks = (asked === null ? [] : screens[asked]).map((text) =>
    wrapToWidth(ctx, text, TERMINAL.width - TERMINAL.padX - left)
  )
  const chars = blocks.flat().reduce((sum, line) => sum + line.length, 0)
  let budget = Math.ceil(chars * Math.min(1, progress))

  const marker = (y) => {
    ctx.font = screenFont(size, 700)
    ctx.fillStyle = PHOSPHOR.phosphor
    ctx.shadowColor = PHOSPHOR.phosphor
    ctx.shadowBlur = GLOW_RADIUS * 0.8
    ctx.fillText(PROMPT_TYPE.marker, TERMINAL.padX, y)
  }

  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  let y = PROMPT_TYPE.top
  let caret = { x: left, y }
  if (asked === null) marker(y)
  for (let index = 0; index < blocks.length; index++) {
    // The second prompt appears only once the first has been fully typed.
    if (index > 0 && budget <= 0) break
    marker(y)
    const block = blocks[index]
    for (let row = 0; row < block.length; row++) {
      const line = block[row]
      const shown = line.slice(0, Math.max(0, Math.min(line.length, budget)))
      ctx.font = screenFont(size, 500)
      if (shown) {
        ctx.fillStyle = PHOSPHOR.hot
        ctx.shadowColor = PHOSPHOR.phosphor
        ctx.shadowBlur = GLOW_RADIUS * 0.8
        ctx.fillText(shown, left, y)
      }
      caret = { x: left + ctx.measureText(shown).width, y }
      budget -= line.length
      if (budget <= 0) break
      if (row < block.length - 1) y += lineHeight
    }
    y += lineHeight + size * PROMPT_TYPE.gap
  }
  ctx.shadowBlur = 0

  return { caret: { rect: { x: caret.x, y: caret.y, width: size * 0.6, height: size } } }
}

/**
 * A chart, sized for the back of a room rather than for a screenshot.
 *
 * The harness chrome is GONE from this visual — no frame, no "AGENT HARNESS /
 * DATA VIEW", no "GRAPHICS MODE · VECTOR PLOT · STATIC BUFFER", no
 * "PLOT/BAR · BUFFER LOCKED", no footer. Six lines of 23–29px furniture that
 * nobody past the fourth row can resolve, each one taking a bite out of the
 * frame, and between them they were holding the TITLE down to 34px and the
 * slide's actual headline figure to 24px in a corner. The chrome sells the
 * TRANSCRIPT, where the fiction is that you are watching a terminal; a
 * full-screen chart is not pretending to be a terminal, it is the argument.
 *
 * What is left is what carries: the question, the number that answers it, and
 * the plot. Everything moved up roughly two type sizes into the space the
 * furniture was using.
 */
function drawChartVisual(ctx, visual, draw = 1) {
  chromeText(ctx, visual.title, TERMINAL.padX, 150, {
    size: 62,
    weight: 700,
    color: PHOSPHOR.hot,
  })
  // A question can be put to the room before it is answered: a `visual` step
  // with `reveal: 'title'` stops here, and the `plot` step that follows grows
  // the chart in over its own progress (Scott, 2026-09-10, for q-stopping).
  if (visual.reveal === 'title') return []
  const grow = Math.min(draw, visual.progress === undefined ? 1 : easeInOut(visual.progress))

  // The headline share, on its own line and at reading size. This is the
  // sentence Scott says out loud; it was 24px, right-aligned, above the plot.
  // When the plot is growing on Enter it lands once the bars have — the number
  // is the answer, and the bars are what earn it.
  if (visual.progress === undefined || visual.progress >= 1) {
    chromeText(ctx, visual.detail, TERMINAL.padX, 236, {
      size: 40,
      weight: 500,
      color: PHOSPHOR.phosphor,
    })
  }

  const panel = { x: TERMINAL.padX, y: 320, w: TERMINAL.width - TERMINAL.padX * 2, h: 950 }
  drawCornerMarks(ctx, panel)
  // The 230 of bottom margin is category-label space, not padding: a column's
  // label sits BELOW the plot rect, and at 42px it ran off the bottom of the
  // glass the moment the type came up to a readable size.
  return drawTerminalChart(
    ctx,
    { x: panel.x + 96, y: panel.y + 40, w: panel.w - 192, h: panel.h - 230 },
    visual.chart,
    grow,
    hoveredChartRow()
  )
}

function drawVisual(ctx, visual, draw = 1, time = 0) {
  if (visual.kind === 'title') drawTitle(ctx, visual, draw)
  else if (visual.kind === 'asset') drawAssetVisual(ctx, visual)
  else if (visual.kind === 'chart') return drawChartVisual(ctx, visual, draw)
  else if (visual.kind === 'tweet') drawTweetVisual(ctx, visual, draw)
  else if (visual.kind === 'statement') drawStatementVisual(ctx, visual, draw)
  else if (visual.kind === 'stat') drawStatVisual(ctx, visual, draw)
  else if (visual.kind === 'slot') drawSlotVisual(ctx, visual, draw)
  else if (visual.kind === 'grill') drawGrillVisual(ctx, visual, draw, time)
  else if (visual.kind === 'walk') drawWalkVisual(ctx, visual, draw, time)
  else if (visual.kind === 'diagram') drawDiagramVisual(ctx, visual, draw)
  else if (visual.kind === 'prompt') return drawPromptVisual(ctx, visual)
  else if (visual.kind === 'warning') drawWarningVisual(ctx, visual, draw)
  else if (visual.kind === 'off') drawPowerOff(ctx, visual, time)
  else if (visual.kind === 'quote') drawQuoteVisual(ctx, visual, draw, time)
  else throw new Error(`Unknown terminal visual kind: ${visual.kind}`)
  return []
}

/**
 * The raster sweep — the transition language of the whole deck. The beam
 * travels DOWN the frame both ways, and nothing about it is a hard line:
 *
 *   'in'  — the incoming frame already exists as a faint GHOST below the
 *           beam; the beam is what energizes it. A soft-shouldered veil keeps
 *           the boundary from strobing, and an additive ignition band makes
 *           content flare to hot as the beam crosses, then settle.
 *   'out' — the old frame is not erased, it DECAYS: a luminous trail hangs
 *           just behind the beam and fades with distance, with a global
 *           settle so the last rows die before the draw scan begins.
 *
 * Two consecutive field scans of a machine repainting its buffer — and every
 * value on it is a rung of the one phosphor ladder.
 */
const WIPE_SPAN = 180

function applyRasterWipe(ctx, reveal) {
  const progress = easeInOut(reveal.progress)
  const travel = TERMINAL.height + WIPE_SPAN * 2
  const y = progress * travel - WIPE_SPAN
  const width = TERMINAL.width
  const height = TERMINAL.height
  // PHOSPHOR.glass as an alpha-composable overlay.
  const glass = (alpha) => `rgba(11, 10, 6, ${alpha})`

  ctx.save()
  ctx.shadowBlur = 0
  ctx.globalCompositeOperation = 'source-over'

  if (reveal.mode === 'in') {
    // Ghost preview: the frame is present but barely driven until written.
    const shoulder = 96
    const top = Math.max(0, y - shoulder)
    const bottom = Math.min(height, y + shoulder)
    if (bottom > top) {
      const veil = ctx.createLinearGradient(0, y - shoulder, 0, y + shoulder)
      veil.addColorStop(0, glass(0))
      veil.addColorStop(1, glass(0.93))
      ctx.fillStyle = veil
      ctx.fillRect(0, top, width, bottom - top)
    }
    if (bottom < height) {
      ctx.fillStyle = glass(0.93)
      ctx.fillRect(0, bottom, width, height - bottom)
    }
  } else {
    // Decay trail: strongest far behind the beam, luminous right behind it,
    // and globally settling to dark through the last third of the phase.
    const trail = 560
    const settled = easeInOut((reveal.progress - 0.6) / 0.4)
    const edge = Math.min(height, Math.max(0, y))
    if (edge > 0) {
      const decay = ctx.createLinearGradient(0, y - trail, 0, y)
      decay.addColorStop(0, glass(1))
      decay.addColorStop(1, glass(0.3 + 0.7 * settled))
      ctx.fillStyle = decay
      ctx.fillRect(0, 0, width, edge)
      if (y - trail > 0) {
        ctx.fillStyle = glass(1)
        ctx.fillRect(0, 0, width, y - trail)
      }
    }
  }

  if (y > -WIPE_SPAN && y < height + WIPE_SPAN) {
    // Ignition band: additive, so content near the beam genuinely overdrives
    // toward hot rather than being painted over, and bare glass only picks up
    // a faint field. Peak sits just above the line — freshly written rows
    // glow, then settle.
    ctx.globalCompositeOperation = 'lighter'
    const band = ctx.createLinearGradient(0, y - 120, 0, y + 64)
    band.addColorStop(0, 'rgba(255, 213, 74, 0)')
    band.addColorStop(0.62, 'rgba(255, 213, 74, 0.16)')
    band.addColorStop(1, 'rgba(255, 213, 74, 0)')
    ctx.fillStyle = band
    ctx.fillRect(0, y - 120, width, 184)

    const core = ctx.createLinearGradient(0, y - 5, 0, y + 5)
    core.addColorStop(0, 'rgba(255, 242, 205, 0)')
    core.addColorStop(0.5, 'rgba(255, 242, 205, 0.8)')
    core.addColorStop(1, 'rgba(255, 242, 205, 0)')
    ctx.fillStyle = core
    ctx.fillRect(0, y - 5, width, 10)
    ctx.globalCompositeOperation = 'source-over'
  }
  ctx.restore()
}

/**
 * @param ctx    2D context of the screen canvas
 * @param frame  { lines, caret, visual } from buildFrame()
 * @param time   seconds — drives the caret blink only
 * @param options.drawCaret  false when WebGL composites the caret in-shader
 * @param options.reveal     { mode: 'out'|'in', progress } during a content
 *                           sweep (see playback.js); null when steady
 */
export function paintTerminal(ctx, frame, time, { drawCaret = true, reveal = null } = {}) {
  resetScreen(ctx)

  // Elements grow only while drawing IN; an undraw erases the finished frame.
  // A `draw` step supplies the same input from its own progress.
  const draw = Math.min(reveal?.mode === 'in' ? reveal.progress : 1, frame.visual?.draw ?? 1)

  if (frame.visual) {
    const drawn = drawVisual(ctx, frame.visual, draw, time)
    // Chart rows are recorded even mid-sweep: they are already in their final
    // places, so the pointer keeps working while the beam draws them in.
    recordChartRegions(Array.isArray(drawn) ? drawn : [])
    // A visual that types (the survey prompt) is the only thing that knows
    // where its text ends; the caret it hands back blinks like the transcript's.
    if (drawn?.caret) frame.caret = drawn.caret
  } else {
    // A transcript has no chart on it, so nothing is hoverable — clear the
    // regions rather than leaving the last chart's rows live under the pointer.
    recordChartRegions([])
    drawHarnessChrome(ctx)
    // Chrome ends on a right-aligned status label. Transcript coordinates are
    // left-edge anchors, so restore their text state explicitly.
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'

    for (let row = 0; row < frame.lines.length; row++) {
      const line = frame.lines[row]
      if (!line.text) continue
      const color = ROLE[line.role] ?? PHOSPHOR.phosphor
      const y = TERMINAL.padY + row * LINE_H + BASELINE

      ctx.font = font(line.weight ?? 400)
      ctx.fillStyle = color
      ctx.shadowColor = color
      ctx.shadowBlur = GLOW_RADIUS * (GLOW[line.role] ?? 0.5)
      ctx.fillText(line.text, TERMINAL.padX, y)
    }

    ctx.shadowBlur = 0
  }

  if (reveal) applyRasterWipe(ctx, reveal)

  // Hard on/off block cursor—the phosphor is either being driven or it is not.
  // Suppressed during a sweep: the machine is repainting, nothing owns input.
  if (drawCaret && !reveal && frame.caret && Math.floor(time * 1.9) % 2 === 0) {
    const rect = caretRect(ctx, frame.caret)
    ctx.fillStyle = PHOSPHOR.hot
    ctx.shadowColor = PHOSPHOR.hot
    ctx.shadowBlur = GLOW_RADIUS
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
    ctx.shadowBlur = 0
  }
}

/**
 * Where the block cursor sits, in canvas pixels.
 *
 * A transcript caret is `{ row, prefix }` — the TEXT the cursor follows,
 * measured in the grid's own face so the block lands against the last glyph
 * whatever the advance width turns out to be. A typing visual hands over a
 * `rect` directly, because only its painter knows where its text ends. The
 * tube composites the same rect in the shader, so both renderers read it here.
 */
export function caretRect(ctx, caret) {
  if (caret.rect) return caret.rect
  ctx.font = font(500)
  return {
    x: TERMINAL.padX + ctx.measureText(caret.prefix).width,
    y: TERMINAL.padY + caret.row * LINE_H + BASELINE,
    width: CHAR_W,
    height: FONT_SIZE,
  }
}
