import {
  AGENT_OUTCOMES,
  COHORTS,
  CORRELATIONS,
  DISTRIBUTIONS,
  DRIVE_QUADRANTS,
  EXTERNAL,
  FORM,
  QUESTIONS,
  SURVEY,
  countOf,
  shareOf,
} from '../data/survey.js'

const n = (count) => count.toLocaleString('en-US')
const pct = (share) => `${Math.round(share * 100)}%`

/**
 * A five-point scale as vertical columns, left to right — the reading order of
 * the scale itself. Counts sit on the bars because they are what was actually
 * collected; the share the talk argues about rides in `detail`, where Scott's
 * spoken headline and the glass agree without the bars pretending to be
 * percentages.
 */
function scaleVisual(question, distribution) {
  return Object.freeze({
    kind: 'chart',
    title: question.title.toUpperCase(),
    detail: `${pct(shareOf(distribution, question.highlight))} · ${n(
      countOf(distribution, question.highlight)
    )} OF ${n(SURVEY.respondents)}`,
    chart: Object.freeze({
      kind: 'bar',
      values: Object.freeze(
        distribution.map((count, index) =>
          Object.freeze({
            // A scale point is its number plus the anchor word at that end, if
            // any. A question whose points ARE the answers (agents: 1…5+)
            // carries `options` instead, and the option is the whole label —
            // "1 1, 2 2, 3 3" was the number being printed twice.
            label:
              question.options?.[index] ??
              (question.anchors?.[index]
                ? `${index + 1} ${question.anchors[index]}`
                : String(index + 1)),
            value: count,
          })
        )
      ),
    }),
  })
}

/**
 * Coefficients as aligned columns on bare glass.
 *
 * `statement` centres each line on its own width, so in a monospace face the
 * only way to get a column to line up is to make every line the same number of
 * characters. Padding to a common width does that, and the alignment is most of
 * the argument: three numbers that are visibly the same size — zero.
 */
function correlationLines(pairs) {
  const labelWidth = Math.max(...pairs.map(([label]) => label.length))
  return Object.freeze(
    pairs.map(([label, coefficient], index) =>
      Object.freeze({
        text: `ρ ${coefficient.toFixed(3).padStart(6)}   ${label.padEnd(labelWidth)}`,
        // The first pair is the one the beat is about — skill worry against how
        // hard people actually run AI.
        role: index === 0 ? 'hot' : 'phosphor',
      })
    )
  )
}

/**
 * Two cohorts, one measure, as horizontal bars — the form every "+N points"
 * finding in this survey takes. The n rides in the label because a cohort
 * figure without its base is not a finding, and these are read aloud from the
 * glass (NARRATIVE.md §7 rule 2).
 */
function cohortVisual(title, cohort) {
  return Object.freeze({
    kind: 'chart',
    title: title.toUpperCase(),
    detail: cohort.measure.toUpperCase(),
    chart: Object.freeze({
      kind: 'distribution',
      format: 'percent',
      max: 100,
      values: Object.freeze([
        Object.freeze({
          label: `${cohort.high.label} (n=${n(cohort.high.count)})`,
          value: cohort.high.rate * 100,
        }),
        Object.freeze({
          label: `${cohort.low.label} (n=${n(cohort.low.count)})`,
          value: cohort.low.rate * 100,
        }),
      ]),
    }),
  })
}

/**
 * Closed catalog of full-screen visuals that the fake harness can display.
 * Slides and sessions select these by ID; renderer-specific callbacks never
 * enter the presentation specification.
 */
