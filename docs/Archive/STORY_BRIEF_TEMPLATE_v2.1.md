# STORY BRIEF — Endless Tales
**Version:** 2.1
**Owner:** Marc Postlewaite / Endless Tales
**Last Updated:** June 10, 2026
**Changes from v2.0 (approved by Marc):** PIPELINE_MODE field added (transition vs full). SFX fields reframed as Anchor SFX candidates (3–6 per story). MUSIC_MOMENTS replaced by MUSIC_SILENCE_MOMENTS ([MUSIC:OUT]/[MUSIC:IN], max 2). NEXT_LISTEN field added for Belle bridge lines. Series runtime default 12–18 minutes. Optional SOLUTION_NOTES feeding the mandatory Story Resolution Map. Aligned with PUBLISHED_STORY_SPEC v1.4 and STAGE2_SCRIPT_PROMPT v2.2.

---

## HOW TO USE

Fill out every field below. Blank fields slow down production and result in Claude making assumptions that may not match your vision. The more specific you are, the better the script.

When complete, paste this brief into a new Claude chat along with the Stage 2 Master Prompt (`STAGE2_SCRIPT_PROMPT.md` v2.2) and say: **"Write the script."**

Fields marked **[REQUIRED]** must be filled. Fields marked **[OPTIONAL]** can be left blank — Claude will use defaults.

---

## PART 0 — PIPELINE MODE

**[REQUIRED]** Which pipeline is live for this story?
~~~
PIPELINE_MODE: transition
~~~
*(Options: `transition` | `full`)*

- **`transition`** — Builds 1+2 (name stitch, SFX/music-marker rendering) are NOT yet live. Claude follows ALL Stage 2 v2.2 writing rules (Resolution Map, Turn Rule, sensory anchors, opening clarity, one intro line, bridge lines) but the script must contain **NO `[SFX:]` markers, NO `[MUSIC:OUT]`/`[MUSIC:IN]` markers, and NO `[LISTENER_NAME]`** — the Belle intro is written as its no-name version. The current pipeline would read "[LISTENER_NAME]" aloud.
- **`full`** — Builds 1+2 are live and the two-story pilot has passed. Scripts include `[LISTENER_NAME]`, 3–6 anchor SFX, and optional music silence markers.

---

## PART 1 — STORY IDENTITY

**Title (working title or leave blank — Claude will suggest one):**
~~~
TITLE:
~~~

**Standalone or Series:** [REQUIRED]
~~~
TYPE: standalone
~~~
*(Options: `standalone` | `series`)*

**If Series — Series Name:** [REQUIRED for series]
~~~
SERIES_NAME:
~~~

**If Series — Episode Number:** [REQUIRED for series]
~~~
EPISODE_NUMBER:
~~~

**If Series — Total Episodes in Series:** [REQUIRED for series]
~~~
SERIES_TOTAL_EPISODES:
~~~

**If Series — Is This the Finale?:** [REQUIRED for series]
~~~
IS_FINALE: false
~~~
*(Options: `true` | `false`)*

> **Series Release Rule reminder:** Episode 1 never publishes unless Episode 2 is approved and live in the same release. Three-episode series publish complete. Plan the brief batch accordingly.

---

## PART 2 — AUTHOR & GENRE

**Author:** [REQUIRED]
~~~
AUTHOR:
~~~
*(Choose from the 31-author ET roster in STAGE2_SCRIPT_PROMPT v2.2. Each author is permanently paired with their narrator — Claude assigns the narrator automatically from the NARRATOR LOOKUP TABLE.)*

*(If unsure, describe the tone you want and Claude will recommend the right author.)*

*(To write in the style of a classic author — Raymond Chandler, Shirley Jackson, etc. — note that in REQUIREMENTS below.)*

**Primary Genre:** [REQUIRED]
~~~
GENRE:
~~~
*(Options: Thriller, Horror, Dark Mystery, Mystery/Crime, Adventure, Drama, Sci-Fi, Western, Historical Drama, Supernatural, Family/Heartwarming, Comedy)*

