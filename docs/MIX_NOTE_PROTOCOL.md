# MIX NOTE PROTOCOL — Endless Tales
**Version:** 1.0  
**Owner:** Marc Postlewaite / Endless Tales  
**Last Updated:** April 2026

---

## PURPOSE

When Marc listens to a mixed story and something sounds wrong, this protocol converts that observation into a precise instruction Hal can act on. Vague feedback ("the music was too loud") produces vague fixes. This protocol produces specific, timestamped, actionable remix instructions.

**The rule:** All mix problems go to Claude first. Claude diagnoses and writes the Hal instruction. Marc sends the instruction to Hal. Hal re-mixes only what's needed.

---

## STEP 1 — MARC IDENTIFIES THE PROBLEM

While listening, note the following for each problem:

- **Approximate timestamp** — where in the story did it happen? (e.g., "around 4 minutes in," "the opening 30 seconds," "the final scene")
- **What was happening in the story** — narration, dialogue, SFX moment, scene transition, silence
- **What you heard** — use the problem categories below to name it
- **What you expected** — what should it have sounded like?

---

## PROBLEM CATEGORIES

Use these exact terms when describing the issue to Claude. They map directly to specific mix parameters Hal can adjust.

### Music Problems

| What you hear | Category name | Likely cause |
|---|---|---|
| Music drowns out the narrator or dialogue | `MUSIC_TOO_LOUD` | Music dB level too high under narration/dialogue |
| Music is barely audible — feels absent | `MUSIC_TOO_QUIET` | Music dB level too low |
| Music feels wrong for the moment — doesn't match the scene energy | `MUSIC_WRONG_ENERGY` | Missing or ignored `[MUSIC: ...]` scene cue in script |
| Music plays at the same level throughout — no variation | `MUSIC_FLAT` | Scene-level cues not applied; flat mix |
| Music doesn't build before the climax | `MUSIC_NO_BUILD` | Missing music cue before peak scene |
| Music cuts off abruptly at the end | `MUSIC_HARD_CUT` | No fade-out applied to outro |
| Music starts too suddenly | `MUSIC_NO_FADE_IN` | Missing fade-in on opening |
| Music during the announcer is audible | `MUSIC_UNDER_ANNOUNCER` | Music not ducked to -60dB during ANNOUNCER lines |

### SFX Problems

| What you hear | Category name | Likely cause |
|---|---|---|
| SFX is too loud — pulls focus from dialogue | `SFX_TOO_LOUD` | SFX level too high relative to voice |
| SFX is too quiet — barely noticeable | `SFX_TOO_QUIET` | SFX level too low |
| SFX sounds wrong for the environment | `SFX_WRONG_SOUND` | Wrong asset selected for the cue |
| SFX plays at the wrong moment | `SFX_WRONG_TIMING` | Sync issue in the mix |
| Too many SFX — feels cluttered | `SFX_TOO_FREQUENT` | Script over-specified SFX; needs thinning |
| Too few SFX — environment feels empty | `SFX_ABSENT` | Script under-specified; needs addition |

### Voice Problems

| What you hear | Category name | Likely cause |
|---|---|---|
| One character's voice is significantly louder or quieter than others | `VOICE_LEVEL_IMBALANCE` | Per-voice normalization not applied |
| Narrator and character voices feel like they're in different acoustic spaces | `VOICE_SPACE_MISMATCH` | Different EQ/reverb settings across voices |
| A voice is distorted or clipping | `VOICE_CLIPPING` | Peak level too high — limiter not applied |
| A voice sounds muffled or hollow | `VOICE_EQ_WRONG` | EQ settings off for that voice |

---

## STEP 2 — WRITE THE MIX NOTE

After identifying the problem, write it up using this format and bring it to Claude:

```
MIX NOTE
========
Story: [story title]
Story UUID: [if known]
Timestamp: [approximate time in the audio where the problem occurs]
Category: [problem category name from the table above]
What I heard: [describe in your own words what you heard]
What it should sound like: [describe the target]
Scene context: [what was happening in the story at that moment]
```

