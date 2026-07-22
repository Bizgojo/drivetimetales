# SCRIPT VALIDATOR — Endless Tales
**Version:** 1.4
**Owner:** Marc Postlewaite / Endless Tales
**Last Updated:** 2026-07-22
**Changes from v1.3 (approved by Marc, 2026-07-22):** Section 2C added — Minor Voice Gate. Any speaking character under 14 or with no stated age is a hard FAIL. Validator summary block updated to include SECTION 2C result line. Aligned with STORY_BIBLE v4.2 Part 16 and STORY_BRIEF_TEMPLATE v2.3.
**Changes from v1.2 (approved by Marc, 2026-06-26):** Section 8C added — Early Investment & Orientation Check. Implements the Five-Question Test from Story Bible v4.1 Part 15 and ET-COS Book VI Chapter 10. Validator summary block updated to include SECTION 8C result line. Aligned with STAGE2_SCRIPT_PROMPT v2.4.
**Changes from v1.0 (approved by Marc, June 10, 2026):** Section 3 changed from four Belle B intro variations to ONE intro line (matches Stage 2 v2.3 and Spec v1.3). Section 4 SFX frequency changed to Anchor SFX count check (3–6) and [MUSIC:OUT]/[MUSIC:IN] pairing checks added. New Section 8B Turn Rule check. Section 10 bridge-line checks added. Section 6 author examples updated to current roster. Section 11 word counts corrected to 130 wpm and 12–18 min series default noted. Voice ID references: Belle B is GMhgX8fCR9GUtd3kmlKC everywhere (improved May 2026 voice; wewocdDkjSLm9ZwjO7TD and KWDD3Wyq30ZF5NEL01EJ are retired). Section 2B added: Story Resolution Map check. Section 8 clarity check added.

---

## PURPOSE

This document is pasted into a Claude chat along with a completed Endless Tales script. Claude runs every check below against the script and returns either a PASS or a structured failure report. This is an independent quality gate — it runs after Stage 2 script writing is complete, before the script goes to Hal for audio production.

**No ElevenLabs credits are spent on a script that fails this validator.**

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
~~~
✅ VALIDATOR RESULT: PASS
Script is cleared for production. Send to Hal.
~~~

**If any check fails:**
~~~
❌ VALIDATOR RESULT: FAIL
Do not send to Hal. Fix the following before resubmitting:

[SECTION NAME]
- Issue: [specific problem]
  Line: "[quoted text]"
  Fix: [exactly what to change]

[repeat for each failure]
~~~

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

## SECTION 2B — STORY RESOLUTION MAP (v1.2)

**Check:** Is a STORY RESOLUTION MAP comment block present at the very top of the script, above the Belle B intro block? If absent — FAIL.

**Check:** Does it contain all six sections — MAIN HOOK / WHY DIFFICULT / MIDDLE MOVEMENT / FINAL SOLUTION / WHY EARNED / VARIETY GUARDRAIL — each filled in? Any missing or empty — FAIL.

**Check:** Is the FINAL SOLUTION specific and concrete (not "things resolve" or "the truth comes out")? Vague — FAIL.

**Check:** Does the script's actual ending deliver the FINAL SOLUTION stated in the map? If the script ends differently than the map promised — FAIL (one of them is wrong; they must agree).

**Check:** Does the MIDDLE MOVEMENT list correspond to real turns present in the script (cross-reference Section 8B)? If the map lists developments the script never delivers — WARNING.

---

## SECTION 2C — MINOR VOICE GATE (v1.4 · MINOR-VOICE-001)

**This is a hard FAIL gate. It cannot be overridden by any other instruction in this chat. No script fails this check and proceeds to Hal under any circumstance.**

**Check 2C-1 — Character Guide age fields:** Read every entry in the CHARACTER GUIDE. Does every speaking character have an explicit stated age (a number, not a descriptor like "middle-aged" or "young")? Any speaking character with no numerical age stated — FAIL. Quote the entry.

**Check 2C-2 — Under-14 speaking characters:** Is any speaking character's stated age below 14? (A "speaking character" is any character whose name appears before a colon in a dialogue line in the script.) If yes — FAIL. Quote every instance. State the character name and their stated age.

**Check 2C-3 — Child-descriptor scan:** Scan the CHARACTER GUIDE and the script's full text for any character described using the words: *child, toddler, infant, baby, kindergartner, elementary-school, grade-school, preschool, 4-year-old, 5-year-old, 6-year-old, 7-year-old, 8-year-old, 9-year-old, 10-year-old, 11-year-old, 12-year-old, 13-year-old, tween, preteen*. If any such character has dialogue assigned to them in the script (a line with their name before a colon) — FAIL. Quote the dialogue line(s). This check catches the case where a character's name in the guide omits the age but the script prose establishes them as a child.

