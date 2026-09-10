/**
 * ─────────────────── THE FAKE AGENT SESSION ───────────────────
 * The thing on the screen is an AI coding harness that does not exist. It is a
 * script: a list of steps, advanced one at a time by the presenter. Tap Enter
 * and the next step plays—a visual loads, a line types itself, the agent thinks,
 * a tool runs, and an
 * answer streams in. You talk over it.
 *
 * Why scripted rather than live: the screen is a canvas texture inside a 3D
 * scene (there is no DOM up there to be interactive), and more importantly a
 * talk needs the same beat to land the same way at every rehearsal. The agent
 * being fake is also the point — this is a talk about what these tools do to
 * you, performed by a mock of one.
 *
 * COPY IS PLACEHOLDER. The shape is right, the words are Scott's to write.
 *
 * Step kinds:
 *   user  { text }                     types out, character by character
 *   say   { text }                     agent prose, streams in by word
 *   think { label }                    spinner, then collapses to an elapsed time
 *   tool  { name, arg, out[] }         a tool call and its output
 *   note  { text }                     dim chrome (banners, token counts)
 *   gap   {}                           a blank line / breathing beat
 *   visual { id, reveal? }             a catalog visual replaces the transcript;
 *                                      `reveal: 'title'` draws a chart's headline
 *                                      alone, the question before its answer
 *   plot   { id }                      the chart named by `id` grows its plot in
 *                                      over the step, under the title already up
 *   pull   { id, pull }                one pull of a catalog slot machine; the
 *                                      reels spin for the length of the step
 *   grill  { id, question }            the brain flips and lands, then asks
 *                                      question `question` (null: nothing left)
 *   ask    { id, question }            one screen of a catalog prompt types
 *                                      itself, large (null: the idle prompt)
 *   draw   { id }                      a catalog visual draws itself in over the
 *                                      step, the way the sweep would (a title
 *                                      types, bars grow) — for Enter/autoplay
 *   off    { id }                      the tube shuts off: the visual named by
 *                                      `id` collapses to a line, then to dark
 *   Any step may carry `dwell` seconds for autoplay (useSessionAutoplay).
 * ──────────────────────────────────────────────────────────────
 */

import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'
import { AGENT_WEEK, formatUsageDuration } from '../data/agentUsage.js'
import { CHAR_W, LINE_H, ROWS, SAFE_COLS, font } from './theme.js'
import { getTerminalVisual } from './visuals.js'

/* ─────────────────────────── text wrapping ─────────────────────────── */

const wrapCache = new Map()

/**
 * Wrap to a column count using pretext — real break opportunities, correct for
 * emoji and non-Latin, and it never touches the DOM to measure (which would
 * reflow the page mid-talk). Cached because the painter runs every frame.
 */
function wrap(text, cols) {
  const key = `${cols}\u0000${text}`
  const hit = wrapCache.get(key)
  if (hit) return hit
  const prepared = prepareWithSegments(text, font(400))
  const { lines } = layoutWithLines(prepared, cols * CHAR_W, LINE_H)
  const out = lines.map((l) => l.text)
  wrapCache.set(key, out)
  return out
}

/** Font metrics change once JetBrains Mono lands; anything measured before is wrong. */
export function clearWrapCache() {
  wrapCache.clear()
}

/* ──────────────────────────── step timing ──────────────────────────── */

const CHARS_PER_SEC = 34 // Scott typing — fast, but human
// The survey asking: nobody is performing this typing, the room is reading
// it, so it runs at a machine's pace (Scott, 2026-09-10: "faster").
const ASK_CHARS_PER_SEC = 96
const WORDS_PER_SEC = 9 // the agent streaming
const PULL_SECS = 2.4 // one pull of the slot machine, lever to last reel
const FLIP_SECS = 1.6 // the brain in the air, lift-off to the question
const PLOT_SECS = 0.85 // a chart growing in on Enter, the same beat as the draw sweep
const DRAW_SECS = 1.2 // a visual drawing itself in on a step
const OFF_SECS = 0.9 // a CRT shutting off: collapse to a line, the line to a dot

