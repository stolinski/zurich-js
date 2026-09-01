const PROFILES = Object.freeze({
  fxaa: Object.freeze({ id: 'fxaa', dpr: 1, multisampling: 0, fxaa: true }),
  'msaa2-dpr125': Object.freeze({
    id: 'msaa2-dpr125',
    dpr: 1.25,
    multisampling: 2,
    fxaa: false,
  }),
  'msaa4-dpr1': Object.freeze({
    id: 'msaa4-dpr1',
    dpr: 1,
    multisampling: 4,
    fxaa: false,
  }),
  'msaa2-fxaa': Object.freeze({
    id: 'msaa2-fxaa',
    dpr: 1,
    multisampling: 2,
    fxaa: true,
  }),
  'ssaa4-reference': Object.freeze({
    id: 'ssaa4-reference',
    dpr: 2,
    multisampling: 0,
    fxaa: false,
    reference: true,
  }),
})

function qualityParams() {
  return typeof window === 'undefined'
    ? null
    : new URLSearchParams(window.location.search)
}

function resolveQualityProfile() {
  if (typeof window === 'undefined') return null
  const params = qualityParams()
  if (!params.has('quality') || !params.has('aa')) return null
  const id = params.get('aa')
  const profile = PROFILES[id]
  if (!profile) {
    throw new Error(
      `Unknown quality AA profile "${id}". Expected one of: ${Object.keys(PROFILES).join(', ')}`
    )
  }
  return profile
}

function resolveHandoffMode() {
  const params = qualityParams()
  if (!params?.has('quality') || !params.has('handoff')) return null
  const mode = params.get('handoff')
  if (!['shader', 'geometry'].includes(mode)) {
    throw new Error('Quality handoff mode must be "shader" or "geometry"')
  }
  return mode
}

export const QUALITY_AA_PROFILES = PROFILES
export const QUALITY_AA_PROFILE = resolveQualityProfile()
export const QUALITY_HANDOFF_MODE = resolveHandoffMode()
