/**
 * One settled screenshot of one slide, for the authoring loop.
 *
 * `capture.mjs` is the evidence harness: it discovers the slide order, traces
 * every adjacent transition, and hashes decoded pixels. That is the right tool
 * for acceptance and much too slow for "change a material, look at it again".
 * This does the smallest useful thing on the same CDP plumbing.
 *
 * Usage:
 *   node scripts/quality/shot.mjs <slide-id> [<slide-id> ...] \
 *     [--url https://ai-health.robo.online] [--cdp 9223] \
 *     [--viewport 1920x1080] [--settle-ms 4000] [--out DIR]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CdpClient, openPageTarget, resolveCdpEndpoint, sleep } from './cdp.mjs'

function parseArgs(argv) {
  const slides = []
  const options = {
    url: 'https://ai-health.robo.online',
    cdp: undefined,
    viewport: '1920x1080',
    // 4s caught slides mid content-sweep — the hero glass was still a blank
    // grey rectangle. The sweep plus camera flight needs the longer window, and
    // an `autoplay` slide needs longer still: `agent-session` drives its own
    // seven steps and does not settle for about twelve seconds, so anything
    // shorter photographs it mid-conversation.
    settleMs: 13000,
    out: 'quality-artifacts/aesthetic-pass',
  }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      slides.push(token)
      continue
    }
    const key = token.slice(2)
    const value = argv[++i]
    if (key === 'settle-ms') options.settleMs = Number(value)
    else if (key in options) options[key] = value
    else throw new Error(`unknown option --${key}`)
  }
  if (!slides.length) throw new Error('name at least one slide id')
  return { slides, options }
}

const { slides, options } = parseArgs(process.argv.slice(2))
const [width, height] = options.viewport.split('x').map(Number)

const endpoint = await resolveCdpEndpoint(options.cdp)
const target = await openPageTarget(endpoint)
const client = await CdpClient.connect(target.webSocketUrl)
if (target.warning) console.warn(target.warning)

await client.send('Page.enable')
await client.send('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: false,
})

await mkdir(options.out, { recursive: true })

for (const slide of slides) {
  const url = `${options.url}/?slide=${encodeURIComponent(slide)}`
  await client.send('Page.navigate', { url })
  // The deck warms shaders, compiles programs and settles its camera before it
  // declares itself presentation-ready; a fixed window is what capture.mjs uses
  // too, and it keeps direct-URL arrival identical to navigated arrival.
  await sleep(options.settleMs)
  const { data } = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  })
  const path = resolve(options.out, `${slide}.png`)
  await writeFile(path, Buffer.from(data, 'base64'))
  console.log(`${slide} -> ${path}`)
}

if (target.created && target.targetId) {
  await client.send('Target.closeTarget', { targetId: target.targetId }).catch(() => {})
}
client.close()
