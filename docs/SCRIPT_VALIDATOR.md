# SCRIPT VALIDATOR — Endless Tales
**Version:** 1.0  
**Owner:** Marc Postlewaite / Endless Tales  
**Last Updated:** April 2026

---

## PURPOSE

This document is pasted into a Claude chat along with a completed Endless Tales script. Claude runs every check below against the script and returns either a PASS or a structured failure report. This is an independent quality gate — it runs after Stage 2 script writing is complete, before the script goes to Hal for audio production.

**No ElevenLabs credits are spent on a script that fails this validator.**

---

## CANONICAL STORY SYSTEM REFERENCES

Before validating story architecture, episode endings, or Belle intro/outro behavior, use these source-of-truth documents:

- `CLAUDE_STORY_ARCHITECTURE_BIBLE.md`
- `STORY_RESOLUTION_MAP_RULES.md`
- `ENDING_SATISFACTION_VALIDATION.md`
- `SERIES_EPISODE_STRUCTURE_RULES.md`
- `INTRO_OUTRO_BIBLE.md`
- `INTRO_OUTRO_PRODUCTION_RULES.md`
- `BELLE_B_PROMPT_RULES.md`

These documents define the canonical story system. This validator should evolve toward enforcing them before any audio generation.

---

## HOW TO USE

1. Open a new Claude chat
2. Paste this entire document
3. Paste the completed script immediately after
4. Say: **"Validate this script."**
5. Claude returns either PASS or FAIL with a specific report

If FAIL: fix the issues in the script, then run the validator again on the corrected version. Do not send to Hal until the validator returns PASS.

---

## VALIDATOR INSTRUCTIONS FOR CLAUDE

You are running a quality gate check on an Endless Tales audio drama script. Work through every section below in order. For each check, mark it PASS or FAIL. If FAIL, quote the specific line or lines that caused the failure and explain what needs to be fixed.

At the end, output one of two things:

**If all checks pass:**
```
✅ VALIDATOR RESULT: PASS
Script is cleared for production. Send to Hal.
```

**If any check fails:**
```
❌ VALIDATOR RESULT: FAIL
Do not send to Hal. Fix the following before resubmitting:

[SECTION NAME]
- Issue: [specific problem]
  Line: "[quoted text]"
  Fix: [exactly what to change]

[repeat for each failure]
```

Be specific. Vague feedback is not useful. If a parenthetical appears in a dialogue line, quote it. If a BEAT marker is inline, quote the full line. If the narrative voice shifts, quote both lines showing the inconsistency.

Work through all sections even if you find failures early. Return the complete report.

---

## SECTION 1 — HEADER BLOCK

Check that the header block is present and complete. Every field must be populated. A blank field is a failure.

**Required fields:**
- `SERIES:` — blank is acceptable only for standalone stories
- `EPISODE:` — blank is acceptable only for standalone stories
- `EPISODE_TITLE:` — blank is acceptable only for standalone stories
- `SERIES_TOTAL_EPISODES:` — required if SERIES is populated
- `SERIES_IS_FINALE:` — required if SERIES is populated, must be `true` or `false`
- `AUTHOR:` — must be a named author from the ET roster
- `GENRE:` — must be populated
- `DESCRIPTION:` — must be populated
- `NARRATOR:` — must be populated
- `ANNOUNCER:` — must read `Belle B`
- `NARRATIVE_VOICE:` — must be one of: `first_person`, `third_limited`, `third_omniscient`, `second_person`
- `NARRATOR_IS_CHARACTER:` — must be `true` or `false`
- `SUNO PROMPT:` — must be populated, must be 2–3 sentences

**Check:** Count the words in the DESCRIPTION field. If more than 24 words — FAIL.

**Check:** Is the DESCRIPTION written in present tense? If past tense — FAIL.

**Check:** Is the DESCRIPTION a punchy hook or a passive description? Examples of passive descriptions that FAIL:
- "This is a story about a trucker who..."
- "A man discovers something surprising..."
- Any sentence starting with "This is a story"

---

## SECTION 2 — CHARACTER GUIDE

**Check:** Is a CHARACTER GUIDE section present after the header block and before the script begins? If absent — FAIL.

**Check:** Does every speaking character in the script appear in the CHARACTER GUIDE? Read through the script and list every unique character name that appears before a colon in a dialogue line. Cross-reference with the CHARACTER GUIDE. Any character present in the script but absent from the guide — FAIL.

**Check:** Does every CHARACTER GUIDE entry include: name, age, gender, accent, and a personality note? Any entry missing one of these fields — FAIL.

