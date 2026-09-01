#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { CdpClient, openPageTarget, resolveCdpEndpoint, sleep, waitForPage } from './cdp.mjs'
import { readPng } from './png.mjs'
import { qualityProbeSource } from './probe.mjs'

const DEFAULT_OUT = `quality-artifacts/${new Date().toISOString().replace(/[:.]/g, '-')}`

function usage() {
  return `Usage:
  node scripts/quality/capture.mjs [options]

Required runtime:
  A Vite dev/preview server and Chrome launched with --remote-debugging-port.
  Node 22+; no npm packages are used by this harness.

Options:
  --url URL                    Presentation URL (default http://127.0.0.1:4173)
  --cdp ENDPOINT               CDP HTTP origin, port, or page WebSocket URL
                               (otherwise discovers localhost 9222/23/25/29/9333)
  --viewport WIDTHxHEIGHT      CSS viewport (default 1920x1080)
  --dpr NUMBER                 Emulated device DPR (default 1)
  --slides SELECTION           all, comma-separated ids/indexes, or index ranges
                               such as cold-open,reveal or 0-4 (default all)
  --directions VALUE           both, forward, or backward (default both)
  --mode VALUE                 all, settled, or transitions (default all)
  --out DIRECTORY              Evidence directory (default ${DEFAULT_OUT})
  --cache VALUE                fresh or warm HTTP cache (default warm)
  --settle-ms NUMBER           Fixed pre-capture settle wait (default 4000)
  --trace-ms NUMBER            Transition trace window (default 4000)
  --ready-timeout-ms NUMBER    Page readiness timeout (default 30000)
  --motion-threshold NUMBER    Tiny-canvas RGB MAE threshold, 0-255 (default 0.5)
  --visual-probe VALUE         on or off (default on)
  --webgl-probe VALUE          full, allocations, or off (default full)
  --max-transitions NUMBER     Diagnostic cap; omit for acceptance captures
  --help                       Show this help

The report never substitutes guessed values for unavailable app probes.`
}

function takeValue(argv, index, inline, name) {
  const value = inline ?? argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return { value, consumed: inline === undefined ? 1 : 0 }
}

function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/.exec(value)
  if (!match) throw new Error('--viewport must use WIDTHxHEIGHT, for example 1920x1080')
  const width = Number(match[1])
  const height = Number(match[2])
  if (width < 1 || height < 1) throw new Error('--viewport dimensions must be positive')
  return { width, height }
}

function parseArgs(argv) {
  const options = {
    url: 'http://127.0.0.1:4173',
    cdp: null,
    viewport: { width: 1920, height: 1080 },
    dpr: 1,
    slides: 'all',
    directions: 'both',
    mode: 'all',
    out: DEFAULT_OUT,
    cache: 'warm',
    settleMs: 4000,
    traceMs: 4000,
    readyTimeoutMs: 30000,
    motionThreshold: 0.5,
    visualProbe: 'on',
    webglProbe: 'full',
    maxTransitions: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') return { help: true }
    if (!arg.startsWith('--')) throw new Error(`Unexpected positional argument ${arg}`)
    const [name, inline] = arg.split('=', 2)
    const taken = takeValue(argv, index, inline, name)
    index += taken.consumed
    const value = taken.value
    if (name === '--url') options.url = value
    else if (name === '--cdp') options.cdp = value
    else if (name === '--viewport') options.viewport = parseViewport(value)
    else if (name === '--dpr') options.dpr = Number(value)
    else if (name === '--slides' || name === '--slide') options.slides = value
    else if (name === '--directions') options.directions = value
    else if (name === '--mode') options.mode = value
    else if (name === '--out') options.out = value
    else if (name === '--cache') options.cache = value
    else if (name === '--settle-ms') options.settleMs = Number(value)
    else if (name === '--trace-ms') options.traceMs = Number(value)
    else if (name === '--ready-timeout-ms') options.readyTimeoutMs = Number(value)
    else if (name === '--motion-threshold') options.motionThreshold = Number(value)
    else if (name === '--visual-probe') options.visualProbe = value
    else if (name === '--webgl-probe') options.webglProbe = value
    else if (name === '--max-transitions') options.maxTransitions = Number(value)
    else throw new Error(`Unknown option ${name}`)
  }

  if (!['both', 'forward', 'backward'].includes(options.directions)) {
    throw new Error('--directions must be both, forward, or backward')
  }
  if (!['all', 'settled', 'transitions'].includes(options.mode)) {
    throw new Error('--mode must be all, settled, or transitions')
  }
  if (!['fresh', 'warm'].includes(options.cache)) {
    throw new Error('--cache must be fresh or warm')
  }
  if (!['on', 'off'].includes(options.visualProbe)) {
    throw new Error('--visual-probe must be on or off')
  }
  if (!['full', 'allocations', 'off'].includes(options.webglProbe)) {
    throw new Error('--webgl-probe must be full, allocations, or off')
  }
  for (const [name, value, minimum] of [
    ['--dpr', options.dpr, 0.1],
    ['--settle-ms', options.settleMs, 0],
    ['--trace-ms', options.traceMs, 1],
    ['--ready-timeout-ms', options.readyTimeoutMs, 1],
    ['--motion-threshold', options.motionThreshold, 0],
  ]) {
    if (!Number.isFinite(value) || value < minimum) {
      throw new Error(`${name} must be a number >= ${minimum}`)
    }
  }
  if (
    options.maxTransitions !== null &&
    (!Number.isInteger(options.maxTransitions) || options.maxTransitions < 1)
  ) {
    throw new Error('--max-transitions must be a positive integer')
  }
  return options
}

