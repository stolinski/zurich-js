/**
 * Rec.709 luma percentiles for a settled capture, against the QUALITY.md §Q5b
 * anchors. Exposure is a GATE in this deck, not taste: the 2026-08 audit found
 * every stage failing photographically while all timing and precision gates
 * passed, because none of them measured brightness.
 *
 * Usage: node scripts/quality/luma-stats.mjs <slide-id> <file.png> [...]
 */
import { readPng } from './png.mjs'

/** QUALITY.md §Q5b, transcribed. `null` means the row states no bound. */
const ANCHORS = {
  reveal: { p50: [8, 18], max: 250 },
  'cubicle-wide': { p50: [40, 62], maxBelow10Pct: 1 },
  // The glass-filling DATA run had no anchor at all, which is exactly how it
  // came to be shipped with the post chain switched off: twenty-six slides
  // carrying the whole argument, and nothing measuring whether they were
  // legible. Both halves matter and they pull opposite ways — p50 keeps the
  // glass between the marks black, p99.9 keeps the marks themselves at reading
  // brightness. A frame can fail either by washing out or by going dim.
  //
  // p99.9 and not p99: p99 tracks bright AREA, so it moves with how many marks
  // a chart happens to have rather than with how bright they are. A two-row
  // cohort split measured 168 against a five-bar scale's 205 while both were
  // equally legible. At p99.9 the same two frames are 224 and 227.
  'q-stopping': { p50: [4, 26], p999: 200 },
  'stopping-sleep': { p50: [4, 26], p999: 200 },
  'three-zeros': { p50: [4, 26], p999: 200 },
  'agent-wall-near': { p95: 100, max: 250 },
  'agent-wall': { p95: 95 },
  'inside-glass': { p999: 130 },
}

function percentile(sortedCounts, total, fraction) {
  const target = total * fraction
  let seen = 0
  for (let value = 0; value < 256; value += 1) {
    seen += sortedCounts[value]
    if (seen >= target) return value
  }
  return 255
}

async function statsFor(path) {
  const png = await readPng(path)
  const { width, height, rgba: data } = png
  const histogram = new Uint32Array(256)
  let below10 = 0
  const total = width * height
  for (let i = 0; i < total; i += 1) {
    const o = i * 4
    // Encoded Rec.709 luma, matching compare-images.mjs.
    const luma = Math.round(
      0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]
    )
    histogram[luma] += 1
    if (luma < 10) below10 += 1
  }
  return {
    width,
    height,
    p50: percentile(histogram, total, 0.5),
    p95: percentile(histogram, total, 0.95),
    p99: percentile(histogram, total, 0.99),
    p999: percentile(histogram, total, 0.999),
    max: percentile(histogram, total, 0.999999),
    below10Pct: (below10 / total) * 100,
  }
}

function verdict(slide, s) {
  const anchor = ANCHORS[slide]
  if (!anchor) return ['(no §Q5b anchor for this slide)']
  const lines = []
  if (anchor.p50) {
    const [lo, hi] = anchor.p50
    lines.push(
      `${s.p50 >= lo && s.p50 <= hi ? 'PASS' : 'FAIL'}  p50 ${s.p50} (want ${lo}–${hi})`
    )
  }
  if (anchor.p95 !== undefined) {
    lines.push(`${s.p95 >= anchor.p95 ? 'PASS' : 'FAIL'}  p95 ${s.p95} (want >= ${anchor.p95})`)
  }
  if (anchor.p999 !== undefined) {
    lines.push(
      `${s.p999 >= anchor.p999 ? 'PASS' : 'FAIL'}  p99.9 ${s.p999} (want >= ${anchor.p999})`
    )
  }
  if (anchor.max !== undefined) {
    lines.push(`${s.max >= anchor.max ? 'PASS' : 'FAIL'}  max ${s.max} (want >= ${anchor.max})`)
  }
  if (anchor.maxBelow10Pct !== undefined) {
    lines.push(
      `${s.below10Pct <= anchor.maxBelow10Pct ? 'PASS' : 'FAIL'}  ` +
        `below-10 ${s.below10Pct.toFixed(2)}% (want <= ${anchor.maxBelow10Pct}%)`
    )
  }
  return lines
}

const args = process.argv.slice(2)
if (args.length % 2 !== 0 || args.length === 0) {
  console.error('usage: luma-stats.mjs <slide-id> <file.png> [<slide-id> <file.png> ...]')
  process.exit(2)
}

for (let i = 0; i < args.length; i += 2) {
  const slide = args[i]
  const path = args[i + 1]
  const s = await statsFor(path)
  console.log(`\n${slide}  (${s.width}x${s.height})`)
  console.log(
    `  p50 ${s.p50}  p95 ${s.p95}  p99 ${s.p99}  p99.9 ${s.p999}  max ${s.max}  below10 ${s.below10Pct.toFixed(2)}%`
  )
  for (const line of verdict(slide, s)) console.log(`  ${line}`)
}
