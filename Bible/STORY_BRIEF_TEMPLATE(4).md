# STORY BRIEF — Endless Tales
**Version:** 2.0
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
*(Choose from ET roster: Sara Keene, Elias Thorn, Dale Harmon, Julian Mercer, Daniel Wren, Mark Holbrook, Silas Cutter, Nina Vasquez, Caroline Voss, Marc Hobelman)*

*(Each author is already paired with their narrator in Supabase. Claude will assign the correct narrator automatically from the author selection.)*

*(If unsure, describe the tone you want and Claude will recommend the right author.)*

*(To write in the style of a classic author — Raymond Chandler, Shirley Jackson, etc. — note that in REQUIREMENTS below. Claude will model the new ET author's voice on that reference.)*

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
Anything else Claude must include, avoid, or handle carefully. Plot points you want hit. Themes you want explored. Content you want excluded. Style references from the `style_references` table (e.g. "write in the style of Raymond Chandler").
```
REQUIREMENTS:

```

**If Series — Previous Episode Summary:** [REQUIRED for Episode 2+]
Brief summary of what happened in the previous episode. What was the cliffhanger? What emotional state is the listener in? Claude uses this to write the series intro and carry consequence forward.
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

**Overall Music Energy:** [REQUIRED]
Describe the dominant emotional tone of the music for this story.
```
MUSIC_ENERGY:
```
*Examples:*
- `Slow-burn dread — sparse, minimal, tension underneath everything`
- `Driving and kinetic — pulse-based, forward momentum, no vocals`
- `Warm and melancholic — acoustic, unhurried, bittersweet`
- `Atmospheric and expansive — cinematic, wide, documentary feel`
- `Tense procedural — low strings, clock-like rhythm, urban cold`
- `Mournful and atmospheric — church organ undertones, something sacred gone wrong`

**Music Reference:** [OPTIONAL but powerful]
Name a film, TV show, or composer whose score captures the sound you want.
```
MUSIC_REFERENCE:
```
*Examples: `No Country for Old Men`, `True Detective Season 1`, `Arrival`, `Sicario`, `Ozark`, `Hans Zimmer — Interstellar`*

**Key Dramatic Moments Needing Music Shifts:** [OPTIONAL but strongly recommended]
List 2–4 moments where the music energy needs to change significantly.
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

**SFX Density:** [OPTIONAL — defaults to standard]
```
SFX_DENSITY: standard
```
*(Options: `minimal` | `standard` | `rich`)*

**SFX Priority Environments:** [OPTIONAL]
List the key locations in the story. Claude will ensure these get specific, grounded SFX.
```
SFX_ENVIRONMENTS:
-
-
```

**Audio Tone Notes:** [OPTIONAL]
```
AUDIO_NOTES:

```

---

## PART 5 — BELLE B & PUBLISHING

### Belle B Intro Line [OPTIONAL — Claude writes one if blank]

Belle B is the Endless Tales announcer and the listener's permanent companion. She is the same voice every subscriber hears before every story, forever. Over time she becomes a trusted friend.

Her job is to recommend this story the way a trusted friend would: with warmth, specificity, and no wasted words. She makes listeners feel good about themselves not by complimenting them directly, but by treating them as intelligent adults whose time matters and whose taste she respects.

The listener's first name (`[LISTENER_NAME]`) is pre-recorded in Belle B's voice and stitched in dynamically at playback. **One line is written. One audio file is generated. The name stitch handles personalization automatically.**

If you have a specific angle for Belle B to take on this story, write it here. Otherwise Claude writes it from the premise and genre.

```
BELLE_B_INTRO:

```

**If blank, Claude will write the intro line matching the genre tone:**
- Mystery/Crime: intrigued, slightly teasing
- Horror/Supernatural: quietly conspiratorial, a hint of relish
- Thriller: urgent, leaning forward
- Adventure/Action: energized, forward-moving
- Drama/Family: warm, a little careful
- Western: understated, spare
- Sci-Fi/Speculative: curious, slightly awed
- Dark Mystery: low and deliberate

**Belle B never:**
- Uses time-of-day references ("tonight," "this morning")
- Uses generic language ("great story," "exciting adventure")
- Directly compliments the listener
- Sounds like a promo or host announcement
- Writes more than two short sentences

---

### Listener Gender Skew [OPTIONAL]

The platform infers gender from the subscriber's first name to calibrate Belle B's register — not her voice, just her word choice. This affects the writing only. One line is still written. One audio file is still generated.

If you know the target audience skews a particular direction for this story, note it here. Otherwise Claude defaults to neutral.

```
LISTENER_GENDER_SKEW: neutral
```
*(Options: `male` | `female` | `neutral`)*

---

### Story Description [OPTIONAL — Claude writes one if blank]

The punchy present-tense hook that appears on the story card in the app. 24 words maximum.

```
DESCRIPTION:

```

---

## COMPLETED BRIEF EXAMPLE

```
TITLE: The Confession Booth
TYPE: standalone
AUTHOR: Declan Marsh
GENRE: Mystery/Crime
NARRATIVE_VOICE: (blank — use author default)
RUNTIME: 25 min

PREMISE: A parish priest is found strangled in the confessional of an old
South Boston church. Detective Declan Marsh assumes robbery until he learns
the dead priest heard a confession minutes before he died — and the penitent
left behind a detail about an unsolved murder only the killer could know.
Marsh has to find the killer before they realize what they left behind.

SETTING: South Boston, present day. An old Catholic parish church, a
detective bureau, a triple-decker neighborhood street, a waterfront bar.
Winter. Cold that gets into the bones.

CHARACTERS: (blank — Claude creates from premise)

REQUIREMENTS: Resolved ending — Marsh identifies and confronts the killer.
No supernatural elements. Keep it grounded and procedural.

MUSIC_ENERGY: Mournful and atmospheric — church organ undertones, something
sacred gone wrong.

MUSIC_REFERENCE: True Detective Season 1 / Prisoners

MUSIC_MOMENTS:
- Opening — low organ drone, almost subsonic, just texture and cold air
- When Marsh enters the confessional — music drops to near silence, one
  sustained note
- The revelation of the unsolved murder detail — music shifts darker,
  the weight of what this means settling in
- Final confrontation — sparse, tense, no resolution until it's over
- Closing — single mournful note, fading slowly

SFX_DENSITY: rich
SFX_ENVIRONMENTS:
- Old Catholic church interior (echo, candles, wooden pew creak, weighted
  silence)
- Confessional booth (close, airless, whispered acoustics)
- South Boston winter street (wind, distant traffic, footsteps on salted
  sidewalk)
- Waterfront bar (low murmur, glass on wood, TV in background)
- Detective bureau (phones, fluorescent hum, coffee maker)

AUDIO_NOTES: The confessional scenes should feel acoustically tight and
close — like the listener is inside the booth. The church should feel vast
by contrast. Silence is a tool in this story — use it deliberately at the
moments of revelation.

BELLE_B_INTRO: (blank — Claude writes from premise and genre)

LISTENER_GENDER_SKEW: neutral

DESCRIPTION: A priest dead in his own confessional. A killer who came to
confess. And the one detail Marsh can't unhear.
```

---

**What Claude produces from this brief:**

At the top of the script, before the header block:

```
BELLE B INTRO
---
BELLE B: [LISTENER_NAME], I've been holding this one — "The Confession
Booth." A killer walked into a South Boston church to unburden themselves.
They left something behind they shouldn't have.
---
```

Header opens with:

```
AUTHOR: Declan Marsh
GENRE: Mystery/Crime
DESCRIPTION: A priest dead in his own confessional. A killer who came to
confess. And the one detail Marsh can't unknow.
NARRATOR: Iris Calloway
ANNOUNCER: Belle B
NARRATIVE_VOICE: third_limited
NARRATOR_IS_CHARACTER: false
SUNO PROMPT: Mournful atmospheric mystery score with low church organ
undertones and sparse orchestration. Cold, reverent, deeply unsettled —
like something sacred has been violated. No vocals. Slow tempo, long
sustained notes, minimal percussion.
```

**Key rules this example demonstrates:**
- `BELLE_B_INTRO` left blank — Claude writes the single intro line from the premise
- `LISTENER_GENDER_SKEW: neutral` — Belle B uses universal register
- No Sandy. No multiple variations. No time-of-day references.
- `ANNOUNCER: Belle B` in the header — always, every script
- One `BELLE B INTRO` block at the top — one line, one ElevenLabs audio file
- `[LISTENER_NAME]` placed mid-sentence, not forced to the front
- The intro references something specific and sensory — not a genre label
- Narrator (Iris Calloway) is assigned automatically from Declan Marsh's author profile in Supabase

---

*STORY_BRIEF_TEMPLATE.md — Endless Tales · Version 2.0 · April 2026*
*Changes require Marc's approval and version increment.*
*Commit to GitHub at ~/Projects/ASC/ after any update.*