const safeName = (value) => value.replace(/[^a-z0-9_.-]+/gi, '-')
const slideParam = () =>
  `new URLSearchParams(location.search).get('slide')`

function withSlide(baseUrl, slide) {
  const url = new URL(baseUrl)
  url.searchParams.set('slide', slide)
  return url.href
}

async function navigate(client, url, readyTimeoutMs) {
  await client.send('Page.navigate', { url })
  const page = await waitForPage(client, readyTimeoutMs)
  if (!new URL(url).searchParams.has('quality')) return page

  const deadline = Date.now() + readyTimeoutMs
  while (Date.now() < deadline) {
    const status = await client.evaluate(`
      window.__presentationQuality?.snapshot?.().presentationReady ?? false
    `)
    if (status === true) return page
    await sleep(20)
  }
  throw new Error(`Presentation did not become ready within ${readyTimeoutMs}ms: ${url}`)
}

const KEY_DATA = {
  ArrowRight: { code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 },
  ArrowLeft: { code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 },
}

async function dispatchKey(client, key) {
  const data = KEY_DATA[key]
  if (!data) throw new Error(`Unsupported key ${key}`)
  await client.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key,
    ...data,
  })
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    ...data,
  })
}

async function waitForSlideChange(client, previous, timeoutMs = 1200) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const current = await client.evaluate(slideParam())
    if (current && current !== previous) return current
    await sleep(20)
  }
  return null
}

async function capturePng(client, path) {
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  })
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, Buffer.from(screenshot.data, 'base64'))
  const png = await readPng(path)
  return {
    path,
    width: png.width,
    height: png.height,
    bytes: png.bytes,
    pngSha256: png.fileSha256,
    pixelSha256: png.pixelSha256,
  }
}

async function discoverDeck(client, options, outDirectory) {
  console.log('Discovering slide order through one-key navigation…')
  await navigate(client, withSlide(options.url, '0'), options.readyTimeoutMs)
  await sleep(options.settleMs)

  const initialPath = join(outDirectory, 'loads', `${options.cache}-load-index-0.png`)
  const initialCapture = await capturePng(client, initialPath)
  const initialSnapshot = await client.evaluate('window.__qualityEvidence.snapshot()')

  const numericStart = await client.evaluate(slideParam())
  await dispatchKey(client, 'ArrowRight')
  const second = await waitForSlideChange(client, numericStart)
  if (!second) {
    throw new Error('Could not advance from numeric slide 0 while discovering the deck')
  }
  await sleep(190)
  await dispatchKey(client, 'ArrowLeft')
  const first = await waitForSlideChange(client, second)
  if (!first) throw new Error('Could not recover the first slide id while discovering the deck')

  const ids = [first]
  while (ids.length < 200) {
    await sleep(190)
    const previous = await client.evaluate(slideParam())
    await dispatchKey(client, 'ArrowRight')
    const next = await waitForSlideChange(client, previous, 500)
    if (!next) break
    if (ids.includes(next)) throw new Error(`Slide discovery looped at ${next}`)
    ids.push(next)
  }
  if (ids.length >= 200) throw new Error('Slide discovery exceeded the 200-slide safety cap')

  initialCapture.slide = first
  initialCapture.snapshot = initialSnapshot
  initialCapture.captureTiming = {
    method: 'fresh page navigation to numeric index 0 plus fixed settle wait',
    fixedWaitMs: options.settleMs,
    cache: options.cache,
  }
  return { ids, initialCapture }
}