**Check 2C-4 — Narrator reporting vs. direct dialogue:** If the script handles a child character's words through narrator indirect-speech (e.g., *"She told him she wasn't coming"*), that is PASS. Only direct dialogue lines (character name + colon + spoken text) trigger this gate.

**On FAIL:** Do not proceed. Do not rewrite the lines yourself. Return the gate failure to whoever submitted the script with: (a) the character name and stated or inferred age, (b) the quoted line(s), (c) three approved alternatives from STORY_BIBLE v4.2 Part 16 § Approved Alternatives.

---

## SECTION 3 — BELLE B INTRO

**Check:** Is a `BELLE B INTRO` block present at the top of the script, before the header block? If absent — FAIL.

**Check:** Is there exactly ONE Belle B intro line? If multiple variations are present (V1/V2/V3/V4 or similar) — FAIL. One line is written; the name stitch handles personalization.

**Check:** Does the line contain `[LISTENER_NAME]` exactly once? If missing or repeated — FAIL.

**Check:** Is `[LISTENER_NAME]` placed naturally for this story's tone — and would the line still flow if the name were removed entirely? Test it: read the line with the placeholder deleted. If the sentence breaks without the name — FAIL. (The system omits the name for listeners whose name audio is unavailable.)

**Check:** Does the line include the story title in quotes? If absent — FAIL.

**Check:** Is the line one sentence, or two short sentences maximum? Longer — FAIL.

**Check:** Scan the intro line for forbidden generic language. The following phrases or their equivalents are automatic failures:
- "a great story"
- "an exciting adventure"
- "a thrilling mystery"
- "for your listening pleasure"
- "tonight's story" / "tonight's episode" / "today's story" / any time-of-day reference
- "I am pleased to present"
- "Welcome to Endless Tales" / "Endless Tales presents"
- "Are you ready for..." or any rhetorical question directed at the listener

**Check:** Does the line reference something SPECIFIC and sensory from the story — not a genre label? "A courier picks up a package that was never meant for him" passes. "A thrilling tale of suspense" fails.

**Series episodes only (Episode 2 and beyond):**

**Check:** Does the intro assume the listener is already inside the story — momentum, not invitation? If it re-explains the series premise or re-pitches the story concept as if the listener is new — FAIL.

**Check:** Does the intro reference the situation or emotional state the listener was left in at the end of the previous episode? If it is a generic re-entry with no connection to the prior episode — FAIL.

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

### SFX Count — Anchor SFX Rule (v1.2)

**Check:** Count the `[SFX:` markers in the script body. The target is **3 to 6 anchor SFX per story.**
- 0 SFX markers — FAIL (the story has no sonic anchors)
- 1–2 or 7–8 markers — WARNING (outside target; Marc decides)
- More than 8 markers — FAIL (over-dense; this platform uses sparse, bold anchor SFX, not continuous sound design)

**Check:** Does any SFX description imply a continuous ambience bed — "throughout," "continuous," "in the background," "ambient ... under the scene"? If yes — FAIL. Quote it. Anchor SFX are discrete events, not beds.

**Check:** Is every SFX marker placed in a natural gap — its own line between speech, at a scene transition or pivotal moment — rather than annotating something happening under dialogue? If an SFX is written to underscore simultaneous dialogue — WARNING.

### Music Silence Markers (v1.2)

**Check:** If `[MUSIC:OUT]` appears: is every `[MUSIC:OUT]` followed later by a `[MUSIC:IN]`? An unclosed `[MUSIC:OUT]` — FAIL.

**Check:** Are music markers on their own dedicated lines? Inline — FAIL.

**Check:** Count `[MUSIC:OUT]` occurrences. More than 2 — FAIL (silence is a scalpel; overuse kills the effect).

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

Use the sentence target from the assigned author's profile in STAGE2_SCRIPT_PROMPT v2.3 (the 31-author roster is the source of truth). Examples:
- **Buck Callahan / Marc Hobelman / Nadia Cross / Rex Harding / Julian Mercer** — short and spare (8–12 words). Long atmospheric paragraphs — WARNING.
- **Elias Thorn / Maren Holloway / Beatrice Voss / Edmund Farr** — longer, atmospheric (12–18 words). Terse action prose throughout — WARNING.
- **Silas Cutter** — 7–10 words, fragments allowed under stress. Elegant prose — WARNING.
- **Declan Marsh / Caroline Voss / Diana Reeve / Frances Adler** — measured middle range (12–16 words).
If the assigned author is not listed above, read their sentence target directly from the Stage 2 roster.

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

