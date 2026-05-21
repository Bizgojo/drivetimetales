# CLAUDE STORY ARCHITECTURE BIBLE - Endless Tales
**Version:** 1.0  
**Owner:** Marc Postlewaite / Endless Tales  
**Last Updated:** May 2026  
**Status:** Production doctrine

---

## PURPOSE

This document defines the required story-construction architecture for Claude-generated Endless Tales scripts.

Endless Tales stories must be built before they are drafted. The system must know what problem the story is solving, why that solution is hard, how the middle earns the ending, and what emotional shape the listener receives at the close.

The Story Resolution Map is mandatory before drafting. A script that begins without a resolution map is not production-ready.

---

## RELATED DOCTRINE

This bible is part of the canonical Endless Tales story system:

- `STORY_RESOLUTION_MAP_RULES.md` defines the mandatory pre-draft map.
- `ENDING_SATISFACTION_VALIDATION.md` defines ending scoring and earned-ending checks.
- `SERIES_EPISODE_STRUCTURE_RULES.md` defines first, non-final, and finale episode behavior.
- `INTRO_OUTRO_BIBLE.md`, `INTRO_OUTRO_PRODUCTION_RULES.md`, and `BELLE_B_PROMPT_RULES.md` define Belle continuity, intro/outro state, and audio transition doctrine.

---

## CORE RULE

Every story must define the following before drafting:

1. Main hook/problem
2. Why the solution initially seems difficult or impossible
3. Middle escalation path
4. Final solution
5. Why the ending is earned

This structure applies to standalone exception cases, first episodes, middle episodes, and finales.

---

## STORY RESOLUTION MAP

The Story Resolution Map is the pre-draft contract between premise and ending.

It must answer:

- What problem makes the listener want to continue?
- What blocks the obvious solution?
- What pressure, cost, or revelation escalates the problem in the middle?
- What final action, choice, discovery, sacrifice, or consequence resolves the episode?
- Why could this ending only happen because of what came before?

The map must be specific. Vague statements such as "the hero learns the truth" or "the mystery is solved" are not sufficient.

---

## DIFFICULT SOLUTION RULE

The ending must feel earned.

An ending is earned when:

- The middle creates the conditions for the solution.
- The protagonist pays a cost, makes a difficult choice, or uses a discovery established earlier.
- The solution follows from character, pressure, and setup.
- The listener can look back and see why this ending became possible.

An ending is not earned when:

- A new clue appears at the last second.
- A stranger solves the problem.
- The villain confesses without pressure.
- Luck replaces causality.
- A supernatural or technological answer appears without setup.
- The story simply stops after a reveal.

No coincidence or deus-ex-machina ending is acceptable.

---

## HOOK QUALITY

Strong hooks create a problem with immediate friction.

Good hooks:

- A bus driver hears a missing passenger call from a phone that was buried with him.
- A town's emergency siren starts naming people who will die before dawn.
- A retired thief is forced to steal back evidence from the police station before his daughter is framed.
- A ferry captain finds the same abandoned car waiting on both sides of the river.

Weak hooks:

- A quiet town has a secret.
- A detective investigates a strange case.
- A woman returns home and remembers her past.
- Something mysterious happens one night.

Weak hooks are usually generic because they do not define pressure, consequence, or a specific question.

---

## EARNED ENDINGS

Earned endings resolve the story using materials the listener has already heard.

Earned examples:

- The mechanic defeats the killer because the broken truck radio from scene one can transmit on the mine channel.
- The daughter exposes the mayor because she noticed his left-handed signature in the first interview.
- The trapped hikers survive because the "useless" old trail bell becomes a way to measure distance in fog.

Unearned examples:

- A police officer arrives with the answer after being absent from the story.
- The villain explains the whole plot because the episode needs to end.
- A hidden witness appears in the final minute with perfect evidence.
- A miracle storm, device, or animal saves the protagonist without setup.

---

## SERIES-FIRST ARCHITECTURE

Endless Tales is a series-first production system. Episodes must satisfy both the episode and the larger series.

Non-final episodes must:

- Resolve the immediate episode-level tension.
- Advance the series-level tension.
- Change the listener's understanding of the core problem.
- Create strong forward pull into the next episode.

Final episodes must:

- Resolve the core series problem.
- Pay off the central hook.
- Provide emotional closure.
- Avoid teasing a next episode unless the series has been explicitly renewed.

---

## VARIETY GUARDRAILS

The system must avoid repeated story shapes across the library.

Do not overuse:

- "The trusted authority was the villain."
- "The narrator was dead all along."
- "The monster was grief."
- "The missing person was never missing."
- "The protagonist caused it and forgot."
- Last-minute villain confession endings.
- Final-scene newspaper, radio, or voicemail reveals.

Variety is not randomness. A different ending must still be earned by the map.

---

## FUTURE ENFORCEMENT TARGETS

Future validators should check that every draft includes:

- A complete Story Resolution Map before drafting.
- A main hook with concrete pressure.
- A stated difficult/impossible solution barrier.
- Middle escalation that changes the available ending.
- An ending that uses seeded information.
- No coincidence or deus-ex-machina resolution.
- Episode state behavior for non-final and final episodes.
- Library-level variety checks for repeated twists, endings, and villain reveals.

This document defines the architecture. Generation and validator code should implement it incrementally without changing production audio behavior.
