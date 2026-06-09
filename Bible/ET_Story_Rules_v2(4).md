# ⚠️ RETIRED — SUPERSEDED BY v3.0
# This document was the active Endless Tales Story Bible through 2026-06-08.
# It has been retired as the active authority effective 2026-06-08 19:59 EDT.
# Canonical standard is now: ET_Story_Rules_v3_CANONICAL.md
# Preserved as archive reference only — do not use for new production.
# ─────────────────────────────────────────────────────────────────────────────


# Endless Tales — Story Rules Bible
*Reference for Claude when writing or converting audio drama scripts*
*Last updated: April 2026*

Follow every rule below when writing or converting a script for Endless Tales.
These rules are enforced by ASC (Audio Story Creator) during the quality gate.

---

## FORMAT

**r1 — Header block required**
Every script must include a header block with the following fields before the script begins:
```
SERIES:
EPISODE:
EPISODE_TITLE:
AUTHOR:
GENRE:
DESCRIPTION:
NARRATOR:
ANNOUNCER:
NARRATIVE_VOICE:
SUNO PROMPT:
```

**r2 — Character Guide**
Include a CHARACTER GUIDE section listing each character's name, age, gender, accent, and personality. This is used for voice casting.

**r3 — Suno Prompt**
Include a SUNO PROMPT in the header — a 2-3 sentence music brief describing genre, instrumentation, tempo, and mood.

**r4 — SFX markers**
SFX markers use the format `[SFX: description]` on their own line, never inline with dialogue or narration.

**r5 — Dialogue format**
Dialogue lines use the format `CHARACTER NAME: dialogue text` — all caps name, colon, then text.

> ⚠️ **No parentheticals inside dialogue lines.** Do NOT write:
> `CROSS: (quietly) Get me whatever the coroner writes.`
> Instead, convey tone through word choice, or use a NARRATOR line before the dialogue:
> `NARRATOR: Cross kept his voice low.`
> `CROSS: Get me whatever the coroner writes.`
>
> Parentheticals like `(quietly)`, `(to himself)`, `(sharply)`, `(low)` are **stripped by ASC and will not be heard** — do not rely on them to convey meaning.

**r6 — Pause cues**
Use `[BEAT]` for a 1-second pause and `[PAUSE:X]` for longer pauses where X is seconds.

> ⚠️ **Pause cues must always be on their own line, never inline with dialogue.**
> Do NOT write: `CROSS: Get me the report. [BEAT] Every word.`
> Write instead:
> ```
> CROSS: Get me the report.
> [BEAT]
> CROSS: Every word.
> ```

---

## NARRATIVE VOICE

**r22 — NARRATIVE_VOICE header field required**
Every script must declare its narrative voice in the header. This field is invisible to listeners — it controls how Claude writes the script and ensures consistency across all episodes of a series.

Valid values:
```
NARRATIVE_VOICE: first_person
NARRATIVE_VOICE: third_limited
NARRATIVE_VOICE: third_omniscient
NARRATIVE_VOICE: second_person
```

**r23 — First person rules**
When `NARRATIVE_VOICE: first_person` — the NARRATOR IS the protagonist. All narration uses "I", "me", "my". The narrator can only know what the protagonist knows, sees, and feels. This voice creates maximum intimacy and tension. Best for thriller, horror, mystery, personal drama.

> ✅ `NARRATOR: I pulled the door open. The smell hit me first — copper and something else I didn't want to name.`
> ❌ `NARRATOR: She pulled the door open. The smell hit her first.`

**r24 — Third limited rules**
When `NARRATIVE_VOICE: third_limited` — the narrator follows one character closely from outside. Uses "he/she/they" but has access to that character's thoughts and feelings. The narrator cannot know what other characters are thinking. Most versatile voice. Best for western, adventure, drama, most genres.

> ✅ `NARRATOR: Hale crouched over the tracks. Something was wrong — he could feel it before he could name it.`
> ❌ `NARRATOR: Hale crouched over the tracks. Across town, Mayor Cross smiled to himself, knowing the deputy would find nothing.` *(narrator can't know Cross's thoughts in third limited)*

**r25 — Third omniscient rules**
When `NARRATIVE_VOICE: third_omniscient` — the narrator knows everything. Can move between characters, reveal hidden motivations, speak with documentary authority. Best for sci-fi, epic stories, historical drama, Origin 2.0-style content.

