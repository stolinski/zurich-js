import { defineSlides } from '../presentation/defineSlides.js'
import {
  AGENTS_OUTCOMES,
  AGENTS_STOPPING,
  BOUNDARIES_ACT_SCREEN,
  CEILING_ACT_SCREEN,
  COLD_OPEN,
  CUBICLE_ACT_SCREEN,
  DRIVE_QUADRANTS_CHART,
  EARLY_CAREER,
  MOST_PROMPTS,
  PHOSPHOR_ACT_SCREEN,
  PRODUCTIVITY_PARADOX,
  QR_SCREEN,
  ROB,
  Q_AGENTS,
  Q_ENJOYMENT,
  Q_PRESSURE,
  Q_SKILLS,
  Q_STOPPING,
  SENTRY_SCREEN,
  SKILLS_ENJOYMENT,
  STOPPING_BEATS_COUNT,
  STOPPING_SLEEP,
  SYNTAX_SCREEN,
  THREE_R,
  THREE_ZEROS,
  TITLE_SCREEN,
  WHAT_GETS_PRUNED,
} from '../terminal/session.js'

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE TALK — "The True Cost of AI Coding"
 *
 *  The argument is in NARRATIVE.md; this file is its running order. Two
 *  pillars carry it — the slot machine at HOME, the atrophy INSIDE THE GLASS —
 *  and the cubicle and wall between them are the context that makes neither
 *  optional. See PLAN.md for the build and QUALITY.md for acceptance.
 *
 *  This is the only file you edit to arrange the talk.
 *
 *  ── THE RHYTHM ──
 *  Data beats FILL THE GLASS. Reveal beats sit in the room. That alternation
 *  is not a compromise for legibility, it is the thesis: while you are reading
 *  the number you are in the same trance as the person at the desk, and when
 *  the camera pulls back you see where they were sitting the whole time.
 *  A chart framed inside the room is also simply not readable from the back of
 *  a conference hall — verified, not assumed.
 *
 *  ── THE PACING RULE (alternate per ACT, never per BEAT) ──
 *  An earlier cut alternated glass/room on every slide and the camera yo-yoed:
 *  28 flights across the deck, several of them out-and-straight-back-in to say
 *  one sentence. Group instead — enter a stage, do ALL the room work in one
 *  run, then move to the glass once and stay there for the whole data run.
 *  Down to 20 flights, every one of which is a real transition.
 *
 *  Three rules fall out of that, and breaking any of them brings the yo-yo back:
 *    · A qualification is the SAME thought as the chart it qualifies. Caveats
 *      HOLD — same camera, same glass, no flight (`stopping-caveat`,
 *      `early-career-caveat`). The press exists so the caveat cannot be
 *      skipped on stage, not to move the camera.
 *    · Room beats that escalate are ONE move and nothing goes between them.
 *      `agent-wall-near` → `agent-wall` is the "one, two, four, infinity"
 *      reveal; a chart was once scheduled in the middle and cut it in half.
 *    · Do not return to a stage to say something a single line can carry. The
 *      return trip visits two rooms, not three, for exactly this reason.
 *
 *  Fields (all optional except id + camera):
 *    camera   { pos, target, smoothTime?, fillScreen? }
 *             `fillScreen: true` parks head-on at exactly the distance that
 *             covers the viewport at any aspect, and locks camera input. It
 *             also zeroes all post-processing (see scene/Effects.jsx). With
 *             `tube: 0` that combination is what makes the cold open read as a
 *             screen recording; with `tube: 1` it is a full-frame CRT.
 *    session  a fake-agent script (see terminal/session.js). Driven by ENTER,
 *             never by the arrows — the arrows are slides, always. A slide
 *             with NO session holds the previous one, complete: that is how a
 *             chart stays up while the camera moves and Scott talks over it.
 *    autoplay true to play the session on an authored schedule instead of on
 *             Enter (state/useSessionAutoplay.js). For beats the machine
 *             performs; a beat the PRESENTER performs must not have it, or the
 *             timing of the room is taken away from the person in it. Enter and
 *             Backspace still hand control back on the first press.
 *    stage    'home' | 'cubicle' | 'wall' | 'phosphor'. Context swaps are held
 *             until the hero glass covers frame, so EVERY stage change here is
 *             immediately preceded by a glass-filling slide — forwards and
 *             backwards. Breaking that pairing pops the scenery on stage.
 *    crt      tube params. `tube: 0` is a flat passthrough — a screen
 *             recording. `tube: 1` is a CRT. Anything between is the reveal.
 *
 *  There is no DOM content layer — every legible thing is drawn onto the
 *  screen's canvas.
 *
 *  Nav: → / ← move SLIDES and nothing else, always. Enter runs the next thing
 *  in the fake agent (backspace undoes it) — a separate performance control, on
 *  the key you'd actually hit at a terminal. 0–9 jump, f fullscreen.
 *
 *  COPY IS PLACEHOLDER throughout — Scott rewrites.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Head-on at the covering distance: the reading position for every data beat. */
