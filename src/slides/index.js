import { defineSlides } from '../presentation/defineSlides.js'
import {
  AGENTS_STOPPING,
  BOUNDARIES_ACT_SCREEN,
  CEILING_ACT_SCREEN,
  COLD_OPEN,
  CONTROL_ACT_SCREEN,
  DISCLAIMER_SCREEN,
  GRILL_ME,
  QR_SCREEN,
  ROB,
  Q_AGENTS,
  Q_ENJOYMENT,
  Q_PRESSURE,
  Q_SKILLS,
  Q_STOPPING,
  SENTRY_SCREEN,
  SKILLS_ENJOYMENT,
  SLOT_MACHINE,
  STOPPING_SLEEP,
  SURVEY_QUESTIONS,
  SYNTAX_SCREEN,
  TITLE_SCREEN,
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
 *             until the hero glass covers frame: CameraRig routes every
 *             adjacent stage change through the strict cover point (a short
 *             push into the glass if the camera is not already there), the
 *             StageDirector commits the swap behind it, and only then does the
 *             destination flight begin. A glass-filling slide on at least ONE
 *             side of the change keeps that push short and invisible; a
 *             room-to-room stage change would spend its whole flight hiding
 *             behind a glass the room never asked to look at.
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
    //
    // Still FLAT. The tube used to wake here (Scott, 2026-09-02); since
    // 2026-09-10 the whole open — chat window, Rob, the disclaimer and the QR
    // — stays a screen recording and the tube wakes at `survey-questions`,
    // because the curve, mask and beam were what made the code hard to scan.
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
    // DISCLAIMER, before the code (Scott, 2026-09-10). A warning triangle and
    // one word; the sampling caveat — self-selected, not the developer
    // population, association not cause — is spoken over it, once, before
    // the room is asked to scan anything.
    id: 'disclaimer',
    stage: 'home',
    session: DISCLAIMER_SCREEN,
    crt: FLAT,
    camera: { ...FLAT_GLASS, smoothTime: 0.45 },
  },
  {
    // AFTER ROB, not before him. The QR used to sit third, among the identity
    // assets, where it asked a room that had been told nothing yet to scan a
    // survey about a problem it had not met. It lands here instead: they have
    // just read the post and the reply count, and the code is the answer to
    // the question that leaves them with. It also carries the base count now
    // (n = 3,593) — that number is what makes the link worth scanning, and it
    // was being spent as an act marker four acts later.
    //
    // Flat and a thousand pixels wide: on the tube it was small and soft and
    // did not scan (Scott, 2026-09-10).
    id: 'intro-qr',
    stage: 'home',
    session: QR_SCREEN,
    crt: FLAT,
    camera: { ...FLAT_GLASS, smoothTime: 0.45 },
  },
  {
    // THE FORM, before any answer to it. The room has just been handed the
    // code; this is what the code leads to — the questions, worded as
    // respondents saw them, and nothing else (no scales, no anchors, no
    // counts). Every data beat after this picks one of these lines back up.
    //
    // THE TUBE WAKES HERE. The title, the identity assets, the chat window,
    // Rob, the disclaimer and the code are the flat frames; from the first
    // survey prompt on, every glass-filling beat is the same TUBE_FULL preset
    // as the data runs, through the same post. (Flat slides used to read
    // visibly darker than tube ones — the flat path was presenting linear
    // light, fixed in shaders/crt.js on 2026-09-10 — and a curved screen
    // recording still gives away nothing about the room.)
    id: 'survey-questions',
    stage: 'home',
    session: SURVEY_QUESTIONS,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 0.6 },
  },

  /* ═══════════════ ② HOME — THE MACHINE YOU CAN'T PUT DOWN ═══════════════
   * PILLAR 1. Why prompting is hard to stop, and what it does to sleep.
   *
   * Still the glass, still head-on: the pull-back sits after the machine, so
   * the whole of Pillar 1 plays on the same covering tube the survey prompt
   * woke, and the room learns where that tube sits only once the data has
   * landed and the mechanism has been shown.
   *
   * Data first, machine second (Scott, 2026-09-09): the room reads the overrun
   * and what it does to sleep, and THEN watches the thing that does it.
   * `variable-reward`, which named the mechanism as one line of glass before
   * the machine showed it, was cut the same day — the machine names itself. */
  {
    id: 'q-stopping',
    stage: 'home',
    session: Q_STOPPING,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 1.2 },
  },
  {
    // The strongest relationship in the survey, ρ = 0.41.
    //
    // The counterweight (a third report no sleep change at all) and the
    // association disclaimer are spoken over THIS chart, once, and meant.
    // `stopping-caveat` used to hold the same chart as a press of its own so
    // the qualification could not be skipped; from the presenter's side two
    // identical glasses in a row read as a slide that did not advance (Scott,
    // 2026-09-09), so the press is gone and the caveat rides in the notes.
    id: 'stopping-sleep',
    stage: 'home',
    session: STOPPING_SLEEP,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 1.2 },
  },
  {
    // THE MACHINE, performed — after the data it explains. Each Enter is one
    // pull — one more prompt — and the reels land three near-misses before
    // the one that pays. The calm-motion rule yields for the length of a pull
    // because the churn IS the mechanism being shown; between pulls the
    // machine is still.
    id: 'slot-machine',
    stage: 'home',
    session: SLOT_MACHINE,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 1.2 },
  },
  {
    // THE REVEAL, and it is ONE beat: the dolly back into the room.
    //
    // The tube has been awake since the survey prompt, so the pull-back no
    // longer carries the wake — only the housing, the desk and the room
    // arriving around an image the room has already accepted. `tube-wake`
    // used to hold at the covering distance while curvature came up and only
    // then move; the wake and the move were then fused; now the wake happens
    // on the glass and this beat is purely spatial.
    //
    // After the machine, not after the QR: the glass carries the paid line
    // into the room, and the room learns where the tube sits only once the
    // data has landed and the machine has been seen for what it is.
    //
    // Square-on, and nothing after it. The three-quarter and profile waypoints
    // that followed re-explained the same fact from two more angles; the
    // punchline only lands once. The tube's reading preset relaxes to the room
    // preset (mask, beam, halation) over the same flight.
    id: 'reveal',
    stage: 'home',
    crt: TUBE,
    camera: { pos: [0, 2.5, 44], target: [0, -0.5, 0], fov: 35, smoothTime: 3 },
    focus: [0, 0, 0],
  },

  /* ═══════════════ ③ CUBICLE — THE PRESSURE ═══════════════ */
  {
    // Straight from the desk to the data (Scott, 2026-09-09). The camera pushes
    // back into the glass from the reveal, the stage swaps to the cubicle
    // behind it once it covers the frame, and the pressure chart draws in on
    // the way; the room is not seen until the data has landed.
    // `cubicle-threshold` ("it is not just you.", which used to write the act
    // marker over that push) and `productivity-paradox` (+26% PRs / −19%
    // speed) were cut the same day — the act is one chart and the office.
    id: 'q-pressure',
    stage: 'cubicle',
    session: Q_PRESSURE,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 2.0 },
  },
  {
    // Enough width to reveal neighboring pools of agent activity over the
    // partitions, while the original monitor remains the anchor. Spoken: saved
    // effort returns as decisions and supervision, never as rest. After the
    // data, not before it (Scott, 2026-09-02): the office is the pull-back
    // that closes the act, the way the desk closes Pillar 1. No session, so
    // the pressure chart stays on the monitor through the move.
    id: 'cubicle-wide',
    stage: 'cubicle',
    crt: TUBE,
    camera: { pos: [-24, 4, 118], target: [8, -2, -50], fov: 35, smoothTime: 2.6 },
    focus: [0, -1, -4],
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
    // GRILL ME, right after the agent count (Scott, 2026-09-10; it used to be
    // the exit from the phosphor). Two agents is normal — and before the wall
    // shows what the reasoning scales to, the question goes to the room:
    // could you have written this without the model, did you read the diff,
    // do you know why it works. Each landing asks one; Y or N answers it and
    // flips the brain for the next.
    id: 'what-gets-pruned',
    stage: 'wall',
    session: GRILL_ME,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 1.2 },
  },
  {
    // More levers, more pulls: double the overrun rate at four or more agents.
    // `stopping-beats-count` (the same split inside the 1–2 agent band) was
    // cut 2026-09-10.
    id: 'agents-stopping',
    stage: 'wall',
    session: AGENTS_STOPPING,
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
    // data lands first (two is normal, more means more overruns, and the grill
    // has already asked what the output is worth) and the camera pulls back
    // onto a wall the room has just been given every reason not to expect.
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
    // Only 12% say sharpening. Straight from the wall into the data: the
    // `phosphor-return` act marker ("losing our skills.") that used to sit
    // between them was cut 2026-09-10 (Scott).
    id: 'q-skills',
    stage: 'wall',
    session: Q_SKILLS,
    crt: TUBE_FULL,
    camera: { ...GLASS, smoothTime: 3.0 },
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
    // The finding, stated. WHY it happens is the descent that follows. The
    // last glass-filling wall beat, so it occludes the phosphor swap
    // (`agents-outcomes` used to; cut 2026-09-10).
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
    // OUT THROUGH THE FACEPLATE. The deposits fade and the glass reforms over
    // this one flight, which is also the occlusion that carries the phosphor
    // stage out: the next slide is a cubicle room shot, and a set swap needs
    // the glass covering the frame with a picture on it — the phosphor cues
    // ease over this slide's smoothTime, so without it the cubicle would show
    // through a half-formed glass. No session, so the glass reforms around
    // the last chart the room left on it. The grill used to be this beat's
    // arrival; it moved after the agent count (Scott, 2026-09-10).
    id: 'phosphor-exit',
    stage: 'phosphor',
    crt: { tube: 1, maskMode: 2, maskStrength: 0.72 },
    phosphor: { opacity: 0, screenOpacity: 1, depth: 1, form: 1, decay: 1 },
    camera: { ...GLASS, smoothTime: 3.2 },
    focus: [0, 0, 0],
  },

  /* ═══════════════ ⑦ THE RETURN — THE FIX IS A STACK ═══════════════
   * Out the way we came in, each level holding one layer of the answer. The
   * form has to invert or it has no resolution, and the autonomy caveat needs
   * the cubicle physically back in frame. */
  {
    // THE CEILING. Everything about to be said assumes you are allowed to stop.
    // Against a quota, or a manager who treats the tool as a magic bullet, a
    // 15-minute timer will not save you. Healthy prompting cannot be carried
    // by personal discipline alone. The line stays on the monitor for the
    // whole beat — it used to be written on a glass slide of its own.
    id: 'return-cubicle',
    stage: 'cubicle',
    session: CEILING_ACT_SCREEN,
    crt: TUBE,
    camera: { pos: [-20, 3.5, 76], target: [6, -1.5, -26], fov: 35, smoothTime: 2.8 },
    focus: [0, -1, -4],
  },
  {
    // GO FOR A WALK, over a path through line trees that the room walks along.
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
    // The glass holds one line so the screen never lectures the room.
    id: 'boundaries',
    stage: 'home',
    session: CONTROL_ACT_SCREEN,
    crt: TUBE,
    camera: { pos: [15, 3, 46], target: [-2, -1, -2], fov: 35, smoothTime: 2.8 },
    focus: [0, 0, -2],
  },
  {
    // THE CODE AGAIN, flat and at scanning size, as the door out (Scott,
    // 2026-09-10). The room has the whole argument now; this is where it
    // goes. Flat on purpose — the tube's curve, mask and beam are what made
    // the code hard to scan — so the glass goes back to a screen recording
    // for it, and the close wakes the tube one last time on the way out.
    id: 'outro-qr',
    stage: 'home',
    session: QR_SCREEN,
    crt: FLAT,
    camera: { ...FLAT_GLASS, smoothTime: 2.4 },
  },
  {
    // The lights go off in the room and the title comes back on the glass —
    // same words as slide 1, on a screen you now know is an object, alone in
    // the dark the way it was at 3am. Then the idle cursor. Hold it blinking
    // and stop talking.
    id: 'close',
    stage: 'home',
    session: TITLE_SCREEN,
    crt: TUBE,
    lights: 0,
    camera: { pos: [0, 2.5, 44], target: [0, -0.5, 0], fov: 35, smoothTime: 3 },
    focus: [0, 0, 0],
  },
])