> ✅ `NARRATOR: Hale saw tracks and read confusion. Cross, three miles away, was already making calls to ensure the deputy would find nothing.`

**r26 — Second person rules**
When `NARRATIVE_VOICE: second_person` — the listener IS the protagonist. Narration uses "you", "your". Rare, used only for specific immersive formats. Must be approved by Marc before use.

> ✅ `NARRATOR: You pull the door open. The smell hits you first.`

**r27 — Voice consistency**
The declared narrative voice must be maintained throughout the entire script without exception. If a script starts in first person, every narrator line must remain in first person. Mixed voice is a quality gate failure.

---

## AUTHOR VOICE PROFILES

**r28 — Author profiles govern writing style**
Each Endless Tales author has a defined voice profile. When writing a script attributed to a specific author, Claude must write in that author's voice — not a generic style. The author's narrative voice, tone, and pacing are non-negotiable per assignment.

### Current Author Roster

**SARA KEENE**
- Narrative Voice: First Person
- Primary Genres: Thriller, Horror
- Tone: Tense, intimate, psychological
- Pacing: Fast — short punchy sentences, rapid scene cuts
- Signature: Female protagonists, unreliable narrators, atmosphere over action
- Example line: *"I knew before I opened the door. I always know. That's the part nobody believes."*

**ELIAS THORN**
- Narrative Voice: First Person
- Primary Genres: Horror, Dark Mystery
- Tone: Dark, lyrical, dread-soaked
- Pacing: Slow-burn — long atmospheric setups, sudden violent turns
- Signature: Rural settings, folklore undertones, nature as threat
- Example line: *"The creek doesn't hurry. It has nowhere to be and all the time it needs. That night I understood what that meant."*

**DALE HARMON**
- Narrative Voice: Third Person Limited
- Primary Genres: Adventure, Action
- Tone: Warm, grounded, cinematic
- Pacing: Steady — action sequences punchy, character moments slower
- Signature: Male protagonists, blue-collar heroes, moral clarity
- Example line: *"Harmon had driven this road a thousand times. Tonight it felt like someone else's road."*

**JULIAN MERCER**
- Narrative Voice: Third Person Limited
- Primary Genres: Mystery, Crime
- Tone: Precise, cool, procedural
- Pacing: Methodical — every detail matters, nothing wasted
- Signature: Detective/investigator POV, urban settings, twist endings
- Example line: *"The evidence pointed one way. Mercer had learned long ago that evidence was the last thing you trusted."*

**DANIEL WREN**
- Narrative Voice: Third Person Omniscient
- Primary Genres: Drama, Family
- Tone: Warm, observational, compassionate
- Pacing: Slow — character-driven, emotional resonance over plot momentum
- Signature: Ensemble casts, small-town settings, redemption arcs
- Example line: *"Three people sat in that waiting room, each certain they were alone in their fear. They were wrong."*

**MARK HOLBROOK**
- Narrative Voice: Third Person Limited
- Primary Genres: Drama, Thriller
- Tone: Cinematic, restrained, precise
- Pacing: Medium — controlled tension, deliberate reveals
- Signature: Male protagonists under pressure, moral ambiguity, urban settings
- Example line: *"He could have walked away. He kept telling himself that, even as he didn't."*

**SILAS GRAVES**
- Narrative Voice: First Person
- Primary Genres: Horror, Supernatural
- Tone: Raw, visceral, confessional
- Pacing: Punchy — short sentences, fragmented under stress
- Signature: Working-class protagonists, isolated settings, body horror
- Example line: *"I don't tell this story to be believed. I tell it because not telling it is worse."*

**NINA VASQUEZ**
- Narrative Voice: Third Person Omniscient
- Primary Genres: Sci-Fi, Speculative
- Tone: Clinical, curious, expansive
- Pacing: Medium — world-building woven into action
- Signature: Female scientists/engineers, near-future settings, ethical dilemmas
- Example line: *"The station had been silent for eleven days. Dr. Vasquez was the only one who understood why that was the optimistic interpretation."*

**CAROLINE DRAKE**
- Narrative Voice: Third Person Limited
- Primary Genres: Mystery, Historical Drama
- Tone: Elegant, measured, quietly menacing
- Pacing: Methodical — period detail as atmosphere, slow reveals
- Signature: Female protagonists, historical settings (1920s–1960s), social secrets
- Example line: *"In 1947, a woman asking questions was either a secretary or a problem. Margaret Drake had always been both."*

