# ENDLESS TALES - PUBLISHED STORY SPEC
### What a finished story sounds like. No exceptions.
**Version 1.3 - May 20, 2026 - Marc Postlewaite**
*Added: Story Resolution Map Rule (mandatory pre-writing requirement)*

---

## THE LISTENING EXPERIENCE - SECOND BY SECOND

A subscriber presses Play. Here is exactly what they hear, in order:

### 1. STING (3.5 seconds)
- The ET Signature Sting plays at full volume
- File: ET_Signature_Sting_v7.mp3.mp3 in Supabase storage
- At 1.2 seconds, Belle B begins speaking and the sting fades out underneath her voice

### 2. BELLE B INTRO (overlaps sting tail)
- Belle B speaks ONE line, maximum two short sentences
- She is a warm friend recommending a story - not an announcer, not a host, not a DJ
- She speaks to ONE person, not an audience
- Voice ID: GMhgX8fCR9GUtd3kmlKC - this is the ONLY voice used for Belle B, always
- Script label: BELLE B: - never ANNOUNCER:, never SANDY:, never anything else

Belle B intro rules:
- Never says "Welcome to Endless Tales"
- Never says "Tonight" or any time-of-day reference
- Never says "presents" or "we bring you"
- Never uses formal language
- Never addresses the listener by name (no [LISTENER_NAME])
- Never mentions the author or narrator by name
- References something SPECIFIC and sensory from the story
- Tone: like a friend leaning over and saying "oh you have to hear this one"

GOOD: "I've been saving this one - a courier picks up a package that was never meant for him, and the return address doesn't exist."
GOOD: "This one sits with you. A woman drives back to the town she swore she'd never see again, and the first person she runs into is the one she left behind."
BAD: "Welcome to Endless Tales. Tonight we present The Courier, a thrilling tale of suspense and intrigue."
BAD: "Get ready for an exciting new story by Roman Steele, narrated by Ray Dolan."

### 3. SILENCE (0.75 seconds)
- Clean silence between Belle B intro and the story body

### 4. STORY BODY - VOICES + BACKGROUND MUSIC
- The narrator tells the story. Characters speak their dialogue.

Background music behavior:
- Music begins at FULL VOLUME for 2.5 seconds - sets the atmosphere
- When the narrator begins speaking, music DUCKS to 15% volume
- Music stays at 15% underneath all narrator and character dialogue
- Music loops seamlessly if shorter than the story
- When the narrator finishes the last line, music RISES back to full volume
- Music plays at full volume for 3 seconds, then fades out completely
- 1.0 second silence follows before Belle B outro

Voice rules:
- Narrator voice: assigned from narrator_voices table based on the author
- Character voices: auto-assigned from ElevenLabs My Voices library (500+ voices)
- Default accent preference: AMERICAN unless CHARACTER GUIDE says otherwise
- Belle B's voice is NEVER used as narrator or character - only as announcer
- Platform narrators are never cast as characters

No SFX. Stories are voice-only with background music.

### 5. SILENCE (1.0 second)
- Clean silence between story body end and Belle B outro

### 6. BELLE B OUTRO
- Belle B speaks ONE line, maximum two short sentences
- Same voice, same warmth as the intro
- Reflective and warm - leaves the listener with a feeling, not a summary
- Must be COMPLETE - never cut off mid-sentence
- Credits the author and says "an Endless Tales original"

For standalones: Land on the one image or moment that captures what the story meant.
For series non-finales: Name one specific unresolved moment that makes the listener desperate for the next episode.
For series finales: Same as standalone - resolution and satisfaction.

GOOD: "That blanket. Forty-six strangers on a train and he gave it to the one person who needed it most. That was 'Snow Line to Somewhere' by Edmund Worth - an Endless Tales original."
BAD: "Thanks for listening to this exciting story. Tune in next time for more great tales from Endless Tales."

---

## STORY RESOLUTION MAP RULE (MANDATORY)

**Before Claude writes any Endless Tales story, Claude MUST first create a Story Resolution Map.**

The map ensures every story has a clear hook, a difficult solution, and an earned ending. Claude outputs the map as a comment block at the top of the script (it is removed before audio production).

### The Six Required Sections

1. **MAIN HOOK / PROBLEM**
   - What urgent question, danger, mystery, desire, emotional wound, or conflict pulls the listener in?
   - Must be clear and time-sensitive

2. **WHY THE SOLUTION SEEMS DIFFICULT**
   - Why does the solution appear almost impossible, dangerous, risky, costly, hidden, morally difficult, emotionally painful, or unlikely?
   - The listener must feel the problem at the start

3. **MINOR PROBLEMS / MIDDLE MOVEMENT**
   - List the smaller problems, discoveries, reversals, clues, choices, or emotional shifts the middle sorts through
   - These should make the solution possible without revealing it too early

4. **FINAL SOLUTION**
   - State the concrete ending solution BEFORE drafting the script
   - Must be specific and non-vague
   - Resolve, answer, reverse, or transform the main problem

5. **WHY THE ENDING IS EARNED**
   - Explain how the middle of the story prepares the listener for the final solution
   - Show the explicit connection between what happens in the middle and why the ending works
   - The listener should feel the solution was possible all along, but not obvious