function selectSlides(selection, deckIds) {
  if (selection === 'all') return deckIds.map((id, index) => ({ id, index }))
  const indexes = new Set()
  for (const rawToken of selection.split(',')) {
    const token = rawToken.trim()
    if (!token) continue
    const range = /^(\d+)-(\d+)$/.exec(token)
    if (range) {
      const from = Number(range[1])
      const to = Number(range[2])
      const step = from <= to ? 1 : -1
      for (let index = from; index !== to + step; index += step) indexes.add(index)
      continue
    }
    if (/^\d+$/.test(token)) {
      indexes.add(Number(token))
      continue
    }
    const index = deckIds.indexOf(token)
    if (index === -1) throw new Error(`Unknown slide id ${token}`)
    indexes.add(index)
  }
  for (const index of indexes) {
    if (index < 0 || index >= deckIds.length) {
      throw new Error(`Slide index ${index} is outside 0-${deckIds.length - 1}`)
    }
  }
  return [...indexes]
    .sort((a, b) => a - b)
    .map((index) => ({ id: deckIds[index], index }))
}

function transitionPlan(deckIds, selectedSlides, directions, maxTransitions) {
  const selected = new Set(selectedSlides.map((slide) => slide.index))
  const plan = []
  for (let index = 0; index < deckIds.length - 1; index += 1) {
    if (!selected.has(index) || !selected.has(index + 1)) continue
    if (directions === 'both' || directions === 'forward') {
      plan.push({
        direction: 'forward',
        key: 'ArrowRight',
        from: { id: deckIds[index], index },
        to: { id: deckIds[index + 1], index: index + 1 },
      })
    }
    if (directions === 'both' || directions === 'backward') {
      plan.push({
        direction: 'backward',
        key: 'ArrowLeft',
        from: { id: deckIds[index + 1], index: index + 1 },
        to: { id: deckIds[index], index },
      })
    }
  }
  return maxTransitions === null ? plan : plan.slice(0, maxTransitions)
}

function percentile(values, percent) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1)]
}

const round = (value, places = 3) =>
  Number.isFinite(value) ? Number(value.toFixed(places)) : value

function thresholdProfile(viewport) {
  const fallback = viewport.width === 1280 && viewport.height === 720
  return fallback
    ? { name: 'fallback', inputLatencyMs: 50, p95FrameMs: 33, maxFrameMs: 80 }
    : { name: 'stage', inputLatencyMs: 50, p95FrameMs: 20, maxFrameMs: 50 }
}

function vectorDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return null
  let sum = 0
  for (let index = 0; index < a.length; index += 1) {
    const delta = a[index] - b[index]
    sum += delta * delta
  }
  return Math.sqrt(sum)
}

