# ENDING SATISFACTION VALIDATION - Endless Tales
**Version:** 1.0  
**Owner:** Marc Postlewaite / Endless Tales  
**Last Updated:** May 2026  
**Status:** Production doctrine

---

## PURPOSE

This document defines how Endless Tales should evaluate whether an ending feels satisfying, earned, and appropriate to episode state.

Ending satisfaction is not the same as happiness. A tragic, unsettling, or unresolved series episode can be satisfying if it pays off the promised tension and creates the right kind of listener hunger.

---

## RELATED DOCTRINE

Use this document with:

- `CLAUDE_STORY_ARCHITECTURE_BIBLE.md` for the overall Claude story architecture.
- `STORY_RESOLUTION_MAP_RULES.md` for the pre-draft map that the ending must satisfy.
- `SERIES_EPISODE_STRUCTURE_RULES.md` for non-final and finale closure expectations.
- `INTRO_OUTRO_BIBLE.md`, `INTRO_OUTRO_PRODUCTION_RULES.md`, and `BELLE_B_PROMPT_RULES.md` for state-aware Belle wrap-up language after the story ending.

---

## SCORING OVERVIEW

Future validators should score endings on a 0-100 scale.

Recommended thresholds:

- 90-100: Excellent. Clear payoff, strong causality, emotional completion, and state-appropriate series behavior.
- 75-89: Production-ready. Earned and satisfying, with minor improvement possible.
- 60-74: Needs revision. Some payoff exists, but causality or emotion is weak.
- 0-59: Fail. Ending relies on coincidence, evasion, or incomplete resolution.

No ending below 75 should proceed to production without review.

---

## SCORING CATEGORIES

### 1. Hook payoff - 20 points

Does the ending answer, transform, or meaningfully pay off the main hook/problem?

Full credit:

- The listener understands what happened to the central problem.
- The ending clearly connects to the opening promise.

Failure signs:

- The ending resolves a different problem.
- The original hook is forgotten.
- The story stops after a reveal.

### 2. Difficult Solution Rule - 25 points

Does the ending feel earned by pressure, setup, and choice?

Full credit:

- The middle creates the ending.
- The solution uses seeded information.
- The protagonist's action matters.
- No coincidence replaces causality.

Failure signs:

- Last-minute clue.
- Convenient confession.
- Random rescue.
- New rule introduced at the end.

### 3. Emotional satisfaction - 20 points

Does the ending deliver an emotional result appropriate to the story?

Full credit:

- The protagonist, relationship, or community changes in a meaningful way.
- The closing beat feels intentional.
- The listener receives closure, dread, relief, grief, or anticipation by design.

Failure signs:

- The ending is mechanically solved but emotionally flat.
- The final moment does not know what feeling it wants.

### 4. Episode-state alignment - 20 points

Does the ending behave correctly for its place in the series?

Non-final episodes:

- Resolve episode-level tension.
- Advance series-level tension.
- Create forward pull.

Final episodes:

- Resolve the core series problem.
- Provide emotional closure.
- Do not tease a next episode unless explicitly intended.

Standalone exception cases:

- Resolve the story cleanly.
- Do not create unresolved series obligations.

### 5. Variety and freshness - 15 points

Does the ending avoid repetitive library patterns?

Full credit:

- The twist, reveal, villain function, and final image feel distinct from recent stories.
- The ending emerges from this story's specific setup.

Failure signs:

- Reused villain reveal pattern.
- Reused "it was all grief" or "they were dead" structure.
- Reused final voicemail, newspaper, or radio button.

---

## EARNED VS UNEARNED ENDINGS

### Earned ending

The protagonist survives the mine because she noticed earlier that the ventilation fans reverse direction every twelve minutes. In the finale, she times the blast to the fan cycle, forcing dust through the hidden tunnel and exposing the sheriff's escape route.

Why it works:

- The fan cycle was seeded.
- The middle made the mine geography matter.
- The protagonist solves the problem under pressure.
- The ending reveals both plot truth and character competence.

### Unearned ending

The protagonist is cornered in the mine, then a rescue crew appears because they found a map offscreen.

Why it fails:

- The solution arrives from outside the story.
- The protagonist does not act.
- The map was not seeded.
- The middle did not create the ending.

---

## VALIDATION FLAGS

Future QC should flag:

- "Suddenly" endings.
- Confession-only endings.
- Police arrive endings.
- Dream, hallucination, or memory-reset endings without setup.
- New-character rescues.
- Unseeded supernatural rule changes.
- Finales that leave the core series problem unresolved.
- Non-final episodes that end without episode-level payoff.

---

## FUTURE ENFORCEMENT TARGETS

Future validator code should compare the final scene against the Story Resolution Map and produce:

- Ending satisfaction score.
- Difficult Solution Rule pass/fail.
- Episode-state pass/fail.
- Repetitive-ending risk score.
- Required revision notes if score is below threshold.

This validation should happen before audio generation.
