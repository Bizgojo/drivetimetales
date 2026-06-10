# ENDLESS TALES — PUBLISHED STORY SPEC
### What a finished story sounds like. No exceptions.
**Version 1.4 · June 10, 2026 · Marc Postlewaite**

**Changes from v1.3 (May 20, 2026) — all approved by Marc, June 10, 2026:**
1. Belle's intro now addresses the listener by first name — ONE written line containing `[LISTENER_NAME]`, server-side name stitch, silent no-name fallback. (Reverses the "never addresses the listener by name" rule.)
2. **Anchor SFX** reinstated: 3–6 bold, discrete effects per story. (Reverses the "No SFX" rule, with constraints.)
3. Optional `[MUSIC:OUT]`/`[MUSIC:IN]` silence markers (max 2 per story).
4. Belle bridge line after standalone outros (one sentence, conditional).
5. Series episodes default to 12–18 minutes.
6. **Series Release Rule:** Episode 1 never publishes without Episode 2 live; 3-episode series publish complete.
7. Grading moves to six dimensions / 30 points (Investment added) — gates 22+ publish, 26+ gold.
8. Voice ID confirmed: **GMhgX8fCR9GUtd3kmlKC** (improved Belle voice, May 2026). Retired IDs, never to be used: wewocdDkjSLm9ZwjO7TD, KWDD3Wyq30ZF5NEL01EJ.
Carried forward unchanged from v1.3: Story Resolution Map Rule, Opening Clarity, Writing Level, Audio Clarity, two-step endpoints, dynaudnorm mix chain.

---

## THE LISTENING EXPERIENCE — SECOND BY SECOND

A subscriber presses Play. Here is exactly what they hear, in order:

### 1. STING (3.5 seconds)
- The ET Signature Sting plays at full volume
- File: ET_Signature_Sting_v7.mp3.mp3 in Supabase storage
- At 1.2 seconds, Belle begins speaking and the sting fades out underneath her voice

### 2. BELLE B INTRO (overlaps sting tail)
- Belle speaks ONE line, maximum two short sentences
- She is a warm friend recommending a story — not an announcer, not a host, not a DJ
- She speaks to ONE person, not an audience — **and she knows their name**
- Voice ID: **GMhgX8fCR9GUtd3kmlKC** — this is the ONLY voice used for Belle, always
- Script label: `BELLE B:` — never ANNOUNCER:, never SANDY:, never anything else
- Belle is the spoken/persona name. BELLE B is the internal script label and reserved voice identifier.

**Personalization (v1.4):**
- The written intro line contains `[LISTENER_NAME]` exactly once, placed at a natural prosodic pause (after a comma, dash, or clause boundary) — not always first
- The listener's first name is pre-rendered in Belle's voice and stitched in server-side (see AUDIO PIPELINE)
- The line MUST work gracefully with the name omitted — listeners without cached name audio hear the no-name render and never sense anything missing
- The name appears in the INTRO only. Never in outros. Once per story.

**Belle intro rules:**
- Never says "Welcome to Endless Tales"
- Never says "Tonight" or any time-of-day reference
- Never says "presents" or "we bring you"
- Never uses formal language
- Never mentions the author or narrator by name
- References something SPECIFIC and sensory from the story
- Tone: like a friend leaning over and saying "oh you have to hear this one"

GOOD: *"I've been saving this one, [LISTENER_NAME] — a courier picks up a package that was never meant for him, and the return address doesn't exist."*
GOOD (no-name render of the same line): *"I've been saving this one — a courier picks up a package that was never meant for him, and the return address doesn't exist."*
BAD: *"Welcome to Endless Tales. Tonight we present The Courier, a thrilling tale of suspense and intrigue."*
BAD: *"Get ready for an exciting new story by Roman Steele, narrated by Ray Dolan."*

### 3. SILENCE (0.75 seconds)
- Clean silence between Belle intro and the story body

### 4. STORY BODY — VOICES + BACKGROUND MUSIC + ANCHOR SFX
The narrator tells the story. Characters speak their dialogue.

**Background music behavior:**
- Music begins at FULL VOLUME for 2.5 seconds — sets the atmosphere
- When the narrator begins speaking, music DUCKS to 15% volume
- Music stays at 15% underneath all narrator and character dialogue
- Music loops seamlessly if shorter than the story
- When the narrator finishes the last line, music RISES back to full volume
- Music plays at full volume for 3 seconds, then fades out completely
- 1.0 second silence follows before Belle outro

**Music silence drops (v1.4, optional):**
- Scripts may include up to TWO paired `[MUSIC:OUT]` / `[MUSIC:IN]` markers
- `[MUSIC:OUT]`: music fades to complete silence over ~700ms and stays out; `[MUSIC:IN]`: returns to the 15% bed over ~700ms
- Used only at the story's biggest dramatic moment(s) — after constant low music, total silence makes every word land heavier

