/**
 * THE SURVEY — single source of truth (PLAN.md Phase 5).
 *
 * No number appears on any screen except from this file, and nothing here is
 * invented. Every value is transcribed from the published aggregate export at
 * https://ai-health.syntax.fm/dashboard-data.json (Aug 28 refresh, generated
 * 2026-08-28T17:22:32Z), or from the external studies that dashboard cites.
 *
 * ⚠ FROZEN. This dataset is the talk's, at n = 3,593, and does not track the
 * live site. The survey form may stay open and the dashboard may move; the
 * talk does not chase it. `datasetLabel` goes on the glass beside the count so
 * the figure reads as dated rather than merely asserted. Re-pull only as a
 * deliberate decision, and re-check every derived figure in NARRATIVE.md if
 * you do — the beat sheet quotes shares and n's throughout.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ THE VIDEO'S NUMBERS ARE STALE. DO NOT QUOTE THEM ON STAGE.
 *
 * The YouTube video was cut against the ~1,300-response export. Every headline
 * figure moved when the sample grew to 3,593:
 *
 *     overran their stopping point   46%  →  52%
 *     ...and their sleep changed     58%  →  63%   (vs 17% → 23%)
 *     pressure to produce more       65%  →  71%
 *     skills diminishing             59%  →  63%
 *     less enjoyment                 54%  →  57%
 *
 * Different respondent pool over a longer window — read that as "the figures
 * are not interchangeable," not as a trend. The talk uses THIS file only.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * HONESTY CONSTRAINTS, load-bearing for a talk about mental health:
 *  - Self-selected sample. People who follow Syntax and chose to answer. It is
 *    not a sample of the developer population and must never be presented as
 *    one.
 *  - Descriptive and exploratory. Correlations are tied-rank Spearman ρ on
 *    ordinal responses. Association does not establish cause, and every one of
 *    these pairs could run the other way.
 *  - Cohort figures are percentage-point differences between groups, not
 *    effects. Mid-scale answers sit in neither cohort, so low/high rates are
 *    not complements.
 *  - Only aggregates were ever published. Per-respondent records do not exist
 *    here, so nothing may render 3,593 discrete somethings as if it were
 *    plotting real people.
 *  - The right tail is thin: 255 respondents at four agents, 314 at five, and
 *    the "own pull only" quadrant is 173. Say so whenever they are on screen.
 */

export const SURVEY = Object.freeze({
  respondents: 3593,
  medianAgents: 2,
  datasetLabel: 'Aug 28 refresh',
  responseWindow: 'Jul 31–Aug 28, 2026',
  source: 'ai-health.syntax.fm',
})

/**
 * The five wellbeing questions plus the agent-count question, worded exactly as
 * respondents saw them. `highlight` is the cohort the talk actually argues
 * about, matching the dashboard's own emphasis.
 */
export const QUESTIONS = Object.freeze({
  stopping: Object.freeze({
    key: 'q1',
    title: 'Prompting past when you meant to stop',
    prompt:
      "How often do you find yourself continuing to prompt, or 'just one more prompt'-ing, past when you meant to stop?",
    anchors: Object.freeze(['never', '', '', '', 'daily']),
    highlight: Object.freeze([4, 5]),
  }),
  enjoyment: Object.freeze({
    key: 'q2',
    title: 'Enjoyment or flow from coding now, versus before AI',
    prompt:
      'How much genuine enjoyment or flow do you get from coding now compared to before you started using AI heavily?',
    anchors: Object.freeze(['much less', '', 'same', '', 'much more']),
    highlight: Object.freeze([1, 2]),
  }),
  pressure: Object.freeze({
    key: 'q3',
    title: 'Feeling you should produce more because AI makes it possible',
    prompt:
      "How often do you feel you should be producing more because AI makes it possible, even when you don't want to?",
    anchors: Object.freeze(['never', '', '', '', 'daily']),
    highlight: Object.freeze([4, 5]),
  }),
  skills: Object.freeze({
    key: 'q4',
    title: 'Are your coding skills sharpening or diminishing?',
    prompt:
      'Do you feel your actual coding skills are sharpening, holding steady, or diminishing?',
    anchors: Object.freeze(['sharpening', '', 'steady', '', 'diminishing']),
    highlight: Object.freeze([4, 5]),
  }),
  sleep: Object.freeze({
    key: 'q5',
    title: 'Sleep change since using AI heavily for coding',
    prompt:
      'Has your sleep changed since you started using AI heavily for coding? (later bedtimes, racing thoughts on waking)',
    anchors: Object.freeze(['no change', '', '', '', 'major change']),
    highlight: Object.freeze([3, 4, 5]),
  }),
  agents: Object.freeze({
    key: 'agents',
    title: 'Coding agents typically run at once',
    prompt: 'How many coding agents are you typically running at once?',
    anchors: Object.freeze(['1', '2', '3', '4', '5+']),
    highlight: Object.freeze([1, 2]),
  }),
})