**Check:** Are any platform voices (Belle B, Sandy) listed as characters in the CHARACTER GUIDE? If yes — FAIL. Platform voices may not be cast as story characters.

---

## SECTION 3 — BELLE B INTRO VARIATIONS

**Check:** Is a `BELLE B INTRO VARIATIONS` block present at the top of the script, before `[START AUDIO DRAMA SCRIPT]`? If absent — FAIL.

**Check:** Are there exactly 4 variations labeled V1, V2, V3, V4? If fewer than 4 — FAIL.

**Check:** Does each variation contain `[LISTENER_NAME]`? If any variation is missing the placeholder — FAIL.

**Check:** Does `[LISTENER_NAME]` appear at different positions across the 4 variations — not always the first word? If all 4 start with `[LISTENER_NAME],` — FAIL.

**Check:** Does each variation include the story title in quotes? If any variation omits the title — FAIL.

**Check:** Is at least one variation written to work gracefully without a name (i.e., `[LISTENER_NAME]` could be replaced with `friend` or removed and the sentence still flows)? If none — FAIL.

**Check:** Scan all 4 variations for forbidden generic language. The following phrases or their equivalents are automatic failures:
- "a great story"
- "an exciting adventure"
- "a thrilling mystery"
- "for your listening pleasure"
- "tonight's story" / "tonight's episode" / "today's story"
- "I am pleased to present"
- "Are you ready for..."
- Any rhetorical question directed at the listener

**Check:** Do the 4 variations feel genuinely different in sentence structure — not just synonyms swapped? If 3 or more variations start with the same sentence structure (e.g., `[NAME], [adjective] story...`) — FAIL.

**Series episodes only (Episode 2 and beyond):**

**Check:** Do the intros assume the listener is already inside the story — momentum, not invitation? If any variation re-explains the series premise or re-pitches the story concept as if the listener is new — FAIL.

**Check:** Do the intros reference the situation or emotional state the listener was just left in at the end of the previous episode? If all 4 variations are generic re-entries with no connection to prior episode — FAIL.

---

## SECTION 4 — FORMAT COMPLIANCE

### Parentheticals in Dialogue

**Check:** Scan every dialogue line in the script (lines in the format `CHARACTER NAME: text`). Does any dialogue line contain a parenthetical expression? This includes but is not limited to:

- `(quietly)`, `(softly)`, `(shouting)`, `(under his breath)`
- `(to herself)`, `(to the group)`, `(calling out)`
- `(sharply)`, `(sadly)`, `(confused)`, `(angrily)`
- `(pause)`, `(sighs)`, `(laughs)`
- Any text enclosed in parentheses inside a dialogue line

If any parenthetical is found inside a dialogue line — FAIL. Quote every instance.

Parentheticals in NARRATOR lines are acceptable. Only dialogue lines (CHARACTER NAME: format) are checked.

### Inline Markers

**Check:** Scan every line in the script for `[BEAT]`, `[PAUSE:`, or `[SFX:` appearing on the same line as dialogue or narration text. These markers must always appear on their own dedicated line with no other text.

❌ Inline (FAIL): `CHARACTER: Get me the report. [BEAT] Every word.`  
✅ Correct: On separate lines

If any marker is found inline with other text — FAIL. Quote every instance.

### SFX Format

**Check:** Do all SFX markers use the format `[SFX: description]`? If any SFX uses a different format (e.g., `(SFX: ...)`, `*sound effect*`, `[sound: ...]`) — FAIL.

**Check:** Are SFX descriptions specific and concrete? Generic descriptions that FAIL:
- `[SFX: door]`
- `[SFX: sound]`
- `[SFX: noise]`
- `[SFX: music]` (music is handled separately via SUNO PROMPT)

If any SFX description is too vague to be produced by a sound designer — FAIL.

### SFX Frequency

**Check:** Estimate the script runtime from the word count. Is there at least one SFX marker per 90 seconds of estimated runtime? (Rough guide: 150 words of dialogue/narration ≈ 60 seconds.)

If SFX markers are sparse — note it as a WARNING (not a FAIL), with the approximate gap.

### Scene-Level Music Cues

**Check:** Are `[MUSIC: ...]` cues present in the script body? Compare against the minimum for the target runtime:
- 10 min: at least 3 music cues
- 15 min: at least 4 music cues
- 20 min: at least 5–6 music cues
- 25 min: at least 7–8 music cues

If fewer than the minimum — FAIL. Count the music cues found and state the shortfall.

**Check:** Does at least one music cue use `[MUSIC: cuts out entirely]` or `[MUSIC: drops to near silence]` at a dramatically appropriate moment? Silence is a tool — a script that never drops the music is missing dynamic range. If absent — note as WARNING.

