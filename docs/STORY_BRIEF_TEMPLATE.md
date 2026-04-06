# STORY BRIEF — Endless Tales
**Version:** 1.0  
**Owner:** Marc Postlewaite / Endless Tales  
**Last Updated:** April 2026

---

## HOW TO USE

Fill out every field below. Blank fields slow down production and result in Claude making assumptions that may not match your vision. The more specific you are, the better the script.

When complete, paste this brief into a new Claude chat along with the Stage 2 Master Prompt (`STAGE2_SCRIPT_PROMPT.md`) and say: **"Write the script."**

Fields marked **[REQUIRED]** must be filled. Fields marked **[OPTIONAL]** can be left blank — Claude will use defaults.

---

## PART 1 — STORY IDENTITY

**Title (working title or leave blank — Claude will suggest one):**
```
TITLE: 
```

**Standalone or Series:** [REQUIRED]
```
TYPE: standalone
```
*(Options: `standalone` | `series`)*

**If Series — Series Name:** [REQUIRED for series]
```
SERIES_NAME: 
```

**If Series — Episode Number:** [REQUIRED for series]
```
EPISODE_NUMBER: 
```

**If Series — Total Episodes in Series:** [REQUIRED for series]
```
SERIES_TOTAL_EPISODES: 
```

**If Series — Is This the Finale?:** [REQUIRED for series]
```
IS_FINALE: false
```
*(Options: `true` | `false`)*

---

## PART 2 — AUTHOR & GENRE

**Author:** [REQUIRED]
```
AUTHOR: 
```
*(Choose from ET roster: Sara Keene, Elias Thorn, Dale Harmon, Julian Mercer, Daniel Wren, Mark Holbrook, Silas Graves, Nina Vasquez, Caroline Drake, Marc Hobelman)*

*(If unsure, describe the tone you want and Claude will recommend the right author.)*

**Primary Genre:** [REQUIRED]
```
GENRE: 
```
*(Options: Thriller, Horror, Dark Mystery, Mystery/Crime, Adventure, Drama, Sci-Fi, Western, Historical Drama, Supernatural, Family/Heartwarming)*