**Example:**
```
MIX NOTE
========
Story: The Long Haul
Story UUID: 23e5ff68-7cef-49ef-82ca-a614ee53edaa
Timestamp: Around 4:30, when the trucker checks the cargo
Category: MUSIC_FLAT / MUSIC_WRONG_ENERGY
What I heard: Music kept playing at the same level during the cargo check scene — 
no change in energy even though this is supposed to be the most tense moment so far
What it should sound like: Music should drop out or go nearly silent when he opens 
the trailer, then start building again slowly as he realizes what he's looking at
Scene context: This is where the script had [MUSIC: cuts out entirely] — it didn't happen
```

---

## STEP 3 — BRING THE MIX NOTE TO CLAUDE

Open a Claude chat and paste:
1. This Mix Note Protocol document
2. The completed Mix Note

Say: **"Write the Hal remix instruction for this mix note."**

Claude will:
- Diagnose the root cause
- Determine whether the fix is in the mix parameters or in the script's music/SFX cues
- Write a precise, numbered Hal instruction
- Note if the script needs updating to prevent the same issue in future stories

---

## STEP 4 — SEND THE HAL INSTRUCTION TO HAL

Copy Claude's remix instruction and send it to Hal via Telegram verbatim. Do not paraphrase. The instruction will be specific enough that Hal can act on it without back-and-forth.

A well-formed Hal remix instruction looks like this:

```
REMIX INSTRUCTION — The Long Haul
==================================
Issue: MUSIC_FLAT / MUSIC_WRONG_ENERGY at timestamp ~4:30

Root cause: The [MUSIC: cuts out entirely] cue in the script at the cargo 
check scene was not applied. Music continued at -28dB through this scene.

Fix the following:
1. At timestamp ~4:20 (start of cargo check scene): drop music to -55dB over 3 seconds
2. Hold at -55dB (near silence) through the dialogue in this scene
3. At timestamp ~5:10 (after "I know what this is"): begin music rebuild — 
   fade from -55dB to -32dB over 8 seconds
4. Continue normal -28dB music level from ~5:20 onward

Do not re-render voice audio. Mix adjustment only.
Export new story_body.mp3 and upload to replace existing file.
Confirm UUID and new file timestamp when done.
```

---

## STEP 5 — VERIFY THE FIX

When Hal confirms the remix is complete:
1. Pull the new audio from the app or download from Supabase storage
2. Listen to the specific timestamp range that was fixed
3. If it sounds right — approve and publish
4. If it still sounds wrong — write a new Mix Note and repeat

---

## WHEN TO UPDATE THE SCRIPT VS. JUST THE MIX

Some mix problems are one-time fixes (adjust this story's levels). Others reveal a rule that should be written into the script going forward.

| Situation | Fix |
|---|---|
| Music cue was in the script but Hal didn't apply it | Mix fix only — Hal instruction |
| Music cue was missing from the script | Mix fix + update the script file + note for Stage 2 prompt if it's a pattern |
| Wrong energy throughout the whole story | Likely SUNO PROMPT issue — update the brief and regenerate music for future stories |
| SFX level consistently wrong across multiple stories | Update the ASC Bible dB table — bring to Claude to revise |
| Same problem appears in 2+ different stories | Pattern — bring to Claude to update Stage 2 Master Prompt rules |

**The rule:** If a problem happens once, fix the mix. If it happens twice, fix the rule.

---

## QUICK REFERENCE — MIX LEVEL STANDARDS

These are the ASC Bible's target levels. Use these when describing what you expect to Hal or when asking Claude to diagnose a level problem.

| Segment Type | Target Music Level | Notes |
|---|---|---|
| ANNOUNCER (intro/outro) | -60dB | Near silence — voice completely clear |
| NARRATOR | -28dB | Subtle bed under narration |
| CHARACTER dialogue | -28dB | Same as narrator |
| [BEAT] / [PAUSE] | -18dB | Music rises slightly in silence |
| Music build toward climax | -20dB to -10dB | Gradual, over 10–15 seconds |
| End-of-story swell | -10dB | Peaks before outro ANNOUNCER |
| After final word | Fade to silence | 3-second fade |
| SFX vs. dialogue | SFX at -6dB relative to dialogue | SFX present but never dominant |

If what you're hearing doesn't match these targets, name the segment type and category in your Mix Note.

---

*MIX_NOTE_PROTOCOL.md — Endless Tales · Version 1.0 · April 2026*  
*Changes require Marc's approval and version increment.*  
*Commit to GitHub at ~/Projects/ASC/ after any update.*