const GLASS = Object.freeze({ fillScreen: true, target: [0, 0, 0], fov: 35 })
/** The cold open's framing — same covering solve, wider lens, flat tube. */
const FLAT_GLASS = Object.freeze({ fillScreen: true, target: [0, 0, 0], fov: 50 })

const FLAT = Object.freeze({ tube: 0 })
const TUBE = Object.freeze({ tube: 1, maskMode: 2 })
/**
 * The glass-filling beat preset: softened mask, and a TIGHT BEAM.
 *
 * `focus` is the gaussian beam width, and at the default 0.55 it is what made
 * the type on every data slide read soft — a wide beam smears each glyph
 * vertically, and these are the slides where the glass IS the frame and the
 * type is all there is to look at. Halation goes to zero for the same reason:
 * it is a 24-tap near-field blur, and on a covering framing the texture is
 * close enough to 1:1 that it is fully active over every letterform.
 *
 * 0.22 rather than 0.34 because the difference is not gradual — measured
 * high-frequency detail is flat between 0.55 and 0.34 and then jumps 23% at
 * 0.22. The tube still reads as a tube: curvature, grille, bezel and vignette
 * are all untouched, and it is the BEAM that stops being a smear.
 */
const TUBE_FULL = Object.freeze({
  tube: 1,
  maskMode: 2,
  maskStrength: 0.7,
  focus: 0.22,
  halation: 0,
})