/**
 * The form as respondents saw it: the six scaled questions in the order they
 * were asked, then the open field. `survey-questions` asks exactly this on the
 * glass right after the QR — the room reads the instrument before the readings.
 * The form labelled the open field "(optional)"; the glass drops the word
 * (Scott, 2026-09-09).
 */
export const FORM = Object.freeze({
  questions: Object.freeze([
    QUESTIONS.stopping,
    QUESTIONS.enjoyment,
    QUESTIONS.pressure,
    QUESTIONS.skills,
    QUESTIONS.sleep,
    QUESTIONS.agents,
  ]),
  openEnded: 'Other thoughts',
})

/** Response counts by scale point 1→5. Every array sums to SURVEY.respondents. */
export const DISTRIBUTIONS = Object.freeze({
  stopping: Object.freeze([408, 626, 692, 940, 927]),
  enjoyment: Object.freeze([924, 1136, 659, 562, 312]),
  pressure: Object.freeze([195, 350, 513, 1190, 1345]),
  skills: Object.freeze([120, 325, 869, 1366, 913]),
  sleep: Object.freeze([1253, 632, 622, 707, 379]),
  agents: Object.freeze([1109, 1144, 771, 255, 314]),
})

/** Descriptive means, 1–5. The questions remain ordinal; these are not scores. */
export const MEANS = Object.freeze({
  stopping: 3.376,
  enjoyment: 2.5,
  pressure: 3.874,
  skills: 3.731,
  sleep: 2.534,
  agents: 2.31,
})

/**
 * Tied-rank Spearman ρ between question pairs. Only the pairs the talk uses.
 *
 * The three near-zero entries are a finding, not filler: how hard someone runs
 * AI predicts their stopping difficulty and their sleep, and predicts nothing
 * at all about whether they think their skills are going. Skill worry is flat
 * background dread across the whole sample.
 */
export const CORRELATIONS = Object.freeze({
  stoppingAgents: 0.423,
  stoppingSleep: 0.414,
  sleepAgents: 0.275,
  pressureSleep: 0.29,
  pressureStopping: 0.287,
  pressureAgents: 0.206,
  enjoymentSkills: -0.37,
  // ── the three zeros ──
  skillsAgents: -0.002,
  enjoymentSleep: 0.018,
  stoppingSkills: 0.049,
})

/**
 * Cohort splits. Each is a pair of groups defined by clear low (1–2) and high
 * (4–5) answers; mid-scale respondents are in neither, so `rate` values across
 * a pair do not sum to 1.
 */
export const COHORTS = Object.freeze({
  /** Strongest relationship in the survey: +40 points of sleep change. */
  stoppingToSleep: Object.freeze({
    measure: 'midpoint-or-greater sleep change',
    high: Object.freeze({
      label: 'overran often or daily',
      count: 1867,
      rate: 0.63,
    }),
    low: Object.freeze({
      label: 'rarely or never overran',
      count: 1034,
      rate: 0.231,
    }),
  }),
  /** The same split holds inside a single agent-count band — see NARRATIVE.md. */
  stoppingToSleepAmongLightUsers: Object.freeze({
    measure: 'midpoint-or-greater sleep change, 1–2 agent users only',
    high: Object.freeze({
      label: 'overran often or daily',
      count: 890,
      rate: 0.57,
    }),
    low: Object.freeze({
      label: 'rarely or never overran',
      count: 866,
      rate: 0.21,
    }),
  }),
  skillsToEnjoyment: Object.freeze({
    measure: 'reduced enjoyment',
    high: Object.freeze({
      label: 'skills diminishing',
      count: 2279,
      rate: 0.68,
    }),
    low: Object.freeze({
      label: 'skills sharpening',
      count: 445,
      rate: 0.3,
    }),
  }),
  /**
   * From the export's agents × q1 cross-tab: 453 of the 569 running four or
   * more agents answered 4–5 on stopping (0.796), against 890 of the 2,253
   * running one or two (0.395). The dashboard's insight rounds these to 80%
   * and 40%; the glass rounds the same way. The agent scale tops out at "5+",
   * so the high band is "4 or more", not "4–5".
   */
  agentsToStopping: Object.freeze({
    measure: 'overran their stopping point often or daily',
    high: Object.freeze({ label: '4 or more agents', count: 569, rate: 0.796 }),
    low: Object.freeze({ label: '1–2 agents', count: 2253, rate: 0.395 }),
  }),
  /** Nearly flat: skill worry does not track how hard people use AI. */
  stoppingToSkills: Object.freeze({
    measure: 'skills on the diminishing side',
    high: Object.freeze({
      label: 'overran often or daily',
      count: 1867,
      rate: 0.64,
    }),
    low: Object.freeze({
      label: 'rarely or never overran',
      count: 1034,
      rate: 0.6,
    }),
  }),
})

