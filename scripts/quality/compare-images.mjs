#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { ssim } from 'ssim.js'
import { readPng } from './png.mjs'

function usage() {
  return `Usage:
  node scripts/quality/compare-images.mjs REFERENCE.png CANDIDATE.png [options]

Options:
  --json FILE                     Write machine-readable JSON
  --report FILE                   Write a concise Markdown report
  --region X,Y,WIDTH,HEIGHT       Compare the same pixel crop in both images
  --max-luma-mae NUMBER           Fail above encoded Rec.709 luma MAE (0-255)
  --max-centroid-error NUMBER     Fail above luminance centroid distance in px
  --max-brightness-change NUMBER  Fail above absolute mean-luma change (%)
  --min-ssim NUMBER               Fail below Wang-style SSIM (0-1)
  --fail-on-difference            Require pixel-identical images
  --help                          Show this help

This dependency-free utility reports exact hashes, MAE/RMSE, brightness, and
luminance centroid displacement. It does NOT calculate or claim SSIM.`
}

function parseArgs(argv) {
  const positionals = []
  const options = {
    json: null,
    report: null,
    region: null,
    maxLumaMae: null,
    maxCentroidError: null,
    maxBrightnessChange: null,
    minSsim: null,
    failOnDifference: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') return { help: true }
    if (!arg.startsWith('--')) {
      positionals.push(arg)
      continue
    }
    const [name, inline] = arg.split('=', 2)
    const value = inline ?? argv[++index]
    if (name === '--json') options.json = value
    else if (name === '--report') options.report = value
    else if (name === '--region') {
      const parts = value.split(',').map(Number)
      if (
        parts.length !== 4 ||
        parts.some((part) => !Number.isInteger(part)) ||
        parts[0] < 0 ||
        parts[1] < 0 ||
        parts[2] < 1 ||
        parts[3] < 1
      ) {
        throw new Error('--region must be X,Y,WIDTH,HEIGHT using non-negative integers')
      }
      options.region = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] }
    } else if (name === '--max-luma-mae') options.maxLumaMae = Number(value)
    else if (name === '--max-centroid-error') options.maxCentroidError = Number(value)
    else if (name === '--max-brightness-change') options.maxBrightnessChange = Number(value)
    else if (name === '--min-ssim') options.minSsim = Number(value)
    else if (name === '--fail-on-difference') {
      options.failOnDifference = true
      if (inline === undefined) index -= 1
    } else {
      throw new Error(`Unknown option ${name}`)
    }
  }
  if (positionals.length !== 2) throw new Error('Expected REFERENCE.png and CANDIDATE.png')
  for (const [name, value] of [
    ['--max-luma-mae', options.maxLumaMae],
    ['--max-centroid-error', options.maxCentroidError],
    ['--max-brightness-change', options.maxBrightnessChange],
    ['--min-ssim', options.minSsim],
  ]) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`${name} must be a non-negative number`)
    }
  }
  if (options.minSsim !== null && options.minSsim > 1) {
    throw new Error('--min-ssim must be between 0 and 1')
  }
  return { ...options, reference: positionals[0], candidate: positionals[1] }
}

const encodedLuma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b
const srgbToLinear = (value) => {
  const normalized = value / 255
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}
const linearLuma255 = (r, g, b) =>
  (0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)) * 255
const rounded = (value, places = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(places)) : value

function crop(image, region) {
  if (!region) return image
  if (region.x + region.width > image.width || region.y + region.height > image.height) {
    throw new Error(
      `Region ${region.x},${region.y},${region.width},${region.height} exceeds ${image.width}x${image.height}`
    )
  }
  const rgba = Buffer.allocUnsafe(region.width * region.height * 4)
  for (let y = 0; y < region.height; y += 1) {
    const sourceStart = ((region.y + y) * image.width + region.x) * 4
    image.rgba.copy(
      rgba,
      y * region.width * 4,
      sourceStart,
      sourceStart + region.width * 4
    )
  }
  return { ...image, width: region.width, height: region.height, rgba }
}

function ssimImage(image) {
  const data = new Uint8ClampedArray(image.width * image.height * 4)
  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
    const source = pixel * 4
    const luma = Math.round(
      encodedLuma(image.rgba[source], image.rgba[source + 1], image.rgba[source + 2])
    )
    data[source] = data[source + 1] = data[source + 2] = luma
    data[source + 3] = 255
  }
  return { width: image.width, height: image.height, data }
}

const SSIM_OPTIONS = Object.freeze({
  ssim: 'fast',
  windowSize: 11,
  k1: 0.01,
  k2: 0.03,
  bitDepth: 8,
  downsample: false,
  rgb2grayVersion: 'original',
})