export const slides = defineSlides([
  /* ═══════════════ ① THE FLAT-SCREEN OPEN ═══════════════
   * Exactly one line on unlit glass. No harness chrome, post, perspective, or
   * visible edge: the first image is only the name of the talk. */
  {
    id: 'cold-open',
    stage: 'home',
    session: TITLE_SCREEN,
    crt: FLAT,
    camera: { ...FLAT_GLASS, smoothTime: 0.6 },
  },
  {
    // These are real Slides—not hidden Session steps—so normal arrow navigation
    // reaches every identity screen and each one has a stable deep link.
    id: 'intro-syntax',
    stage: 'home',
    session: SYNTAX_SCREEN,
    crt: FLAT,
    camera: { ...FLAT_GLASS, smoothTime: 0.45 },
  },
  {
    id: 'intro-sentry',
    stage: 'home',
    session: SENTRY_SCREEN,
    crt: FLAT,
    camera: { ...FLAT_GLASS, smoothTime: 0.45 },
  },
  {
    // The exchange PLAYS ITSELF. This is not a demo Scott performs — it is the
    // machine working while he talks over it, and tapping Enter seven times to
    // keep a conversation moving puts his hand on a keyboard during the one
    // beat where the room is supposed to forget there is a deck at all.
    //
    // Enter and Backspace still work and still take it back: one press hands
    // the exchange to the presenter for the rest of the visit, so a line can be
    // held on or re-read without the schedule dragging him forward. Arrows are
    // untouched and still move exactly one slide.
    id: 'agent-session',
    stage: 'home',
    session: COLD_OPEN,
    autoplay: true,
    crt: FLAT,
    camera: { ...FLAT_GLASS, smoothTime: 0.6 },
  },
  {
    // ROB. Scott's own confession becomes a point on a scale that ends in a
    // hospital — and then the reply thread turns it from an anecdote into the
    // reason this survey exists.
    //
    // It used to have no session of its own, which meant it HELD the
    // after-midnight chart: the room read Scott's week while hearing about
    // someone else's night. The beat gets its own glass.
    id: 'rob',
    stage: 'home',
    session: ROB,
    crt: FLAT,
    camera: { ...FLAT_GLASS, smoothTime: 0.5 },
  },

  {
    // AFTER ROB, not before him. The QR used to sit third, among the identity
    // assets, where it asked a room that had been told nothing yet to scan a
    // survey about a problem it had not met. It lands here instead: they have
    // just read the post and the reply count, and the code is the answer to
    // the question that leaves them with. It also carries the base count now
    // (n = 3,593) — that number is what makes the link worth scanning, and it
    // was being spent as an act marker four acts later.
    id: 'intro-qr',
    stage: 'home',
    session: QR_SCREEN,
    crt: FLAT,
    camera: { ...FLAT_GLASS, smoothTime: 0.45 },
  },

  /* ═══════════════ ② HOME — THE MACHINE YOU CAN'T PUT DOWN ═══════════════
   * PILLAR 1. Why prompting is hard to stop, and what it does to sleep. */
  {
    // THE REVEAL, and it is ONE beat.
    //
    // The tube wakes DURING the pull-back rather than before it. `tube-wake`
    // used to hold at the covering distance while curvature, raster and
    // reflection came up, and only then did the camera move — which meant the
    // audience watched the picture bend, waited, and then watched it recede.
    // Two presses to deliver one idea, with a dead spot in the middle. The
    // slide's `crt` target damps toward TUBE over exactly the same flight, so
    // asking for both at once costs nothing and the glass becomes an object in
    // the same gesture that reveals the object.
    //
    // Square-on, and nothing after it. The three-quarter and profile waypoints
    // that followed re-explained the same fact from two more angles; the
    // housing arriving around an image the room has already accepted is the
    // punchline, and it only lands once.
    //
    // Longer than either beat it replaces, because it is now carrying a lens
    // change (50 → 35) and the tube ramp on top of the dolly.
    id: 'reveal',
    stage: 'home',
    crt: TUBE,
    camera: { pos: [0, 2.5, 44], target: [0, -0.5, 0], fov: 35, smoothTime: 3 },
    focus: [0, 0, 0],
  },
  {
    // The mechanism, named. Bare glass — an animated slot machine would break
    // the calm-motion rule and cheapen it.
    id: 'variable-reward',
    stage: 'home',
    session: MOST_PROMPTS,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 1.2 },
  },
  {
    id: 'q-stopping',
    stage: 'home',
    session: Q_STOPPING,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 1.2 },
  },
  {
    // The strongest relationship in the survey, ρ = 0.41.
    id: 'stopping-sleep',
    stage: 'home',
    session: STOPPING_SLEEP,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 1.2 },
  },
  {
    // A HOLD: same camera, same glass, no flight. The counterweight (a third
    // report no sleep change at all) and the association disclaimer are the
    // same thought as the chart above them, so the frame must not move — this
    // exists as a press so the qualification cannot be skipped on stage.
    // Spoken here, once, and meant — not re-hedged on every later chart.
    id: 'stopping-caveat',
    stage: 'home',
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 1.2 },
  },

  /* ═══════════════ ③ CUBICLE — THE PRESSURE ═══════════════ */
  {
    // The glass writes the act marker during the push, and the held-forward
    // rule keeps it up through the cubicle beats it introduces.
    id: 'cubicle-threshold',
    stage: 'home',
    session: CUBICLE_ACT_SCREEN,
    crt: { tube: 1, maskMode: 2, maskStrength: 0.68 },
    camera: { ...GLASS, smoothTime: 2.0 },
    focus: [0, 0, 0],
  },
  {
    // Enough width to reveal neighboring pools of agent activity over the
    // partitions, while the original monitor remains the anchor. Spoken: saved
    // effort returns as decisions and supervision, never as rest.
    id: 'cubicle-wide',
    stage: 'cubicle',
    crt: TUBE,
    camera: { pos: [-24, 4, 118], target: [8, -2, -50], fov: 35, smoothTime: 2.6 },
    focus: [0, -1, -4],
  },
  {
    id: 'q-pressure',
    stage: 'cubicle',
    session: Q_PRESSURE,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 2.0 },
  },
  {
    // The tools work AND experienced developers were slower while believing
    // they were faster. Both findings get used to ask for more.
    id: 'productivity-paradox',
    stage: 'cubicle',
    session: PRODUCTIVITY_PARADOX,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 1.2 },
  },
  /* ═══════════════ ④ WALL — THE THROTTLE ═══════════════ */
  {
    // Most people are not running ten agents — median 2.
    id: 'q-agents',
    stage: 'wall',
    session: Q_AGENTS,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 2.0 },
  },
  {
    id: 'agents-stopping',
    stage: 'wall',
    session: AGENTS_STOPPING,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 2.6 },
  },
  {
    // Benefit and cost climb together; the dashed skills line refuses to follow.
    id: 'agents-outcomes',
    stage: 'wall',
    session: AGENTS_OUTCOMES,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 1.2 },
  },
  {
    // THE TELL. Hold agent count constant and the sleep gap barely shrinks: it
    // isn't how many agents, it's whether you can stop. Pillar 1 confirmed from
    // a second direction, and the finding the video never reaches.
    id: 'stopping-beats-count',
    stage: 'wall',
    session: STOPPING_BEATS_COUNT,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 1.2 },
  },

  /* ═══════════════ ⑤ THE SKILL YOU CAN'T FEEL GOING ═══════════════
   * PILLAR 2. The argument is made ON the glass, because inside the phosphor
   * the screen is behind the camera and no statement can be read there. The
   * descent that follows is the wordless payoff of what was just said. */
  {
    // AFTER the agent data, not before it. The pull-back used to open this act,
    // so the room saw fifty-four screens and only then learned that the median
    // developer runs two — which is the reveal explaining itself away. Now the
    // data lands first (two is normal, more costs you sleep, and the count was
    // never the mechanism anyway) and the camera pulls back onto a wall the
    // room has just been given every reason not to expect.
    //
    // Still ONE continuous escalation with the next beat, and nothing may be
    // scheduled between them.
    id: 'agent-wall-near',
    stage: 'wall',
    crt: TUBE,
    camera: { pos: [-16, 2, 58], target: [0, 0, -6], fov: 35, smoothTime: 2.5 },
    focus: [0, 0, -2],
  },
  {
    // Fifty-four pooled procedural agents surround the full-resolution hero:
    // one instanced chassis draw and one instanced screen draw. Spoken: the
    // escalation is trivially logical, and there is no number at which the
    // reasoning stops.
    id: 'agent-wall',
    stage: 'wall',
    crt: TUBE,
    camera: { pos: [0, 0, 206], target: [0, 0, -3], fov: 35, smoothTime: 3.2 },
    focus: [0, 0, -3],
  },
  {
    id: 'phosphor-return',
    stage: 'wall',
    session: PHOSPHOR_ACT_SCREEN,
    crt: { tube: 1, maskMode: 2, maskStrength: 0.72 },
    camera: { ...GLASS, smoothTime: 3.0 },
    focus: [0, 0, 0],
  },
  {
    // Only 12% say sharpening.
    id: 'q-skills',
    stage: 'wall',
    session: Q_SKILLS,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 1.2 },
  },
  {
    id: 'q-enjoyment',
    stage: 'wall',
    session: Q_ENJOYMENT,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 1.2 },
  },
  {
    // ρ = −0.37, the strongest negative in the survey. Not two findings —
    // mostly the same people. Say that the survey measured BELIEF about skill
    // and never tested anyone; then say why belief is the thing that matters.
    //
    // The finding, stated. WHY it happens is the descent that follows. This is
    // also the last glass-filling wall beat, so it occludes the phosphor swap.
    id: 'skills-enjoyment',
    stage: 'wall',
    session: SKILLS_ENJOYMENT,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 1.2 },
  },
  {
    // THE DREAM, and now the ENTIRE descent in one move.
    //
    // `phosphor-approach` and `phosphor-threshold` used to sit in front of this
    // — two held waypoints that widened the grille and faded the geometry in
    // while the camera crept toward a bright patch of terminal output. They
    // were the mechanism of the handoff shown as three separate stops, and
    // stopping is exactly what a descent must not do: the room watched a
    // sequence of near-identical grids instead of travelling anywhere. The
    // handoff eases over this one flight now, so the glass opens and the camera
    // keeps going THROUGH it into the cloud.
    //
    // Long, because it is the only wordless beat in the talk and the movement
    // IS the content.
    id: 'inside-glass',
    stage: 'phosphor',
    crt: { tube: 1, maskMode: 2, maskPitchPx: 32, maskStrength: 1, focus: 0.2, halation: 0 },
    phosphor: { opacity: 1, screenOpacity: 0, depth: 1, form: 0, decay: 0 },
    camera: { pos: [3.0, 2.1, -1.6], target: [-1.8, 0.6, -9.6], fov: 32, smoothTime: 4.2 },
    focus: [-3, 1.4, -8],
  },
  {
    // WHY 1 — NEUROPLASTICITY. The brain is an efficient machine and prunes
    // what it isn't using. The motes stream into a neural network during the
    // flight, and Scott explains the mechanism over it: this is not a metaphor
    // for what he is describing, it is a picture of it. The instrument you
    // played in middle school.
    id: 'synapse',
    stage: 'phosphor',
    crt: { tube: 1, maskMode: 2, maskPitchPx: 32, maskStrength: 1, focus: 0.2, halation: 0 },
    phosphor: { opacity: 1, screenOpacity: 0, depth: 1, form: 1, decay: 0 },
    camera: { pos: [0.4, 1.6, -0.6], target: [-0.2, 1.1, -8.2], fov: 32, smoothTime: 3.0 },
    focus: [-0.2, 1.1, -8.2],
  },
  {
    // WHY 2 — use it or lose it, watched rather than asserted. Connections die
    // one by one across this slow drift, each edge on its own seeded cue, until
    // only isolated dimming nodes remain. Say nothing over it. The silence is
    // the point: nothing on screen announces the loss, which is what WHY 4
    // then proves about your own sense of it.
    id: 'synapse-decay',
    stage: 'phosphor',
    crt: { tube: 1, maskMode: 2, maskPitchPx: 32, maskStrength: 1, focus: 0.2, halation: 0 },
    phosphor: { opacity: 1, screenOpacity: 0, depth: 1, form: 1, decay: 1 },
    camera: { pos: [-0.8, 1.4, -2.2], target: [-0.4, 1.0, -8.6], fov: 32, smoothTime: 3.4 },
    focus: [-0.4, 1.0, -8.6],
  },

  /* ═══════════════ ⑥ THE TURN ═══════════════ */
  {
    // Back out through the faceplate: the deposits fade and the glass reforms,
    // holding the same skill/enjoyment split the camera entered through. Also
    // the occlusion that carries the phosphor→wall swap, in both directions.
    id: 'phosphor-exit',
    stage: 'phosphor',
    crt: { tube: 1, maskMode: 2, maskStrength: 0.72 },
    phosphor: { opacity: 0, screenOpacity: 1, depth: 1, form: 1, decay: 1 },
    camera: { ...GLASS, smoothTime: 3.2 },
    focus: [0, 0, 0],
  },
  {
    // WHY 3 — it takes the reps, not the typing. Reading the problem, holding
    // it, choosing the approach: exactly what gets delegated first. Lands as
    // the application of the decay the room has just watched, which is why it
    // is here rather than before the descent.
    id: 'what-gets-pruned',
    stage: 'wall',
    session: WHAT_GETS_PRUNED,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 1.6 },
  },
  {
    // WHY 4, AND THE TURN OF THE TALK. Skill worry predicts nothing about how
    // hard anyone runs AI — so you cannot use your own sense of it as a gauge.
    // Directly after a silent decay nobody could feel, that is the proof.
    id: 'three-zeros',
    stage: 'wall',
    session: THREE_ZEROS,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 1.4 },
  },
  {
    // WHO IS HOLDING THE THROTTLE. Read top to bottom: own pull only (n=173),
    // neither, both, outside pressure only. Same keystrokes, four prices — and
    // no cell is free. The least-damaged group also runs the fewest agents.
    id: 'drive-quadrants',
    stage: 'wall',
    session: DRIVE_QUADRANTS_CHART,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 1.6 },
  },

  /* ═══════════════ ⑦ THE RETURN — THE FIX IS A STACK ═══════════════
   * Out the way we came in, each level holding one layer of the answer. The
   * form has to invert or it has no resolution, and the autonomy caveat needs
   * the cubicle physically back in frame. */
  {
    // Spoken over this: agent count is the one number you can turn down, and
    // the outcomes chart priced it — but the tell already said the count was
    // never the mechanism. Smallest lever, not the fix. It does not need its
    // own trip back to the wall to be said.
    id: 'act-ceiling',
    stage: 'wall',
    session: CEILING_ACT_SCREEN,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 2.6 },
    focus: [0, 0, 0],
  },
  {
    // THE CEILING. Everything about to be said assumes you are allowed to stop.
    // Against a quota, a manager who treats the tool as a magic bullet, or being
    // 23 and looking at that employment chart, a 15-minute timer will not save
    // you. Healthy prompting cannot be carried by personal discipline alone.
    id: 'return-cubicle',
    stage: 'cubicle',
    crt: TUBE,
    camera: { pos: [-20, 3.5, 76], target: [6, -1.5, -26], fov: 35, smoothTime: 2.8 },
    focus: [0, -1, -4],
  },
  {
    // THE EMPLOYMENT CHART, and it belongs HERE.
    //
    // It spent the talk in the cubicle act, between the pressure question and
    // the productivity paradox, where it was the only beat about the job
    // MARKET — a different argument wearing the same act's clothes, and the
    // slides either side of it had nothing to do with it. The ceiling is what
    // it is evidence FOR: everything the talk is about to advise assumes you
    // are allowed to act on it, and being twenty-three looking at this chart is
    // one of the three reasons you might not be. `return-cubicle` was already
    // reaching for it in prose; now the room can see it.
    id: 'early-career',
    stage: 'cubicle',
    session: EARLY_CAREER,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 2.2 },
  },
  {
    // A HOLD — the chart stays exactly where it is.
    // NON-NEGOTIABLE, and spoken with the chart still up: unemployment rose
    // across every kind of job in that window, and rose MORE for the jobs least
    // exposed to AI. This is not proof AI took those jobs. Without this beat the
    // chart is dishonest and the advice section loses the room's trust — which
    // is the very next thing out of Scott's mouth, so it matters more here than
    // it did in the cubicle.
    id: 'early-career-caveat',
    stage: 'cubicle',
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 1.2 },
  },
  {
    id: 'act-boundaries',
    stage: 'cubicle',
    session: BOUNDARIES_ACT_SCREEN,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 2.4 },
    focus: [0, 0, 0],
  },
  {
    // HOW YOU'D KNOW, and WHAT WORKS — both spoken at the desk, where they
    // apply. Sleep first, then loss of interest, exhaustion, anxiety, pulling
    // away from people; then somatization. Then: box the loop, make stopping
    // structural, stay the one deciding, narrow the ambition, talk to people.
    // The glass stays on one line so the screen never lectures the room.
    id: 'boundaries',
    stage: 'home',
    crt: TUBE,
    camera: { pos: [15, 3, 46], target: [-2, -1, -2], fov: 35, smoothTime: 2.8 },
    focus: [0, 0, -2],
  },
  {
    // THE 3R. A result becomes a response only when a person takes
    // responsibility for it. The shortcut is drawn dim because it is the one
    // everybody already takes; the routed edge is the rep that stops the
    // atrophy AND the friction the slot machine does not have.
    id: 'three-r',
    stage: 'home',
    session: THREE_R,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 2.4 },
    focus: [0, 0, 0],
  },
  {
    // The title again — same words as slide 1, on glass you now know is an
    // object, in a room, in a building, made of phosphor. Then the idle cursor.
    // Hold it blinking and stop talking.
    id: 'close',
    stage: 'home',
    session: TITLE_SCREEN,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 2.0 },
    focus: [0, 0, 0],
  },
])
