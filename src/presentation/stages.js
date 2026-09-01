const defineStage = (id, definition) =>
  Object.freeze({ id, ...definition })

/**
 * Atomic structural contexts available to the talk.
 *
 * A stage is more than a room: it declares the sets, dressing,
 * representations, and lighting intent that must change together behind the
 * hero glass. Numeric emphasis and animation remain slide cues so this catalog
 * does not grow a new stage for every beat.
 */
export const STAGES = Object.freeze({
  home: defineStage('home', {
    sets: ['hero-monitor', 'home-room'],
    dressing: ['home-props', 'dust'],
    representations: ['terminal-glass'],
    lighting: 'home-night',
    swapGate: 'hero-glass',
  }),
  cubicle: defineStage('cubicle', {
    sets: ['hero-monitor', 'cubicle-room'],
    dressing: ['office-details', 'office-props', 'dust'],
    representations: ['terminal-glass', 'cubicle-agents'],
    lighting: 'office-exposed',
    swapGate: 'hero-glass',
  }),
  wall: defineStage('wall', {
    sets: ['hero-monitor', 'wall-rack'],
    dressing: [],
    representations: ['terminal-glass', 'wall-agents'],
    lighting: 'agent-wall',
    swapGate: 'hero-glass',
  }),
  phosphor: defineStage('phosphor', {
    sets: [],
    dressing: [],
    representations: ['terminal-glass', 'phosphor-field'],
    lighting: 'self-lit',
    swapGate: 'hero-glass',
  }),
})

export const STAGE_IDS = Object.freeze(Object.keys(STAGES))

export function getStage(id) {
  const stage = STAGES[id]
  if (!stage) throw new Error(`Unknown presentation stage "${id}"`)
  return stage
}