function cameraContinuity(trace, keydown) {
  const start = trace.startSnapshot?.camera?.position
  const end = trace.endSnapshot?.camera?.position
  const endpointDistance = vectorDistance(start, end)
  if (!Number.isFinite(endpointDistance) || endpointDistance <= 1e-4) return null

  const samples = trace.observables.filter(
    (sample) =>
      (!keydown || sample.t >= keydown.t) &&
      Array.isArray(sample.camera?.position)
  )
  if (!samples.length) {
    return { status: 'unsupported', reason: 'No camera observables followed the keydown.' }
  }

  const progress = samples.map(
    (sample) => vectorDistance(start, sample.camera.position) / endpointDistance
  )
  let previous = 0
  let maxStepRatio = 0
  let movingFrames = 0
  let monotonic = true
  for (const value of progress) {
    const step = value - previous
    if (step < -0.01) monotonic = false
    if (step > 0.001) movingFrames += 1
    maxStepRatio = Math.max(maxStepRatio, Math.abs(step))
    previous = value
  }

  const firstStepRatio = progress[0]
  const endpointErrorRatio =
    vectorDistance(samples.at(-1).camera.position, end) / endpointDistance
  const animatedPhaseObserved = samples.some(
    (sample) =>
      sample.transition?.settled === false &&
      sample.transition?.phase !== 'restore'
  )
  const passed =
    firstStepRatio <= 0.2 &&
    maxStepRatio <= 0.25 &&
    movingFrames >= 4 &&
    monotonic &&
    endpointErrorRatio <= 0.005 &&
    animatedPhaseObserved

  return {
    status: passed ? 'pass' : 'fail',
    endpointDistance: round(endpointDistance),
    firstStepRatio: round(firstStepRatio, 5),
    maxStepRatio: round(maxStepRatio, 5),
    movingFrames,
    sampleCount: samples.length,
    monotonic,
    endpointErrorRatio: round(endpointErrorRatio, 5),
    animatedPhaseObserved,
    thresholds: {
      firstStepRatio: 0.2,
      maxStepRatio: 0.25,
      movingFrames: 4,
      endpointErrorRatio: 0.005,
    },
  }
}

function summarizeTrace(trace, viewport) {
  const keydown = trace.keydowns.find((entry) => entry.key === trace.meta.key) ?? null
  // CDP startTrace and key dispatch are separate round trips. Exclude rAF gaps
  // that happened before the page received the key; otherwise harness latency
  // can be mislabeled as a transition frame hitch.
  const frameDeltas = trace.raf
    .filter((frame) => !keydown || frame.t >= keydown.t)
    .map((frame) => frame.deltaMs)
    .filter(Number.isFinite)
  const indexChange = trace.indexChanges[0] ?? null
  const firstVisible = Number.isFinite(trace.firstVisibleMovement?.t)
    ? trace.firstVisibleMovement
    : null
  const inputLatencyMs = keydown && firstVisible ? firstVisible.t - keydown.t : null
  const indexLatencyMs = keydown && indexChange ? indexChange.t - keydown.t : null
  const profile = thresholdProfile(viewport)
  const p95FrameMs = percentile(frameDeltas, 95)
  const maxFrameMs = frameDeltas.length ? Math.max(...frameDeltas) : null
  const continuity = cameraContinuity(trace, keydown)
  const checks = {
    inputLatency:
      inputLatencyMs === null
        ? { status: 'unsupported', thresholdMs: profile.inputLatencyMs }
        : {
            status: inputLatencyMs <= profile.inputLatencyMs ? 'pass' : 'fail',
            actualMs: round(inputLatencyMs),
            thresholdMs: profile.inputLatencyMs,
          },
    p95Frame:
      p95FrameMs === null
        ? { status: 'unsupported', thresholdMs: profile.p95FrameMs }
        : {
            status: p95FrameMs <= profile.p95FrameMs ? 'pass' : 'fail',
            actualMs: round(p95FrameMs),
            thresholdMs: profile.p95FrameMs,
          },
    maxFrame:
      maxFrameMs === null
        ? { status: 'unsupported', thresholdMs: profile.maxFrameMs }
        : {
            status: maxFrameMs <= profile.maxFrameMs ? 'pass' : 'fail',
            actualMs: round(maxFrameMs),
            thresholdMs: profile.maxFrameMs,
          },
  }

  if (continuity) checks.cameraContinuity = continuity

  const allocations = trace.webglInterception?.delta
  if (allocations?.status === 'available') {
    checks.navigationPrograms = {
      status: allocations.createdPrograms === 0 ? 'pass' : 'fail',
      actual: allocations.createdPrograms,
      threshold: 0,
    }
    checks.navigationTextures = {
      status: allocations.createdTextures === 0 ? 'pass' : 'fail',
      actual: allocations.createdTextures,
      threshold: 0,
    }
  } else {
    checks.navigationPrograms = { status: 'unsupported', threshold: 0 }
    checks.navigationTextures = { status: 'unsupported', threshold: 0 }
  }

  const statuses = Object.values(checks).map((check) => check.status)
  const verdict = statuses.includes('fail')
    ? 'fail'
    : statuses.includes('unsupported')
      ? 'incomplete'
      : 'pass'
  return {
    profile,
    keydown,
    indexChange,
    firstVisibleMovement: trace.firstVisibleMovement,
    cameraContinuity: continuity,
    inputLatencyMs: round(inputLatencyMs),
    indexLatencyMs: round(indexLatencyMs),
    frameCount: frameDeltas.length,
    p50FrameMs: round(percentile(frameDeltas, 50)),
    p95FrameMs: round(p95FrameMs),
    maxFrameMs: round(maxFrameMs),
    framesOver50Ms: frameDeltas.filter((delta) => delta > 50).length,
    framesOver80Ms: frameDeltas.filter((delta) => delta > 80).length,
    longTaskCount: trace.longTasks.length,
    maxLongTaskMs: round(
      trace.longTasks.length ? Math.max(...trace.longTasks.map((task) => task.durationMs)) : 0
    ),
    checks,
    verdict,
  }
}