**Anchor SFX (v1.4):**
- Each story contains **3 to 6 anchor SFX** — bold, discrete, story-critical sounds at scene transitions and pivotal moments
- SFX play in natural gaps — NEVER under or overlapping dialogue or narration
- NO continuous ambience beds. Listeners are in moving vehicles; subtle ambience is lost to road noise and fights the ducked music
- Mix level: foregrounded — clearly audible over the 15% music bed and cab noise; peak at or slightly above dialogue level, never startling
- Loudness-normalized before mixing
- Scripts mark them as `[SFX: specific concrete description]` on their own line

**Voice rules:**
- Narrator voice: assigned from narrator_voices table based on the author
- Character voices: auto-assigned from ElevenLabs My Voices library (500+ voices)
- Default accent preference: AMERICAN unless CHARACTER GUIDE says otherwise
- Belle's voice is NEVER used as narrator or character — only as announcer
- Platform narrators are never cast as characters

### 5. SILENCE (1.0 second)
- Clean silence between story body end and Belle outro

### 6. BELLE B OUTRO
- Belle speaks ONE line, maximum two short sentences
- Same voice, same warmth as the intro — **no [LISTENER_NAME] in outros, ever**
- Reflective and warm — leaves the listener with a feeling, not a summary
- Must be COMPLETE — never cut off mid-sentence
- Credits the author and says "an Endless Tales original"

For standalones: land on the one image or moment that captures what the story meant.
For series non-finales: name one specific unresolved moment that makes the listener desperate for the next episode.
For series finales: same as standalone — resolution and satisfaction.

**Bridge line (v1.4) — standalones only, conditional:** when the author has a related series or recurring protagonist in the catalog, Belle adds ONE sentence after the formal close — a friend's aside, never a plug: *"Marsh has another case waiting whenever you are."* One sentence max · only when a real next listen exists · never on series episodes · no promo language ("check out," "don't miss," "available now") · no [LISTENER_NAME].

GOOD: *"That blanket. Forty-six strangers on a train and he gave it to the one person who needed it most. That was 'Snow Line to Somewhere' by Edmund Worth — an Endless Tales original."*
BAD: *"Thanks for listening to this exciting story. Tune in next time for more great tales from Endless Tales."*

---

## STORY RESOLUTION MAP RULE (MANDATORY)

**Before Claude writes any Endless Tales story, Claude MUST first create a Story Resolution Map.**

The map ensures every story has a clear hook, a difficult solution, and an earned ending. Claude outputs the map as a comment block at the top of the script (it is removed before audio production).