/** How long a step takes to play out, in seconds. */
export function stepDuration(step) {
  switch (step.kind) {
    case 'user':
      return Math.max(0.5, step.text.length / CHARS_PER_SEC)
    case 'say':
      return Math.max(0.6, step.text.split(/\s+/).length / WORDS_PER_SEC)
    case 'think':
      return step.secs ?? 1.6
    case 'tool':
      return 0.35 + (step.out?.length ?? 0) * 0.11
    case 'visual':
      return 0.01
    case 'pull':
      return PULL_SECS
    case 'grill':
      return FLIP_SECS
    case 'ask': {
      // The idle prompt is instant; a question types at the machine's pace.
      if (step.question === null) return 0.01
      const chars = getTerminalVisual(step.id).screens[step.question].reduce(
        (sum, text) => sum + text.length,
        0
      )
      return Math.max(0.35, chars / ASK_CHARS_PER_SEC)
    }
    case 'plot':
      return PLOT_SECS
    case 'draw':
      return DRAW_SECS
    case 'off':
      return OFF_SECS
    default:
      return 0.25
  }
}

const revealChars = (text, p) => text.slice(0, Math.ceil(text.length * p))

function revealWords(text, p) {
  const words = text.split(' ')
  return words.slice(0, Math.ceil(words.length * p)).join(' ')
}

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/* ───────────────────────── step → display lines ───────────────────────── */

/**
 * Expand one step into display lines. `p` is 0→1 through the step; a finished
 * step is expanded at p = 1. Returns `{ lines, caret }`, where caret carries
 * the TEXT the cursor sits after rather than a column index — the painter
 * measures it, so the block lands exactly against the last glyph no matter
 * what the face's real advance width turns out to be.
 */
function expand(step, p, time) {
  const done = p >= 1
  switch (step.kind) {
    case 'user': {
      const shown = revealChars(step.text, p)
      const text = `YOU    ${shown}`
      return {
        lines: [{ text, role: 'user', weight: 500 }],
        caret: text,
      }
    }

    case 'say': {
      const shown = done ? step.text : revealWords(step.text, p)
      // SAFE_COLS, not the full grid: the tube's barrel warp overscans the outer
      // edge and an oblique camera foreshortens it away. See theme.js.
      const wrapped = wrap(shown, SAFE_COLS - 7)
      return {
        lines: wrapped.map((text, index) => ({
          text: `${index === 0 ? 'AGENT  ' : '       '}${text}`,
          role: 'agent',
        })),
        caret: null,
      }
    }

    case 'think': {
      if (done) {
        const secs = (step.secs ?? 1.6).toFixed(1)
        return {
          lines: [{ text: `AGENT  ${step.label} · ${secs}s`, role: 'meta' }],
          caret: null,
        }
      }
      const frame = SPINNER[Math.floor(time * 12) % SPINNER.length]
      return {
        lines: [{ text: `AGENT  ${frame} ${step.label}…`, role: 'tool' }],
        caret: null,
      }
    }

    case 'tool': {
      const head = {
        text: `TOOL   ${step.name}  ${step.arg ?? ''}`.trimEnd(),
        role: 'tool',
      }
      const out = step.out ?? []
      // Header lands immediately; output pays out over the rest of the step.
      const shown = done ? out.length : Math.floor(Math.max(0, p - 0.2) * 1.25 * out.length)
      const body = out.slice(0, shown).map((text, i) => ({
        text: `       ${i === out.length - 1 ? '└' : '│'} ${text}`,
        role: 'meta',
      }))
      return { lines: [head, ...body], caret: null }
    }

    case 'note':
      return { lines: [{ text: step.text, role: 'meta' }], caret: null }

    case 'gap':
      return { lines: [{ text: '', role: 'meta' }], caret: null }

    default:
      return { lines: [], caret: null }
  }
}

