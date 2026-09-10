import { slides } from '../slides/index.js'
import { resolveSession } from '../terminal/playback.js'
import { getTerminalVisual } from '../terminal/visuals.js'

/** Step kinds that belong to the agent transcript rather than to a visual. */
const TRANSCRIPT_STEPS = new Set(['user', 'say', 'think', 'tool', 'note', 'gap'])

/** One line of what a visual puts on the glass. */
function excerptOf(visual) {
  switch (visual.kind) {
    case 'title':
    case 'warning':
    case 'walk':
      return visual.text
    case 'asset':
      return visual.headline ? `${visual.headline} · ${visual.label}` : visual.label
    case 'prompt':
      return `${visual.header} · ${visual.screens.length} screens`
    case 'tweet':
      return `${visual.handle} — ${visual.paragraphs[0]}`
    case 'chart':
      return `${visual.title} · ${visual.detail}`
    case 'statement':
      return visual.lines.map((line) => line.text).join(' / ')
    case 'stat':
      return [visual.value?.toLocaleString?.('en-US') ?? visual.value, visual.suffix, visual.label]
        .filter(Boolean)
        .join(' ')
    case 'slot':
      return `${visual.prompt} · ${visual.pulls.length} pulls`
    case 'grill':
      return `${visual.title} · ${visual.questions.length} questions`
    case 'quote':
      return `“${visual.text}”`
    case 'diagram':
      return visual.caption
    default:
      return ''
  }
}

/** The phosphor field's three authored states, by the slide's cue. */
function phosphorState(cue) {
  if (cue.decay >= 1) return 'loss · connections die one by one'
  if (cue.form >= 1) return 'synapse · the fireflies settle into the network'
  return 'dream · a cloud of fireflies'
}

/**
 * What is on the glass for slide `index`: the visual kinds its session draws
 * (or the one it holds from an earlier slide), how many Enter presses it
 * takes, and a line of the last thing it shows. Inside the glass the picture
 * is the phosphor field itself, not the held transcript, so those slides
 * report the field's state instead.
 */
function glassOf(index) {
  const cue = slides[index].phosphor
  if (cue && cue.screenOpacity === 0) {
    return { kinds: ['phosphor field'], excerpt: phosphorState(cue), held: false, presses: 0 }
  }
  const showing = resolveSession(slides, index, Number.MAX_SAFE_INTEGER)
  if (!showing) return { kinds: [], excerpt: '', held: false, presses: 0 }
  const visuals = showing.script
    .filter((step) => step.id)
    .map((step) => getTerminalVisual(step.id))
  const kinds = [...new Set(visuals.map((visual) => visual.kind))]
  const transcript = showing.script.filter((step) => TRANSCRIPT_STEPS.has(step.kind))
  if (transcript.length) kinds.unshift('harness')
  const last = visuals[visuals.length - 1]
  const excerpt = last
    ? excerptOf(last)
    : (transcript.find((step) => step.kind === 'user')?.text ?? '')
  return {
    kinds,
    excerpt,
    held: !showing.live,
    presses: showing.live && showing.script.length > 1 ? showing.script.length : 0,
  }
}

export function SlideIndex() {
  return (
    <main className="slide-index">
      <h1>
        {getTerminalVisual('talk-title').text} · {slides.length} slides
      </h1>
      <ol>
        {slides.map((slide, index) => {
          const glass = glassOf(index)
          const flat = (slide.crt?.tube ?? 1) === 0
          const tags = [
            ...glass.kinds,
            glass.held && 'holds',
            slide.stage,
            flat ? 'flat' : slide.camera?.fillScreen ? 'tube' : 'room',
            slide.autoplay && 'autoplay',
            glass.presses && `${glass.presses} enters`,
          ].filter(Boolean)
          return (
            <li key={slide.id} data-stage={slide.stage}>
              <a href={`?slide=${slide.id}`}>
                <span className="slide-index__number">{index}</span>
                <strong>{slide.id}</strong>
                <span className="slide-index__tags">{tags.join(' · ')}</span>
                {glass.excerpt && <p>{glass.excerpt}</p>}
              </a>
              <a className="slide-index__flat" href={`?flat&slide=${slide.id}`}>
                ?flat
              </a>
            </li>
          )
        })}
      </ol>
    </main>
  )
}
