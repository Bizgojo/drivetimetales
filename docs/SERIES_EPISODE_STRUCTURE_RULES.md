# SERIES EPISODE STRUCTURE RULES - Endless Tales
**Version:** 1.0  
**Owner:** Marc Postlewaite / Endless Tales  
**Last Updated:** May 2026  
**Status:** Production doctrine

---

## PURPOSE

Endless Tales is a series-first library. Episodes must work as individual listening experiences and as parts of a larger narrative arc.

This document defines how first episodes, non-final episodes, and final episodes should be structured before drafting.

---

## RELATED DOCTRINE

Use this document with:

- `CLAUDE_STORY_ARCHITECTURE_BIBLE.md` for the full story-construction doctrine.
- `STORY_RESOLUTION_MAP_RULES.md` for the required per-episode problem, escalation, and solution map.
- `ENDING_SATISFACTION_VALIDATION.md` for episode-state ending scores.
- `INTRO_OUTRO_BIBLE.md`, `INTRO_OUTRO_PRODUCTION_RULES.md`, and `BELLE_B_PROMPT_RULES.md` for Belle continuity language tied to episode state.

---

## EPISODE STATE IS MANDATORY

Every episode must know its series state before drafting:

- First episode
- Non-final continuing episode
- Final episode
- Standalone exception case

Episode state controls structure, ending behavior, Belle intro/outro language, and validation expectations.

---

## FIRST EPISODES

A first episode must:

- Establish the series hook quickly.
- Give the listener a concrete episode-level problem.
- Introduce the central character, threat, setting, or engine.
- Resolve the first episode's immediate tension.
- Open the larger series problem.

The first episode should not explain the entire mythology. It should make the listener want episode two.

Strong first-episode transition:

- The missing girl is found alive, resolving the search, but she is carrying a photograph of tomorrow's crime scene.

Weak first-episode transition:

- The detective decides there is more to investigate.

---

## NON-FINAL EPISODES

Non-final episodes must do three things:

1. Resolve episode-level tension.
2. Advance series-level tension.
3. Create strong forward pull.

The episode cannot simply stop at a cliffhanger. It must deliver a meaningful episode result first.

Strong non-final ending:

- Episode problem resolved: Clara escapes the mine with the missing ledger.
- Series problem advanced: The ledger proves the town council knew about the deaths.
- Forward pull: The final page names Clara's brother as the next planned victim.

Weak non-final ending:

- Clara hears a noise, then the episode ends.

The weak version creates interruption, not momentum.

---

## FINAL EPISODES

Final episodes must:

- Resolve the core series problem.
- Pay off the central hook.
- Use setup from prior episodes.
- Provide emotional closure.
- Close the current series experience cleanly.

A finale may leave atmosphere, consequence, or moral unease. It may not leave the main series problem unresolved.

Strong finale ending:

- The town remembers the buried names, the corrupt sheriff is exposed, and Clara chooses to stay long enough to rebuild what her family helped hide.

Weak finale ending:

- The sheriff escapes, the ledger is lost, and Clara says the truth is still out there.

The weak version might work for a middle episode, but it fails as a finale unless a new season is explicitly planned.

---

## EPISODE TRANSITION QUALITY

Strong transitions create forward motion by changing the story state.

Good transition examples:

- The episode's killer is caught, but the evidence proves he was following orders from someone inside the mayor's office.
- The protagonist saves the child, but the child speaks in the voice of the missing priest.
- The map is recovered, but the safest route crosses the land the family swore never to enter.

Weak transition examples:

- Something is still wrong.
- The mystery continues.
- A shadow watches from a distance.
- Tune in next time to find out what happens.

Weak transitions are vague. Strong transitions make the next episode feel necessary.

---

## SERIES-LEVEL TENSION

Every series must define the larger tension that runs across episodes.

Examples:

- Who caused the Bellworth cover-up, and who is still protecting it?
- Why do the missing drivers keep returning to the toll booth?
- What is the real purpose of the emergency siren?

Each non-final episode should either:

- Reveal new information about the series problem.
- Increase the cost of solving it.
- Change who can be trusted.
- Force a more dangerous next step.

---

## VARIETY GUARDRAILS

Across a series, avoid repeating:

- The same episode ending structure.
- The same cliffhanger type.
- The same authority-figure reveal.
- The same hidden-relative reveal.
- The same "the protagonist caused it" reveal.
- The same final object or message device.

Within a series, each episode ending should have a different dramatic function:

- Discovery
- Loss
- Betrayal
- Choice
- Escape
- Exposure
- Sacrifice
- Reversal

---

## FUTURE VALIDATOR TARGETS

Future QC should validate:

- Episode state is present and consistent.
- First episodes open a series problem without over-explaining.
- Non-final episodes resolve episode tension and advance series tension.
- Finales resolve the core series problem.
- Episode transitions are specific, not generic.
- Repeated transition and reveal patterns are flagged across the series.

These rules should be enforced before audio generation and before Belle intro/outro generation.
