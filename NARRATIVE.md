# The narrative — "The True Cost of AI Coding"

The argument, beat by beat, mapped onto the camera move that already exists.

Sources: the [survey](https://ai-health.syntax.fm) (Aug 28 refresh, n = 3,593)
and the [video](https://www.youtube.com/watch?v=iPUn1Fnfn0k) — data,
relationships and advice only, no interview footage. Every number on this page
traces to `src/data/survey.js`. PLAN.md owns the build; ART-DIRECTION.md owns
the look; this file owns what the talk says.

**Copy in here is a draft for Scott to rewrite.** The beat structure and the
number placement are the deliverable.

---

## 1. The thesis

> The cost is real, and you cannot see it from where you are standing.

At your desk it looks like a personal failure of discipline — *I stayed up too
late again, I'll be better tomorrow.* One step back, it's every desk in the
building. One step back, it's infrastructure, and the pace was never yours to
set. One step *in*, it's your own head.

The reason "just try harder to stop" doesn't work is that **the thing you're
fighting isn't at your scale.** And neither is the fix.

That is exactly what the camera already does. The form is the argument — which
is why the talk should not explain the metaphor at any point. Let the room work
it out; they will.

### The two pillars

Everything else is context for these two. They get the most time, the best
staging, and the mechanism explained — not just the number.

- **The machine you can't put down.** Why prompting is hard to stop, and what
  that does to sleep. Lives at HOME. Carries the survey's strongest
  relationship (ρ = 0.41).
- **The skill you can't feel going.** Why the ability atrophies, and why your
  own sense of it is not a working gauge. Lives INSIDE THE GLASS. Carries the
  survey's strongest negative (ρ = −0.37) and the beat the phosphor field was
  built for.

They bookend the descent. The cubicle and the wall in between are the reason
neither one is optional.

---

## 2. The mapping

| Scale | Survey question | The finding | The move |
|---|---|---|---|
| **Cold open** — flat glass | (Scott's own usage) | after-midnight hours | *This is me.* |
| **Home** — one desk, 3am | q1 stopping · q5 sleep | **the slot machine**; 52% overrun; 63% vs 23% sleep | *It isn't discipline.* |
| **Cubicle** — institutional | q3 pressure | 71% feel it; +26% PRs; −19% speed | *The pace isn't yours.* |
| **Wall** — 54 agents | agents | 80% vs 40% overrun; benefit and cost climb together | *The throttle has a price.* |
| **Inside the glass** | q4 skills · q2 enjoyment | **the atrophy**; ρ = −0.37; skill worry uncoupled | *And you can't feel it.* |
| **The turn** — phosphor | drive quadrants | Same keystrokes, four prices | *Who's holding the throttle?* |
| **The return** — back out | advice | Self → habit → system | *The fix is a stack.* |

---

## 3. Beat sheet — as built

**This is the shipped order**, 34 slides, matching `src/slides/index.js`
exactly. Numbers are slide indices (the 0–9 jump keys and `?slide=<id>`).
Suggested copy is draft.

**The rhythm:** data beats FILL THE GLASS, reveal beats sit in the room. That is
not a legibility compromise, it is the thesis — while you read the number you
are in the same trance as the person at the desk; when the camera pulls back you
see where they were sitting. (A chart framed inside the room was also measured
and is simply not readable from the back of a hall.)

**The pacing:** that alternation runs per ACT, never per beat. Enter a stage, do
all the room work in one run, then move to the glass once and stay for the whole
data run. Caveats HOLD the frame rather than earning a flight — a qualification
is the same thought as the chart it qualifies. The deck makes 20 camera moves;
an earlier cut made 28 and visibly yo-yoed.

### ① Cold open — the flat screen, then the tube wakes at the chat window

| # | Slide | Glass | The argument |
|---|---|---|---|
| 0 | `cold-open` | "the true cost of ai coding" | — |
| 1–2 | `intro-syntax` `intro-sentry` | Identity assets | Show and partner, as local monochrome assets. |
| 3 | `agent-session` | The harness runs a real exchange | Scott asks his own agent what his week looked like. |
| 4 | `rob` | **the post itself, with profanity censored** | **Rob Hallam (@robj3d3), 12 July 2026 — 798 replies.** "I'm done with them f***ing with us. / Ended up in hospital today from stress. / Stayed up all night pushing my limits too hard, thinking it would be removed. / Health comes first. / Do better @AnthropicAI" The source record remains verbatim; only the projected profanity is softened. An earlier cut paraphrased this into authored lines; a room has no reason to believe a paraphrase of a thing that exists. The REPLY count is the argument — eight hundred people turned up to say this was normal, and that is the moment an anecdote became a question worth surveying. Text/date/counts from x.com's public syndication endpoint, retrieved 2026-08-31. |
| 5 | `intro-qr` | the code, and **3,593** | **Moved out of the identity run.** Third from the top it asked a room that had been told nothing to scan a survey about a problem it had not met; here they have just read the post and the reply count and the code answers the question that leaves them with. It also carries the base count now — that number is the reason to scan, and it was being spent as an act marker four acts later. Resolves to **ai-health.syntax.fm**: charts first, form second. |
| 6 | `survey-questions` | the six questions, and the open field | **The instrument, before the readings.** Every question worded exactly as respondents saw it — no scales, no anchors, no counts (Scott, 2026-09-09). The room has just been handed the code; this is what the code leads to, and every data beat after it picks one of these lines back up. |

> ⚠ **`src/data/agentUsage.js` is still rehearsal copy.** The open trades on
> "this is my week." Scott supplies the real numbers and the personal stories.

### ② Home — the machine you can't put down · **PILLAR 1**

Still the glass, still head-on. The tube has been awake since the chat window
(slide 3 — the title and the two identity assets are the only flat frames), so
every beat here carries the same drive as the data runs later, and the room
learns where that tube sits only once the data has landed and the machine has
paid. The pull-back closes the act instead of opening it.

Data first, machine second (Scott, 2026-09-09): the room reads the overrun and
what it does to sleep, and *then* watches the thing that does it.

| # | Slide | Glass | The argument |
|---|---|---|---|
| 7 | `q-stopping` | q1, **52%** often or daily | The survey borrowed the machine's own phrasing: *"just one more prompt."* |
| 8 | `stopping-sleep` | **63%** (n=1,867) vs **23%** (n=1,034) | Strongest relationship in the survey, ρ = 0.41. The loop doesn't end at your bedtime. **Counterweight, spoken over this chart:** 35% report *no* sleep change (n=1,253). Then the disclaimer — this doesn't prove prompting wrecked anyone's sleep; it could run the other way. Once, here, and meant. (`stopping-caveat` used to hold the same chart as a press of its own; two identical glasses in a row read as a slide that did not advance — cut 2026-09-09.) |
| 9 | `slot-machine` | three reels, Enter is the lever | **The mechanism, shown — after the data it explains.** Four pulls: `7 7 $`, `7 @ 7`, `7 7 #`, then `7 7 7`. Three near-misses before the one that pays, each pull typed as *one more prompt*. Not a reliable reward — an unpredictable one. Variable-ratio is the most durable schedule there is, more than a reward that always comes, and the dopamine fires on the **anticipation**; the near-miss isn't failure, it's the fuel. Deterministic reels; the prompt is the lever. Restored 2026-09-02; moved after the sleep data 2026-09-09, when `variable-reward` ("most prompts are not the one.") was cut — the machine names itself. |
| 10 | `reveal` | (the glass recedes, carrying the paid line) | The physical punchline, as ONE move: the dolly back into the room. The tube has been awake since the chat window, so the housing and the desk arrive around an image the room has already accepted. `tube-wake` used to hold the wake still and only then move — two presses with a dead spot between them — and the three-quarter and profile waypoints that followed re-explained the same fact from two more angles. The punchline lands once. Moved here from after the QR (2026-09-02), so it lands on a room that has just read the data. |

The cold-open exchange now PLAYS ITSELF rather than waiting on Enter (see
`autoplay` in slides/index.js). It is not a demo the presenter performs — it is
the machine working while Scott talks over it — and the variable-reward beat
that used to be performed on the same harness (`the-lever`) was cut, so nothing
in this act asks him to drive a keyboard on stage.

### ③ Cubicle — the pressure

| # | Slide | Glass | The argument |
|---|---|---|---|
| 11 | `cubicle-threshold` | "it is not just you." | — |
| 12 | `q-pressure` | q3, **71%** · 37% daily | Seven in ten. The office arrives behind this glass; the room does not see it yet. |
| 13 | `productivity-paradox` | **+26%** PRs · **−19%** speed | The tools work. And experienced devs were slower while *believing* they were faster. Both get used to ask for more. |
| 14 | `cubicle-wide` | (holds the paradox chart) | Neighbouring pools of agent activity over the partitions. If it's possible to go faster we must go faster — and nobody asks why. Saved effort returns as decisions, supervision and a higher baseline, never as rest. After the data, not before it (2026-09-02): the office is the pull-back that closes the act, the way the desk closes Pillar 1. |

### ④ Wall — the throttle

| # | Slide | Glass | The argument |
|---|---|---|---|
| 15 | `q-agents` | median **2**, 63% run 1–2 | Most people are not running ten agents. |
| 16 | `agents-stopping` | **80%** (n=569) vs **40%** (n=2,253) | Double the overrun rate. More levers, more pulls. Exact: 453/569 = 79.6% of people running four or more agents (the scale tops out at "5+"), 890/2,253 = 39.5% of those running one or two — verified against the export's agents × q1 cross-tab 2026-09-02. |
| 17 | `stopping-beats-count` | **57%** (n=890) vs **21%** (n=866) | **The tell.** Hold agent count constant and the sleep gap barely shrinks. It isn't how many agents — it's whether you can stop. Pillar 1 from a second direction, and the finding the video never reaches. |
| 18 | `agent-wall-near` | — | **After the data, not before it.** Neighbours enter peripheral vision. |
| 19 | `agent-wall` | — | The pull-back used to OPEN this act, so the room saw fifty-four screens and only then learned the median developer runs two — the reveal explaining itself away. Now the data lands first and the camera pulls back onto a wall they have every reason not to expect. The escalation is trivially logical and that is the problem: one, two, four — there is no number at which the reasoning stops. **Nothing may be scheduled between these two.** |

### ⑤ The skill you can't feel going · **PILLAR 2**

**Mechanism before consequence.** The finding is stated on the glass, the
descent explains *why* it happens with the synapse as the visual aid, and the
glass then returns to put the question to the room. The grill sits after the
decay on purpose — "you can't feel it going" only pays if the room has just
watched something disappear in silence.

| # | Slide | Glass | The argument |
|---|---|---|---|
| 20 | `phosphor-return` | "losing our skills." | — |
| 21 | `q-skills` | q4, **63%** diminishing | Only **12%** say sharpening (n=445). |
| 22 | `q-enjoyment` | q2, **57%** less | 18% the same. 24% enjoy it *more*. |
| 23 | `skills-enjoyment` | **68%** (n=2,279) vs **30%** (n=445) | **The finding.** ρ = **−0.37**, strongest negative in the survey. Not two findings — mostly the same people. Say plainly that the survey measured *belief* and never tested anyone; then say why belief is what matters, because it's what keeps you in the field. |
| 24 | `agents-outcomes` | sleep **32→66%**, enjoyment **18→37%**, skills **flat, dashed** | Benefit and cost climb *together*. No setting moves one without the other. Moved after the skill beats (2026-09-02): the flat line is the last thing on the glass before the descent. |
| 25 | `inside-glass` | the dream — fireflies | The whole descent in ONE move: the glass opens and the camera keeps going through it into the cloud. The motes are fireflies now (2026-09-02): each wanders on its own slow seeded path and blinks on its own rhythm, so the cloud is a swarm of live things rather than a drifting texture. `phosphor-approach` and `phosphor-threshold` used to hold in front of this as two separate stops, when the one thing a descent must not do is stop. |
| 26 | `synapse` | the fireflies settle into the network | **WHY 1 — NEUROPLASTICITY.** The brain is an efficient machine and prunes what it isn't using. The same motes that were wandering settle into their network positions and stay put — explained over it, which is not a metaphor for what's being described but a picture of it. The instrument you played in middle school. |
| 27 | `synapse-decay` | connections die one by one | **WHY 2 — use it or lose it**, watched rather than asserted. Say nothing. The silence is the point. |
| 28 | `what-gets-pruned` | "grill me." — a brain on a grill | **WHY 3, put to the room.** The glass reforms over the flight out of the cloud (`phosphor-exit` used to hold that as a beat of its own, with nothing to say on it; cut 2026-09-02) and lands on a brain on a grill. Each time it lands a question pops up — *could you have written this without the model? did you read the diff? do you know why it works? could you debug it by hand? would you notice if it was wrong?* — Scott answers with **Y** or **N** and the answer flips it. Five questions, then the tally. The questions are placeholder copy. |

The correlation matrix and the drive quadrants are **not** drawn (cut
2026-09-02, with `three-zeros` and `drive-quadrants`): the data stays in
`src/data/survey.js` for the talk to quote — the three near-zero pairs, and
n = 173 for own-pull — but the room gets the question, not another chart.

### ⑦ The return — the fix is a stack

| # | Slide | Stage | The argument |
|---|---|---|---|
| 29 | `return-cubicle` | `cubicle`, "you have to be allowed / to stop." on the monitor | **The ceiling.** Everything about to be said assumes you're allowed to stop. Against a quota, or a manager who treats the tool as a magic bullet, a 15-minute timer will not save you. Healthy prompting cannot be carried by personal discipline alone. The line stays on the monitor for the whole beat; `act-ceiling`, `early-career` and its caveat were cut 2026-09-02. |
| 30 | `act-boundaries` | `cubicle`, glass | "go for a walk." over a perspective line drawing of a path through bare line trees, walked along at walking pace. |
| 31 | `boundaries` | `home`, "you are in control." on the monitor | **How you'd know**, then **what works** — both at the desk where they apply. Sleep first, loss of interest, exhaustion that doesn't clear, anxiety, pulling away from people; then somatization. Then: box the loop (10–15 min, then stop whether or not it landed — a timer beats a variable-reward schedule, willpower doesn't); make stopping structural, not moral; stay the one deciding (that's Pillar 2's answer — put the reps back); narrow the ambition; talk to people, not just the model. The glass holds one line so the screen never lectures. |
| 32 | `close` | `home`, lights off | The lights go off in the room over the flight and the title comes back on the glass — same words as slide 0, on a screen you now know is an object, alone in the dark the way it was at 3am. Then the idle cursor. Hold it blinking and stop talking. `three-r` was cut 2026-09-02. |

The return visits **two** rooms, not three. An earlier cut stopped at the wall
first to say "turn your agent count down" — a point `stopping-beats-count`
already made better, and it cost two camera flights to say something the talk
had itself qualified into nothing.

### What changed from the drafted beat sheet

Three things, all forced by the medium and all improvements:

- **The WHY chain runs mechanism → consequence.** An earlier cut made the whole
  argument on glass first and left the descent as wordless payoff. But the
  synapse IS the neuroplasticity explanation, so that put the mechanism five
  slides after its own consequence. The statements now follow the decay, which
  also means "you can't feel it going" arrives right after the room watches
  something disappear in silence.
- **`phosphor-exit` was added.** Coming back needs its own glass-filling beat to
  occlude the phosphor→wall swap, exactly as the thresholds do going in. It
  earns its place: the motes fade and the glass rewrites itself with the
  population they were made of.
- **Symptoms and boundaries share one slide**, and `drive-quadrants` is a ranked
  bar chart on the glass rather than a phosphor 2×2 — the phosphor morph is
  still open (§6). Ranked bars are arguably better for a live room anyway: the
  beat is read top to bottom, and a ranked list *is* that order.

## 4. The ending (PLAN §7 #1)

**Recommendation: come back out, and land on slide 1.**

The talk's form is *"everything is something you thought you were looking at,
seen one step further out."* The ending has to invert that or the form has no
resolution — otherwise the talk ends 100× inside a screen, which is an image,
not a conclusion.

It also solves a staging problem. The advice is about your actual 5pm and your
actual desk. Delivered from inside an abstract phosphor lattice it's
weightless; delivered at the cubicle and the home desk it has a room around it.
And the autonomy caveat (beat 38) **needs the cubicle physically back in frame**
— the argument made in the environment rather than on a slide, which is what
PLAN.md §1 says the sets are for.

Ending on the title with the tube on is free: no new copy, and the last image is
the first image, changed by everything between.

Rejected: **the synapse reconnecting** — too neat, and the data doesn't support
it. Rejected: **staying inside for the advice** — the advice needs a desk.

---

## 5. Chart, line, or silence

**Chart:** usage/after-midnight · q1 · stopping→sleep · q3 · +26%/−19% ·
early-career employment · agents distribution · agents→stopping ·
agents→outcomes · stopping-beats-count · q4 · q2 · skills→enjoyment · drive
quadrants · 3R diagram.

**Statement on bare glass:** "it is not just you." · "losing our skills." · 3,593 ·
what-gets-pruned · **the three zeros**.

**The form itself:** `survey-questions` — the six questions and the open field
as a numbered list, worded as respondents saw them and nothing else.

**Performed, after the data:** the slot machine. `slot-machine` follows
`stopping-sleep`, so the room watches the thing that produced the numbers it
has just read: four Enter presses, three near-misses, then the pay — the reels
are a catalog form with authored outcomes, so the spin is deterministic and the
churn lasts exactly one pull. `variable-reward` used to name the mechanism
first, as one line of glass, and was cut (2026-09-09) — the machine names
itself. `the-lever` had staged this on the harness and was cut for putting the
presenter's hand on a keyboard; it is back by Scott's call (2026-09-02), with
the pull as the lever rather than a transcript to drive.

**Said with nothing on screen** — the glass going dark *is* the emphasis:
- The sampling disclaimer (self-selected; not the developer population).
- The employment-chart caveat.
- "We have no way of knowing which" (beat 32).
- The autonomy caveat (beat 38) — the moment the talk stops being about tools.
- Most of beats 39–40.

**Deliberately not drawn:** the 6×6 correlation matrix (see beat 31), and any
visual rendering 3,593 discrete marks — per-respondent records were never
published, so a dot-per-person plot would be a fabrication.

---

## 6. Visual forms

Built: **`series`** (multi-trace, shared x-axis, signed domain, dashed option —
slides 21 and 28) and **`diagram`** (labelled nodes, directed edges, per-edge
intensity — slide 41). The cohort splits reuse `distribution`, whose label
column now sizes itself so a cohort's n cannot be overrun by its own bar.

Still open:

- **`quadrant` in phosphor** — the drive quadrants rebuilt from the subpixel
  deposits themselves, area-encoded count and brightness-encoded mean. This is
  the Phase 4 payoff and the one remaining place the phosphor field does real
  data work. `PhosphorField.jsx` already morphs rest→synapse through a
  per-instance target attribute with a seeded delay, so a third target is the
  same pattern rather than a rewrite. Slide 35 ships as a ranked bar chart in
  the meantime, which is complete, not a stub.

---

## 7. Rules this content has to obey

1. **Never quote the video's numbers.** They're from the ~1,300 export and every
   headline moved. `src/data/survey.js` carries the mapping; read it before
   writing any line with a percentage in it.
2. **Every cohort figure gets its n on the glass** — especially 4–5 agents
   (569), own-pull (173), skills-sharpening (445).
3. **Say "these people," never "developers."** Self-selected sample. The video
   is careful about this; the talk must be too.
4. **Perceived skill is perceived.** Beat 35 says it out loud once. The survey
   never tested anyone's ability, and the talk must never imply it did.
5. **Association, once, early, and meant.** Beat 10. Don't re-hedge every chart
   afterward — it reads as either low confidence or low care.
6. **Advice never arrives before the autonomy caveat.** Advice-then-caveat is a
   talk about personal responsibility; caveat-then-advice is a talk about
   working conditions. The second is the one the data supports.
7. **The support line.** The video carries it and a live room needs it more, not
   less: 988 in the US, ADAA.org. Put it on the resources the QR resolves to,
   not on a title card.
8. **No interviewee is named or shown.** Not on the glass, not out loud, not in
   the resources. The talk stands on the survey, the published studies, and
   Scott's own experience. Where the video used a person's framing, the idea is
   re-argued in Scott's voice or dropped — never quoted anonymously, which
   reads as borrowed authority nobody can check. Published work (the 2026 AI
   Index studies, the 3R paper) is a citation, not an interview, and stays.

---

## 8. Settled, and still open

**Settled with Scott (2026-08-28):**
- Scott supplies his own usage figures and personal stories.
- **Rob's story goes immediately after Scott's own usage** (beat 5). Rob is the
  viral tweet that caused the survey, not an interviewee — he stays.
- The QR resolves to `ai-health.syntax.fm`; the charts link on to the survey.
- Skill atrophy and the slot machine are the two pillars (§1).
- **The dataset is frozen at n = 3,593** for this talk. The form may stay open;
  the talk does not chase it. The stat slide carries "Aug 28 refresh" so the
  number is dated rather than merely asserted.
- **No interviewee from the video is named or shown.** See §7 rule 8.
- Talk length is deferred until after Scott rehearses it.

**Still open:**
1. **Scott's real usage numbers and personal stories** — slides 4 and 5, plus
   the tell in slide 40. The only thing blocking the cold open.
2. **All copy is draft.** Every statement, act marker and session line in the
   deck is placeholder in Scott's voice, marked as such in the source.
3. **Does the clinical material get a citation?** (Slides 12, 39, 47.)
   Variable-ratio reinforcement, neuroplasticity and somatization are standard
   findings, not anyone's private opinion, so attributing them to *the field* is
   both honest and interviewee-free. Recommend one spoken clause —
   "psychologists call this…" — over either silence or a name.
4. **The phosphor quadrant** (§6), and whether slide 35 stays a ranked bar.