**MARC HOBELMAN** *(house pen name for western/frontier)*
- Narrative Voice: Third Person Limited
- Primary Genres: Western, Western Thriller
- Tone: Spare, weathered, laconic
- Pacing: Slow-burn — landscape as character, violence is sudden and final
- Signature: Lone protagonists, frontier justice, moral gray zones
- Example line: *"The canyon didn't care who was right. It just kept its shadows and its silence, same as always."*

---

## GENRE → AUTHOR ASSIGNMENT GUIDE

When Marc assigns a story brief, use this guide to determine which author fits:

| Genre | Primary Author | Secondary Author | Voice |
|-------|---------------|-----------------|-------|
| Thriller | Sara Keene | Mark Holbrook | 1st / 3rd Ltd |
| Horror | Silas Graves | Elias Thorn | 1st / 1st |
| Dark Mystery | Elias Thorn | Julian Mercer | 1st / 3rd Ltd |
| Mystery/Crime | Julian Mercer | Caroline Drake | 3rd Ltd / 3rd Ltd |
| Adventure | Dale Harmon | Mark Holbrook | 3rd Ltd / 3rd Ltd |
| Drama | Daniel Wren | Mark Holbrook | 3rd Omni / 3rd Ltd |
| Sci-Fi | Nina Vasquez | — | 3rd Omni |
| Western | Marc Hobelman | — | 3rd Ltd |
| Historical Drama | Caroline Drake | Daniel Wren | 3rd Ltd / 3rd Omni |
| Supernatural | Silas Graves | Sara Keene | 1st / 1st |
| Family/Heartwarming | Daniel Wren | — | 3rd Omni |

---

## STRUCTURE

**r7 — Announcer bookends**
Every episode needs an ANNOUNCER intro and ANNOUNCER outro. See r19–r21 for specific announcer rules.

**r8 — Open with action**
Open with action or conflict, not exposition.

**r9 — Audio-only**
Stories must work without visuals — all setting and action must be conveyed through dialogue, narration, or SFX.

**r16 — Series cliffhanger** *(series episodes only)*
Series episodes MUST end with a cliffhanger that makes it impossible NOT to listen to the next episode. Use one of:
- (a) A shocking revelation that reframes everything the listener just heard
- (b) A character placed in immediate mortal or emotional danger with no resolution
- (c) A betrayal or reversal that destroys the listener's assumptions

The final line of the episode must create a burning question the listener cannot let go of. *"To be continued" phrasing is forbidden.*

**r17 — Carry consequence forward** *(series episodes only)*
Series episodes must carry consequence forward — at least one major story development from this episode (a death, alliance, discovery, or shift in power) must be referenced or felt in the next. Characters are changed by events. No episode can end with the world in the same state it started.

---

## ANNOUNCER RULES

**r19 — Announcer intro format**
The ANNOUNCER intro must follow this exact structure:
1. Platform name: *"Endless Tales presents..."*
2. Series name (if series) or story title
3. Episode title (if series)
4. Brief hook — one sentence maximum, present tense, no spoilers
5. Hard stop. Begin story immediately.

The intro must feel like a Netflix-style title card — brief, authoritative, cinematic. No warmth, no "welcome", no small talk.

> ✅ `ANNOUNCER: Endless Tales presents... Deadwater Canyon. Episode Three: The Missing Hour. One body. One deputy. And a killer who was never a stranger.`
> ❌ `ANNOUNCER: Welcome back to Endless Tales! We're so excited to bring you another episode of Deadwater Canyon today!`

**r20 — Standalone episode outro (forbidden list)**
The ANNOUNCER outro for a standalone (non-series) episode must NOT include:
- Any time of day reference ("good morning", "tonight", "this afternoon", "this evening")
- Vague sign-offs ("tune in next time", "we'll see you soon", "thanks for listening")
- Platform promotion that sounds like an ad
- Cliffhangers (standalone episodes must resolve)

The outro should feel like the last page of a short story — complete, resonant, done.

> ✅ `ANNOUNCER: That was "The Grave He Dug Himself" — an Endless Tales original. Written by Dale Harmon.`
> ❌ `ANNOUNCER: Thanks for listening tonight! Join us next time on Endless Tales for another great story!`

