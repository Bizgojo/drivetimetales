# INTRO / OUTRO PRODUCTION RULES — Endless Tales
**Version:** 1.0  
**Owner:** Marc Postlewaite / Endless Tales  
**Last Updated:** May 2026  
**Status:** Implementation guidance

---

## PURPOSE

This document defines production rules for Endless Tales intro/outro generation, rendering, and future ASC enforcement.

It does not change production audio logic by itself. It is the permanent rule source for future implementation.

---

## RELATED DOCTRINE

Use this document with:

- `INTRO_OUTRO_BIBLE.md` for the canonical creative shape of intros and outros.
- `BELLE_B_PROMPT_RULES.md` for Belle line-generation rules.
- `CLAUDE_STORY_ARCHITECTURE_BIBLE.md`, `STORY_RESOLUTION_MAP_RULES.md`, `ENDING_SATISFACTION_VALIDATION.md`, and `SERIES_EPISODE_STRUCTURE_RULES.md` for the story and episode state that intro/outro production must respect.

---

## SYSTEM RESPONSIBILITIES

The production system must treat intro/outro as part of the listening experience, not as decorative metadata.

Each story or episode should know:
- Whether it is standalone, series episode, or finale
- Series title
- Episode number
- Total episode count
- Whether another episode follows
- Prior episode emotional state when available
- Cliffhanger or resolution state
- Story title
- Author
- Narrator

Belle language must be selected from this state. If state is unknown, the system should choose the safest generic language without implying continuity it cannot verify.

Belle is the spoken/persona name. BELLE B is the internal script label and reserved voice identifier.

---

## AUDIO FLOW RULES

### Intro flow

The canonical intro sequence is:

1. Sting
2. Belle B intro
3. Short beat
4. Music swell
5. Music ducks under narrator
6. Narrator begins story

Production intent:
- The sting signals the Endless Tales frame.
- Belle orients the listener.
- The beat gives Belle's line room to land.
- The music swell carries the listener into the story.
- The music duck prevents masking the narrator.

### Non-final outro flow

The canonical non-final outro sequence is:

1. Story episode ends
2. Music swell
3. Music ducks under Belle B
4. Belle gives cliffhanger recap
5. Belle gives next-episode hook
6. Final music swell and fade

Production intent:
- The story ending lands first.
- Belle enters on supported music, never cold silence.
- The recap is short and tied to the episode ending.
- The hook points forward without spoilers.
- The fade leaves momentum, not abruptness.

### Finale outro flow

The canonical finale outro sequence is:

1. Story finale ends
2. Music swell
3. Music ducks under Belle B
4. Belle gives emotional closure
5. Belle credits title and author
6. Belle says the Endless Tales Original tag
7. Final music swell and fade

Production intent:
- The finale outro closes the series emotionally.
- Belle should not tease a next episode.
- The title/author/tag confirms completion and brand identity.

---

## STATE-BASED LANGUAGE RULES

### Standalone exception

Standalone stories are preserved for repairs, legacy stories, and manually approved exception cases. Belle may introduce and close the story cleanly.

Standalone language must not imply there is a next episode.

### Series first episode

Belle may introduce the title and premise atmosphere, but should not over-explain the whole series.

Good:
> Belle B: This is "The Cut Beneath the Rust," an Endless Tales Original. A salvage crew finds something under the old bridge that was never meant to be pulled into daylight.

Avoid:
> Belle B: In this series, you will meet five characters across seven episodes as they uncover...

### Series middle episode

Belle should assume the listener is already inside the story. The intro may reconnect to the previous episode's emotional or dramatic state.

Good:
> Belle B: You're back in "The Cut Beneath the Rust." The bridge is closed, the river is rising, and Milo still has the thing he found in the mud.

Avoid:
> Belle B: Welcome to a thrilling mystery about a bridge and a salvage crew.

### Non-final episode outro

Belle must not resolve the series. She should recap the immediate cliffhanger and create a clear next-episode pull.

Good:
> Belle B: The bridge is burning, June has disappeared, and the recorder is still playing under the water. Next time on "The Cut Beneath the Rust," Milo follows the signal to its source.

Avoid:
> Belle B: And so the mystery comes to an end.

### Finale outro

Belle should provide emotional closure and credit the work.

Good:
> Belle B: The river gave back what it could, and kept the rest. You've been listening to "The Cut Beneath the Rust" by Caroline Drake, an Endless Tales Original.

Avoid:
> Belle B: Next time, the mystery continues.

---

## TIMING AND QC TARGETS

ASC should eventually enforce these rules:

- No accidental dead air between intro/outro elements
- Silence tails should be short and intentional
- Sting must be present before Belle intro when available
- Music should swell before ducking under narrator
- Music should swell before ducking under Belle outro
- Belle intro should not be clipped at the start or end
- Belle outro should not be clipped at the start or end
- Music should fade cleanly after the final Belle line
- Narrator must remain intelligible over music
- Belle must remain intelligible over music
- Missing intro/outro assets should block final mix when the story is not in a recovery path

Recommended future QC measurements:
- Intro lead silence threshold
- Gap between sting and Belle
- Gap between Belle and story-body start
- Outro tail silence threshold
- Final fade duration
- Relative music-to-voice loudness
- Peak clipping detection
- Missing or zero-byte asset detection

---

## PROMPTING RULES FOR GENERATED BELLE TEXT

Generated Belle text must:
- Be short
- Be specific to the title, series state, and episode state
- Vary in syntax across stories and episodes
- Avoid exact local time or location references
- Avoid spoilers
- Avoid generic hype
- Avoid repetitive templates
- Use finale language only when the episode is actually the finale
- Use next-episode language only when another episode exists

---

## EXAMPLES

### Intro example

> Belle B: This is "The Hollow Road Signal," an Endless Tales Original. A night dispatcher hears one call too many, and the voice on the line already knows her name.

### Non-final outro example

> Belle B: The call has moved from the radio to the house, and Mara has just heard her own voice answer back. In the next episode of "The Hollow Road Signal," she learns who has been listening.

### Finale outro example

> Belle B: The signal is gone, but the road remembers every voice it carried. You've been listening to "The Hollow Road Signal" by Zara Osei, an Endless Tales Original.

---

## IMPLEMENTATION NOTE

Do not remove existing ASC recovery behavior while implementing these rules. Legacy standalone stories and published playback must continue to work. Future enforcement should be added as explicit production gates, warnings, or repair paths rather than destructive rewrites.
