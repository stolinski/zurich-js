import { PHOSPHOR, TERMINAL } from './theme.js'

const FONT = TERMINAL.family

function chartFont(size, weight = 500) {
  return `${weight} ${size}px ${FONT}`
}

function formatDuration(minutes, compact = false) {
  const hours = Math.floor(minutes / 60)
  const remainder = Math.round(minutes % 60)
  if (compact || remainder === 0) return `${hours}h${remainder ? ` ${remainder}m` : ''}`
  return `${hours}h ${String(remainder).padStart(2, '0')}m`
}

function formatValue(chart, value, compact = false) {
  switch (chart.format) {
    case 'duration':
      return formatDuration(value, compact)
    case 'percent':
      return `${Math.round(value)}%`
    case 'signedPercent':
      return `${value > 0 ? '+' : ''}${Math.round(value)}%`
    // A mean on an ordinal scale. Two places on the value, none forced on the
    // axis, so gridlines read "1.25" rather than "1.25000000000000002".
    case 'decimal':
      return compact ? String(Math.round(value * 100) / 100) : value.toFixed(2)
    default:
      return String(value)
  }
}

/**
 * Round a raw data maximum up to an axis ceiling whose quarters are readable
 * numbers — the grid draws four divisions, so a raw max leaves labels like
 * "235" and gives the tallest column no room for its own value.
 */
function niceCeiling(raw) {
  if (!(raw > 0)) return 1
  const quarter = raw / 4
  const magnitude = 10 ** Math.floor(Math.log10(quarter))
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 10]
  const normalized = quarter / magnitude
  const step = steps.find((candidate) => candidate >= normalized) ?? 10
  return step * magnitude * 4
}

function maxValue(chart) {
  if (chart.max !== undefined) return chart.max
  const values = chart.values.map((item) =>
    typeof item === 'number' ? item : item.value
  )
  const raw = Math.max(1, ...values)
  // Columns are labelled above their own top edge, so they need headroom that
  // a horizontal bar or a trace does not.
  return chart.kind === 'bar' ? niceCeiling(raw) : raw
}

/**
 * The value range the plot area spans. Bars, distributions and sparklines all
 * start at zero, so their domain is 0→max and the axis labels are unchanged.
 * A `series` declares its own, because a trajectory chart has to show negative
 * space and the zero line is the thing being measured against.
 */
function domainOf(chart) {
  if (chart.domain) return chart.domain
  return { min: 0, max: maxValue(chart) }
}

const easeInOut = (t) => {
  const clamped = Math.min(1, Math.max(0, t))
  return clamped * clamped * (3 - 2 * clamped)
}

/**
 * Draw-in choreography: the grid sweeps first, then data elements land one
 * after another. Element `index` of `count` gets its own eased 0→1 window
 * inside the overall draw progress; at draw = 1 every element is complete, so
 * the settled frame is identical whether it animated in or deep-linked.
 */
function elementProgress(draw, index, count) {
  if (draw >= 1) return 1
  const start = 0.22 + (index / Math.max(1, count)) * 0.4
  return easeInOut((draw - start) / 0.38)
}

const gridProgress = (draw) => (draw >= 1 ? 1 : easeInOut(draw * 2.4))

function line(ctx, x1, y1, x2, y2, color = PHOSPHOR.ghost, width = 2) {
  ctx.beginPath()
  ctx.moveTo(Math.round(x1), Math.round(y1))
  ctx.lineTo(Math.round(x2), Math.round(y2))
  ctx.lineWidth = width
  ctx.strokeStyle = color
  ctx.stroke()
}

function label(ctx, text, x, y, options = {}) {
  ctx.font = chartFont(options.size ?? 32, options.weight ?? 500)
  ctx.fillStyle = options.color ?? PHOSPHOR.dim
  ctx.textAlign = options.align ?? 'left'
  ctx.textBaseline = options.baseline ?? 'top'
  ctx.fillText(text, x, y)
}

/**
 * The interior of a data mark.
 *
 * PHOSPHOR.ghost — the rung reserved for rules, borders and chrome — used to
 * fill every bar, which left the settled chart as OUTLINES: on the tube, whose
 * mask and vignette cost roughly 44% of the frame's mean with no post to
 * compensate on a glass-filling slide, a ghost interior is indistinguishable
 * from the glass behind it. The draw sweep's additive ignition then flatters
 * exactly this area, so a chart read solid while it was being written and hollow
 * a second later — brighter, then dimmer, which is precisely backwards.
 *
 * Alpha over glass rather than a sixth rung: the ladder stays five values, this
 * is PHOSPHOR.dim at partial drive, and the hovered mark still has somewhere to
 * go (solid `dim`) without either of them reaching for a new colour.
 */