**r21 — Series episode outro**
The ANNOUNCER outro for a series episode must do two things:
1. Tease the next episode with a specific named character, threat, or event that WILL appear next
2. End with a question OR a provocative statement that makes the listener feel they cannot wait

Generic teasers are forbidden. "Next time on..." must name something real.

> ✅ `ANNOUNCER: Next time on Deadwater Canyon — Sheriff Cole's widow opens his safe. What she finds will end everything Deputy Hale thought he knew about this town.`
> ❌ `ANNOUNCER: Next time on Deadwater Canyon — things get even more complicated for our heroes. Don't miss it!`

**r18 — No time of day, ever**
Neither the ANNOUNCER intro nor outro may reference any time of day under any circumstances. This includes: "good morning", "good evening", "good night", "tonight", "this morning", "this afternoon", "today's episode", "join us tomorrow". Listeners play stories at any hour. Time references break immersion and are immediately wrong for most listeners.

---

## PACING

**r10 — Short dialogue turns**
Dialogue exchanges should be short — 1-3 sentences per turn for most exchanges.

**r11 — SFX frequency**
Include at least one significant SFX cue every 60-90 seconds of script.

---

## NARRATOR USAGE

**r19n — Narrator carries the load**
The NARRATOR is the listener's guide. Use narrator lines generously to:
- Introduce new characters the moment they appear ("Otto Figg was fifty-eight years old...")
- Orient the listener after scene transitions
- Convey tone and atmosphere that would otherwise require parentheticals
- Re-anchor a distracted driver who may have missed a line

The narrator should speak in short, punchy sentences. Never use the narrator for long paragraphs of exposition.

**r20n — No stage directions in dialogue**
Tone, emotion, and physical action must be expressed through the NARRATOR or through the words themselves — never through parenthetical directions inside a dialogue line. ASC strips all parentheticals before sending dialogue to voice generation. Any tone direction placed inside a dialogue line will be silently removed and will not affect the voice performance.

---

## AUDIENCE

**r12 — Distracted listener**
The audience is driving. Stories must make sense even if the listener is slightly distracted.

**r13 — Content guidelines**
Avoid graphic violence, explicit content, or highly distressing material.

---

## PUBLISHING

**r14 — Description length & hook writing**
The DESCRIPTION field must be 24 words or fewer. Write it as a single punchy hook — present tense, no spoilers, designed to make a driver press play. It will appear on the story card in the app.

> ✅ *"A long-haul trucker's final delivery holds a secret that could cost him everything."*
> ❌ *"This is a story about a trucker who discovers something surprising in his cargo."* (passive, weak, no tension)

**r15 — Genre assignment**
Assign 1-3 genres from the ET genre list. The primary genre is required.

---

## COMPLETE SCRIPT FORMAT EXAMPLE

```
SERIES: Deadwater Canyon
EPISODE: 3
EPISODE_TITLE: The Missing Hour
AUTHOR: Marc Hobelman
GENRE: Western Thriller
DESCRIPTION: Deputy Hale discovers a body in the canyon — and realizes the killer was never a stranger.
NARRATOR: TAMMY
ANNOUNCER: JAKE
NARRATIVE_VOICE: third_limited
SUNO PROMPT: Sparse western guitar, slow tension build, desert atmosphere, no vocals, cinematic.

CHARACTER GUIDE
---
DEPUTY HALE — 38, male, weathered American accent, quietly determined, haunted by a past mistake
MAYOR CROSS — 55, male, smooth Southern drawl, charming on the surface, calculating underneath
LUCY — 24, female, soft Texan accent, nervous energy, knows more than she lets on

---
[START AUDIO DRAMA SCRIPT]

ANNOUNCER: Endless Tales presents... Deadwater Canyon. Episode Three: The Missing Hour. One deputy. One body. And a killer who was never a stranger.

[SFX: wind across dry canyon, distant crow call]

NARRATOR: Three days since the rain. Three days since Sheriff Cole's funeral. Deputy Hale still hadn't slept. He stood at the canyon rim in the grey morning light, hat pulled low, listening to nothing.

DEPUTY HALE: Nobody buries a man this fast unless they're scared of what he'd say if he woke up.

[SFX: boots on gravel, slow footsteps stopping]

NARRATOR: He crouched over the tracks in the dust — two sets, not one. Someone had been here before him. He didn't know yet that one of those sets of boots was going to change everything.
```

---

## WHAT ASC STRIPS AUTOMATICALLY