/**
 * Outcome rates by concurrent agent count. Benefit and cost climb together;
 * skill worry is the line that refuses to follow either of them.
 */
export const AGENT_OUTCOMES = Object.freeze([
  Object.freeze({
    agents: 1,
    count: 1109,
    enjoymentUp: 0.179,
    sleepChange: 0.319,
    overran: 0.283,
    skillsDiminishing: 0.628,
  }),
  Object.freeze({
    agents: 2,
    count: 1144,
    enjoymentUp: 0.23,
    sleepChange: 0.467,
    overran: 0.503,
    skillsDiminishing: 0.657,
  }),
  Object.freeze({
    agents: 3,
    count: 771,
    enjoymentUp: 0.276,
    sleepChange: 0.589,
    overran: 0.68,
    skillsDiminishing: 0.636,
  }),
  Object.freeze({
    agents: 4,
    count: 255,
    enjoymentUp: 0.329,
    sleepChange: 0.624,
    overran: 0.776,
    skillsDiminishing: 0.62,
  }),
  Object.freeze({
    agents: 5,
    count: 314,
    enjoymentUp: 0.366,
    sleepChange: 0.659,
    overran: 0.812,
    skillsDiminishing: 0.58,
  }),
])

/**
 * WHO IS SETTING THE PACE — the pivot chart of the talk.
 *
 * Respondents who answered clearly high (4–5) or low (1–2) on BOTH their own
 * pull (stopping) and outside pressure. 2,489 of 3,593 classify; mid-scale
 * answers are excluded. Same behaviour, four different prices — and no cell is
 * free.
 */
export const DRIVE_QUADRANTS = Object.freeze({
  classified: 2489,
  total: 3593,
  cells: Object.freeze([
    Object.freeze({
      id: 'pull',
      label: 'Own pull only',
      pull: true,
      pressure: false,
      count: 173,
      meanEnjoyment: 3.301,
      meanAgents: 2.538,
      enjoymentUp: 0.462,
      sleepChange: 0.439,
      skillsDiminishing: 0.48,
    }),
    Object.freeze({
      id: 'both',
      label: 'Both',
      pull: true,
      pressure: true,
      count: 1484,
      meanEnjoyment: 2.543,
      meanAgents: 2.789,
      enjoymentUp: 0.239,
      sleepChange: 0.66,
      skillsDiminishing: 0.668,
    }),
    Object.freeze({
      id: 'push',
      label: 'Outside pressure only',
      pull: false,
      pressure: true,
      count: 564,
      meanEnjoyment: 2.053,
      meanAgents: 1.754,
      enjoymentUp: 0.119,
      sleepChange: 0.293,
      skillsDiminishing: 0.688,
    }),
    Object.freeze({
      id: 'neither',
      label: 'Neither',
      pull: false,
      pressure: false,
      count: 268,
      meanEnjoyment: 2.821,
      meanAgents: 1.586,
      enjoymentUp: 0.328,
      sleepChange: 0.119,
      skillsDiminishing: 0.392,
    }),
  ]),
})

/**
 * Not survey data. Published studies the dashboard cites, kept here so the
 * talk's external claims carry their sources with them.
 */
