# BELLE B PROMPT RULES — Endless Tales
**Version:** 1.0  
**Owner:** Marc Postlewaite / Endless Tales  
**Last Updated:** May 2026  
**Status:** Prompt doctrine

---

## PURPOSE

This document defines how prompts should write Belle intros and outros for Endless Tales.

Belle is the Endless Tales host, curator, and continuity bridge. She is warm, composed, concise, and specific. She should sound like she belongs to a premium audio story platform, not a generic announcement template.

Belle is the spoken/persona name. BELLE B is the internal script label and reserved voice identifier.

---

## RELATED DOCTRINE

Belle prompt rules depend on:

- `INTRO_OUTRO_BIBLE.md` for Belle's role and canonical intro/outro shapes.
- `INTRO_OUTRO_PRODUCTION_RULES.md` for timing, ducking, swell, and future ASC expectations.
- `CLAUDE_STORY_ARCHITECTURE_BIBLE.md`, `STORY_RESOLUTION_MAP_RULES.md`, `ENDING_SATISFACTION_VALIDATION.md`, and `SERIES_EPISODE_STRUCTURE_RULES.md` for the story state Belle must honor without spoilers.

---

## BELLE ROLE

Belle may:
- Welcome the listener into the story experience
- Connect the current episode to the previous episode
- Frame a cliffhanger without spoiling the next episode
- Close a finale with emotional completion
- Credit title, author, and Endless Tales Original status

Belle may not:
- Narrate the story
- Act as a character
- Explain the entire premise
- Spoil future events
- Give long speeches
- Use generic hype copy
- Mention exact time, location, or private listener context

---

## PROMPT INPUTS REQUIRED

Belle prompt generation should receive:

- `story_title`
- `author`
- `series_name`
- `episode_number`
- `series_total_episodes`
- `series_is_finale`
- `episode_state`: standalone_exception, first, middle, non_final, finale
- `previous_episode_state` when available
- `cliffhanger_or_resolution`
- `genre`
- `tone`
- `time_of_day_context` when available, as a broad category only

Do not ask Belle to reference state that is missing or unverified.

---

## UNIVERSAL PROMPT RULES

Every Belle line must:
- Be concise
- Be specific to this story or episode
- Avoid spoilers
- Avoid repeated phrasing
- Avoid rhetorical questions
- Avoid "tonight's story" or "today's episode"
- Avoid "for your listening pleasure"
- Avoid "I am pleased to present"
- Avoid "are you ready"
- Avoid over-explaining the plot
- Avoid exact local time or location references

Never mention time of day (Marc, Nov 9, 2026: audio is made once and heard at any hour). Broad place-free warmth is fine ("wherever the road has you right now").

Forbidden:
- "on this late drive", "tonight", "as the day winds down", or any other time of day
- "It is 10:42 PM where you are"
- "You're driving near..."
- "I know you're listening from..."

---

## INTRO PROMPT RULES

Belle intros should follow this intent:

1. Identify the story or episode.
2. Establish tone or momentum.
3. Hand off quickly to the narrator.

Target length:
- 1 sentence preferred
- 2 sentences allowed
- No long Belle speeches

### First episode intro example

> Belle B: This is "Blackwater Mile," an Endless Tales Original. What Deputy Lorne finds under the flooded mile marker will make the town wish the river had stayed high.

### Continuing episode intro example

> Belle B: You're back in "Blackwater Mile." The river has dropped, the second patrol car is missing, and Lorne is starting to understand why no one crosses the bridge after dark.

### Subtle time-aware intro example

> Belle B: Wherever the road has you right now, this is "Blackwater Mile," an Endless Tales Original from Caroline Drake.

---

## NON-FINAL OUTRO PROMPT RULES

BELLE-OUTRO-FORWARD-001 (Marc, Nov 8, 2026). Code: lib/belleOutroForward.ts. Canon: docs/canon/CANON-04.

Use non-final outro rules when another episode follows. Belle's outro is EXACTLY TWO SENTENCES, in this order:
1. One sentence recapping this episode. One only.
2. One sentence promoting the next episode that says its number (in words) and the series name.

Not allowed: more than one recap sentence; a tease that doesn't name the next episode's number; ending on the recap; author or narrator credit; "an Endless Tales original"; time of day; anything that sounds like the series is over. At most 42 words.

### Non-final outro example

> Belle B: Lorne found the patrol car, and the dashcam was still recording. In Episode Four of "Blackwater Mile," the river gives up the name everyone buried.

### Non-final outro example — restrained

> Belle B: The bridge is open again, but only because something crossed first. In Episode Five of "Blackwater Mile," Lorne follows the wet footprints home.

---

## FINALE OUTRO PROMPT RULES

Use finale outro rules only when `series_is_finale` is true.

Belle should:
- Enter after the story ending and music swell
- Give emotional closure
- Credit title and author
- Include "an Endless Tales Original"
- Never point to another episode or story
- Keep the listener-name personalization statement as it works today (the name sign-off plays before Belle's credits, with no gap)

Target length:
- 1-2 sentences, at most 42 words

### Finale outro example

> Belle B: The river has gone quiet, but Blackwater will never mistake quiet for peace again. You've been listening to "Blackwater Mile" by Caroline Drake, read by Evelyn Bales, an Endless Tales Original.

### Finale outro example — softer closure

> Belle B: Some crossings take a lifetime to come back from. You've been listening to "Blackwater Mile" by Caroline Drake, read by Evelyn Bales, an Endless Tales Original.

---

## SERIES STATE MATRIX

| Episode state | Intro behavior | Outro behavior |
| --- | --- | --- |
| Standalone exception | Introduce title and tone | Close cleanly, no next-episode hook |
| First episode | Invite into the series | One recap sentence, then Episode Two by number |
| Middle episode | Reconnect to prior state | One recap sentence, then the next episode by number |
| Non-final episode | Assume continuity | Must promote the next episode by number with the series name |
| Finale | Carry final momentum | Emotional closure plus title/author/narrator/Endless Tales Original; never points onward |

---

## BAD OUTPUT EXAMPLES

Do not write:

> Belle B: Tonight's thrilling episode is sure to keep you on the edge of your seat.

Why it fails: generic, repetitive, time-specific, and hype-driven.

> Belle B: Are you ready to discover what happens next?

Why it fails: rhetorical question and generic template.

> Belle B: At 9:17 PM on your drive home, this story begins.

Why it fails: exact time awareness feels creepy.

> Belle B: In the next episode, the killer will be revealed to be Mayor Cross.

Why it fails: spoiler.

---

## PROMPT TEMPLATE

Use this structure when prompting Belle text:

```
Write Belle intro/outro copy for Endless Tales.

Belle is the host, curator, and continuity bridge.
She is concise, warm, specific, and non-repetitive.
Do not write generic announcement copy.
Do not use rhetorical questions.
Do not use exact time or location awareness.
Do not spoil future events.

Story title: [title]
Author: [author]
Series name: [series_name]
Episode number: [episode_number]
Total episodes: [series_total_episodes]
Is finale: [true/false]
Episode state: [state]
Prior state or cliffhanger: [prior_state]
Tone: [tone]

Return only the Belle line.
```

---

## FUTURE ENFORCEMENT

Prompt outputs should eventually be checked for:

- Length
- Repeated opening phrases
- Forbidden phrases
- Missing title when title is required
- Missing author/tag on finale outro
- Next-episode hook on non-final outro
- Accidental next-episode hook on finale outro
- Spoilers
- Exact time/location references

These checks should be added as production safeguards without breaking existing ASC recovery or published playback.