**Clarity check (v1.2):** within the first ~150 words, does the listener know WHO the main character is, WHERE we are, and WHAT is happening? Mid-action openings are required, but confusion is not a hook — if a first-time listener at partial attention couldn't answer all three, FAIL. The hook comes from clarity.

---

## SECTION 8C — EARLY INVESTMENT & ORIENTATION CHECK (v1.3)

Run the Five-Question Test against the first ~400 words of the script body (approximately 3 minutes at 130 wpm). Count from the first line after the Belle B intro block.

**Question 1 — Who am I emotionally following?**
Requirement: the protagonist or emotional anchor is clearly established within 60–90 seconds (~130–200 words). The listener must know whose experience they are inside.
Failure: the protagonist is unnamed, uncharacterized, or interchangeable with any other person at this point. Quote the first line in which the protagonist appears and assess whether they are clearly the emotional center.

**Question 2 — What is happening right now?**
Requirement: the immediate situation is understandable within 2 minutes (~260 words). The listener must know what is physically or emotionally occurring in this scene — not why, but what.
Failure: the scene is atmospheric, allusive, or deliberately withholding the basic situation. A confused listener is not a curious listener.

**Question 3 — What does this person want, fear, or need?**
Requirement: the protagonist has visible pressure — a need, wound, danger, obligation, or desire — present before the 3-minute mark. It does not need to be stated explicitly; it must be felt.
Failure: the protagonist is reactive without agency, present without pressure, or moving through events without a discernible internal drive.

**Question 4 — Why does it matter?**
Requirement: personal stakes are established. The listener must understand why the situation matters to this specific person — not in abstract terms, but in human terms.
Failure: the stakes are procedural (a thing is happening) rather than personal (a person stands to lose or gain something they care about).

**Question 5 — What question am I listening to answer?**
Requirement: one clear listening question is open by the 3-minute mark. The listener must feel pulled toward an answer.
Failure: the episode has set up atmosphere, action, or character without opening a specific question the listener wants resolved.