6. **VARIETY GUARDRAIL**
   - How does this story differ from recent stories in structure, tone, pacing, setting, mood, plot shape, and solution type?
   - Do NOT repeat the same pattern
   - Vary the solution type and story rhythm

### Allowed Solution Types

- Clever discovery
- Emotional confession
- Moral choice
- Sacrifice
- Escape
- Rescue
- Revelation
- Reversal
- Justice
- Forgiveness
- Survival
- Transformation
- Bittersweet acceptance
- Series cliffhanger with episode-level resolution

### Hard Rules

- **The solution must feel difficult at the beginning.**
- **The middle must make the solution possible.**
- **The ending must make the listener feel the story has paid off its promise.**
- **Standalone stories must resolve the main hook completely.**
- **Non-final series episodes must resolve the episode problem while strengthening the larger series hook.**
- **Final series episodes must resolve the series problem completely.**
- **Do NOT force this story into the same plot pattern as prior stories.** Vary structure, tone, pacing, and solution type.

### Review Bot Flags

The review bot will FAIL or FLAG any story where:
- The main hook is unclear or weak
- The final solution is vague or missing
- The ending does not resolve the story promise
- A standalone story leaves major problems unresolved
- A final series episode leaves the series problem unresolved
- The story feels formulaic because it repeats the same structure as prior stories

---

## STORY CONTENT RULES

### Writing Level
- Write at a 10th grade reading level
- Clear, direct prose. Short sentences.
- No literary flourishes that a listener would need to re-hear to understand
- The story should be immediately graspable by anyone paying partial attention while driving

### Opening Clarity - CRITICAL
- The first 60 seconds must establish: WHO is the main character, WHERE are we, WHAT is happening
- The listener must never be confused about what is going on
- No starting mid-action without context
- The hook comes FROM clarity, not from confusion

### Endings - NON-NEGOTIABLE
- Every standalone MUST have a definitive ending
- The central conflict MUST be resolved
- The listener MUST know the story is over and feel satisfied
- The last 2 minutes contain: (1) climax or final revelation, (2) resolution showing consequences, (3) closing image or moment
- Test: can a listener summarize how the story ended in one sentence? If not, rewrite.
- No ambiguous endings. No trailing off.

### Series Episodes
- Non-finale: ends with a SPECIFIC cliffhanger - a moment of danger, revelation, or impossible choice.
- Finale: follows standalone ending rules - full resolution and satisfaction.

### Characters
- Culturally specific names that fit the character's background - American, European, and Latin American common names are fine (e.g. "Tom Beckett," "Elena Ruiz," "Santiago Herrera")
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

### Accent Defaults
- Default: American accent unless CHARACTER GUIDE specifies otherwise
- When no accent specified: American voices get +10 score, British voices get -5 score

---

## THE SCRIPT FORMAT

Every script must contain these elements in this order:

BELLE B INTRO
---
BELLE B: [intro line]
---

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
[NAME - age, gender, accent, tone in one line]
---

[START AUDIO DRAMA SCRIPT]

NARRATOR: [story begins]
[CHARACTER]: [dialogue]
[BEAT]
...

BELLE B: [outro line]

---

## AUDIO PIPELINE - TECHNICAL

### API Endpoints (TWO-STEP PIPELINE ONLY):
1. POST /api/admin/generate-voices - generates all voice segments + Belle B intro/outro
2. POST /api/asc3/render-final-mix - mixes everything into final audio

NEVER use /api/asc3/generate-story-complete - it had wrong voice ID hardcoded.

### Belle B voice settings:
- Voice ID: GMhgX8fCR9GUtd3kmlKC
- Stability: 0.49, Similarity: 0.51, Style: 0.0, Speaker Boost: true, Speed: 1.0
- Model: eleven_multilingual_v2
- Volume in mix: 1.5x

### Mix settings:
- Voice normalization: dynaudnorm filter applied to all segments
- Belle B: 1.5x volume
- Narrator/character voices: 1.0x (normalized)
- Background music under dialogue: 15% (ducked)
- Background music at transitions: full volume
- BEAT/PAUSE lines generate actual silence audio segments
- Uses @ffmpeg-installer/ffmpeg (NOT ffmpeg-static)
- Stories with 80+ segments: use local ffmpeg mix
- Sting crossfade: Belle B starts at 1200ms into sting

---

## WHAT MARC LISTENS FOR WHEN APPROVING

1. Does the sting play and crossfade into Belle B?
2. Does Belle B sound like a warm friend, not an announcer?
3. Is the intro specific to THIS story?
4. Are the character voices American (unless script says otherwise)?
5. Is the background music ducking properly under dialogue and rising at transitions?
6. Does the story have a clear, satisfying ending?
7. Is the Belle B outro complete with author credit?
8. Does the outro reference something specific from the story?
9. Are voices level and consistent throughout?
10. Is the story clear and easy to follow on first listen?
11. Overall: would a commuter enjoy this and want to hear another one?

---

This spec is the single source of truth.
If any code, prompt, or instruction contradicts this document, this document wins.
PUBLISHED_STORY_SPEC.md - Version 1.2 - April 14, 2026