The following are silently removed from dialogue before voice generation. Do not rely on them:
- Parenthetical tone directions: `(quietly)`, `(to himself)`, `(sharply)`, `(low)`, `(calling out)`, etc.
- Inline `[BEAT]` markers inside dialogue lines
- Inline `[PAUSE:X]` markers inside dialogue lines
- Inline `[SFX: ...]` markers inside dialogue lines

Always place `[BEAT]`, `[PAUSE:X]`, and `[SFX: ...]` on their own dedicated lines.

---

## PLATFORM VOICE PROTECTION

**r29 — Platform narrator and announcer voices are exclusive to their roles**
The platform NARRATOR voice and ANNOUNCER voice (Belle B, ElevenLabs voice ID: EXAVITQu4vr4xnSDxMaL) are reserved exclusively for their designated platform roles. They may never be cast as characters inside a story script under any circumstances.

This means:
- Belle B may not appear as a character named "the dispatcher", "the radio host", "the operator", or any other in-story role
- The story NARRATOR voice may not be reused as a villain, supporting character, or any named role inside the narrative
- No character in the CHARACTER GUIDE may be assigned a platform narrator or announcer voice ID

**The only exception — NARRATOR_IS_CHARACTER:**
A story may declare that its narrator is a character within the narrative (e.g. a ghost telling their own story, a prisoner writing a journal, a detective recounting a case). This must be:
1. Declared in the script header as `NARRATOR_IS_CHARACTER: true`
2. Approved by Marc before production begins
3. Cast with a non-platform voice — never Belle B or the default platform narrator

> ✅ Correct: A ghost story where the narrator reveals at the end they are the murder victim — cast with a unique character voice approved for this story
> ❌ Wrong: Using Belle B as "the radio dispatcher" in an action story
> ❌ Wrong: Reusing the platform narrator voice as "Old Man Jenkins" in a western

**r30 — NARRATOR_IS_CHARACTER header field**
When a narrator is a character in the story, add this to the header block:
```
NARRATOR_IS_CHARACTER: true
NARRATOR_CHARACTER_NAME: [character name]
NARRATOR_CHARACTER_VOICE: [ElevenLabs voice ID — must not be a platform voice]
```

ASC will use `NARRATOR_CHARACTER_VOICE` instead of the default platform narrator voice for all NARRATOR lines in this script.

---

## SQL — Authors Table Extension
*Run in Supabase SQL Editor to add voice profile fields*

```sql
ALTER TABLE authors
  ADD COLUMN IF NOT EXISTS narrative_voice text DEFAULT 'third_limited',
  ADD COLUMN IF NOT EXISTS tone text,
  ADD COLUMN IF NOT EXISTS pacing text,
  ADD COLUMN IF NOT EXISTS signature text,
  ADD COLUMN IF NOT EXISTS example_line text,
  ADD COLUMN IF NOT EXISTS primary_genre text,
  ADD COLUMN IF NOT EXISTS secondary_genre text;

-- Update existing authors with profiles
UPDATE authors SET narrative_voice='first_person', tone='tense, intimate, psychological', pacing='fast', primary_genre='Thriller', secondary_genre='Horror', signature='Female protagonists, unreliable narrators, atmosphere over action' WHERE name='Sara Keene';
UPDATE authors SET narrative_voice='first_person', tone='dark, lyrical, dread-soaked', pacing='slow-burn', primary_genre='Horror', secondary_genre='Dark Mystery', signature='Rural settings, folklore undertones, nature as threat' WHERE name='Elias Thorn';
UPDATE authors SET narrative_voice='third_limited', tone='warm, grounded, cinematic', pacing='steady', primary_genre='Adventure', secondary_genre='Action', signature='Male protagonists, blue-collar heroes, moral clarity' WHERE name='Dale Harmon';
UPDATE authors SET narrative_voice='third_limited', tone='precise, cool, procedural', pacing='methodical', primary_genre='Mystery', secondary_genre='Crime', signature='Detective POV, urban settings, twist endings' WHERE name='Julian Mercer';
UPDATE authors SET narrative_voice='third_omniscient', tone='warm, observational, compassionate', pacing='slow', primary_genre='Drama', secondary_genre='Family', signature='Ensemble casts, small-town settings, redemption arcs' WHERE name='Daniel Wren';
UPDATE authors SET narrative_voice='third_limited', tone='cinematic, restrained, precise', pacing='medium', primary_genre='Drama', secondary_genre='Thriller', signature='Male protagonists under pressure, moral ambiguity' WHERE name='Mark Holbrook';
UPDATE authors SET narrative_voice='first_person', tone='raw, visceral, confessional', pacing='punchy', primary_genre='Horror', secondary_genre='Supernatural', signature='Working-class protagonists, isolated settings, body horror' WHERE name='Silas Graves';
UPDATE authors SET narrative_voice='third_omniscient', tone='clinical, curious, expansive', pacing='medium', primary_genre='Sci-Fi', secondary_genre='Speculative', signature='Female scientists, near-future settings, ethical dilemmas' WHERE name='Nina Vasquez';
UPDATE authors SET narrative_voice='third_limited', tone='elegant, measured, quietly menacing', pacing='methodical', primary_genre='Mystery', secondary_genre='Historical Drama', signature='Female protagonists, historical settings, social secrets' WHERE name='Caroline Drake';
UPDATE authors SET narrative_voice='third_limited', tone='spare, weathered, laconic', pacing='slow-burn', primary_genre='Western', secondary_genre='Western Thriller', signature='Lone protagonists, frontier justice, moral gray zones' WHERE name='Marc Hobelman';
```