### The Six Required Sections
1. **MAIN HOOK / PROBLEM** — What urgent question, danger, mystery, desire, emotional wound, or conflict pulls the listener in? Must be clear and time-sensitive.
2. **WHY THE SOLUTION SEEMS DIFFICULT** — Why does the solution appear almost impossible, dangerous, risky, costly, hidden, morally difficult, emotionally painful, or unlikely? The listener must feel the problem at the start.
3. **MINOR PROBLEMS / MIDDLE MOVEMENT** — The smaller problems, discoveries, reversals, clues, choices, or emotional shifts the middle sorts through. These should make the solution possible without revealing it too early. *(These are the story's turns — see Turn Rule below; the two systems work together.)*
4. **FINAL SOLUTION** — State the concrete ending solution BEFORE drafting the script. Must be specific and non-vague. Resolve, answer, reverse, or transform the main problem.
5. **WHY THE ENDING IS EARNED** — How the middle prepares the listener for the final solution. The listener should feel the solution was possible all along, but not obvious.
6. **VARIETY GUARDRAIL** — How this story differs from recent stories in structure, tone, pacing, setting, mood, plot shape, and solution type. Do NOT repeat the same pattern.

### Allowed Solution Types
Clever discovery · Emotional confession · Moral choice · Sacrifice · Escape · Rescue · Revelation · Reversal · Justice · Forgiveness · Survival · Transformation · Bittersweet acceptance · Series cliffhanger with episode-level resolution

### Hard Rules
- The solution must feel difficult at the beginning.
- The middle must make the solution possible.
- The ending must make the listener feel the story has paid off its promise.
- Standalone stories must resolve the main hook completely.
- Non-final series episodes must resolve the episode problem while strengthening the larger series hook.
- Final series episodes must resolve the series problem completely.
- Do NOT force this story into the same plot pattern as prior stories. Vary structure, tone, pacing, and solution type.

### Review Bot Flags
The review bot will FAIL or FLAG any story where: the main hook is unclear or weak · the final solution is vague or missing · the ending does not resolve the story promise · a standalone leaves major problems unresolved · a final series episode leaves the series problem unresolved · the story feels formulaic because it repeats the same structure as prior stories.

---

## STORY CONTENT RULES

### Writing Level
- Write at a 10th grade reading level
- Clear, direct prose. Short sentences.
- No literary flourishes that a listener would need to re-hear to understand
- The story should be immediately graspable by anyone paying partial attention while driving

### Opening Clarity — CRITICAL
- The first 60 seconds must establish: WHO is the main character, WHERE are we, WHAT is happening
- The listener must never be confused about what is going on
- No starting mid-action without context — open in the middle of trouble, but orient immediately
- **The hook comes FROM clarity, not from confusion**

### Story Structure (v1.4 — owned in detail by Stage 2 v2.2)
- **Turn Rule:** a reveal, reversal, escalation, or consequential decision every 3–4 script minutes; no flat stretch longer than 5 minutes; stories of 20+ minutes contain a midpoint reversal
- **Sensory Anchor Rule:** every scene grounds its physical space in at least two concrete sensory details within its first three narrator lines

### Endings — NON-NEGOTIABLE
- Every standalone MUST have a definitive ending
- The central conflict MUST be resolved
- The listener MUST know the story is over and feel satisfied
- The last 2 minutes contain: (1) climax or final revelation, (2) resolution showing consequences, (3) closing image or moment
- Test: can a listener summarize how the story ended in one sentence? If not, rewrite.
- No ambiguous endings. No trailing off.

### Series Episodes
- Non-finale: ends with a SPECIFIC cliffhanger — a moment of danger, revelation, or impossible choice.
- Finale: follows standalone ending rules — full resolution and satisfaction.
- Runtime default: **12–18 minutes** per episode unless the Brief justifies longer. 20–25 minutes is reserved for standalones, finales, and episodes that earn it.

### Series Release Rule (v1.4) — NON-NEGOTIABLE
- **Episode 1 never publishes unless Episode 2 is produced, approved, and published in the same release.**
- Three-episode series publish complete. Longer series may release weekly after Episodes 1–2 are live.
- A cliffhanger with no next episode available converts retention into frustration. Never strand a listener on a cliff.

### Characters
- Culturally specific names that fit the character's background — American, European, and Latin American common names are fine (e.g. "Tom Beckett," "Elena Ruiz," "Santiago Herrera")
- Each character must be distinct in voice, speech pattern, and personality
- CHARACTER GUIDE must include: gender, approximate age, accent, AND tone

### Audio Clarity
- This is audio-only. Listeners cannot see who is speaking.
- The narrator must make it clear who is talking at all times
- When a new character speaks, the narrator introduces them first
- When the setting changes, the narrator describes the new location

### Premise Originality
- Each story must have a distinct premise
- No two stories in the same batch should share similar plots
- Check existing stories before writing new ones

---

## GRADING (v1.4 — full rubric in MASTER_BIBLE v3.0 §4)
Six dimensions, 1–5 each, 30 points: Hook · Clarity · Pacing · Audio Quality · Landing · **Investment** ("Did I care what happened to this person? Did I feel something at the ending?"). Publish at **22+/30**; gold standard at **26+/30**. Marc approval required before any publish.

---

## VOICE ASSIGNMENT RULES

### Source
- ALL character voices come from ElevenLabs My Voices library via fetchMyVoices() API
- NEVER use hardcoded voice lists

### Variety
- Standalone stories: avoid reusing same character voices across different stories
- Recently-used voices get a scoring penalty

### Series Consistency
- Character voices MUST be locked from Episode 1 and reused in all subsequent episodes
- Same character = same voice, every episode
- Recurring protagonists keep their voice across an author's standalones

### Accent Defaults
- Default: American accent unless CHARACTER GUIDE specifies otherwise
- When no accent specified: American voices get +10 score, British voices get -5 score

---

## THE SCRIPT FORMAT

Every script must contain these elements in this order:

~~~
<!-- STORY RESOLUTION MAP
[six sections — stripped before audio production]
-->

BELLE B INTRO
---
BELLE B: [single intro line containing [LISTENER_NAME]]
---

SERIES: [or blank]
EPISODE: [or blank]
EPISODE_TITLE: [or blank]
SERIES_TOTAL_EPISODES: [required for series]
SERIES_IS_FINALE: [true/false — required for series]
AUTHOR: [author name]
GENRE: [genre]
DESCRIPTION: [24-word hook for app display]
NARRATOR: [narrator name]
ANNOUNCER: Belle B
NARRATIVE_VOICE: [first_person / third_limited / third_omniscient]
NARRATOR_IS_CHARACTER: [true/false]
SUNO PROMPT: [2-3 sentences describing background music]

CHARACTER GUIDE
---
[NAME — age, gender, accent, tone in one line]
---

[START AUDIO DRAMA SCRIPT]

NARRATOR: [story begins]
[CHARACTER]: [dialogue]
[BEAT]
[SFX: specific concrete description]     ← 3–6 per story
[MUSIC:OUT] ... [MUSIC:IN]               ← optional, max 2 pairs
...

BELLE B: [outro line — bridge sentence after, if standalone with a real next listen]
~~~

---

## AUDIO PIPELINE — TECHNICAL

### API Endpoints (TWO-STEP PIPELINE ONLY):
1. POST /api/admin/generate-voices — generates all voice segments + Belle intro/outro assets
2. POST /api/asc3/render-final-mix — mixes everything into final audio

NEVER use /api/asc3/generate-story-complete — it had a wrong voice ID hardcoded. Permanently banned.

### Belle voice settings:
- Voice ID: **GMhgX8fCR9GUtd3kmlKC**
- Stability: 0.49, Similarity: 0.51, Style: 0.0, Speaker Boost: true, Speed: 1.0
- Model: eleven_multilingual_v2
- Volume in mix: 1.5x

### Name Stitch (v1.4) — server-side, cached
1. **Name audio cache** — table `belle_name_audio` (name_text PK lowercase, audio_url, duration_ms, status). Name clips rendered ONCE per unique first name in Belle's voice (GMhgX8fCR9GUtd3kmlKC, settings above), loudness-normalized, cached in Supabase storage. Shared across all subscribers with that name.
2. **Per story:** generate-voices renders intro Part A (before [LISTENER_NAME]), Part B (after), and a full no-name render. final_mix is built with the no-name intro; the story body is never re-mixed per user.
3. **First play:** if name audio exists → ffmpeg concat partA + name + partB, ≤40ms crossfade per seam, cached per user × story (news-system pattern). Subsequent plays instant from cache.
4. **Fallback:** name missing, unrenderable, or stitch fails → serve the no-name render. Silent and invisible to the listener. Never block playback.
5. Full build details: PERSONALIZATION_AND_SFX_IMPLEMENTATION.md v1.0.

### Mix settings:
- Voice normalization: dynaudnorm filter applied to all segments
- Belle: 1.5x volume
- Narrator/character voices: 1.0x (normalized)
- Anchor SFX: foregrounded, gaps only, loudness-normalized
- Background music under dialogue: 15% (ducked); full volume at transitions
- [MUSIC:OUT]/[MUSIC:IN]: ~700ms fades to/from complete silence, max 2 pairs
- BEAT/PAUSE lines generate actual silence audio segments
- Uses @ffmpeg-installer/ffmpeg (NOT ffmpeg-static)
- Stories with 80+ segments: use local ffmpeg mix
- Sting crossfade: Belle starts at 1200ms into sting

---

## WHAT MARC LISTENS FOR WHEN APPROVING

1. Does the sting play and crossfade into Belle?
2. Does Belle sound like a warm friend, not an announcer?
3. **Is the name stitch seamless — no click, no gap, no robotic seam? (Test a real name AND the no-name render.)**
4. Is the intro specific to THIS story?
5. Are the character voices American (unless script says otherwise)?
6. Is the background music ducking properly under dialogue and rising at transitions?
7. **Do the anchor SFX land cleanly in gaps — bold, never under dialogue, never startling — and do all 3–6 earn their place?**
8. **If [MUSIC:OUT] was used: does the silence land at the right moment and return cleanly?**
9. **Does the story turn every few minutes — no flat stretch where nothing changes?**
10. Does the story have a clear, satisfying ending that pays off the Resolution Map's promise?
11. Is the Belle outro complete with author credit (and the bridge line, if a standalone has one, warm not promotional)?
12. Does the outro reference something specific from the story?
13. Are voices level and consistent throughout?
14. Is the story clear and easy to follow on first listen?
15. Overall: would a commuter enjoy this and want to hear another one — **and did I care what happened?**

---

This spec is the single source of truth.
If any code, prompt, or instruction contradicts this document, this document wins.
Aligned documents: STAGE2_SCRIPT_PROMPT v2.2 · SCRIPT_VALIDATOR v1.1 · MASTER_BIBLE v3.0 · PERSONALIZATION_AND_SFX_IMPLEMENTATION v1.0 · AUTOPLAY_NEXT_EPISODE_SPEC v1.0

*PUBLISHED_STORY_SPEC.md — Version 1.4 — June 10, 2026*
*Changes require Marc's approval and version increment. Commit to GitHub; archive superseded versions the same day.*
