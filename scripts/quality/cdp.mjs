const DEFAULT_PORTS = [9222, 9223, 9225, 9229, 9333]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function requireRuntimeFeatures() {
  if (typeof fetch !== 'function' || typeof WebSocket !== 'function') {
    throw new Error(
      'The quality harness requires Node 22+ (built-in fetch and WebSocket).'
    )
  }
}

function httpOrigin(value) {
  if (/^\d+$/.test(value)) return `http://127.0.0.1:${value}`
  if (value.startsWith('ws://')) return `http://${new URL(value).host}`
  if (value.startsWith('wss://')) return `https://${new URL(value).host}`
  const url = new URL(value)
  return url.origin
}

async function endpointIsReachable(origin) {
  try {
    const response = await fetch(`${origin}/json/version`)
    if (!response.ok) return false
    const value = await response.json()
    return Boolean(value.webSocketDebuggerUrl)
  } catch {
    return false
  }
}

/**
 * Resolve a supplied CDP endpoint or discover a conventional localhost port.
 * A page WebSocket URL is returned as-is. Browser WebSocket URLs are converted
 * back to their HTTP origin so the harness can create an isolated page target.
 */
export async function resolveCdpEndpoint(supplied) {
  requireRuntimeFeatures()
  const requested =
    supplied ??
    process.env.QUALITY_CDP ??
    process.env.CDP_ENDPOINT ??
    process.env.CHROME_REMOTE_DEBUGGING_URL ??
    process.env.CDP_PORT

  if (requested) {
    const value = String(requested)
    if (/^wss?:\/\//.test(value) && /\/devtools\/page\//.test(value)) {
      return { kind: 'page-websocket', webSocketUrl: value, supplied: true }
    }
    const origin = httpOrigin(value)
    if (!(await endpointIsReachable(origin))) {
      throw new Error(`Chrome remote debugging is not reachable at ${origin}`)
    }
    return { kind: 'http', origin, supplied: true }
  }

  for (const port of DEFAULT_PORTS) {
    const origin = `http://127.0.0.1:${port}`
    if (await endpointIsReachable(origin)) {
      return { kind: 'http', origin, supplied: false }
    }
  }

  throw new Error(
    `No Chrome remote-debugging endpoint found. Tried ${DEFAULT_PORTS.join(', ')}; pass --cdp or QUALITY_CDP.`
  )
}

async function createPageTarget(origin) {
  const url = `${origin}/json/new?${encodeURIComponent('about:blank')}`
  let response = await fetch(url, { method: 'PUT' })
  if (!response.ok) response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Could not create a CDP page target (${response.status} ${url})`)
  }
  const target = await response.json()
  if (!target.webSocketDebuggerUrl) {
    throw new Error('Chrome created a target without a page WebSocket URL')
  }
  return target
}

async function getExistingPageTarget(origin) {
  const response = await fetch(`${origin}/json`)
  if (!response.ok) throw new Error(`Could not list Chrome targets (${response.status})`)
  const targets = await response.json()
  return targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl)
}

export async function openPageTarget(endpoint) {
  if (endpoint.kind === 'page-websocket') {
    return {
      webSocketUrl: endpoint.webSocketUrl,
      targetId: null,
      created: false,
      endpoint: endpoint.webSocketUrl,
    }
  }

  try {
    const target = await createPageTarget(endpoint.origin)
    return {
      webSocketUrl: target.webSocketDebuggerUrl,
      targetId: target.id,
      created: true,
      endpoint: endpoint.origin,
    }
  } catch (creationError) {
    const target = await getExistingPageTarget(endpoint.origin)
    if (!target) throw creationError
    return {
      webSocketUrl: target.webSocketDebuggerUrl,
      targetId: target.id,
      created: false,
      endpoint: endpoint.origin,
      warning: `Could not create an isolated target; reusing ${target.url}`,
    }
  }
}

export class CdpClient {
  constructor(socket) {
    this.socket = socket
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
  }

  static async connect(webSocketUrl) {
    requireRuntimeFeatures()
    const socket = new WebSocket(webSocketUrl)
    const client = new CdpClient(socket)

    await new Promise((resolve, reject) => {
      const onOpen = () => {
        socket.removeEventListener('error', onError)
        resolve()
      }
      const onError = (event) => {
        socket.removeEventListener('open', onOpen)
        reject(event.error ?? new Error(`Could not connect to ${webSocketUrl}`))
      }
      socket.addEventListener('open', onOpen, { once: true })
      socket.addEventListener('error', onError, { once: true })
    })

    socket.addEventListener('message', (event) => client.#onMessage(event))
    socket.addEventListener('close', () => client.#onClose())
    return client
  }

  #onMessage(event) {
    const message = JSON.parse(event.data)
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id)
      this.pending.delete(message.id)
      if (message.error) {
        pending.reject(new Error(`${message.error.message} (${message.error.code})`))
      } else {
        pending.resolve(message.result)
      }
      return
    }

    for (const listener of this.listeners.get(message.method) ?? []) {
      listener(message.params)
    }
  }

  #onClose() {
    for (const { reject } of this.pending.values()) {
      reject(new Error('CDP WebSocket closed while a command was pending'))
    }
    this.pending.clear()
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set()
    listeners.add(listener)
    this.listeners.set(method, listeners)
    return () => listeners.delete(listener)
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ??
          response.exceptionDetails.text ??
          'Runtime.evaluate failed'
      )
    }
    return response.result?.value
  }

  close() {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close()
  }
}

export async function waitForPage(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastState = null
  while (Date.now() < deadline) {
    try {
      lastState = await client.evaluate(`(() => {
        const canvas = [...document.querySelectorAll('canvas')]
          .sort((a, b) => b.width * b.height - a.width * a.height)[0]
        return {
          readyState: document.readyState,
          canvas: canvas ? {
            width: canvas.width,
            height: canvas.height,
            clientWidth: canvas.clientWidth,
            clientHeight: canvas.clientHeight
          } : null,
          probe: Boolean(window.__qualityEvidence),
          url: location.href
        }
      })()`)
      if (
        lastState?.readyState === 'complete' &&
        lastState.canvas?.width > 0 &&
        lastState.canvas?.height > 0 &&
        lastState.probe
      ) {
        return lastState
      }
    } catch {
      // Navigation destroys the old execution context; retry in the new one.
    }
    await sleep(100)
  }
  throw new Error(`Page did not become capture-ready in ${timeoutMs}ms: ${JSON.stringify(lastState)}`)
}

export { sleep }