/**
 * Build everything the painter needs for one frame: the visible transcript
 * (last ROWS lines) and where the caret sits.
 *
 * `index` is the step currently playing; `progress` is 0→1 within it. Steps
 * before it are expanded complete.
 */
export function buildFrame(script, index, progress, time, answers = []) {
  const activeStep = script[Math.min(index, script.length - 1)]
  if (activeStep?.kind === 'visual') {
    return {
      lines: [],
      caret: null,
      visual: activeStep.reveal
        ? { ...getTerminalVisual(activeStep.id), reveal: activeStep.reveal }
        : getTerminalVisual(activeStep.id),
    }
  }
  if (activeStep?.kind === 'plot') {
    // The chart grows in over the step; the painter derives every bar from
    // this progress, so the reveal lands identically at every rehearsal and a
    // deep link shows it grown.
    return {
      lines: [],
      caret: null,
      visual: { ...getTerminalVisual(activeStep.id), progress },
    }
  }
  if (activeStep?.kind === 'draw') {
    // The visual draws itself in over the step exactly as the sweep would draw
    // it on a slide change (`draw` is the painters' existing reveal input).
    return {
      lines: [],
      caret: null,
      visual: { ...getTerminalVisual(activeStep.id), draw: progress },
    }
  }
  if (activeStep?.kind === 'off') {
    // The tube shutting off around whatever it was showing.
    return {
      lines: [],
      caret: null,
      visual: { kind: 'off', source: getTerminalVisual(activeStep.id), progress },
    }
  }
  if (activeStep?.kind === 'grill') {
    // Which question is up, how far through the flip that lands it, and every
    // answer given so far (the one for the previous question is stamped on it
    // while the brain is in the air).
    return {
      lines: [],
      caret: null,
      visual: {
        ...getTerminalVisual(activeStep.id),
        question: activeStep.question,
        step: index,
        progress,
        answers,
      },
    }
  }
  if (activeStep?.kind === 'ask') {
    // Which screen is being typed and how far through it; the painter reveals
    // the text from those, so every rehearsal types the same characters at
    // the same moments and a deep link lands on the settled line.
    return {
      lines: [],
      caret: null,
      visual: { ...getTerminalVisual(activeStep.id), question: activeStep.question, progress },
    }
  }
  if (activeStep?.kind === 'pull') {
    // The catalog entry plus which pull this is and how far through it: the
    // painter derives every reel position from those, so the spin is a pure
    // function of progress and lands identically at every rehearsal.
    return {
      lines: [],
      caret: null,
      visual: { ...getTerminalVisual(activeStep.id), pull: activeStep.pull, progress },
    }
  }

  const lines = []
  let caret = null

  for (let i = 0; i <= index && i < script.length; i++) {
    const p = i < index ? 1 : progress
    const { lines: stepLines, caret: prefix } = expand(script[i], p, time)
    // Only the LIVE step owns the cursor. Earlier prompts have been submitted;
    // leaving the caret parked on one of them strands it halfway up a finished
    // transcript.
    if (i === index && prefix != null) {
      caret = { row: lines.length + stepLines.length - 1, prefix }
    }
    lines.push(...stepLines)
  }

  // Between taps the transcript is settled and nothing owns the cursor — but a
  // real CLI is sitting at an idle prompt, and "between taps" is most of the
  // talk, because that's when Scott is speaking. Without this the screen goes
  // dead exactly when the room is looking at it longest.
  //
  // Only once the agent's TURN is over, though: a prompt that appears while a
  // tool is still running claims the agent finished when it hasn't. Look ahead
  // past blank lines — if the next thing that happens is Scott typing, the
  // agent is done and the cursor is waiting on him.
  if (!caret && progress >= 1) {
    let next = index + 1
    while (script[next]?.kind === 'gap') next++
    if (!script[next] || script[next].kind === 'user') {
      lines.push({ text: 'YOU    ', role: 'user', weight: 500 })
      caret = { row: lines.length - 1, prefix: 'YOU    ' }
    }
  }

  // Scroll: keep the tail on screen, and keep the caret's row with it.
  const overflow = Math.max(0, lines.length - ROWS)
  if (caret) caret = { ...caret, row: caret.row - overflow }
  return { lines: lines.slice(overflow), caret }
}