async function captureSettledSlides(client, options, selectedSlides, outDirectory) {
  const settled = []
  for (const slide of selectedSlides) {
    console.log(`Settled ${slide.index}: ${slide.id}`)
    await navigate(client, withSlide(options.url, slide.id), options.readyTimeoutMs)
    await sleep(options.settleMs)
    const snapshot = await client.evaluate('window.__qualityEvidence.snapshot()')
    const path = join(
      outDirectory,
      'settled',
      `${String(slide.index).padStart(2, '0')}-${safeName(slide.id)}.png`
    )
    const capture = await capturePng(client, path)
    settled.push({
      ...slide,
      capture: {
        ...capture,
        captureTiming: {
          method: 'direct URL navigation plus fixed settle wait',
          fixedWaitMs: options.settleMs,
        },
      },
      snapshot,
    })
  }
  return settled
}

async function captureTransitions(client, options, plan, outDirectory) {
  const transitions = []
  const fixedWaitMs = Math.max(options.traceMs, options.settleMs)
  for (let index = 0; index < plan.length; index += 1) {
    const item = plan[index]
    const label = `${item.from.id} ${item.direction === 'forward' ? '→' : '←'} ${item.to.id}`
    console.log(`Transition ${index + 1}/${plan.length}: ${label}`)
    await navigate(client, withSlide(options.url, item.from.id), options.readyTimeoutMs)
    await sleep(options.settleMs)
    await client.evaluate(
      `window.__qualityEvidence.startTrace(${JSON.stringify({
        key: item.key,
        direction: item.direction,
        from: item.from,
        to: item.to,
      })})`
    )
    await dispatchKey(client, item.key)
    await sleep(fixedWaitMs)
    const trace = await client.evaluate('window.__qualityEvidence.stopTrace()')
    const arrived = await client.evaluate(slideParam())
    const path = join(
      outDirectory,
      'transitions',
      `${String(item.from.index).padStart(2, '0')}-${safeName(item.from.id)}--${String(item.to.index).padStart(2, '0')}-${safeName(item.to.id)}--${item.direction}.png`
    )
    const capture = await capturePng(client, path)
    const summary = summarizeTrace(trace, options.viewport)
    const arrival = {
      expected: item.to.id,
      actual: arrived,
      status: arrived === item.to.id ? 'pass' : 'fail',
    }
    if (arrival.status === 'fail') summary.verdict = 'fail'
    transitions.push({
      ...item,
      fixedWaitMs,
      arrival,
      settledCapture: capture,
      summary,
      trace,
    })
  }
  return transitions
}

function collectUnsupported(value, path = '$', output = []) {
  if (!value || typeof value !== 'object') return output
  if (value.status === 'unsupported' && typeof value.reason === 'string') {
    output.push({ path, reason: value.reason })
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUnsupported(item, `${path}[${index}]`, output))
  } else {
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'reason') collectUnsupported(child, `${path}.${key}`, output)
    }
  }
  return output
}

