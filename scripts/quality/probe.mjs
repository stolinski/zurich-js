/*
 * This file is serialized and injected with Page.addScriptToEvaluateOnNewDocument.
 * Keep bootstrapQualityProbe self-contained: it cannot import anything in-page.
 */
function bootstrapQualityProbe(options) {
  const VERSION = 1
  const now = () => performance.now()
  const clone = (value) => JSON.parse(JSON.stringify(value))
  const cap = (items, limit = 5000) => {
    if (items.length >= limit) items.shift()
  }

  const webgl = {
    status: options.webglProbe === 'off' ? 'disabled' : 'available',
    mode: options.webglProbe,
    contexts: 0,
    createdPrograms: 0,
    deletedPrograms: 0,
    createdTextures: 0,
    deletedTextures: 0,
    textureUploads: 0,
    textureUploadPixels: 0,
    mipmapGenerations: 0,
    drawCalls: 0,
    triangles: 0,
    events: [],
    errors: [],
  }

  let active = null
  let lastRafTimestamp = null
  const keydowns = []
  const indexChanges = []
  const longTasks = []

  function recordWebgl(type, details = {}) {
    if (!active || options.webglProbe === 'off') return
    cap(webgl.events)
    webgl.events.push({ type, t: now(), ...details })
  }

  function sourceSize(args, method) {
    const subImage = method.includes('SubImage')
    const widthIndex = subImage ? 4 : 3
    const heightIndex = subImage ? 5 : 4
    // Width/height overloads carry 9+ arguments. Source overloads carry a
    // canvas/image/typed array at the end; treating xOffset/format as dimensions
    // used to produce nonsense such as 0×6408 for canvas uploads.
    if (
      args.length >= 9 &&
      typeof args[widthIndex] === 'number' &&
      typeof args[heightIndex] === 'number'
    ) {
      return {
        width: args[widthIndex],
        height: args[heightIndex],
        sourceType: 'explicit-dimensions',
      }
    }
    const source = args[args.length - 1]
    const width = source?.videoWidth ?? source?.naturalWidth ?? source?.width
    const height = source?.videoHeight ?? source?.naturalHeight ?? source?.height
    return {
      width: Number.isFinite(width) ? width : null,
      height: Number.isFinite(height) ? height : null,
      sourceType: source?.constructor?.name ?? typeof source,
      sourceUrl: source?.currentSrc ?? source?.src ?? null,
    }
  }

  function trianglesFor(mode, count, instances = 1) {
    const n = Number(count) || 0
    const copies = Number(instances) || 1
    if (mode === 0x0004) return Math.floor(n / 3) * copies
    if (mode === 0x0005 || mode === 0x0006) return Math.max(0, n - 2) * copies
    return 0
  }

  function patchMethod(prototype, name, wrap) {
    const original = prototype?.[name]
    if (typeof original !== 'function' || original.__qualityWrapped) return
    const replacement = wrap(original)
    Object.defineProperty(replacement, '__qualityWrapped', { value: true })
    try {
      prototype[name] = replacement
    } catch (error) {
      webgl.errors.push(`${name}: ${error.message}`)
    }
  }

  function installWebglProbe() {
    if (options.webglProbe === 'off') return
    const prototypes = [
      globalThis.WebGLRenderingContext?.prototype,
      globalThis.WebGL2RenderingContext?.prototype,
    ].filter(Boolean)

    const canvasGetContext = globalThis.HTMLCanvasElement?.prototype?.getContext
    if (canvasGetContext && !canvasGetContext.__qualityWrapped) {
      const replacement = function qualityGetContext(type, ...args) {
        const context = canvasGetContext.call(this, type, ...args)
        if (context && /^webgl2?$/.test(String(type))) webgl.contexts += 1
        return context
      }
      Object.defineProperty(replacement, '__qualityWrapped', { value: true })
      globalThis.HTMLCanvasElement.prototype.getContext = replacement
    }

    for (const prototype of prototypes) {
      patchMethod(prototype, 'createProgram', (original) => function qualityCreateProgram(...args) {
        const result = original.apply(this, args)
        webgl.createdPrograms += 1
        recordWebgl('createProgram')
        return result
      })
      patchMethod(prototype, 'deleteProgram', (original) => function qualityDeleteProgram(program) {
        if (program) webgl.deletedPrograms += 1
        recordWebgl('deleteProgram')
        return original.call(this, program)
      })
      patchMethod(prototype, 'createTexture', (original) => function qualityCreateTexture(...args) {
        const result = original.apply(this, args)
        webgl.createdTextures += 1
        recordWebgl('createTexture')
        return result
      })
      patchMethod(prototype, 'deleteTexture', (original) => function qualityDeleteTexture(texture) {
        if (texture) webgl.deletedTextures += 1
        recordWebgl('deleteTexture')
        return original.call(this, texture)
      })
      for (const method of ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D']) {
        patchMethod(prototype, method, (original) => function qualityTextureUpload(...args) {
          const size = sourceSize(args, method)
          webgl.textureUploads += 1
          if (size.width && size.height) webgl.textureUploadPixels += size.width * size.height
          recordWebgl(method, size)
          return original.apply(this, args)
        })
      }
      patchMethod(prototype, 'generateMipmap', (original) => function qualityGenerateMipmap(...args) {
        webgl.mipmapGenerations += 1
        recordWebgl('generateMipmap')
        return original.apply(this, args)
      })

      if (options.webglProbe === 'full') {
        patchMethod(prototype, 'drawArrays', (original) => function qualityDrawArrays(mode, first, count) {
          webgl.drawCalls += 1
          webgl.triangles += trianglesFor(mode, count)
          return original.call(this, mode, first, count)
        })
        patchMethod(prototype, 'drawElements', (original) => function qualityDrawElements(mode, count, type, offset) {
          webgl.drawCalls += 1
          webgl.triangles += trianglesFor(mode, count)
          return original.call(this, mode, count, type, offset)
        })
        patchMethod(prototype, 'drawArraysInstanced', (original) => function qualityDrawArraysInstanced(mode, first, count, instances) {
          webgl.drawCalls += 1
          webgl.triangles += trianglesFor(mode, count, instances)
          return original.call(this, mode, first, count, instances)
        })
        patchMethod(prototype, 'drawElementsInstanced', (original) => function qualityDrawElementsInstanced(mode, count, type, offset, instances) {
          webgl.drawCalls += 1
          webgl.triangles += trianglesFor(mode, count, instances)
          return original.call(this, mode, count, type, offset, instances)
        })
      }
    }
  }

  function webglSnapshot() {
    return {
      status: webgl.status,
      mode: webgl.mode,
      contexts: webgl.contexts,
      createdPrograms: webgl.createdPrograms,
      deletedPrograms: webgl.deletedPrograms,
      livePrograms: webgl.createdPrograms - webgl.deletedPrograms,
      createdTextures: webgl.createdTextures,
      deletedTextures: webgl.deletedTextures,
      liveTextures: webgl.createdTextures - webgl.deletedTextures,
      textureUploads: webgl.textureUploads,
      textureUploadPixels: webgl.textureUploadPixels,
      mipmapGenerations: webgl.mipmapGenerations,
      drawCalls: webgl.drawCalls,
      triangles: webgl.triangles,
      errors: [...webgl.errors],
    }
  }

  function subtractWebgl(after, before) {
    if (after.status !== 'available') return after
    const result = { status: after.status, mode: after.mode, errors: after.errors }
    for (const key of [
      'createdPrograms',
      'deletedPrograms',
      'livePrograms',
      'createdTextures',
      'deletedTextures',
      'liveTextures',
      'textureUploads',
      'textureUploadPixels',
      'mipmapGenerations',
      'drawCalls',
      'triangles',
    ]) {
      result[key] = after[key] - before[key]
    }
    return result
  }

  function findRenderer() {
    const explicit = [
      ['window.__renderer', globalThis.__renderer],
      ['window.__gl', globalThis.__gl],
      ['window.__threeRenderer', globalThis.__threeRenderer],
      ['window.__r3f.gl', globalThis.__r3f?.gl],
      ['window.__deck.renderer', globalThis.__deck?.renderer],
    ]
    for (const [source, candidate] of explicit) {
      if (candidate?.isWebGLRenderer && candidate.info) return { source, renderer: candidate }
    }

    // Some authoring builds intentionally expose a renderer under a custom
    // global. Only accept Three's explicit marker; never guess by object shape.
    for (const key of Object.getOwnPropertyNames(globalThis)) {
      if (key.startsWith('__quality')) continue
      try {
        const candidate = globalThis[key]
        if (candidate?.isWebGLRenderer && candidate.info) {
          return { source: `window.${key}`, renderer: candidate }
        }
      } catch {
        // Window accessors can throw; they are not diagnostic seams.
      }
    }
    return null
  }

  function rendererSnapshot() {
    const found = findRenderer()
    if (!found) {
      return {
        status: 'unsupported',
        reason: 'No exposed THREE.WebGLRenderer with renderer.info was found.',
      }
    }
    const info = found.renderer.info
    return {
      status: 'available',
      source: found.source,
      programs: Array.isArray(info.programs) ? info.programs.length : null,
      memory: {
        geometries: info.memory?.geometries ?? null,
        textures: info.memory?.textures ?? null,
      },
      render: {
        frame: info.render?.frame ?? null,
        calls: info.render?.calls ?? null,
        triangles: info.render?.triangles ?? null,
        points: info.render?.points ?? null,
        lines: info.render?.lines ?? null,
      },
      shadowMap: found.renderer.shadowMap
        ? {
            autoUpdate: found.renderer.shadowMap.autoUpdate,
            needsUpdate: found.renderer.shadowMap.needsUpdate,
            type: found.renderer.shadowMap.type,
          }
        : { status: 'unsupported', reason: 'Renderer has no shadowMap diagnostics.' },
    }
  }

  function declaredStageSnapshot() {
    const candidates = [
      ['window.__deck.slide.stage', globalThis.__deck?.slide?.stage],
      ['window.__deck.current().stage', (() => {
        try { return globalThis.__deck?.current?.()?.stage } catch { return undefined }
      })()],
      ['window.__slide.stage', globalThis.__slide?.stage],
      ['window.__deck.store.state.slide.stage', globalThis.__deck?.store?.getState?.()?.slide?.stage],
    ]
    const match = candidates.find(([, value]) => typeof value === 'string')
    return match
      ? { status: 'available', source: match[0], value: match[1] }
      : {
          status: 'unsupported',
          reason: 'The current slide declaration is not exposed by this build.',
        }
  }

  function displayedStageSnapshot() {
    try {
      const value = globalThis.__stage?.showing?.()
      if (typeof value === 'string') {
        return { status: 'available', source: 'window.__stage.showing()', value }
      }
    } catch {
      // Fall through to an explicit unsupported result.
    }
    return {
      status: 'unsupported',
      reason: 'The displayed StageDirector stage is not exposed by this build.',
    }
  }

  function deckSnapshot() {
    try {
      const state = globalThis.__deck?.store?.getState?.()
      if (state && Number.isInteger(state.index)) {
        return {
          status: 'available',
          source: 'window.__deck.store',
          index: state.index,
          count: state.count ?? null,
          step: state.step ?? null,
        }
      }
    } catch {
      // URL remains authoritative in production.
    }
    return {
      status: 'partial',
      source: 'location.search',
      slide: new URLSearchParams(location.search).get('slide'),
      reason: 'The Zustand store is not exposed; URL slide id is available without a numeric index.',
    }
  }

  function transitionSnapshot() {
    try {
      const transition = globalThis.__stage?.transition?.()
      if (transition && Number.isInteger(transition.index)) {
        return { status: 'available', source: 'window.__stage.transition()', ...clone(transition) }
      }
    } catch {
      // Fall through to an explicit unsupported result.
    }
    return {
      status: 'unsupported',
      reason: 'The render-clock camera transition is not exposed by this build.',
    }
  }

  function cameraSnapshot() {
    const camera = globalThis.__cam
    if (!camera?.isCamera) {
      return {
        status: 'unsupported',
        reason: 'The active Three camera is not exposed by this build.',
      }
    }
    return {
      status: 'available',
      source: 'window.__cam',
      position: camera.position?.toArray?.() ?? null,
      quaternion: camera.quaternion?.toArray?.() ?? null,
      zoom: camera.zoom ?? null,
      fov: camera.fov ?? null,
    }
  }

  function uniformValue(container, name) {
    const value = container?.[name]?.value
    return Number.isFinite(value) ? value : null
  }

  function crtSnapshot() {
    const crt = globalThis.__crt
    if (!crt) {
      return { status: 'unsupported', reason: 'CRT uniforms are not exposed by this build.' }
    }
    return {
      status: 'available',
      source: 'window.__crt',
      tube: uniformValue(crt, 'uTube'),
      lines: uniformValue(crt, 'uLines'),
      focus: uniformValue(crt, 'uFocus'),
      maskStrength: uniformValue(crt, 'uMaskStrength'),
      maskPitchPx: uniformValue(crt, 'uMaskPitchPx'),
      curvature: uniformValue(crt, 'uCurvature'),
      bezel: uniformValue(crt, 'uBezel'),
      halation: uniformValue(crt, 'uHalation'),
      vignette: uniformValue(crt, 'uVignette'),
      handoffOpacity: uniformValue(crt, 'uHandoffOpacity'),
      caretVisible: uniformValue(crt, 'uCaretVisible'),
    }
  }

  function phosphorSnapshot() {
    const phosphor = globalThis.__phosphor
    if (!phosphor) {
      return { status: 'unsupported', reason: 'Phosphor uniforms are not exposed by this build.' }
    }
    return {
      status: 'available',
      source: 'window.__phosphor',
      opacity: uniformValue(phosphor, 'uOpacity'),
      depth: uniformValue(phosphor, 'uDepth'),
    }
  }

  function canvasSnapshot() {
    const canvases = [...document.querySelectorAll('canvas')]
    const canvas = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0]
    return canvas
      ? {
          status: 'available',
          count: canvases.length,
          width: canvas.width,
          height: canvas.height,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight,
        }
      : { status: 'unsupported', reason: 'No canvas was found.' }
  }

  function antialiasingSnapshot() {
    try {
      return globalThis.__presentationQuality?.snapshot?.().antialiasing ?? {
        status: 'unsupported',
        reason: 'AA diagnostics are not exposed by this build.',
      }
    } catch (error) {
      return { status: 'unsupported', reason: String(error) }
    }
  }

  function snapshot() {
    return {
      t: now(),
      url: location.href,
      timeOrigin: performance.timeOrigin,
      deck: deckSnapshot(),
      declaredStage: declaredStageSnapshot(),
      displayedStage: displayedStageSnapshot(),
      transition: transitionSnapshot(),
      camera: cameraSnapshot(),
      crt: crtSnapshot(),
      phosphor: phosphorSnapshot(),
      rendererInfo: rendererSnapshot(),
      webglInterception: webglSnapshot(),
      canvas: canvasSnapshot(),
      antialiasing: antialiasingSnapshot(),
    }
  }

  let scratch = null
  let scratchContext = null
  function visualPixels() {
    if (options.visualProbe === 'off') {
      return { status: 'disabled', reason: 'Disabled with --visual-probe off.' }
    }
    const canvas = [...document.querySelectorAll('canvas')]
      .sort((a, b) => b.width * b.height - a.width * a.height)[0]
    if (!canvas) return { status: 'unsupported', reason: 'No canvas to sample.' }
    try {
      scratch ??= Object.assign(document.createElement('canvas'), {
        width: options.visualWidth,
        height: options.visualHeight,
      })
      scratchContext ??= scratch.getContext('2d', { willReadFrequently: true })
      if (!scratchContext) {
        return { status: 'unsupported', reason: 'Could not create a 2D sampling context.' }
      }
      const started = now()
      scratchContext.drawImage(canvas, 0, 0, scratch.width, scratch.height)
      const pixels = scratchContext.getImageData(0, 0, scratch.width, scratch.height).data
      let rgbSum = 0
      for (let index = 0; index < pixels.length; index += 4) {
        rgbSum += pixels[index] + pixels[index + 1] + pixels[index + 2]
      }
      if (rgbSum === 0) {
        return {
          status: 'unsupported',
          reason:
            'Canvas drawImage readback returned no visible RGB pixels (common with a non-preserved WebGL buffer).',
        }
      }
      return {
        status: 'available',
        pixels: new Uint8ClampedArray(pixels),
        readbackMs: now() - started,
      }
    } catch (error) {
      return { status: 'unsupported', reason: `Canvas readback failed: ${error.message}` }
    }
  }

  function pixelDelta(a, b) {
    if (!a || !b || a.length !== b.length) return null
    let total = 0
    let samples = 0
    for (let index = 0; index < a.length; index += 4) {
      total += Math.abs(a[index] - b[index])
      total += Math.abs(a[index + 1] - b[index + 1])
      total += Math.abs(a[index + 2] - b[index + 2])
      samples += 3
    }
    return samples ? total / samples : 0
  }

  function maxArrayDelta(current, initial) {
    if (!Array.isArray(current) || !Array.isArray(initial)) return 0
    let delta = 0
    for (let index = 0; index < Math.min(current.length, initial.length); index++) {
      delta = Math.max(delta, Math.abs(current[index] - initial[index]))
    }
    return delta
  }

  function observableMovement(current, initial) {
    if (!current || !initial) return null
    const cameraPosition = maxArrayDelta(
      current.camera?.position,
      initial.camera?.position
    )
    const cameraQuaternion = maxArrayDelta(
      current.camera?.quaternion,
      initial.camera?.quaternion
    )
    if (Math.max(cameraPosition, cameraQuaternion) > 1e-7) {
      return {
        source: 'camera',
        delta: Math.max(cameraPosition, cameraQuaternion),
      }
    }
    for (const [source, values, baseline] of [
      ['crt', current.crt, initial.crt],
      ['phosphor', current.phosphor, initial.phosphor],
    ]) {
      if (!values || !baseline) continue
      let delta = 0
      for (const [key, value] of Object.entries(values)) {
        if (key === 'caretVisible') continue
        if (typeof value === 'number' && typeof baseline[key] === 'number') {
          delta = Math.max(delta, Math.abs(value - baseline[key]))
        }
      }
      if (delta > 1e-5) return { source, delta }
    }
    return null
  }

  function frameObservables() {
    const value = { t: now() }
    const camera = cameraSnapshot()
    const crt = crtSnapshot()
    const phosphor = phosphorSnapshot()
    const displayedStage = displayedStageSnapshot()
    const transition = transitionSnapshot()
    if (camera.status === 'available') value.camera = camera
    if (crt.status === 'available') value.crt = crt
    if (phosphor.status === 'available') value.phosphor = phosphor
    if (displayedStage.status === 'available') value.displayedStage = displayedStage.value
    if (transition.status === 'available') value.transition = transition
    return Object.keys(value).length > 1 ? value : null
  }

  function raf(timestamp) {
    if (active) {
      if (lastRafTimestamp !== null) {
        active.raf.push({ t: timestamp, deltaMs: timestamp - lastRafTimestamp })
      }
      lastRafTimestamp = timestamp

      const observable = frameObservables()
      if (observable) {
        active.observables.push(observable)
        if (!active.firstVisibleMovement && active.visual.status !== 'available') {
          const movement = observableMovement(observable, active.startSnapshot)
          if (movement) {
            active.firstVisibleMovement = {
              t: now(),
              method: `${movement.source} diagnostic delta`,
              delta: movement.delta,
              intrusive: false,
            }
          }
        }
      }

      if (!active.firstVisibleMovement && active.visual.status === 'available') {
        const sample = visualPixels()
        if (sample.status !== 'available') {
          active.visual = sample
        } else {
          const delta = pixelDelta(active.visual.baseline, sample.pixels)
          active.visual.samples.push({
            t: now(),
            deltaFromBaseline255: delta,
            readbackMs: sample.readbackMs,
          })
          if (delta >= options.motionThreshold) {
            active.firstVisibleMovement = {
              t: now(),
              deltaFromBaseline255: delta,
              method: `${options.visualWidth}x${options.visualHeight} canvas RGB MAE`,
              threshold255: options.motionThreshold,
              intrusive: true,
            }
            // Stop synchronous GPU readbacks after finding the first changed
            // frame. The rest of the rAF trace stays substantially less invasive.
            active.visual.baseline = null
          }
        }
      }
    }
    requestAnimationFrame(raf)
  }

  function startTrace(meta = {}) {
    const baseline = visualPixels()
    active = {
      meta,
      startedAt: now(),
      keydownStart: keydowns.length,
      indexChangeStart: indexChanges.length,
      longTaskStart: longTasks.length,
      webglEventStart: webgl.events.length,
      webglStart: webglSnapshot(),
      startSnapshot: snapshot(),
      raf: [],
      observables: [],
      firstVisibleMovement: null,
      visual:
        baseline.status === 'available'
          ? {
              status: 'available',
              method: `${options.visualWidth}x${options.visualHeight} canvas RGB MAE`,
              intrusive: true,
              baseline: baseline.pixels,
              baselineReadbackMs: baseline.readbackMs,
              samples: [],
            }
          : baseline,
    }
    lastRafTimestamp = null
    return { startedAt: active.startedAt, visualStatus: active.visual.status }
  }

  function stopTrace() {
    if (!active) throw new Error('No quality trace is active.')
    const stoppedAt = now()
    const after = webglSnapshot()
    const trace = {
      meta: active.meta,
      timeOrigin: performance.timeOrigin,
      startedAt: active.startedAt,
      stoppedAt,
      elapsedMs: stoppedAt - active.startedAt,
      startSnapshot: active.startSnapshot,
      endSnapshot: snapshot(),
      keydowns: keydowns.slice(active.keydownStart),
      indexChanges: indexChanges.slice(active.indexChangeStart),
      firstVisibleMovement: active.firstVisibleMovement ?? {
        status: 'unsupported',
        reason:
          active.visual.status === 'available'
            ? 'No sampled frame exceeded the configured visible-motion threshold.'
            : active.visual.reason,
      },
      visualProbe: {
        status: active.visual.status,
        method: active.visual.method,
        intrusive: active.visual.intrusive ?? false,
        baselineReadbackMs: active.visual.baselineReadbackMs ?? null,
        samples: active.visual.samples ?? [],
      },
      raf: active.raf,
      observables: active.observables,
      longTasks: longTasks.slice(active.longTaskStart),
      rendererInfo: {
        start: active.startSnapshot.rendererInfo,
        end: snapshot().rendererInfo,
      },
      webglInterception: {
        start: active.webglStart,
        end: after,
        delta: subtractWebgl(after, active.webglStart),
        events: webgl.events.slice(active.webglEventStart),
      },
      settledTime: {
        status: 'unsupported',
        reason:
          'The app exposes no production settled event. Screenshot timing is a configured fixed wait, not an invented landing time.',
      },
    }
    active = null
    lastRafTimestamp = null
    return clone(trace)
  }

  const originalReplaceState = history.replaceState.bind(history)
  history.replaceState = function qualityReplaceState(state, unused, url) {
    const before = location.href
    const result = originalReplaceState(state, unused, url)
    const after = location.href
    if (before !== after) indexChanges.push({ t: now(), before, after, method: 'history.replaceState' })
    return result
  }

  addEventListener(
    'keydown',
    (event) => {
      cap(keydowns)
      keydowns.push({
        t: now(),
        key: event.key,
        code: event.code,
        repeat: event.repeat,
        defaultPreventedAtCapture: event.defaultPrevented,
        slideBefore: new URLSearchParams(location.search).get('slide'),
      })
    },
    true
  )

  let longTaskStatus = 'unsupported'
  let longTaskReason = 'Long Task API is unavailable in this Chrome build.'
  if (globalThis.PerformanceObserver?.supportedEntryTypes?.includes('longtask')) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          cap(longTasks)
          longTasks.push({
            name: entry.name,
            startTime: entry.startTime,
            durationMs: entry.duration,
            attribution: (entry.attribution ?? []).map((item) => ({
              name: item.name,
              containerType: item.containerType,
              containerName: item.containerName,
              containerId: item.containerId,
              containerSrc: item.containerSrc,
            })),
          })
        }
      })
      observer.observe({ type: 'longtask', buffered: true })
      longTaskStatus = 'available'
      longTaskReason = null
    } catch (error) {
      longTaskReason = error.message
    }
  }

  installWebglProbe()
  requestAnimationFrame(raf)

  Object.defineProperty(globalThis, '__qualityEvidence', {
    configurable: false,
    enumerable: false,
    value: {
      version: VERSION,
      options: clone(options),
      startTrace,
      stopTrace,
      snapshot,
      diagnostics: () => ({
        version: VERSION,
        longTasks: { status: longTaskStatus, reason: longTaskReason },
        webgl: webglSnapshot(),
      }),
    },
  })
}

export function qualityProbeSource(options) {
  return `;(${bootstrapQualityProbe.toString()})(${JSON.stringify(options)});`
}