/** Total steps in a script — the presenter taps through these one at a time. */
export const stepCount = (script) => script.length

/* ─────────────────────── OPENING AGENT SESSION ────────────────────────
 * Scott asks the agent about his own usage. It answers honestly. Then he asks
 * the question the whole talk is about, and it thinks — and never answers.
 *
 * SHORT ON PURPOSE. An earlier version ran fifteen beats: a banner, three
 * separate exchanges, a tool call and a spinner for each. That's a sketch, not
 * a cold open — the audience has to sit through the machinery before the point
 * lands. Seven beats—including the ready state—gets to "is that a lot?" while
 * they're still deciding
 * whether this is a real demo, which is exactly where it needs to land.
 *
 * If a beat isn't carrying the argument, cut it. The spinners and banners are
 * texture; the two questions are the content.
 *
 * PLACEHOLDER COPY — the beats are right, the words are Scott's.
 * ────────────────────────────────────────────────────────────────────── */

export const COLD_OPEN = [
  { kind: 'note', text: 'SESSION  usage-audit · ready' },
  { kind: 'user', text: 'how many hours did I spend in here last week?' },
  {
    kind: 'tool',
    name: 'usage.read',
    arg: '--window 7d',
    out: [
      `sessions: ${AGENT_WEEK.sessions}`,
      `active: ${Math.floor(AGENT_WEEK.activeMinutes / 60)}h ${AGENT_WEEK.activeMinutes % 60}m`,
    ],
  },
  {
    kind: 'say',
    text: `You spent ${formatUsageDuration(AGENT_WEEK.activeMinutes)} across ${AGENT_WEEK.sessions} sessions. ${formatUsageDuration(AGENT_WEEK.afterMidnightMinutes)} were after midnight.`,
  },
  { kind: 'gap' },
  { kind: 'user', text: 'is that a lot?' },
  { kind: 'think', label: 'thinking', secs: 2.6 },
]

/**
 * A single catalog visual, as a session. The one-step shape matters: it is what
 * `playback.js` recognises as a distinct content identity, so each of these
 * gets the real undraw/draw sweep when a slide changes to it.
 */
const screen = (id) => Object.freeze([Object.freeze({ kind: 'visual', id })])

export const TITLE_SCREEN = screen('talk-title')
export const SYNTAX_SCREEN = screen('syntax')
export const SENTRY_SCREEN = screen('sentry')
export const QR_SCREEN = screen('qr')
export const QR_CODE_SCREEN = screen('qr-code')
export const ROB = screen('rob')
export const DISCLAIMER_SCREEN = screen('disclaimer')

/**
 * THE CLOSE, performed by the machine (Scott, 2026-09-10): the title comes
 * back on the glass as the camera pulls out into the dark room and holds
 * there for a few seconds; then the tube shuts off — the picture collapses to
 * a line, the line to a dot — and after a moment of real dark two words type
 * themselves on the dead glass. `dwell` is the silence between; the slide is
 * `autoplay`, and one press of Enter or Backspace hands it back.
 */
export const CLOSE = Object.freeze([
  Object.freeze({ kind: 'visual', id: 'talk-title', dwell: 6.5 }),
  Object.freeze({ kind: 'off', id: 'talk-title', dwell: 1.8 }),
  Object.freeze({ kind: 'draw', id: 'thank-you' }),
])
/**
 * The form itself, right after the code that leads to it, asked one screen per
 * Enter. Arrival is the idle prompt (question null), so the presenter owns the
 * timing of every question; the screens come from the catalog entry, so the
 * script and the glass cannot disagree about how many there are.
 */
export const SURVEY_QUESTIONS = Object.freeze([
  Object.freeze({ kind: 'ask', id: 'survey-questions', question: null }),
  ...getTerminalVisual('survey-questions').screens.map((_, question) =>
    Object.freeze({ kind: 'ask', id: 'survey-questions', question })
  ),
])