function compare(reference, candidate) {
  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    return {
      comparable: false,
      reason: `Dimension mismatch: ${reference.width}x${reference.height} vs ${candidate.width}x${candidate.height}`,
    }
  }

  const pixelCount = reference.width * reference.height
  let absoluteRgb = 0
  let squaredRgb = 0
  let absoluteAlpha = 0
  let absoluteEncodedLuma = 0
  let squaredEncodedLuma = 0
  let absoluteLinearLuma = 0
  let maxChannelDelta = 0
  let differingPixels = 0
  let referenceLumaSum = 0
  let candidateLumaSum = 0
  let referenceX = 0
  let referenceY = 0
  let candidateX = 0
  let candidateY = 0

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4
    let pixelDiffers = false
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = Math.abs(reference.rgba[offset + channel] - candidate.rgba[offset + channel])
      absoluteRgb += delta
      squaredRgb += delta * delta
      maxChannelDelta = Math.max(maxChannelDelta, delta)
      if (delta !== 0) pixelDiffers = true
    }
    const alphaDelta = Math.abs(reference.rgba[offset + 3] - candidate.rgba[offset + 3])
    absoluteAlpha += alphaDelta
    if (alphaDelta !== 0) pixelDiffers = true
    if (pixelDiffers) differingPixels += 1

    const referenceLuma = encodedLuma(
      reference.rgba[offset],
      reference.rgba[offset + 1],
      reference.rgba[offset + 2]
    )
    const candidateLuma = encodedLuma(
      candidate.rgba[offset],
      candidate.rgba[offset + 1],
      candidate.rgba[offset + 2]
    )
    const lumaDelta = Math.abs(referenceLuma - candidateLuma)
    absoluteEncodedLuma += lumaDelta
    squaredEncodedLuma += lumaDelta * lumaDelta
    absoluteLinearLuma += Math.abs(
      linearLuma255(
        reference.rgba[offset],
        reference.rgba[offset + 1],
        reference.rgba[offset + 2]
      ) -
        linearLuma255(
          candidate.rgba[offset],
          candidate.rgba[offset + 1],
          candidate.rgba[offset + 2]
        )
    )

    const x = pixel % reference.width
    const y = Math.floor(pixel / reference.width)
    referenceLumaSum += referenceLuma
    candidateLumaSum += candidateLuma
    referenceX += x * referenceLuma
    referenceY += y * referenceLuma
    candidateX += x * candidateLuma
    candidateY += y * candidateLuma
  }

  const referenceCentroid =
    referenceLumaSum > 0
      ? { x: referenceX / referenceLumaSum, y: referenceY / referenceLumaSum }
      : null
  const candidateCentroid =
    candidateLumaSum > 0
      ? { x: candidateX / candidateLumaSum, y: candidateY / candidateLumaSum }
      : null
  const centroidError =
    referenceCentroid && candidateCentroid
      ? Math.hypot(
          referenceCentroid.x - candidateCentroid.x,
          referenceCentroid.y - candidateCentroid.y
        )
      : null
  const meanReferenceLuma = referenceLumaSum / pixelCount
  const meanCandidateLuma = candidateLumaSum / pixelCount
  const brightnessChangePercent =
    meanReferenceLuma > 0
      ? ((meanCandidateLuma - meanReferenceLuma) / meanReferenceLuma) * 100
      : meanCandidateLuma === 0
        ? 0
        : null
  const ssimResult = ssim(ssimImage(reference), ssimImage(candidate), SSIM_OPTIONS)

  return {
    comparable: true,
    dimensions: { width: reference.width, height: reference.height, pixelCount },
    identicalPixels: differingPixels === 0,
    differingPixels,
    differingPixelRatio: rounded(differingPixels / pixelCount),
    maxChannelDelta255: maxChannelDelta,
    rgbMae255: rounded(absoluteRgb / (pixelCount * 3)),
    rgbRmse255: rounded(Math.sqrt(squaredRgb / (pixelCount * 3))),
    alphaMae255: rounded(absoluteAlpha / pixelCount),
    encodedRec709LumaMae255: rounded(absoluteEncodedLuma / pixelCount),
    encodedRec709LumaRmse255: rounded(Math.sqrt(squaredEncodedLuma / pixelCount)),
    linearRec709LuminanceMae255: rounded(absoluteLinearLuma / pixelCount),
    meanEncodedLuma255: {
      reference: rounded(meanReferenceLuma),
      candidate: rounded(meanCandidateLuma),
    },
    brightnessChangePercent: rounded(brightnessChangePercent),
    luminanceCentroid: {
      reference: referenceCentroid
        ? { x: rounded(referenceCentroid.x), y: rounded(referenceCentroid.y) }
        : null,
      candidate: candidateCentroid
        ? { x: rounded(candidateCentroid.x), y: rounded(candidateCentroid.y) }
        : null,
      errorPx: rounded(centroidError),
      status: centroidError === null ? 'unsupported' : 'available',
      reason:
        centroidError === null
          ? 'A luminance centroid is undefined when either image has zero total luma.'
          : null,
    },
    ssim: {
      status: 'available',
      mssim: rounded(ssimResult.mssim, 9),
      implementation: 'ssim.js@3.5.0',
      options: SSIM_OPTIONS,
      domain: '8-bit encoded Rec.709 luma repeated into RGB',
    },
  }
}