export const EXTERNAL = Object.freeze({
  copilot: Object.freeze({
    metric: '26% more',
    claim: 'Developers using GitHub Copilot completed 26% more pull requests.',
    source: 'Cui et al., 2025 — 2026 AI Index Report',
  }),
  metr: Object.freeze({
    metric: '19% slower',
    claim:
      'Experienced developers were 19% slower using AI — while believing it helped.',
    source: 'Becker et al. (METR), 2025 — 2026 AI Index Report',
  }),
  /**
   * Software developer headcount, percent change from each age band's own 2022
   * peak. Zero is that band's peak, so these are trajectories, not headcounts.
   *
   * ⚠ CAVEAT THAT MUST BE SPOKEN: unemployment rose across every kind of job in
   * this window, and rose MORE for the jobs least exposed to AI. This is not
   * proof that AI took those jobs.
   */
  earlyCareerEmployment: Object.freeze({
    periods: Object.freeze([
      "Jan '21",
      "Jul '21",
      "Jan '22",
      "Jul '22",
      "Jan '23",
      "Jul '23",
      "Jan '24",
      "Jul '24",
      "Jan '25",
      "Jul '25",
    ]),
    series: Object.freeze([
      Object.freeze({
        label: '22–25',
        values: Object.freeze([-16, -9, -5, 0, -3, -9, -12, -15, -18, -20]),
      }),
      Object.freeze({
        label: '26–30',
        values: Object.freeze([-14, -8, -3, 0, -1, -4, -5, -5, -6, -6]),
      }),
      Object.freeze({
        label: '41–49',
        values: Object.freeze([-17, -10, -5, 0, 2, 4, 6, 8, 10, 12]),
      }),
    ]),
    exposureGap: -0.16,
    source:
      'Brynjolfsson et al., 2025 — 2026 AI Index Report, Fig. 4.4.29 · readings digitised from the plot',
  }),
  /**
   * The post that caused this survey, quoted verbatim.
   *
   * Rob is the reason the form exists — not an interviewee, so unlike everyone
   * else in the talk he is named (NARRATIVE.md §8). The beat used to be four
   * lines of authored poetry ABOUT this post; it is now the post.
   *
   * This source record stays verbatim, including the profanity and the company
   * he names. The terminal renderer softens the profanity only in the projected
   * copy, without altering the preserved source text.
   *
   * Text, author, date and counts retrieved from X's public syndication
   * endpoint (cdn.syndication.twimg.com) on 2026-08-31. The REPLY count is the
   * figure the argument actually rests on — the thread full of people saying
   * this was normal is what turned an anecdote into a question worth asking.
   * An impressions figure was not available from that endpoint; an earlier
   * draft of this file carried "4.7M" from NARRATIVE.md, which nothing here
   * could source, so it is not quoted on the glass.
   */
  robPost: Object.freeze({
    author: 'Rob Hallam',
    handle: '@robj3d3',
    date: '12 JULY 2026',
    url: 'https://x.com/robj3d3/status/2076356929878966555',
    paragraphs: Object.freeze([
      "I'm done with them fucking with us.",
      'Ended up in hospital today from stress.',
      'Stayed up all night pushing my limits too hard, thinking it would be removed.',
      'Health comes first.',
      'Do better @AnthropicAI',
    ]),
    likes: 2913,
    replies: 798,
    source: 'x.com/robj3d3 · retrieved 2026-08-31',
  }),
  /**
   * The frame the talk ends on. AI output yields a RESULT; a result only
   * becomes a RESPONSE once a person takes RESPONSIBILITY for it. The direct
   * edge exists and is passive; the routed one is active and critical.
   */
  threeR: Object.freeze({
    title: 'The 3R principle',
    claim: 'A result becomes a response only after someone takes responsibility for it.',
    source: 'Adapted from Manzotti, npj Artificial Intelligence, 2026',
  }),
})

/** Total responses across a distribution — a guard against transcription drift. */
export function totalOf(distribution) {
  return distribution.reduce((sum, count) => sum + count, 0)
}

/** Share of respondents who chose any of `levels` (1-indexed scale points). */
export function shareOf(distribution, levels) {
  const total = totalOf(distribution)
  if (total === 0) throw new Error('Empty distribution has no share')
  const inCohort = levels.reduce((sum, level) => {
    const count = distribution[level - 1]
    if (count === undefined) throw new Error(`Scale point ${level} is off the 1–5 scale`)
    return sum + count
  }, 0)
  return inCohort / total
}

/** Count of respondents who chose any of `levels`. */
export function countOf(distribution, levels) {
  return levels.reduce((sum, level) => sum + distribution[level - 1], 0)
}
