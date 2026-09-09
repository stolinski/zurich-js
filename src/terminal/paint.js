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
function drawStatementVisual(ctx, visual, draw = 1) {
  const lines = visual.lines
  // These are the beats with nothing else on the glass. If a line cannot be
  // read from the back of the room there is no second thing for the room to
  // look at instead.
  const size = lines.length > 3 ? 74 : lines.length > 2 ? 86 : 100
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

function drawAssetVisual(ctx, visual) {
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

  // A headline needs the bottom third of the frame, so the preview gives it up.
  const preview = visual.headline
    ? { x: 176, y: 290, w: TERMINAL.width - 352, h: 600 }
    : { x: 176, y: 310, w: TERMINAL.width - 352, h: 740 }
  ctx.strokeStyle = PHOSPHOR.ghost
  ctx.lineWidth = 2
  ctx.strokeRect(preview.x, preview.y, preview.w, preview.h)
  drawCornerMarks(ctx, preview)

  const image = getTerminalAsset(visual.asset)
  if (image) {
    const square = visual.asset === 'qr'
    drawImageContain(ctx, image, {
      x: preview.x + 110,
      y: preview.y + 74,
      w: preview.w - 220,
      h: square ? preview.h - 148 : preview.h - 220,
    })
  } else {
    chromeText(ctx, 'DECODING LOCAL ASSET…', TERMINAL.width / 2, 640, {
      size: 34,
      align: 'center',
      color: PHOSPHOR.dim,
    })
  }

  if (visual.headline) {
    // The number, then what it counts, then where to scan. The technical
    // caption is dropped on this slide — it is the machine describing its own
    // file format under the one figure that decides whether anyone reaches for
    // a phone, and it was literally printing through the digits.
    chromeText(ctx, visual.headline, TERMINAL.width / 2, 930, {
      size: 128,
      weight: 700,
      align: 'center',
      color: PHOSPHOR.hot,
    })
    chromeText(ctx, visual.caption, TERMINAL.width / 2, 1086, {
      size: 42,
      weight: 500,
      align: 'center',
      color: PHOSPHOR.phosphor,
    })
    chromeText(ctx, visual.label.toUpperCase(), TERMINAL.width / 2, 1152, {
      size: 34,
      weight: 700,
      align: 'center',
      color: PHOSPHOR.dim,
    })
    return
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
 * The survey, as the form: every question worded as respondents saw it, and
 * nothing else — no scales, no anchors, no counts. The room has just been
 * handed the code, so this is the instrument read before the readings.
 *
 * A hanging number gutter so seven items read as a list from the back of the
 * room rather than a paragraph; the numbers sit one rung down so the words
 * are what glows. Types on over the draw sweep like a statement, and the
 * settled frame is identical to a deep link.
 */
const QUESTIONS_TYPE = Object.freeze({ size: 48, lineHeight: 1.32, gap: 0.6, gutter: 92, top: 300 })

function drawQuestionsVisual(ctx, visual, draw = 1) {
  chromeText(ctx, visual.title, TERMINAL.padX, 150, {
    size: 62,
    weight: 700,
    color: PHOSPHOR.hot,
  })

  const { size } = QUESTIONS_TYPE
  const lineHeight = size * QUESTIONS_TYPE.lineHeight
  const gap = size * QUESTIONS_TYPE.gap
  const left = TERMINAL.padX + QUESTIONS_TYPE.gutter
  ctx.font = screenFont(size, 500)
  const blocks = visual.items.map((text) =>
    wrapToWidth(ctx, text, TERMINAL.width - TERMINAL.padX - left)
  )
  const total = blocks.flat().reduce((sum, line) => sum + line.length, 0)
  let budget = Math.ceil(total * (draw >= 1 ? 1 : easeInOut((draw - 0.1) / 0.8)))

  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  let y = QUESTIONS_TYPE.top
  blocks.forEach((block, index) => {
    if (budget > 0) {
      chromeText(ctx, String(index + 1), TERMINAL.padX, y, {
        size,
        weight: 700,
        color: PHOSPHOR.dim,
      })
    }
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
    y += gap
  })
  ctx.shadowBlur = 0
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
  // The headline share, on its own line and at reading size. This is the
  // sentence Scott says out loud; it was 24px, right-aligned, above the plot.
  chromeText(ctx, visual.detail, TERMINAL.padX, 236, {
    size: 40,
    weight: 500,
    color: PHOSPHOR.phosphor,
  })

  const panel = { x: TERMINAL.padX, y: 320, w: TERMINAL.width - TERMINAL.padX * 2, h: 950 }
  drawCornerMarks(ctx, panel)
  // The 230 of bottom margin is category-label space, not padding: a column's
  // label sits BELOW the plot rect, and at 42px it ran off the bottom of the
  // glass the moment the type came up to a readable size.
  return drawTerminalChart(
    ctx,
    { x: panel.x + 96, y: panel.y + 40, w: panel.w - 192, h: panel.h - 230 },
    visual.chart,
    draw,
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
  else if (visual.kind === 'questions') drawQuestionsVisual(ctx, visual, draw)
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
  const draw = reveal?.mode === 'in' ? reveal.progress : 1

  if (frame.visual) {
    // Recorded even mid-sweep: the rows are already in their final places, so
    // the pointer keeps working while the beam draws them in.
    recordChartRegions(drawVisual(ctx, frame.visual, draw, time))
    if (reveal) applyRasterWipe(ctx, reveal)
    return
  }

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

  if (reveal) applyRasterWipe(ctx, reveal)

  // Hard on/off block cursor—the phosphor is either being driven or it is not.
  // Suppressed during a sweep: the machine is repainting, nothing owns input.
  if (drawCaret && !reveal && frame.caret && Math.floor(time * 1.9) % 2 === 0) {
    ctx.font = font(500)
    const x = TERMINAL.padX + ctx.measureText(frame.caret.prefix).width
    const y = TERMINAL.padY + frame.caret.row * LINE_H + BASELINE
    ctx.fillStyle = PHOSPHOR.hot
    ctx.shadowColor = PHOSPHOR.hot
    ctx.shadowBlur = GLOW_RADIUS
    ctx.fillRect(x, y, CHAR_W, FONT_SIZE)
    ctx.shadowBlur = 0
  }
}