**Narrative Voice:** [OPTIONAL — Claude defaults to the author's standard voice]
~~~
NARRATIVE_VOICE:
~~~
*(Options: `first_person` | `third_limited` | `third_omniscient` — leave blank for author default)*

---

## PART 3 — STORY CONTENT

**The Core Premise:** [REQUIRED]
Describe the story in 2–5 sentences. Who is the protagonist? What do they want? What's standing in their way? What's at stake?
~~~
PREMISE:

~~~

**The Setting:** [REQUIRED]
Time period, location, and any specific environmental details that matter to the story.
~~~
SETTING:

~~~

**Target Runtime:** [REQUIRED]
~~~
RUNTIME:
~~~
*(Options: `10 min` | `12 min` | `15 min` | `18 min` | `20 min` | `25 min`)*
*(**Series episodes default to 12–18 minutes** — one commute-sized attention arc per episode, ending on a cliffhanger. 20–25 minutes is for standalones, finales, and episodes that earn it.)*

**Characters:** [OPTIONAL — Claude will create characters from the premise if blank]
Name, role, key traits.
~~~
CHARACTERS:

~~~

**Solution Notes:** [OPTIONAL — feeds the mandatory Story Resolution Map]
If you already know the ending, the twist, or the solution type you want (clever discovery, sacrifice, reversal, justice, bittersweet acceptance, etc.), note it here. Claude must build the full six-section Resolution Map before writing either way.
~~~
SOLUTION_NOTES:

~~~

**Specific Story Requirements:** [OPTIONAL]
Anything Claude must include, avoid, or handle carefully. Plot points, themes, exclusions, style references.
~~~
REQUIREMENTS:

~~~

**If Series — Previous Episode Summary:** [REQUIRED for Episode 2+]
What happened, the cliffhanger, and the emotional state the listener was left in. Claude uses this for the series re-entry intro and to carry consequence forward.
~~~
PREVIOUS_EPISODE:

~~~

**If Series — Next Episode Setup:** [OPTIONAL]
If you know what happens next, note it — Claude writes a specific, real outro tease instead of a generic one.
~~~
NEXT_EPISODE:

~~~

**Next Listen (bridge line):** [STANDALONES ONLY — OPTIONAL]
If this author has a series or recurring protagonist in the catalog, name it here. Claude writes Belle's one-sentence bridge after the formal outro ("Marsh has another case waiting whenever you are"). Leave blank = no bridge line.
~~~
NEXT_LISTEN:

~~~

---

## PART 4 — AUDIO & MUSIC DIRECTION

**Overall Music Energy:** [REQUIRED]
The dominant emotional tone of the background music.
~~~
MUSIC_ENERGY:
~~~
*Examples:*
- `Slow-burn dread — sparse, minimal, tension underneath everything`
- `Driving and kinetic — pulse-based, forward momentum, no vocals`
- `Warm and melancholic — acoustic, unhurried, bittersweet`
- `Tense procedural — low strings, clock-like rhythm, urban cold`
- `Mournful and atmospheric — church organ undertones, something sacred gone wrong`

**Music Reference:** [OPTIONAL but powerful]
A film, TV show, or composer whose score captures the sound.
~~~
MUSIC_REFERENCE:
~~~
*Examples: `No Country for Old Men`, `True Detective Season 1`, `Arrival`, `Sicario`, `Hans Zimmer — Interstellar`*

**Music Silence Moments:** [OPTIONAL — full pipeline mode only, max 2]
The story's single biggest moment(s) where the music should drop to COMPLETE silence and return after ([MUSIC:OUT]/[MUSIC:IN]). One looping track otherwise plays ducked at 15% throughout — silence is the only dynamic tool, so spend it on the moment that matters most.
~~~
MUSIC_SILENCE_MOMENTS:
- [moment]:
~~~
*Example: `When Marsh opens the confessional door — silence until he speaks`*

**Anchor SFX Candidates:** [OPTIONAL — full pipeline mode only]
The story gets exactly 3–6 anchor SFX: bold, discrete, story-critical sounds at scene transitions and pivotal moments, never under dialogue, no continuous ambience beds. List candidate moments/sounds; Claude selects and places the final 3–6.
~~~
ANCHOR_SFX_CANDIDATES:
-
-
~~~
*Examples: `the confessional door — heavy wood, slow creak` · `the single gunshot in the stairwell` · `the train arriving as she decides`*

**Audio Tone Notes:** [OPTIONAL]
~~~
AUDIO_NOTES:

~~~

---

## PART 5 — BELLE & PUBLISHING

### Belle Intro Line [OPTIONAL — Claude writes one if blank]

Belle is the Endless Tales announcer and the listener's permanent companion — the same warm voice before every story, forever. Her job: recommend this story the way a trusted friend would, with warmth, specificity, and no wasted words.

**One line is written. One set of audio is generated.** In `full` mode the line contains `[LISTENER_NAME]` once, at a natural pause, and the server-side name stitch personalizes it; the line must work gracefully without the name. In `transition` mode Claude writes the same line without the placeholder.

If you have a specific angle for Belle on this story, write it here. Otherwise Claude writes it from the premise and genre using the Genre Tone Guide in Stage 2 v2.2.

~~~
BELLE_INTRO:

~~~

**Belle never:** uses time-of-day references · uses generic language ("great story," "exciting adventure") · directly compliments the listener · sounds like a promo or host · mentions the author or narrator by name · exceeds two short sentences · asks rhetorical questions.

---

### Listener Gender Skew [OPTIONAL]

Calibrates Belle's word choice and register only — not her voice or warmth. One line is still written.
~~~
LISTENER_GENDER_SKEW: neutral
~~~
*(Options: `male` | `female` | `neutral`)*

---

### Story Description [OPTIONAL — Claude writes one if blank]

The punchy present-tense hook on the story card. 24 words maximum.
~~~
DESCRIPTION:

~~~

---

## COMPLETED BRIEF EXAMPLE (full pipeline mode)

~~~
PIPELINE_MODE: full
TITLE: The Confession Booth
TYPE: standalone
AUTHOR: Declan Marsh
GENRE: Mystery/Crime
NARRATIVE_VOICE: (blank — author default)
RUNTIME: 20 min

PREMISE: A parish priest is found strangled in the confessional of an old
South Boston church. Detective Declan Marsh assumes robbery until he learns
the dead priest heard a confession minutes before he died — and the penitent
left behind a detail about an unsolved murder only the killer could know.
Marsh has to find the killer before they realize what they left behind.

SETTING: South Boston, present day. An old Catholic parish church, a
detective bureau, a triple-decker street, a waterfront bar. Winter.

CHARACTERS: (blank — Claude creates from premise)

SOLUTION_NOTES: Solution type = clever discovery. Marsh catches the killer
through the one detail of the confession they don't know he knows.

REQUIREMENTS: Resolved ending — Marsh identifies and confronts the killer.
No supernatural elements. Grounded and procedural.

NEXT_LISTEN: Declan Marsh recurring cases ("The Quiet Floor" is in the
catalog)

MUSIC_ENERGY: Mournful and atmospheric — church organ undertones, something
sacred gone wrong.
MUSIC_REFERENCE: True Detective Season 1 / Prisoners
MUSIC_SILENCE_MOMENTS:
- When Marsh steps into the confessional and finds the carved words —
  silence until he reads them aloud

ANCHOR_SFX_CANDIDATES:
- Heavy confessional door, slow creak
- Marsh's footsteps stopping on the marble aisle
- The waterfront bar door as the killer walks in
- A single phone buzz that changes everything

AUDIO_NOTES: The confessional should feel airless and close; the church
vast by contrast. Silence is the tool — spend it on the revelation.

BELLE_INTRO: (blank — Claude writes from premise and genre)
LISTENER_GENDER_SKEW: neutral
DESCRIPTION: A priest dead in his own confessional. A killer who came to
confess. And the one detail Marsh can't unhear.
~~~

**What Claude produces from this brief:** the Story Resolution Map comment block, then the Belle intro block (one line, with `[LISTENER_NAME]` in full mode), the complete header, the Character Guide, the full script with 3–6 anchor SFX and the marked silence drop (full mode), the cliffhanger or resolution per type, the Belle outro with author credit — and, because NEXT_LISTEN is filled, the one-sentence bridge: *"Marsh has another case waiting whenever you are."*

---

*STORY_BRIEF_TEMPLATE.md — Endless Tales · Version 2.1 · June 2026*
*Changes require Marc's approval and version increment. Commit to GitHub after any update.*