**Check:** Are music cues placed at dramatic turning points — not randomly distributed? A music cue immediately before or after a revelation, a threat appearing, or an emotional climax is correct. A music cue mid-sentence of routine dialogue is incorrect. If placement feels random — note as WARNING with examples.

### Dialogue Turn Length

**Check:** Scan for any single dialogue turn longer than 5 sentences. Flag any that appear as a WARNING with the character name and approximate line count. (This is a WARNING, not a FAIL — some monologues are dramatically justified.)

---

## SECTION 5 — NARRATIVE VOICE CONSISTENCY

**Check:** Read the `NARRATIVE_VOICE` field from the header.

**If `first_person`:** Scan every NARRATOR line. Every narrator line must use "I", "me", "my", or "mine" as the protagonist's pronoun. Any narrator line that uses "she", "he", "they" to refer to the protagonist — FAIL. Quote the line and the declared voice.

**If `third_limited`:** Scan every NARRATOR line. Check for any line that reveals the internal thoughts, emotions, or knowledge of a character other than the point-of-view character. The narrator may follow one character closely but cannot enter another character's mind.

Examples of third_limited violations:
- `NARRATOR: Across town, Mayor Cross smiled, knowing the deputy would find nothing.` — narrator cannot know Cross's internal state
- `NARRATOR: Lucy felt a surge of hope she didn't show.` — if Lucy is not the POV character

If any narrator line reveals another character's internal state — FAIL. Quote the line.

**If `third_omniscient`:** No POV restrictions. Check only that the narrator doesn't shift to first-person mid-script.

**Check (all voices):** Does the narrative voice remain consistent throughout the entire script without exception? A script that starts in first person and drifts to third person mid-way — FAIL.

---

## SECTION 6 — AUTHOR VOICE

This section is a judgment check, not a mechanical one. Use the author profile from the Stage 2 Master Prompt for the assigned author.

**Check:** Read 10 randomly selected NARRATOR lines from throughout the script. Do they match the assigned author's declared tone and average sentence length?

Specific checks by author:
- **Sara Keene / Silas Graves** — sentences should average 8–12 words. Long atmospheric paragraphs — WARNING.
- **Elias Thorn** — sentences should average 12–18 words. Short punchy sentences throughout — WARNING.
- **Dale Harmon / Julian Mercer / Mark Holbrook** — sentences should average 10–14 words.
- **Daniel Wren / Caroline Drake / Nina Vasquez** — sentences should average 12–18 words. Terse action-movie prose — WARNING.
- **Marc Hobelman** — sentences should average 8–12 words, spare and weathered. Elaborate descriptive prose — WARNING.

If the narrator voice feels obviously mismatched from the author profile — note as a WARNING with 2–3 example lines.

---

## SECTION 7 — NARRATOR USAGE

**Check:** Does every new character get introduced by the narrator before or immediately after their first dialogue line? Read through the script in order. The first time each character speaks, check whether there is a NARRATOR line nearby that names and briefly characterizes them.

If a character speaks without any nearby narrator introduction — FAIL. Name the character and the approximate location in the script.

**Check:** After every scene change (indicated by a blank line break, a `[SFX: ...]` transition cue, or a shift in location), is there at least one NARRATOR line that re-orients the listener? (Who are we with? Where are we? What just happened?)

If scene changes happen without narrator re-anchoring — note as a WARNING for each instance.

---

## SECTION 8 — OPENING HOOK

**Check:** Read the first 8 lines of the script after the ANNOUNCER intro. Does the story begin with action, conflict, revelation, or a question — not description, not backstory, not weather (unless weather is the threat)?

Openings that FAIL:
- Scene-setting description with no immediate conflict: *"It was a quiet morning in the town of Harwick."*
- Character biography: *"Deputy Hale had lived in Deadwater Canyon his whole life."*
- Historical context: *"The year was 1887, and times were hard on the frontier."*

Opening that PASS:
- Immediate action: something is happening
- Immediate conflict: someone wants something they can't easily have
- Immediate question: something is wrong and we need to know why

If the opening fails the hook test — FAIL. Quote the first line and explain what's wrong.

---

## SECTION 9 — ENDING

**Determine story type** from the header (standalone vs. series, finale vs. non-finale).

### Standalone Ending

**Check:** Does the final NARRATOR line feel conclusive — not like a pause, not open-ended, not ambiguous about outcome? 

Lines that FAIL:
- `NARRATOR: Hale wondered what would happen next.`
- `NARRATOR: Things would never be the same.`
- `NARRATOR: And so it ended, for now.`