function relativePath(outDirectory, path) {
  return relative(outDirectory, path) || '.'
}

function markdownReport(evidence, outDirectory) {
  const lines = [
    '# Presentation quality evidence',
    '',
    `Generated: ${evidence.generatedAt}`,
    '',
    '## Run',
    '',
    `- URL: \`${evidence.config.url}\``,
    `- Chrome: ${evidence.environment.browser.product}`,
    `- Viewport: ${evidence.config.viewport.width}×${evidence.config.viewport.height} CSS px at DPR ${evidence.config.dpr}`,
    `- Canvas: ${evidence.loadCapture.snapshot.canvas.width}×${evidence.loadCapture.snapshot.canvas.height} backing px`,
    `- Cache profile: ${evidence.config.cache}`,
    `- Fixed settle wait: ${evidence.config.settleMs}ms`,
    `- Visual first-motion probe: ${evidence.config.visualProbe} (intrusive until first changed sampled frame)`,
    `- WebGL interception: ${evidence.config.webglProbe}`,
    '',
    '## Settled slides',
    '',
    '| # | Slide | Screenshot | Pixel SHA-256 | Renderer info | Declared/displayed stage |',
    '| ---: | --- | --- | --- | --- | --- |',
  ]
  for (const item of evidence.settled) {
    const renderer = item.snapshot.rendererInfo
    const stage = `${item.snapshot.declaredStage.value ?? 'unsupported'}/${item.snapshot.displayedStage.value ?? 'unsupported'}`
    lines.push(
      `| ${item.index} | ${item.id} | \`${relativePath(outDirectory, item.capture.path)}\` | \`${item.capture.pixelSha256.slice(0, 12)}…\` | ${renderer.status} | ${stage} |`
    )
  }
  if (!evidence.settled.length) lines.push('| — | — | — | — | — | — |')

  lines.push(
    '',
    '## Adjacent transition traces',
    '',
    '| Transition | Input→visible | Camera path | p95 / max frame | >50ms / >80ms | +programs / +textures | Long tasks | Verdict |',
    '| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |'
  )
  for (const item of evidence.transitions) {
    const allocations = item.trace.webglInterception?.delta
    lines.push(
      `| ${item.from.id} ${item.direction === 'forward' ? '→' : '←'} ${item.to.id} | ${item.summary.inputLatencyMs ?? 'unsupported'}ms | ${item.summary.cameraContinuity?.status ?? 'n/a'} | ${item.summary.p95FrameMs ?? 'unsupported'} / ${item.summary.maxFrameMs ?? 'unsupported'}ms | ${item.summary.framesOver50Ms} / ${item.summary.framesOver80Ms} | ${allocations?.createdPrograms ?? 'unsupported'} / ${allocations?.createdTextures ?? 'unsupported'} | ${item.summary.longTaskCount} | **${item.summary.verdict}** |`
    )
  }
  if (!evidence.transitions.length) lines.push('| — | — | — | — | — | — | — | — |')

  const uniqueUnsupported = new Map()
  for (const item of evidence.unsupported) {
    if (!uniqueUnsupported.has(item.reason)) uniqueUnsupported.set(item.reason, item.path)
  }
  lines.push('', '## Unsupported probes', '')
  if (uniqueUnsupported.size === 0) {
    lines.push('None.')
  } else {
    for (const [reason, path] of uniqueUnsupported) lines.push(`- ${reason} First seen at \`${path}\`.`)
  }

  lines.push(
    '',
    '## Interpretation',
    '',
    '- This report is evidence, not an automatic visual-quality pass. Headless/software-rendered FPS is not acceptance evidence.',
    '- “Settled” screenshots use the configured fixed wait. No production settled event was exposed, so the harness does not invent an exact landing time.',
    '- WebGL interception counts API calls; it is not mislabeled as `renderer.info`. Renderer metrics appear only when an actual `THREE.WebGLRenderer` is exposed.',
    '- SSIM is not calculated. Use a trusted SSIM implementation for the required ≥0.99 supersampled edge-region gate.',
    '- Exact rAF samples, long tasks, index events, probe snapshots, uploads, and hashes are in `evidence.json`.',
    ''
  )
  return lines.join('\n')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const outDirectory = resolve(options.out)
  await mkdir(outDirectory, { recursive: true })
  const endpoint = await resolveCdpEndpoint(options.cdp)
  const target = await openPageTarget(endpoint)
  if (target.warning) console.warn(target.warning)
  const client = await CdpClient.connect(target.webSocketUrl)
  const consoleMessages = []
  const networkFailures = []

  client.on('Runtime.consoleAPICalled', (event) => {
    if (!['error', 'warning'].includes(event.type)) return
    consoleMessages.push({
      type: event.type,
      timestamp: event.timestamp,
      text: event.args.map((arg) => arg.value ?? arg.description ?? '').join(' '),
    })
  })
  client.on('Runtime.exceptionThrown', (event) => {
    consoleMessages.push({
      type: 'exception',
      timestamp: event.timestamp,
      text: event.exceptionDetails?.exception?.description ?? event.exceptionDetails?.text,
    })
  })
  client.on('Network.loadingFailed', (event) => {
    if (!event.canceled) networkFailures.push({ requestId: event.requestId, errorText: event.errorText })
  })

  try {
    await Promise.all([
      client.send('Page.enable'),
      client.send('Runtime.enable'),
      client.send('Network.enable'),
      client.send('Log.enable'),
    ])
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: options.viewport.width,
      height: options.viewport.height,
      deviceScaleFactor: options.dpr,
      mobile: false,
      screenWidth: options.viewport.width,
      screenHeight: options.viewport.height,
    })
    await client.send('Network.setCacheDisabled', { cacheDisabled: false })
    if (options.cache === 'fresh') await client.send('Network.clearBrowserCache')
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: qualityProbeSource({
        motionThreshold: options.motionThreshold,
        visualProbe: options.visualProbe,
        visualWidth: 28,
        visualHeight: 16,
        webglProbe: options.webglProbe,
      }),
    })

    const browser = await client.send('Browser.getVersion')
    const { ids: deckIds, initialCapture } = await discoverDeck(client, options, outDirectory)
    const selectedSlides = selectSlides(options.slides, deckIds)
    const plan = transitionPlan(
      deckIds,
      selectedSlides,
      options.directions,
      options.maxTransitions
    )
    console.log(`Discovered ${deckIds.length} slides; selected ${selectedSlides.length}; planned ${plan.length} transition traces.`)

    const settled =
      options.mode === 'transitions'
        ? []
        : await captureSettledSlides(client, options, selectedSlides, outDirectory)
    const transitions =
      options.mode === 'settled'
        ? []
        : await captureTransitions(client, options, plan, outDirectory)
    const diagnostics = await client.evaluate('window.__qualityEvidence.diagnostics()')

    const evidence = {
      schemaVersion: 1,
      task: '6rex1l71',
      generatedAt: new Date().toISOString(),
      config: {
        ...options,
        out: outDirectory,
        transitionCaptureWaitMs: Math.max(options.traceMs, options.settleMs),
      },
      environment: {
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        browser,
        cdp: {
          endpoint: target.endpoint,
          supplied: endpoint.supplied,
          isolatedTarget: target.created,
        },
      },
      deck: { ids: deckIds, count: deckIds.length, selected: selectedSlides },
      loadCapture: initialCapture,
      settled,
      transitions,
      diagnostics,
      consoleMessages,
      networkFailures,
    }
    evidence.unsupported = collectUnsupported(evidence)

    const jsonPath = join(outDirectory, 'evidence.json')
    const reportPath = join(outDirectory, 'report.md')
    await writeFile(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`)
    await writeFile(reportPath, markdownReport(evidence, outDirectory))
    console.log(`Wrote ${jsonPath}`)
    console.log(`Wrote ${reportPath}`)
  } finally {
    if (target.created) await client.send('Page.close').catch(() => undefined)
    client.close()
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message)
  console.error(`\n${usage()}`)
  process.exitCode = 1
})