const MARK_FILL = 'rgba(173, 140, 44, 0.42)'

function drawGrid(ctx, bounds, chart, horizontal = false, draw = 1) {
  const divisions = 4
  const sweep = gridProgress(draw)
  if (sweep <= 0) return
  const { min, max } = domainOf(chart)
  for (let i = 0; i <= divisions; i++) {
    const t = i / divisions
    const value = min + (max - min) * t
    if (horizontal) {
      const x = bounds.x + bounds.w * t
      line(ctx, x, bounds.y, x, bounds.y + bounds.h * sweep)
      if (sweep >= 1) {
        label(ctx, formatValue(chart, value, true), x, bounds.y + bounds.h + 18, {
          size: 32,
          align: i === 0 ? 'left' : i === divisions ? 'right' : 'center',
          color: PHOSPHOR.dim,
        })
      }
    } else {
      const y = bounds.y + bounds.h * (1 - t)
      line(ctx, bounds.x, y, bounds.x + bounds.w * sweep, y)
      if (sweep >= 1) {
        label(ctx, formatValue(chart, value, true), bounds.x - 22, y, {
          size: 32,
          align: 'right',
          baseline: 'middle',
          color: PHOSPHOR.dim,
        })
      }
    }
  }
}

function drawBars(ctx, bounds, chart, draw = 1, hover = null, regions = []) {
  const count = Math.max(1, chart.values.length)
  const gap = Math.min(42, bounds.w / count * 0.18)
  const barWidth = Math.max(18, (bounds.w - gap * (count - 1)) / count)
  const maximum = maxValue(chart)

  drawGrid(ctx, bounds, chart, false, draw)
  chart.values.forEach((item, index) => {
    const x = bounds.x + index * (barWidth + gap)
    // The hit column is the full plot height and includes the gap to its right,
    // so there is no dead lane between adjacent bars for the pointer to fall
    // into. Recorded before the growth bail-out: a row's target stays in the
    // same place whether or not its bar has finished drawing.
    regions.push({
      index,
      x,
      y: bounds.y,
      w: barWidth + gap,
      h: bounds.h + 68,
    })

    const grown = elementProgress(draw, index, count)
    if (grown <= 0) return
    const value = typeof item === 'number' ? item : item.value
    const itemLabel = typeof item === 'number' ? String(index + 1) : item.label
    const height = bounds.h * (value / maximum) * grown
    const y = bounds.y + bounds.h - height
    const lit = index === hover

    // One hue, and the hierarchy is intensity — every hovered element moves up
    // exactly one rung of the phosphor ladder rather than changing colour.
    ctx.fillStyle = lit ? PHOSPHOR.dim : MARK_FILL
    ctx.fillRect(x, y, barWidth, height)
    ctx.strokeStyle = lit ? PHOSPHOR.hot : PHOSPHOR.phosphor
    ctx.lineWidth = lit ? 5 : 4
    ctx.strokeRect(x, y, barWidth, height)
    line(ctx, x, y, x + barWidth, y, PHOSPHOR.hot, lit ? 7 : 5)

    if (grown < 1) return
    label(ctx, formatValue(chart, value), x + barWidth / 2, y - 22, {
      size: 46,
      align: 'center',
      baseline: 'bottom',
      color: lit ? PHOSPHOR.hot : PHOSPHOR.phosphor,
    })
    label(ctx, itemLabel, x + barWidth / 2, bounds.y + bounds.h + 66, {
      size: 42,
      align: 'center',
      color: lit ? PHOSPHOR.phosphor : PHOSPHOR.dim,
    })
  })
}