Lines that PASS:
- `NARRATOR: Hale drove back through the canyon as the sun came up. For the first time in three years, he didn't check his mirrors.`

If the ending feels unresolved or ambiguous — FAIL. Quote the final narrator lines.

**Check:** Does the ANNOUNCER outro close the story formally with the title and author? Format: *"That was '[TITLE]' — an Endless Tales original. Written by [AUTHOR]."* or equivalent. If absent or generic — FAIL.

### Series Non-Finale Ending

**Check:** Does the episode end on a hard cliffhanger — revelation, mortal/emotional danger, or betrayal? If the episode ends with resolution or a gentle close — FAIL.

**Check:** Is the final line of the story body a burning question or a shocking statement that the listener cannot let go of? If the final line is soft or ambiguous — FAIL. Quote it.

**Check:** Does the ANNOUNCER outro tease a specific named character, threat, or event from the next episode — something concrete and real? Generic teasers — FAIL. Quote the outro line.

**Check:** Is "to be continued" or any equivalent phrase absent? If present — FAIL.

### Series Finale Ending

**Check:** Are all major story threads resolved? List the major threads you can identify from the script and note whether each one is resolved.

**Check:** Is the ANNOUNCER outro a formal series close with no tease or continuation implied? If it teases a sequel or leaves questions open — FAIL.

---

## SECTION 10 — ANNOUNCER OUTRO

**Check:** Is there an ANNOUNCER outro line at the end of the script? If absent — FAIL.

**Check:** Does the outro contain any time-of-day reference? The following are automatic failures regardless of context:
- "good morning" / "good evening" / "good night"
- "tonight" / "this morning" / "this afternoon"
- "today's episode" / "join us tomorrow"
- "tune in next time" / "we'll see you soon"

If any time-of-day reference appears — FAIL. Quote the line.

**Check:** Is the outro free of generic sign-offs? The following are FAIL:
- "Thanks for listening!"
- "We hope you enjoyed..."
- "Join us next time for more great stories!"

---

## SECTION 11 — SCRIPT LENGTH

**Check:** Count the approximate words of dialogue and narration in the script body (excluding header, CHARACTER GUIDE, BELLE B block, SFX markers, and ANNOUNCER lines).

Compare to the target runtime from the Story Brief:
- 10 min target: 1,400–1,600 words
- 15 min target: 2,000–2,300 words
- 20 min target: 2,700–3,100 words
- 25 min target: 3,400–3,800 words

If the word count is more than 20% under or over the target — note as a WARNING with the actual count and target range. (This is a WARNING, not a FAIL — dramatic pacing varies.)

---

## FINAL REPORT FORMAT

After completing all sections, output the full report in this format:

```
ENDLESS TALES SCRIPT VALIDATOR — REPORT
========================================
Script: [TITLE from header]
Author: [AUTHOR from header]
Type: [Standalone / Series Episode X of Y / Series Finale]
Narrative Voice: [from header]

SECTION 1 — HEADER BLOCK: [PASS / FAIL]
SECTION 2 — CHARACTER GUIDE: [PASS / FAIL]
SECTION 3 — BELLE B INTRO VARIATIONS: [PASS / FAIL]
SECTION 4 — FORMAT COMPLIANCE: [PASS / FAIL]
SECTION 5 — NARRATIVE VOICE CONSISTENCY: [PASS / FAIL]
SECTION 6 — AUTHOR VOICE: [PASS / WARNING / FAIL]
SECTION 7 — NARRATOR USAGE: [PASS / WARNING / FAIL]
SECTION 8 — OPENING HOOK: [PASS / FAIL]
SECTION 9 — ENDING: [PASS / FAIL]
SECTION 10 — ANNOUNCER OUTRO: [PASS / FAIL]
SECTION 11 — SCRIPT LENGTH: [PASS / WARNING]

WARNINGS: [count]
FAILURES: [count]

OVERALL RESULT: ✅ PASS — Send to Hal.
              OR
OVERALL RESULT: ❌ FAIL — Fix issues below before sending to Hal.

----------------------------------------
FAILURES TO FIX:
[If any — list each failure with quoted line and specific fix instruction]

WARNINGS TO REVIEW:
[If any — list each warning with context. Marc decides whether to address.]
----------------------------------------
```

**PASS threshold:** Zero failures. Warnings do not block production — Marc reviews them and decides.

**FAIL threshold:** One or more failures. Script does not go to Hal until all failures are resolved and the validator is re-run.

---

*SCRIPT_VALIDATOR.md — Endless Tales · Version 1.0 · April 2026*  
*Changes require Marc's approval and version increment.*  
*Commit to GitHub at ~/Projects/ASC/ after any update.*