export const TERMINAL_VISUALS = Object.freeze({
  // Both the cold open and the close paint this, so the byline appears on the
  // first image the room sees and again on the last — same words, same place.
  'talk-title': Object.freeze({
    kind: 'title',
    text: 'the true cost of ai coding',
    byline: 'by Scott Tolinski',
  }),
  syntax: Object.freeze({
    kind: 'asset',
    asset: 'syntax',
    label: 'Syntax',
    path: '/logos/syntax.svg',
    detail: 'SHOW IDENTITY / LOCAL ASSET',
  }),
  sentry: Object.freeze({
    kind: 'asset',
    asset: 'sentry',
    label: 'Sentry',
    path: '/logos/sentry.svg',
    detail: 'SHOW PARTNER / LOCAL ASSET',
  }),
  qr: Object.freeze({
    kind: 'asset',
    asset: 'qr',
    // Resolves to ai-health.syntax.fm — the charts, which carry the link to the
    // survey itself. One code, not two: the room scans data first and is
    // offered the form second.
    //
    // The base count rides HERE. It used to be spent as the wall act's marker,
    // four acts later, where a room already inside the argument was shown a
    // number it had been assuming since the first chart. On the code it is
    // doing work: it is the reason to scan.
    headline: n(SURVEY.respondents),
    caption: 'DEVELOPERS SURVEYED',
    label: 'ai-health.syntax.fm',
    path: '/logos/qr.svg',
    detail: `${n(SURVEY.respondents)} DEVELOPERS SURVEYED · ${SURVEY.source.toUpperCase()}`,
  }),
  // THE FORM, asked the way a terminal asks: one question per Enter, typed
  // large behind a prompt, and nothing else on the glass — no scales, no
  // anchors, no counts (Scott, 2026-09-09). The room has just been handed the
  // code; this is what the code leads to, and every data beat after it picks
  // one of these lines back up. The wording is FORM's, so the glass and the
  // dataset cannot disagree about what was asked. The agent count and the
  // open field share the last screen, the way the form ended.
  'survey-questions': Object.freeze({
    kind: 'prompt',
    header: 'SURVEY',
    screens: Object.freeze(
      FORM.questions.map((question, index, questions) =>
        Object.freeze(
          index === questions.length - 1
            ? [question.prompt, FORM.openEnded]
            : [question.prompt]
        )
      )
    ),
  }),
  // ── Act markers ──
  // Full-screen writing beats for the glass-filling threshold slides, so each
  // context change is preceded by the machine writing the next chapter.
  // COPY IS PLACEHOLDER — the form is the deliverable, the words are Scott's.
  // No longer on a slide (Scott, 2026-09-09): the cubicle act opens straight on
  // its data. Kept for `?visual` review like the other cut beats.
  'act-cubicle': Object.freeze({
    kind: 'statement',
    lines: Object.freeze([
      Object.freeze({ text: 'it is not just you.', role: 'hot' }),
    ]),
  }),
  'act-phosphor': Object.freeze({
    kind: 'statement',
    lines: Object.freeze([
      Object.freeze({ text: 'losing our skills.', role: 'hot' }),
    ]),
  }),
  // ROB — the post itself, drawn as a post.
  //
  // Words, author, handle, date and counts all come from EXTERNAL.robPost,
  // which holds what was actually published. The projected copy censors the
  // profanity without changing the source record. Earlier passes paraphrased
  // the post into authored lines and then quoted it as plain type, and neither
  // is the artifact — the beat works because the room recognises that a real
  // person posted this and eight hundred people replied.
  //
  // The SECOND attached image — his hospital admission form, carrying his full
  // name and clinical findings — is deliberately not shipped. He published it;
  // enlarging a named person's medical record on a conference projector is a
  // different act, it cannot be taken back once it is in the deck, and the beat
  // does not need it. The A&E photograph carries "hospital" on its own.
  rob: Object.freeze({
    kind: 'tweet',
    author: EXTERNAL.robPost.author,
    handle: EXTERNAL.robPost.handle,
    verified: true,
    paragraphs: Object.freeze(
      EXTERNAL.robPost.paragraphs.map((paragraph) =>
        paragraph.replace('fucking', 'f***ing')
      )
    ),
    meta: `${EXTERNAL.robPost.date} · ${n(EXTERNAL.robPost.replies)} REPLIES · ${n(
      EXTERNAL.robPost.likes
    )} LIKES`,
    url: EXTERNAL.robPost.url,
  }),
  /* ─────────────────────────── THE SURVEY ───────────────────────────
   * Every value below is derived from data/survey.js at module load. No figure
   * is retyped here, so the frozen export and the glass cannot drift.
   * See NARRATIVE.md §3 for which beat each of these lands on.
   * ────────────────────────────────────────────────────────────────── */

  // ── ② Home · the machine you can't put down ──
  // No longer on a slide: `variable-reward` named the mechanism as one line of
  // glass before the machine showed it, and was cut (Scott, 2026-09-09) — the
  // slot machine, now after the sleep data, names itself. Kept in the catalog
  // for `?visual` review, like the other cut beats below.
  'most-prompts': Object.freeze({
    kind: 'statement',
    lines: Object.freeze([
      Object.freeze({ text: 'most prompts are not the one.', role: 'hot' }),
    ]),
  }),
  // THE MACHINE, performed. Each Enter is one pull — one more prompt — and the
  // reels are authored so the room watches three near-misses land before the
  // one that pays, which is the schedule the beat is about. Deterministic:
  // every rehearsal spins and lands the same symbols in the same order. Back
  // in the deck by Scott's call (2026-09-02) after `the-lever` was cut.
  'slot-machine': Object.freeze({
    kind: 'slot',
    symbols: Object.freeze(['7', '$', '@', '#', '%', '&']),
    idle: Object.freeze(['$', '@', '#']),
    pulls: Object.freeze([
      Object.freeze(['7', '7', '$']),
      Object.freeze(['7', '@', '7']),
      Object.freeze(['7', '7', '#']),
      Object.freeze(['7', '7', '7']),
    ]),
    prompt: 'one more prompt',
  }),
  'q-stopping': scaleVisual(QUESTIONS.stopping, DISTRIBUTIONS.stopping),
  'stopping-sleep': cohortVisual(
    'Stopping difficulty and sleep',
    COHORTS.stoppingToSleep
  ),

  // ── ③ Cubicle · the pressure ──
  'q-pressure': scaleVisual(QUESTIONS.pressure, DISTRIBUTIONS.pressure),
  // Cut from the deck 2026-09-09 (Scott); the studies stay in EXTERNAL for the
  // talk to quote, and the chart stays here for `?visual` review.
  'productivity-paradox': Object.freeze({
    kind: 'chart',
    title: 'WHAT THE STUDIES FOUND',
    detail: '2026 AI INDEX REPORT · NOT SURVEY DATA',
    chart: Object.freeze({
      kind: 'distribution',
      format: 'percent',
      max: 30,
      values: Object.freeze([
        Object.freeze({ label: 'more pull requests, with Copilot', value: 26 }),
        Object.freeze({ label: 'slower, and believed it was faster', value: 19 }),
      ]),
    }),
  }),
  'early-career': Object.freeze({
    kind: 'chart',
    title: 'EARLY-CAREER DEVELOPER EMPLOYMENT',
    detail: 'PERCENT CHANGE FROM EACH AGE BAND’S OWN 2022 PEAK · NOT SURVEY DATA',
    chart: Object.freeze({
      kind: 'series',
      format: 'signedPercent',
      domain: Object.freeze({ min: -25, max: 15 }),
      categories: EXTERNAL.earlyCareerEmployment.periods,
      values: Object.freeze(
        EXTERNAL.earlyCareerEmployment.series.map((series, index) =>
          Object.freeze({
            label: series.label,
            // The youngest band is the argument, so it is the only one driven
            // hot; the bands that grew sit back at dim and phosphor.
            role: index === 0 ? 'hot' : index === 1 ? 'phosphor' : 'dim',
            values: series.values,
          })
        )
      ),
    }),
  }),

  // ── ④ Wall · the throttle ──
  'q-agents': scaleVisual(QUESTIONS.agents, DISTRIBUTIONS.agents),
  'agents-stopping': cohortVisual(
    'Agents run at once, and stopping',
    COHORTS.agentsToStopping
  ),
  'agents-outcomes': Object.freeze({
    kind: 'chart',
    title: 'OUTCOMES BY AGENTS RUN AT ONCE',
    detail: 'BENEFIT AND COST CLIMB TOGETHER · SKILL WORRY DOES NOT FOLLOW',
    chart: Object.freeze({
      kind: 'series',
      format: 'percent',
      domain: Object.freeze({ min: 0, max: 80 }),
      // The survey's top answer is "5+", so the last band is five or more.
      categories: Object.freeze(
        AGENT_OUTCOMES.map((row) => (row.agents === 5 ? '5+' : String(row.agents)))
      ),
      values: Object.freeze([
        Object.freeze({
          label: 'sleep change',
          role: 'hot',
          values: Object.freeze(AGENT_OUTCOMES.map((row) => row.sleepChange * 100)),
        }),
        Object.freeze({
          label: 'enjoyment up',
          role: 'phosphor',
          values: Object.freeze(AGENT_OUTCOMES.map((row) => row.enjoymentUp * 100)),
        }),
        // Dashed because its job is to visibly refuse to behave like the other
        // two — the flat line IS the finding.
        Object.freeze({
          label: 'skills diminishing',
          role: 'dim',
          dashed: true,
          values: Object.freeze(
            AGENT_OUTCOMES.map((row) => row.skillsDiminishing * 100)
          ),
        }),
      ]),
    }),
  }),
  'stopping-beats-count': cohortVisual(
    'Same agent count, different sleep',
    COHORTS.stoppingToSleepAmongLightUsers
  ),

  // ── ⑤ Inside the glass · the skill you can't feel going ──
  'q-skills': scaleVisual(QUESTIONS.skills, DISTRIBUTIONS.skills),
  // GRILL ME. A brain on a grill, drawn in the slot machine's idiom: each time
  // it lands a question pops up, Y or N answers it, and the answer flips it
  // for the next. COPY IS PLACEHOLDER — the questions are Scott's; the form
  // is the deliverable.
  'grill-me': Object.freeze({
    kind: 'grill',
    title: 'grill me.',
    questions: Object.freeze([
      'could you have written this without the model?',
      'did you read the diff before you shipped it?',
      'do you know why it works?',
      'could you debug it by hand tomorrow?',
      'would you notice if it was wrong?',
    ]),
  }),
  // The three near-zero pairs, as bare glass. A 6×6 correlation matrix is
  // unreadable from the back of a room and buries this — NARRATIVE.md beat 35.
  'three-zeros': Object.freeze({
    kind: 'statement',
    lines: correlationLines([
      ['skills · agents', CORRELATIONS.skillsAgents],
      ['enjoyment · sleep', CORRELATIONS.enjoymentSleep],
      ['skills · stopping', CORRELATIONS.stoppingSkills],
    ]),
  }),
  'q-enjoyment': scaleVisual(QUESTIONS.enjoyment, DISTRIBUTIONS.enjoyment),
  'skills-enjoyment': cohortVisual(
    'Perceived skill and enjoyment',
    COHORTS.skillsToEnjoyment
  ),

  // ── ⑥ The turn · who is holding the throttle ──
  // Ranked by mean enjoyment rather than laid out as a 2×2. The beat is read
  // aloud in exactly this order — best-off to worst-off — and a ranked list is
  // that order, where a quadrant grid asks a room to hunt for it.
  'drive-quadrants': Object.freeze({
    kind: 'chart',
    title: 'WHO IS SETTING THE PACE',
    detail: `MEAN ENJOYMENT, 1–5 · ${n(DRIVE_QUADRANTS.classified)} OF ${n(
      DRIVE_QUADRANTS.total
    )} CLASSIFIED`,
    chart: Object.freeze({
      kind: 'distribution',
      format: 'decimal',
      max: 5,
      values: Object.freeze(
        [...DRIVE_QUADRANTS.cells]
          .sort((a, b) => b.meanEnjoyment - a.meanEnjoyment)
          .map((cell) =>
            Object.freeze({
              label: `${cell.label.toLowerCase()} (n=${n(cell.count)})`,
              value: cell.meanEnjoyment,
            })
          )
      ),
    }),
  }),

  // ── ⑦ The return · the fix is a stack ──
  'act-ceiling': Object.freeze({
    kind: 'statement',
    lines: Object.freeze([
      Object.freeze({ text: 'you have to be allowed', role: 'phosphor' }),
      Object.freeze({ text: 'to stop.', role: 'hot' }),
    ]),
  }),
  // GO FOR A WALK. One line, over a perspective line drawing of a path
  // through simple line trees that the room walks along — the only visual in
  // the catalog that moves on its own clock, and it moves at walking pace.
  'act-boundaries': Object.freeze({
    kind: 'walk',
    text: 'go for a walk.',
    animated: true,
  }),
  'act-control': Object.freeze({
    kind: 'statement',
    lines: Object.freeze([
      Object.freeze({ text: 'you are in control.', role: 'hot' }),
    ]),
  }),
  // The last image before the title returns. The shortcut is drawn dim and
  // dashed because it is the one everybody already takes.
  'three-r': Object.freeze({
    kind: 'diagram',
    caption: EXTERNAL.threeR.claim,
    nodes: Object.freeze([
      Object.freeze({ id: 'output', label: 'AI OUTPUT', x: 0.16, y: 0.62 }),
      Object.freeze({ id: 'result', label: 'RESULT', x: 0.4, y: 0.62 }),
      Object.freeze({
        id: 'responsibility',
        label: 'RESPONSIBILITY',
        x: 0.62,
        y: 0.3,
        role: 'hot',
      }),
      Object.freeze({ id: 'response', label: 'RESPONSE', x: 0.86, y: 0.62 }),
    ]),
    edges: Object.freeze([
      Object.freeze({ from: 'output', to: 'result', role: 'hot' }),
      Object.freeze({ from: 'result', to: 'response' }),
      Object.freeze({ from: 'result', to: 'responsibility', role: 'hot' }),
      Object.freeze({ from: 'responsibility', to: 'response', role: 'hot' }),
    ]),
  }),
})

export function getTerminalVisual(id) {
  const visual = TERMINAL_VISUALS[id]
  if (!visual) throw new Error(`Unknown terminal visual: ${id}`)
  return visual
}