function drawDistribution(ctx, bounds, chart, draw = 1, hover = null, regions = []) {
  // The label column sizes itself to its longest entry, shrinking the type
  // before it will overflow. A cohort row carries its own n — "overran often or
  // daily (n=1,867)" — and a fixed column silently ran that under the bar,
  // which loses the base a cohort figure is meaningless without.
  const maxLabelWidth = bounds.w * 0.42
  let labelSize = 44
  const widest = () => {
    ctx.font = chartFont(labelSize)
    return Math.max(...chart.values.map((item) => ctx.measureText(item.label).width))
  }
  while (labelSize > 30 && widest() > maxLabelWidth) labelSize -= 1
  const labelWidth = Math.min(maxLabelWidth, widest()) + 28
  const valueWidth = 260
  const plot = {
    x: bounds.x + labelWidth,
    y: bounds.y,
    w: bounds.w - labelWidth - valueWidth,
    h: bounds.h,
  }
  const maximum = maxValue(chart)
  const rowHeight = plot.h / Math.max(1, chart.values.length)

  drawGrid(ctx, plot, chart, true, draw)
  chart.values.forEach((item, index) => {
    const centerY = plot.y + rowHeight * (index + 0.5)
    // The whole band, label column through value column: the row is what the
    // presenter is pointing at, not the bar. Recorded before the growth
    // bail-out so a row's target does not move while the sweep draws it.
    regions.push({
      index,
      x: bounds.x,
      y: centerY - rowHeight / 2,
      w: bounds.w,
      h: rowHeight,
    })

    const grown = elementProgress(draw, index, chart.values.length)
    if (grown <= 0) return
    const barHeight = Math.min(92, rowHeight * 0.42)
    const width = plot.w * (item.value / maximum) * grown
    const lit = index === hover

    // A band behind the row, so the row reads as picked out even where its bar
    // is short. PHOSPHOR.dim at low alpha rather than an opaque rung: the grid
    // has to stay legible THROUGH it — a hovered row that hides its own
    // gridlines is answering a question about where the value sits by deleting
    // the scale. Sized to the bar, not to the row: `rowHeight` on a two-value
    // chart is half the plot, and a block that size reads as a mode change
    // rather than as pointing at something.
    if (lit) {
      ctx.save()
      ctx.shadowBlur = 0
      const bandHeight = Math.min(rowHeight, barHeight + 76)
      ctx.fillStyle = 'rgba(173, 140, 44, 0.17)'
      ctx.fillRect(bounds.x - 18, centerY - bandHeight / 2, bounds.w + 36, bandHeight)
      ctx.restore()
    }

    label(ctx, item.label, bounds.x, centerY, {
      size: labelSize,
      baseline: 'middle',
      color: lit ? PHOSPHOR.phosphor : PHOSPHOR.dim,
    })
    ctx.fillStyle = lit ? PHOSPHOR.dim : MARK_FILL
    ctx.fillRect(plot.x, centerY - barHeight / 2, width, barHeight)
    ctx.strokeStyle = lit ? PHOSPHOR.hot : PHOSPHOR.phosphor
    ctx.lineWidth = lit ? 5 : 4
    ctx.strokeRect(plot.x, centerY - barHeight / 2, width, barHeight)
    line(
      ctx,
      plot.x + width,
      centerY - barHeight / 2,
      plot.x + width,
      centerY + barHeight / 2,
      PHOSPHOR.hot,
      lit ? 8 : 6
    )
    if (grown < 1) return
    label(ctx, formatValue(chart, item.value), bounds.x + bounds.w, centerY, {
      size: lit ? 52 : 48,
      weight: 700,
      align: 'right',
      baseline: 'middle',
      color: PHOSPHOR.hot,
    })
  })
}