**Narrative Voice:** [OPTIONAL — Claude defaults to the author's standard voice]
```
NARRATIVE_VOICE: 
```
*(Options: `first_person` | `third_limited` | `third_omniscient` — leave blank to use author default)*

---

## PART 3 — STORY CONTENT

**The Core Premise:** [REQUIRED]
Describe the story in 2–5 sentences. Who is the protagonist? What do they want? What's standing in their way? What's at stake?
```
PREMISE: 

```

**The Setting:** [REQUIRED]
Time period, location, and any specific environmental details that matter to the story.
```
SETTING: 

```

**Target Runtime:** [REQUIRED]
```
RUNTIME: 
```
*(Options: `10 min` | `15 min` | `20 min` | `25 min`)*

**Characters:** [OPTIONAL — Claude will create characters from the premise if blank]
List any specific characters you want in the story. Include name, role, and any key traits. Leave blank for Claude to create them from the premise.
```
CHARACTERS:

```

**Specific Story Requirements:** [OPTIONAL]
Anything else Claude must include, avoid, or handle carefully. Plot points you want hit. Themes you want explored. Content you want excluded.
```
REQUIREMENTS:

```

**If Series — Previous Episode Summary:** [REQUIRED for Episode 2+]
Brief summary of what happened in the previous episode. What was the cliffhanger? What emotional state is the listener in? Claude uses this to write the series intro variations and to carry consequence forward.
```
PREVIOUS_EPISODE:

```

**If Series — Next Episode Setup:** [OPTIONAL]
If you know what happens in the next episode, note it here. Claude uses this to write a specific, real series outro tease rather than a generic one.
```
NEXT_EPISODE:

```

---

## PART 4 — AUDIO & MUSIC DIRECTION

This section directly controls how Claude writes music cues and SFX into the script, and how Hal mixes the final audio. Be specific — vague direction produces generic results.

**Overall Music Energy:** [REQUIRED]
Describe the dominant emotional tone of the music for this story. This becomes the foundation of the SUNO PROMPT.
```
MUSIC_ENERGY: 
```
*Examples:*
- `Slow-burn dread — sparse, minimal, tension underneath everything`
- `Driving and kinetic — pulse-based, forward momentum, no vocals`
- `Warm and melancholic — acoustic, unhurried, bittersweet`
- `Atmospheric and expansive — cinematic, wide, documentary feel`
- `Tense procedural — low strings, clock-like rhythm, urban cold`

**Music Reference (optional but powerful):** [OPTIONAL]
Name a film, TV show, or composer whose score captures the sound you want. Claude uses this to sharpen the SUNO PROMPT.
```
MUSIC_REFERENCE: 
```
*Examples: `No Country for Old Men`, `True Detective Season 1`, `Arrival`, `Sicario`, `Ozark`, `Hans Zimmer — Interstellar`, `Johann Johannsson`*

**Key Dramatic Moments Needing Music Shifts:** [OPTIONAL but strongly recommended]
List 2–4 moments in the story where the music energy needs to change significantly. Claude will write scene-level `[MUSIC: ...]` cues at these moments in the script, so Hal knows to shift the mix — not just hold a flat level throughout.
```
MUSIC_MOMENTS:
- [Scene or moment]: [what the music should do]
- [Scene or moment]: [what the music should do]
- [Scene or moment]: [what the music should do]
```
*Examples:*
- `Opening — near silence, just ambient texture, no melody`
- `When the body is discovered — music drops out completely, silence for 3 seconds`
- `The chase sequence — energy spikes hard, driving rhythm`
- `Final revelation — music swells, holds, then fades slowly`
- `Ending — single instrument only, quiet resolution`

**SFX Density:** [OPTIONAL — defaults to standard]
```
SFX_DENSITY: standard
```
*(Options: `minimal` — sparse, atmospheric only | `standard` — one significant cue per 60–90 sec | `rich` — frequent, immersive, cinematic)*

**SFX Priority Environments:** [OPTIONAL]
List the key locations or environments in the story. Claude will ensure these environments get specific, grounded SFX rather than generic ones.
```
SFX_ENVIRONMENTS:
- 
- 
```
*Examples: `rural highway at night`, `1940s diner kitchen`, `abandoned warehouse`, `moving semi cab interior`, `forest in early morning`*

**Audio Tone Notes:** [OPTIONAL]
Anything else about how this story should sound. Silences that matter. Moments where SFX should dominate. Voices that should feel isolated vs. immersed in environment.
```
AUDIO_NOTES:

```

---

## PART 5 — PUBLISHING

**Story Description (24 words max):** [OPTIONAL — Claude writes one if blank]
The punchy present-tense hook that appears on the story card in the app. If you have a specific angle you want, write it here. Otherwise Claude will write it from the premise.
```
DESCRIPTION:

```

---

## COMPLETED BRIEF EXAMPLE

```
TITLE: The Long Haul
TYPE: standalone
AUTHOR: Dale Harmon
GENRE: Thriller
NARRATIVE_VOICE: (blank — use author default)
RUNTIME: 15 min

PREMISE: A long-haul trucker making his final delivery before retirement 
discovers his cargo isn't what the manifest says. Someone is following him. 
He has 200 miles and six hours to decide whether to deliver it anyway or 
find out what's really in that trailer.

SETTING: Interstate highway, rural American South, present day, night. 
Truck stops, empty roads, one roadside diner.

CHARACTERS: (blank — Claude creates from premise)

REQUIREMENTS: 
- No supernatural elements — keep it grounded
- The cargo reveal should be morally ambiguous, not a simple good/evil setup
- End on a choice, not a rescue

MUSIC_ENERGY: Tense and sparse — minimal instrumentation, long sustained 
notes, the kind of music that makes an empty road feel dangerous.

MUSIC_REFERENCE: No Country for Old Men / Sicario

MUSIC_MOMENTS:
- Opening miles — low ambient hum, almost nothing, just road noise and texture
- When he checks the cargo — music cuts out entirely, dead silence
- The following headlights appear — energy begins rising slowly
- Final stretch — single sustained note, building, no resolution until story ends

SFX_DENSITY: rich
SFX_ENVIRONMENTS:
- Semi cab interior (engine, gear shifts, CB radio static)
- Loading dock at night (distant forklifts, metal, echo)
- Roadside diner (kitchen sounds, bell on door, sparse conversation)
- Open highway (tire hum, wind, passing vehicles)

AUDIO_NOTES: The silence when the music cuts should feel sudden and 
physical — like something just changed. Use it deliberately, not randomly.

DESCRIPTION: A trucker's last run. A cargo he shouldn't know about. 
And someone who needs to make sure he doesn't arrive.
```

---

*STORY_BRIEF_TEMPLATE.md — Endless Tales · Version 1.0 · April 2026*  
*Changes require Marc's approval and version increment.*  
*Commit to GitHub at ~/Projects/ASC/ after any update.*