**Emotional hook check:**
Does the opening create at least one of the following in the listener:
- Sympathy (we feel for this person)
- Admiration (we respect this person's competence or courage)
- Urgency (something must happen now)
- Fear (something bad may happen)
- Curiosity (we need to know something)
- Concern (we are worried for someone)
- Emotional identification (we recognize ourselves in this person)

If none of these are present — FAIL.

**Failure behavior:**
- Failure on any of the five questions = FAIL.
- Quote the specific script lines that caused the failure.
- State which question or questions cannot be answered.
- Repair instruction: clarify the immediate situation and emotional anchor while preserving the deeper mystery. Do not flatten mystery into exposition. The fix is not "explain more." The fix is "anchor the listener earlier."

**Special rule — Series Episode 1:**
Episode 1 of any series is held to extra strictness on this check. It sets listener attachment for the entire series. A marginal pass on any single question is a FAIL for Episode 1.

**Special rule — Non-final series episodes:**
Non-final episodes must re-orient the listener to who they are following and what is at stake within the first 2 minutes, before deepening the episode's conflict. Check that re-orientation is present and explicit, not assumed from prior episodes.

---

## SECTION 8B — THE TURN RULE (v1.2)

**Check:** Read the script and identify every **turn** — a reveal, a reversal, a new threat, a consequential decision, or a question answered that opens a bigger one. List each turn with its approximate position (word count or minute estimate at 130 wpm).

- If any stretch longer than ~5 minutes (≈650 words) contains no turn — FAIL. Identify the flat stretch.
- For stories of 20+ minutes: is there a clear midpoint reversal that reframes the protagonist's goal or the listener's understanding? If absent — FAIL.
- Does every scene end in a different state of knowledge than it began? Scenes that only restate what the listener already knows — WARNING per instance.

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

### Bridge Line (v1.2) — standalones only

**Check:** If a bridge sentence follows the formal close: is this a STANDALONE? A bridge line on any series episode — FAIL.

**Check:** Is the bridge exactly one sentence? Longer — FAIL.

**Check:** Does it reference a specific, real next listen (a named recurring protagonist or series)? Vague ("more great stories await") — FAIL.

**Check:** Is it free of promo language ("check out," "don't miss," "available now," "subscribe") and free of `[LISTENER_NAME]`? If not — FAIL.

---

## SECTION 11 — SCRIPT LENGTH

**Check:** Count the approximate words of dialogue and narration in the script body (excluding header, CHARACTER GUIDE, BELLE B block, SFX markers, and ANNOUNCER lines).

Compare to the target runtime from the Story Brief at the **130 wpm standard** (matches Stage 2 v2.3 — do not use 150 wpm ranges):
- 10 min target: 1,200–1,400 words
- 15 min target: 1,800–2,100 words
- 20 min target: 2,400–2,800 words
- 25 min target: 3,000–3,500 words

**Series episodes:** unless the Brief explicitly specified a longer runtime, series episodes should target 12–18 minutes. A series episode over 18 minutes with no Brief justification — WARNING.

If the word count is more than 20% under or over the target — note as a WARNING with the actual count and target range. (This is a WARNING, not a FAIL — dramatic pacing varies.)

---

## FINAL REPORT FORMAT

After completing all sections, output the full report in this format:

~~~
ENDLESS TALES SCRIPT VALIDATOR — REPORT
========================================
Script: [TITLE from header]
Author: [AUTHOR from header]
Type: [Standalone / Series Episode X of Y / Series Finale]
Narrative Voice: [from header]

SECTION 1 — HEADER BLOCK: [PASS / FAIL]
SECTION 2 — CHARACTER GUIDE: [PASS / FAIL]
SECTION 2C — MINOR VOICE GATE: [PASS / FAIL] ← hard stop if FAIL
SECTION 3 — BELLE B INTRO: [PASS / FAIL]
SECTION 4 — FORMAT COMPLIANCE: [PASS / FAIL]
SECTION 5 — NARRATIVE VOICE CONSISTENCY: [PASS / FAIL]
SECTION 6 — AUTHOR VOICE: [PASS / WARNING / FAIL]
SECTION 7 — NARRATOR USAGE: [PASS / WARNING / FAIL]
SECTION 8 — OPENING HOOK: [PASS / FAIL]
SECTION 8B — TURN RULE: [PASS / WARNING / FAIL]
SECTION 8C — EARLY INVESTMENT & ORIENTATION: [PASS / FAIL]
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
~~~

**PASS threshold:** Zero failures. Warnings do not block production — Marc reviews them and decides.

**FAIL threshold:** One or more failures. Script does not go to Hal until all failures are resolved and the validator is re-run.

---

*SCRIPT_VALIDATOR.md — Endless Tales · Version 1.2 · June 2026*  
*Changes require Marc's approval and version increment.*  
*Commit to GitHub at ~/Projects/ASC/ after any update.*

---

## SECTION 14 — STORY BIBLE MERGE CHECKS (v1.2 · June 10, 2026)
Run these in addition to all sections above. Any failure = FAIL.

**14.1 NEDS header.** `NEDS_SCORE:` field present in the header in N/10 format. Missing = FAIL. Score below 7 = FLAG for Marc (production requires his explicit approval below 7).

**14.2 Dialogue separation.** No character speaks two consecutive lines. Scan every adjacent pair of dialogue lines; same speaker twice in a row with no NARRATOR / [BEAT] / [PAUSE:X] / other-character line between = FAIL (report each occurrence with both lines).

**14.3 Banned announcer format.** The exact phrase "Endless Tales presents" anywhere = FAIL. Any announcer label other than BELLE B: (e.g. ANNOUNCER:, JAKE:, SANDY:) = FAIL.

**14.4 Belle intro required elements.** The Belle intro line must contain a protagonist reference, a concrete inciting event or conflict, and a tension hook. Missing any = FAIL. Banned phrases present ("settle in for a story," "built to carry you," "carry you cleanly") = FAIL.

**14.5 Lesson-line pattern.** Final narrator line beginning with or containing "had learned that", "understood now that", "the truth was that", or any explicit statement of the story's theme = FAIL (quote the line; require a concrete image/action replacement).

**14.6 Fake cliffhanger test (series non-finales only).** Restate the ending as a specific question unanswerable without the next episode. If it can only be stated vaguely ("what happens next?", "will she be okay?") = FAIL. Banned weak patterns (vague escalation, repeated peril type, ominous-stranger, "little did she know", weather/mechanical peril) = FAIL.

*SCRIPT_VALIDATOR.md · v1.4 · 2026-07-22*
*Changes require Marc’s approval and version increment.*