function drawSparkline(ctx, bounds, chart, draw = 1) {
  const values = chart.values.map((item) =>
    typeof item === 'number' ? item : item.value
  )
  const maximum = maxValue(chart)
  const divisor = Math.max(1, values.length - 1)
  // The trace PLOTS itself left to right behind the grid sweep, like a pen
  // recorder: whole segments land one at a time.
  const plotted =
    draw >= 1
      ? values.length
      : Math.floor(easeInOut((draw - 0.2) / 0.7) * values.length)

  drawGrid(ctx, bounds, chart, false, draw)
  if (plotted < 1) return
  ctx.beginPath()
  values.slice(0, plotted).forEach((value, index) => {
    const x = bounds.x + (bounds.w * index) / divisor
    const y = bounds.y + bounds.h * (1 - value / maximum)
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.strokeStyle = PHOSPHOR.phosphor
  ctx.lineWidth = 6
  ctx.shadowColor = PHOSPHOR.phosphor
  ctx.shadowBlur = 10
  ctx.stroke()
  ctx.shadowBlur = 0

  values.slice(0, plotted).forEach((value, index) => {
    const x = bounds.x + (bounds.w * index) / divisor
    const y = bounds.y + bounds.h * (1 - value / maximum)
    ctx.fillStyle = PHOSPHOR.hot
    ctx.fillRect(x - 7, y - 7, 14, 14)
  })
}

/**
 * Two or three traces sharing an x-axis, over a domain that may go negative.
 *
 * ONE HUE, so the traces are separated by DRIVE and LINE STYLE, never by colour
 * (PLAN.md §2 rule 3). A series may also declare `dashed` when its job is to
 * visibly refuse to behave like its neighbours — the skills line against
 * enjoyment and sleep is the case this exists for, and reading it as "the flat
 * one" has to survive the back of the room.
 */
const SERIES_LABEL_SIZE = 38

function drawSeries(ctx, bounds, chart, draw = 1) {
  const { min, max } = domainOf(chart)
  const span = max - min || 1
  const seriesCount = chart.values.length
  const points = Math.max(...chart.values.map((s) => s.values.length))
  const divisor = Math.max(1, points - 1)

  // Traces are named in a right-hand gutter rather than at their own end point.
  // Labelling in place put type on top of a neighbouring trace exactly where
  // the lines converge — which is the part of the chart being argued about.
  ctx.font = chartFont(SERIES_LABEL_SIZE)
  const gutter =
    24 + Math.max(...chart.values.map((s) => ctx.measureText(s.label).width))
  const plot = { x: bounds.x, y: bounds.y, w: bounds.w - gutter, h: bounds.h }

  const toX = (index) => plot.x + (plot.w * index) / divisor
  const toY = (value) => plot.y + plot.h * (1 - (value - min) / span)

  drawGrid(ctx, plot, chart, false, draw)

  // Zero is the reference the whole chart is measured against — each band's own
  // peak — so it is drawn as a datum, brighter than the grid behind it.
  if (min < 0 && max > 0 && gridProgress(draw) >= 1) {
    line(ctx, plot.x, toY(0), plot.x + plot.w, toY(0), PHOSPHOR.dim, 3)
  }

  if (chart.categories && gridProgress(draw) >= 1) {
    const total = chart.categories.length
    // Only thin a dense axis; a five-point axis wants every tick named.
    const stride = total > 8 ? 3 : 1
    chart.categories.forEach((text, index) => {
      if (index % stride !== 0 && index !== total - 1) return
      label(ctx, text, toX(index), plot.y + plot.h + 62, {
        size: 34,
        align: index === 0 ? 'left' : index === total - 1 ? 'right' : 'center',
        color: PHOSPHOR.ghost,
      })
    })
  }

  chart.values.forEach((series, seriesIndex) => {
    const grown = elementProgress(draw, seriesIndex, seriesCount)
    if (grown <= 0) return
    const plotted =
      grown >= 1 ? series.values.length : Math.ceil(grown * series.values.length)
    if (plotted < 2) return

    const stroke = PHOSPHOR[series.role] ?? PHOSPHOR.phosphor
    ctx.save()
    if (series.dashed) ctx.setLineDash([18, 14])
    ctx.beginPath()
    series.values.slice(0, plotted).forEach((value, index) => {
      const x = toX(index)
      const y = toY(value)
      if (index === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = stroke
    ctx.lineWidth = series.dashed ? 5 : 6
    ctx.shadowColor = stroke
    ctx.shadowBlur = 10
    ctx.stroke()
    ctx.restore()
    ctx.shadowBlur = 0

    if (grown < 1) return
    // Each trace names itself where it ends, in the gutter. A legend would cost
    // a second lookup the room does not have time for.
    const lastIndex = series.values.length - 1
    label(ctx, series.label, plot.x + plot.w + 16, toY(series.values[lastIndex]), {
      size: SERIES_LABEL_SIZE,
      baseline: 'middle',
      color: stroke,
    })
  })
}

/**
 * Draw one closed-form terminal chart. Supported forms are intentionally small:
 * bars, distributions, sparklines, and multi-trace series. They use thick
 * vector strokes so the CRT shader and texture mipmaps—not a bitmap font—supply
 * the period character.
 */
export function drawTerminalChart(ctx, bounds, chart, draw = 1, hover = null) {
  if (!chart?.kind || !Array.isArray(chart.values) || chart.values.length === 0) {
    throw new Error('A terminal chart needs a kind and at least one value')
  }

  // Hit regions for the pointer, filled in by whichever form draws. Sparklines
  // and series get none on purpose: a trace has no discrete element under the
  // cursor, and inventing one would highlight a period the reader did not pick.
  const regions = []

  ctx.save()
  ctx.beginPath()
  // The clip exists to contain the draw sweep, but a chart's own furniture
  // lives OUTSIDE its plot rect: y-axis labels sit left of x, and a column
  // labels itself above y. Clipping tight to the plot silently ate both. The
  // margins stay inside the panel the caller reserved.
  ctx.rect(bounds.x - 108, bounds.y - 86, bounds.w + 216, bounds.h + 186)
  ctx.clip()
  ctx.shadowColor = PHOSPHOR.phosphor
  ctx.shadowBlur = 4

  if (chart.kind === 'bar') drawBars(ctx, bounds, chart, draw, hover, regions)
  else if (chart.kind === 'distribution')
    drawDistribution(ctx, bounds, chart, draw, hover, regions)
  else if (chart.kind === 'sparkline') drawSparkline(ctx, bounds, chart, draw)
  else if (chart.kind === 'series') drawSeries(ctx, bounds, chart, draw)
  else throw new Error(`Unknown terminal chart kind: ${chart.kind}`)

  ctx.shadowBlur = 0
  ctx.restore()
  return regions
}