function evaluateThresholds(metrics, options) {
  const checks = []
  if (!metrics.comparable) {
    checks.push({ name: 'dimensions', status: 'fail', reason: metrics.reason })
    return checks
  }
  if (options.failOnDifference) {
    checks.push({
      name: 'pixel identity',
      status: metrics.identicalPixels ? 'pass' : 'fail',
      actual: metrics.differingPixels,
      threshold: 0,
    })
  }
  if (options.maxLumaMae !== null) {
    checks.push({
      name: 'encoded Rec.709 luma MAE',
      status: metrics.encodedRec709LumaMae255 <= options.maxLumaMae ? 'pass' : 'fail',
      actual: metrics.encodedRec709LumaMae255,
      threshold: options.maxLumaMae,
      unit: '0-255',
    })
  }
  if (options.maxCentroidError !== null) {
    const actual = metrics.luminanceCentroid.errorPx
    checks.push({
      name: 'luminance centroid error',
      status: actual !== null && actual <= options.maxCentroidError ? 'pass' : 'fail',
      actual,
      threshold: options.maxCentroidError,
      unit: 'px',
    })
  }
  if (options.minSsim !== null) {
    const actual = metrics.ssim.mssim
    checks.push({
      name: 'SSIM',
      status: actual >= options.minSsim ? 'pass' : 'fail',
      actual,
      threshold: options.minSsim,
    })
  }
  if (options.maxBrightnessChange !== null) {
    const actual = metrics.brightnessChangePercent
    checks.push({
      name: 'absolute mean-luma change',
      status:
        actual !== null && Math.abs(actual) <= options.maxBrightnessChange ? 'pass' : 'fail',
      actual,
      threshold: options.maxBrightnessChange,
      unit: '%',
    })
  }
  return checks
}

function markdown(result) {
  const metric = result.metrics
  const lines = [
    '# Image comparison',
    '',
    `- Reference: \`${result.reference.path}\``,
    `- Candidate: \`${result.candidate.path}\``,
    `- Verdict: **${result.verdict.toUpperCase()}**`,
    `- Pixel-identical: ${metric.identicalPixels ? 'yes' : 'no'}`,
  ]
  if (metric.comparable) {
    lines.push(
      `- Encoded Rec.709 luma MAE: ${metric.encodedRec709LumaMae255}/255`,
      `- RGB MAE: ${metric.rgbMae255}/255`,
      `- Luminance centroid error: ${metric.luminanceCentroid.errorPx ?? 'unsupported'} px`,
      `- Mean-luma change: ${metric.brightnessChangePercent ?? 'unsupported'}%`,
      `- SSIM: ${metric.ssim.mssim} (${metric.ssim.implementation})`
    )
  } else {
    lines.push(`- Comparison unavailable: ${metric.reason}`)
  }
  if (result.checks.length) {
    lines.push('', '## Threshold checks', '', '| Check | Result | Actual | Threshold |', '| --- | --- | ---: | ---: |')
    for (const check of result.checks) {
      lines.push(
        `| ${check.name} | ${check.status} | ${check.actual ?? 'n/a'} ${check.unit ?? ''} | ${check.threshold ?? 'n/a'} ${check.unit ?? ''} |`
      )
    }
  }
  return `${lines.join('\n')}\n`
}

async function writeOutput(path, contents) {
  await mkdir(dirname(resolve(path)), { recursive: true })
  await writeFile(path, contents)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }
  const [referenceFile, candidateFile] = await Promise.all([
    readPng(options.reference),
    readPng(options.candidate),
  ])
  const reference = crop(referenceFile, options.region)
  const candidate = crop(candidateFile, options.region)
  const metrics = compare(reference, candidate)
  const checks = evaluateThresholds(metrics, options)
  const verdict = checks.some((check) => check.status === 'fail') ? 'fail' : 'pass'
  const result = {
    schemaVersion: 1,
    tool: 'scripts/quality/compare-images.mjs',
    reference: {
      path: options.reference,
      width: reference.width,
      height: reference.height,
      fileSha256: referenceFile.fileSha256,
      pixelSha256: referenceFile.pixelSha256,
    },
    candidate: {
      path: options.candidate,
      width: candidate.width,
      height: candidate.height,
      fileSha256: candidateFile.fileSha256,
      pixelSha256: candidateFile.pixelSha256,
    },
    region: options.region,
    metrics,
    checks,
    verdict,
  }
  const json = `${JSON.stringify(result, null, 2)}\n`
  if (options.json) await writeOutput(options.json, json)
  if (options.report) await writeOutput(options.report, markdown(result))
  console.log(json.trimEnd())
  if (verdict === 'fail') process.exitCode = 1
}

main().catch((error) => {
  console.error(error.stack ?? error.message)
  console.error(`\n${usage()}`)
  process.exitCode = 2
})
