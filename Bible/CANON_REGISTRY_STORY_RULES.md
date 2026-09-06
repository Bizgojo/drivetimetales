# Endless Tales Canon Registry — Story-Writing Rules
# Source: Endless Tales Canon Registry (Google Doc)
# Owner: Marc Postlewaite. ONLY Marc may create, edit, retire, or renumber a rule.
# Extracted: Aug 29, 2026
# Rules included: STING-001, BELLE-001–008, LENGTH-001–002, CONTENT-001–002,
#   LANGUAGE-001, STYLE-001, HOOK-001, CLIFFHANGER-001, ENDING-001, NAMES-001
#
# IMPORTANT: This file is a local snapshot of selected rules from the master
# Google Doc registry. When Marc updates rules in the registry, update this file
# and commit the change — the prompt-construction code loads it verbatim so that
# canon changes propagate to Hal's brief without a code rewrite.
#
# CANON-001: This registry takes precedence over ET_Story_Rules and STAGE2_SCRIPT_PROMPT
# wherever they conflict. Conflicts are flagged in code comments in generate-script/route.ts.

---

## STING-001
Status: ACTIVE | Scope: Universal | Last Revised: Aug 28, 2026
Purpose: A consistent, recognizable show-open signature, without becoming repetitive or confusing about where in the episode the listener is.
Rule: The sting plays exactly once per episode — at the very start of the intro, before Belle's first line. It never appears anywhere else in the episode: not before the outro, not mid-story.
Conflict: None (resolved Aug 28, 2026 — an earlier Aug 24 canon calling for the sting to "bookend" intro and outro is superseded by this rule, per Marc's explicit ruling).

---

## BELLE-001
Status: ACTIVE | Scope: Universal | Last Revised: Aug 28, 2026
Purpose: Keep the standard episode intro tight and consistent, not bloated with unnecessary content on every episode.
Rule: On a standard episode (not a listener's first episode, not a special personalized case), Belle's intro is exactly ONE line. The listener's name, if known, appears once at a natural pause within that line — pulled from the users.display_name field in the database, NOT the listener's legal first/last name. The line must also work correctly and sound complete if no name is available.
Conflict: None. (Clarified Aug 28, 2026: confirmed via direct database check that the name source is display_name, distinct from legal name fields — matches the original design intent of using "what friends call them.")

---

## BELLE-002
Status: ACTIVE | Scope: Universal | Last Revised: Aug 6, 2026
Purpose: Give a first-time listener arriving through the personalized acquisition funnel a warmer, fuller welcome, without permanently breaking the brevity standard set by BELLE-001.
Rule: A listener's very first episode (the funnel path ending in EP2) uses a multi-sentence personalized welcome instead of the standard one-line intro. This is a deliberate, permanent, named exception to BELLE-001 — not a violation of it, and not something that should ever be "corrected" back to one line.
Conflict: None.

---

## BELLE-003
Status: ACTIVE | Scope: Universal | Last Revised: Aug 13, 2026
Purpose: Avoid an emotionally jarring or overly familiar moment at the close of an episode, which the outro's tone is not built to carry.
Rule: The listener's name never appears in the outro, under any circumstance, on any episode type.
Conflict: None.

---

## BELLE-004
Status: ACTIVE | Scope: First episode of a series only | Last Revised: Aug 28, 2026
Purpose: Properly orient a listener to a brand-new story at the one point in the series where they don't yet know what they're listening to.
Rule: The first episode's intro must introduce the story, name the title, and name the author.
Conflict: None. Compatible with BELLE-002 — the first episode is already exempt from the BELLE-001 one-line constraint, so adding title/author naming here doesn't create a contradiction.

---

## BELLE-005
Status: ACTIVE | Scope: Final episode of a series AND standalone stories | Last Revised: Sep 6, 2026
Purpose: Close out a series or standalone story with a satisfying sense of completion and remind the listener what they just finished, for recall and word-of-mouth.
Rule: The series finale outro and all standalone story outros must be 1–2 sentences, ≤42 words total. No "That was" opener. Open with an emotional beat that references the story's resolution or the character left in the listener's mind. Then credit: title + author + narrator name + "an Endless Tales original." Narrator credit (narrator name) is required in the outro. Rating is prompted via the review screen — Belle must NOT include a spoken rating CTA in the outro. [LISTENER_NAME] is restricted to series episodes only in Belle's intro and must never appear in the outro (BELLE-003).
Conflict: None. (Expanded Sep 6, 2026 to cover standalone outros with the same constraint, add mandatory narrator credit, remove spoken rating CTA, and clarify [LISTENER_NAME] intro scope.)

---

## BELLE-006
Status: ACTIVE | Scope: Interior (non-first, non-final) episodes only | Last Revised: Aug 28, 2026
Purpose: Avoid unnecessary repetition of the title and author on every single episode, which the listener already knows by the time they reach the middle of a series.
Rule: Interior episodes must not name the title or the author in either the intro or the outro. If the series is broken up into seasons, the beginning of each season should give the title and author.
Conflict: None.

---

## BELLE-007
Status: ACTIVE | Scope: Universal | Last Revised: Aug 29, 2026
Purpose: Belle is the single most consistent voice across the entire product — any drift, even accidental, would be immediately noticeable to every listener across every story.
Rule: Belle's voice is permanently locked to voice ID GMhgX8fCR9GUtd3kmlKC (announcer role only), with settings: stability 0.49, similarity 0.51, style 0.0, speaker boost enabled, speed 1.0, model eleven_multilingual_v2. No agent may change, test, or substitute any part of this configuration without Marc's explicit, separate approval.
Conflict: None.

---

## BELLE-008
Status: ACTIVE | Scope: Universal | Last Revised: Aug 29, 2026
Purpose: Belle needs to read clearly above the story's dialogue and music bed at all times, since she is the through-line host across every episode.
Rule: Belle's voice track is mixed at 1.5x volume relative to the story's other dialogue tracks.
Conflict: None.

---

## LENGTH-001
Status: ACTIVE | Scope: Universal | Last Revised: Aug 28, 2026
Purpose: Ensure a commissioned story delivers exactly what was specified in scope, so planning, scheduling, and listener expectations aren't silently changed during writing or production.
Rule: If Marc or Maya specifies a target episode count when commissioning a story from Hal, the delivered story must have exactly that number of episodes — not more, not fewer.
Conflict: None.

---

## LENGTH-002
Status: ACTIVE | Scope: Universal | Last Revised: Aug 28, 2026
Purpose: Keep individual episode length close enough to the specified target that pacing and listener time-commitment expectations stay consistent, while still allowing natural creative variance.
Rule: If Marc or Maya specifies a target per-episode length when commissioning a story from Hal, each episode's actual duration must fall within that target, plus or minus 20%.
Conflict: None.

---

## CONTENT-001
Status: ACTIVE | Scope: Universal | Last Revised: unknown (pre-existing)
Purpose: Keep Belle's brand voice warm and personal, not corporate or institutional-sounding.
Rule: The phrase "Endless Tales presents" is permanently banned — never used in any script, ad copy, or spoken line.
Conflict: None.

---

## CONTENT-002
Status: ACTIVE | Scope: Universal | Last Revised: Aug 28, 2026
Purpose: Comply with ElevenLabs' policy on voice usage involving minors, while still ensuring a minor character sounds like who they're supposed to be.
Rule: The minimum age for any speaking character, in any story, is 14, per ElevenLabs policy. When a story includes a minor character (14–17), the voice selected must genuinely sound age-appropriate for that character — not merely clear the compliance floor while sounding adult.
Conflict: None. (Expanded Aug 28, 2026 to address voice-age-fit, not just the compliance minimum.)

---

## LANGUAGE-001
Status: ACTIVE (list needs Marc's expansion) | Scope: Universal | Last Revised: Aug 28, 2026
Purpose: Avoid words that are gratuitously offensive, discriminatory, or reputation-damaging, while preserving natural, mature dialogue that doesn't feel artificially sanitized.
Rule: Severe profanity and slurs — including "fuck" (and derivatives), "cunt," "nigger," and other racial, ethnic, or discriminatory slurs of equivalent severity — are permanently banned from any script or spoken line, in any story. Milder profanity — including "shit," "damn," and "hell" — is explicitly permitted and must not be excluded by this rule.
Conflict: None. NOTE: the banned list above is illustrative, based directly on Marc's stated examples. Marc should expand or refine the full list directly in this document — drawing the exact line on severe-tier language is a judgment call only he should make precisely.

---

## STYLE-001
Status: ACTIVE (author registry incomplete — see note) | Scope: Universal | Last Revised: Aug 28, 2026
Purpose: Prevent story prose from sounding generic or repetitive across different stories, by giving each in-house pen-name author a distinct, consistent, human-modeled voice.
Rule: Each Endless Tales pen-name author is assigned one real author as a stylistic model. When writing under that pen name, Hal must research and follow that real author's style — sentence rhythm, tone, vocabulary, and word/phrase choices — rather than defaulting to generic phrasing.
Conflict: None. NOTE: COPYRIGHT BOUNDARY — this rule governs STYLE and VOICE only: sentence rhythm, tone, vocabulary, word/phrase choice. It never permits copying the real author's actual text, specific plots, characters, or other copyrighted material. REGISTRY GAP — only one pen-name/real-author pairing is confirmed (Iris Fontaine, for the Bell story) — every other current and future pen name needs this assignment made before the rule has anything to point to.

---

## HOOK-001
Status: ACTIVE (creative judgment — no automated check exists yet) | Scope: Universal | Last Revised: Aug 28, 2026
Purpose: Grab the listener's attention immediately, so they don't tune out before the story develops — critical for both new-listener conversion and ongoing retention.
Rule: Every episode's story body must open with a genuine hook — an immediate point of tension, intrigue, question, or stakes — rather than opening purely with scene-setting, exposition, or unremarkable description.
Conflict: None. NOTE: no automated detector exists for this. HOOK-GATE-001 (code, merged PR #28) enforces the 15-word threshold gate. This rule is the underlying creative standard.

---

## CLIFFHANGER-001
Status: ACTIVE (creative judgment — no automated check exists yet) | Scope: Non-final episodes only (first and interior episodes; final episode governed by ENDING-001 instead) | Last Revised: Aug 28, 2026
Purpose: Create real anticipation for the next episode, driving continued listening and series completion.
Rule: Every non-final episode's story body must end on a genuine cliffhanger — an unresolved question, revealed complication, or moment of real tension — rather than a tidy, fully-resolved stopping point.
Conflict: None. Compatible with BELLE-005/006 — this governs the STORY BODY's ending specifically, distinct from Belle's spoken outro.

---

## ENDING-001
Status: ACTIVE (creative judgment — no automated check exists yet) | Scope: Final episode of a series only | Last Revised: Aug 28, 2026
Purpose: Leave the listener with a genuinely satisfying sense of closure, since the series has no further episode left to resolve anything hanging.
Rule: The final episode's story body must resolve its major plot threads to a satisfying conclusion. It must not end on an unresolved cliffhanger.
Conflict: None. Directly complementary to CLIFFHANGER-001 (the opposite obligation) and BELLE-005 (Belle's outro recaps this resolution once it exists in the story body).

---

## NAMES-001
Status: ACTIVE (no automated check exists yet) | Scope: Universal | Last Revised: Aug 29, 2026
Purpose: Avoid character surnames feeling recycled across the catalog, which can make otherwise-distinct stories start to blur together for a listener working through several of them.
Rule: A character's surname should not be reused across different stories in the catalog without deliberate reason. Surname variety is actively maintained across the growing catalog, not left to chance.
Conflict: None. NOTE: no record of every surname used across the catalog exists yet to check new ones against — this is a writing standard for now, flagged as mechanically buildable sooner than the creative-judgment rules once that record exists.
