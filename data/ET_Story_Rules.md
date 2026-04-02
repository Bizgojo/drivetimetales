# Endless Tales — Story Rules Bible
*Reference for Claude when writing or converting audio drama scripts*

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

## STRUCTURE

**r7 — Announcer bookends**
Every episode needs an ANNOUNCER intro and ANNOUNCER outro.

**r8 — Open with a hook within 30 seconds**
The story must grab the listener within the first 30 seconds of audio — before they have a chance to change their mind. This means the very first scene must drop the listener into action, danger, mystery, or an irresistible question. No throat-clearing, no scene-setting, no weather descriptions.

> ✅ *Cold open on a gunshot. A body. A locked door. A voice that shouldn't be there.*
> ❌ *"It was a quiet Tuesday morning in the town of Millhaven..."*

**The 30-second test:** Read the opening aloud at normal pace. If a listener could tune out before something compelling happens — rewrite it.

**r9 — Audio-only**
Stories must work without visuals — all setting and action must be conveyed through dialogue, narration, or SFX.

**r16 — Series cliffhanger** *(series episodes only)*
Series episodes MUST end with a hard cliffhanger — not a gentle loose end. Use one of:
- (a) A shocking revelation that reframes everything the listener just heard
- (b) A character placed in immediate mortal or emotional danger with no resolution
- (c) A betrayal or reversal that destroys the listener's assumptions

**The burning question test:** The final line of the episode must create a question so urgent the listener cannot let it go. Read the final line aloud and ask: *"Would a driver pull over to find out what happens next?"* If the answer is no — rewrite it.

*"To be continued" phrasing is forbidden.*

**r17 — Carry consequence forward** *(series episodes only)*
Series episodes must carry consequence forward — at least one major story development from this episode (a death, alliance, discovery, or shift in power) must be referenced or felt in the next. Characters are changed by events. No episode can end with the world in the same state it started.

**r18 — Series ANNOUNCER outro** *(series episodes only)*
The ANNOUNCER outro for a series episode must do three things:
1. **Name** a specific character, threat, or event from the next episode — no vague teasers
2. **End on an unresolved emotional note** — the listener should feel the pull of what's coming
3. **Use urgency language** — imply the next episode is waiting right now

> ✅ *"Next time on The Third Key — Cross finds the name in the ledger. And the moment he reads it, he knows he can't unknow it. The Third Key continues... right now."*
> ❌ *"Tune in next time to find out what happens."*
> ❌ *"The story continues in the next episode."*

Generic sign-offs are forbidden. Every outro must feel like it was written specifically for this episode's cliffhanger.

---

## PACING

**r10 — Short dialogue turns**
Dialogue exchanges should be short — 1-3 sentences per turn for most exchanges.

**r11 — SFX frequency**
Include at least one significant SFX cue every 60-90 seconds of script.

---

## NARRATOR USAGE

**r19 — Narrator carries the load**
The NARRATOR is the listener's guide. Use narrator lines generously to:
- Introduce new characters the moment they appear ("Otto Figg was fifty-eight years old...")
- Orient the listener after scene transitions
- Convey tone and atmosphere that would otherwise require parentheticals
- Re-anchor a distracted driver who may have missed a line

The narrator should speak in short, punchy sentences. Never use the narrator for long paragraphs of exposition.

**r20 — No stage directions in dialogue**
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
Assign 1-3 genres from the DTT genre list. The primary genre is required.

---

## STAGE 2 QUALITY GATE — Claude Must Run Before Passing to Hal

Before marking a script ready for Stage 3 (Hal/ASC pipeline), Claude must run through this checklist and confirm each item passes. If any item fails, revise the script before handoff.

**Opening hook (r8)**
- [ ] Does something compelling happen within the first 30 seconds of audio?
- [ ] Is the first line of the script an action, question, or revelation — not description?
- [ ] Would a driver keep listening after the first 30 seconds?

**Episode-end cliffhanger (r16 — series only)**
- [ ] Does the final scene end on a hard cliffhanger (revelation, danger, or betrayal)?
- [ ] Does the final line create a burning question the listener cannot let go?
- [ ] Is "to be continued" or any equivalent phrase absent?

**ANNOUNCER outro (r18 — series only)**
- [ ] Does the outro name a specific character, threat, or event from the next episode?
- [ ] Does it end on an unresolved emotional note?
- [ ] Does it use urgency language implying the next episode is available now?
- [ ] Is it free of generic sign-offs ("tune in next time", "find out what happens")?

**Format compliance**
- [ ] Header block complete with all required fields?
- [ ] No parentheticals inside dialogue lines?
- [ ] All [BEAT], [PAUSE:X], [SFX:] markers on their own lines?
- [ ] DESCRIPTION is 24 words or fewer and written as a punchy hook?

---

## SCRIPT FORMAT EXAMPLE
```
SERIES: Deadwater Canyon
EPISODE: 3
EPISODE_TITLE: The Missing Hour
AUTHOR: Marc Hobelman
GENRE: Western Thriller
DESCRIPTION: Deputy Hale discovers a body in the canyon — and realizes the killer was never a stranger.
NARRATOR: TAMMY
ANNOUNCER: JAKE
SUNO PROMPT: Sparse western guitar, slow tension build, desert atmosphere, no vocals, cinematic.

CHARACTER GUIDE
---
DEPUTY HALE — 38, male, weathered American accent, quietly determined, haunted by a past mistake
MAYOR CROSS — 55, male, smooth Southern drawl, charming on the surface, calculating underneath
LUCY — 24, female, soft Texan accent, nervous energy, knows more than she lets on

---
[START AUDIO DRAMA SCRIPT]

ANNOUNCER: Drive Time Tales presents... Deadwater Canyon. Episode Three: The Missing Hour.

[SFX: wind across dry canyon, distant crow call]

NARRATOR: Three days since the rain. Three days since Sheriff Cole's funeral. And Deputy Hale still hadn't slept. He stood at the canyon rim in the grey morning light, hat pulled low, listening to nothing.

DEPUTY HALE: Nobody buries a man this fast unless they're scared of what he'd say if he woke up.

[SFX: boots on gravel, slow footsteps stopping]

NARRATOR: He crouched over the tracks in the dust — two sets, not one. Someone had been here before him.
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

*Rules r16, r17, and r18 apply only when `SERIES:` is populated in the header.*
*Rules r19 and r20 apply to all scripts.*
*The Stage 2 Quality Gate applies to every script before handoff to Hal.*
*Return ONLY the formatted script — no preamble, no commentary, no markdown fences.*