// Act markers for the glass-filling threshold pushes: each context change is
// preceded by the machine writing the next chapter, and the held-forward rule
// keeps that writing on the glass through the beats it introduces.
// PLACEHOLDER COPY — see terminal/visuals.js.
// `act-cubicle` ("it is not just you.", 2026-09-09) and `act-phosphor`
// ("losing our skills.", 2026-09-10) have no sessions: both acts open on their
// data, and CameraRig hides the stage swaps itself.
export const CEILING_ACT_SCREEN = screen('act-ceiling')
// `act-boundaries` ("go for a walk.") and `act-control` ("you are in
// control.") have no sessions since 2026-09-10: the `boundaries` slide was
// cut, and the walk became the GO OUTSIDE quote; the answers to "what do we
// do" are respondents' own words, quoted, and lead straight to the code.

/**
 * The grill, as a session: the brain lands and the first question pops on
 * arrival; each Y or N stamps the answer and flips it for the next. The last
 * step is the landing after the final answer, with nothing left to ask.
 */
export const GRILL_ME = Object.freeze([
  ...getTerminalVisual('grill-me').questions.map((_, question) =>
    Object.freeze({ kind: 'grill', id: 'grill-me', question })
  ),
  Object.freeze({ kind: 'grill', id: 'grill-me', question: null }),
])

// ── The survey on the glass (NARRATIVE.md §3) ──

/**
 * The slot machine, as a session: the idle machine on arrival, then one pull
 * per Enter. `pull` indexes the visual's authored outcomes, so the script and
 * the catalog cannot disagree about how many pulls there are. It plays after
 * the sleep data now; `most-prompts`, the line that used to name it first, has
 * no session (cut 2026-09-09).
 */
export const SLOT_MACHINE = Object.freeze([
  Object.freeze({ kind: 'visual', id: 'slot-machine' }),
  ...getTerminalVisual('slot-machine').pulls.map((_, pull) =>
    Object.freeze({ kind: 'pull', id: 'slot-machine', pull })
  ),
])
/**
 * The first question, asked before it is answered: the glass shows only the
 * headline — the question the survey put to 3,593 people — and Enter grows
 * the chart in under it (Scott, 2026-09-10).
 */
export const Q_STOPPING = Object.freeze([
  Object.freeze({ kind: 'visual', id: 'q-stopping', reveal: 'title' }),
  Object.freeze({ kind: 'plot', id: 'q-stopping' }),
])
export const STOPPING_SLEEP = screen('stopping-sleep')
export const Q_PRESSURE = screen('q-pressure')
export const Q_AGENTS = screen('q-agents')
export const AGENTS_STOPPING = screen('agents-stopping')
// `agents-outcomes` and `stopping-beats-count` have no sessions since
// 2026-09-10 (Scott); the visuals stay in the catalog for `?visual` review.
export const Q_SKILLS = screen('q-skills')
export const Q_ENJOYMENT = screen('q-enjoyment')
export const SKILLS_ENJOYMENT = screen('skills-enjoyment')
export const QUOTE_PUZZLE = screen('quote-puzzle')
export const QUOTE_DOOMSCROLL = screen('quote-doomscroll')
export const QUOTE_TIRED = screen('quote-tired')
export const QUOTE_LUNCH = screen('quote-lunch')
export const QUOTE_BREAKS = screen('quote-breaks')
export const QUOTE_STARTS = screen('quote-starts')
export const QUOTE_NINETY = screen('quote-ninety')
export const QUOTE_CALMER = screen('quote-calmer')
export const QUOTE_ONE_PROJECT = screen('quote-one-project')
export const QUOTE_OUTSIDE = screen('quote-outside')
export const QUOTE_PHONE = screen('quote-phone')
export const QUOTE_NINE_TO_FIVE = screen('quote-nine-to-five')
export const QUOTE_APART = screen('quote-apart')
