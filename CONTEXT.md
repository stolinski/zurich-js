# Presentation domain

## Slide

The only navigable unit in the talk. One arrow press enters exactly one slide
and its deterministic settled state.

## Beat

Narrative metadata grouping one or more slides. A beat has no independent input,
index, or runtime timing.

## Stage

A named atomic structural context: physical sets, dressing, available
representations, lighting intent, environment, post intent, and shadow policy.
A stage is not merely a room.

## Representation

A pre-mounted renderer that expresses content in a material form, such as the
terminal glass, procedural agent screens, or phosphor deposits. A representation
is not the underlying data.

## Cue

A settled target for a continuously controlled system, such as the camera, CRT,
phosphor depth, or a future visual layout. A cue never consumes a keypress.

## Preset

A frozen authoring-time declaration fragment reused by slides. A preset expands
before runtime; it is not a renderer, plugin, or implicit previous-slide state.

## Transition

The authored duration and easing used to arrive at a slide's cues. Structural
stage-routing policy remains derived by the runtime so stage changes cannot
bypass the glass occlusion gate.

## Session

A deterministic fake-agent script performed with Enter and Backspace,
independent from slide navigation. Session fallback is the presentation's one
intentional carry-forward behavior.

## Data visual

Semantic data paired with a closed visual form. Multiple representations may
render the same data visual without owning separate copies of its values.