---

*Rules r16, r17, r18, r21 apply only when `SERIES:` is populated in the header.*
*Rules r22–r27 (narrative voice) apply to all scripts.*
*Rules r28 (author profiles) apply when a specific Endless Tales author is assigned.*
---

## ENDINGS

**r31 — Standalone stories must have a satisfying, clearly-signaled ending**
Every standalone (non-series) story must end in a way that:
1. Resolves the central conflict completely — no dangling threads, no ambiguity about outcome
2. Signals clearly to the listener that the story is over — the final NARRATOR line must feel conclusive, not like a pause
3. Leaves the listener with an emotional payoff — satisfaction, catharsis, or a resonant final image

The listener should never wonder "is that it?" A standalone ending is a complete meal, not a course.

> ✅ `NARRATOR: Hale drove back through the canyon as the sun came up. For the first time in three years, he didn't check his mirrors.`
> ❌ `NARRATOR: Hale left town. Things would be different now.` *(vague, no emotional landing)*
> ❌ `NARRATOR: Hale wondered what would happen next.` *(open-ended — forbidden in standalones)*

The ANNOUNCER outro must also signal finality — use the story title and author as a closing stamp.
> ✅ `ANNOUNCER: That was "The Missing Hour" — an Endless Tales original by Marc Hobelman.`

**r32 — Series episodes: cliffhanger every episode EXCEPT the finale**
All series episodes must end with a hard cliffhanger (per r16) — EXCEPT the final episode of the series.

The **series finale** must:
1. Resolve ALL major story threads — every question raised across the series must be answered or deliberately closed
2. Give the protagonist a clear and earned outcome — victory, defeat, transformation, or peace — but never ambiguity
3. Signal clearly that the story is complete — the listener must feel the series is finished, not paused
4. Use the ANNOUNCER outro to close the series formally:
> ✅ `ANNOUNCER: That was the final episode of Deadwater Canyon — an Endless Tales original series by Marc Hobelman. Six episodes. One truth.`

The series finale MUST NOT:
- End on a cliffhanger (even a small one)
- Leave major character fates unresolved
- Use language like "perhaps", "someday", "who knows" as a substitute for resolution
- Tease a sequel or continuation in the outro (save that for a separate announcement)

**r33 — Series episode count declared in header**
Every series episode must declare the total episode count in the header so ASC and Claude know whether this is a mid-series episode (cliffhanger required) or the finale (resolution required):
```
SERIES_TOTAL_EPISODES: 6
SERIES_IS_FINALE: false
```
When `SERIES_IS_FINALE: true`, r16 (cliffhanger) does NOT apply. r32 applies instead.

---

*Rules r16, r17, r18, r21 apply only when `SERIES:` is populated in the header.*
*Rules r22–r27 (narrative voice) apply to all scripts.*
*Rules r28 (author profiles) apply when a specific Endless Tales author is assigned.*
*Rules r29–r30 (platform voice protection) apply to ALL scripts without exception.*
*Rules r31 (standalone endings) apply to all non-series scripts.*
*Rules r32–r33 (series endings) apply to all series scripts.*
*Return ONLY the formatted script — no preamble, no commentary, no markdown fences.*
