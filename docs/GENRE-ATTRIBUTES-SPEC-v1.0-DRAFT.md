# GENRE ATTRIBUTES SPEC v1.0 — DRAFT FOR MARC'S REVIEW
**Status:** DRAFT — not canon until Marc locks it per Standing Canon Rule §6
**Date:** July 7, 2026
**Author:** Drafted for Marc's review and declaration

---

## 1. Purpose and Design Principle

Every genre is a contract with the listener. A story fails not by being universally
"bad" but by breaking its own genre's terms. This spec makes those terms explicit
so that three systems can enforce them consistently:

1. **Hal (brief generation)** — briefs inherit the genre's contract before scripting begins
2. **BLP (Bored Listener Pass)** — the ending criterion is judged against the genre's
   ending contract, not a single universal standard
3. **Cover generation and audio mix** — art and sound follow the genre's profile

**Source-of-truth rule:** The Genre Manager admin page owns the LIST of genres.
This document owns the SCHEMA — the set of attributes every genre record must carry.
Attribute VALUES live with the genre records in the database, editable in the Genre
Manager. This document seeds the initial values; after lock, the database is
authoritative and this document is not updated per-genre.

**New genre rule:** No genre may be used for brief generation, production, or
publishing until all schema attributes are completed in the Genre Manager and
Marc has approved the genre. A genre record missing attributes is treated as
inactive by every pipeline system.

---

## 2. The Schema — Required Attributes Per Genre

Every genre record must carry the following fields:

| Field | Type | Purpose |
|---|---|---|
| `listener_contract` | 1 sentence | The promise the genre makes; the test every story must pass |
| `pacing_profile` | short text | Tempo, chapter-end behavior, where tension sits |
| `ending_contract` | short text | What a satisfying ending IS for this genre — the BLP pass criterion |
| `ending_failure_modes` | 2–3 bullets | The specific ways endings break this genre's contract |
| `sound_profile` | short text | Music ducking, stings, silence use, ambient bed guidance |
| `narrator_register` | short text | Voice quality/delivery suited to the genre |
| `cover_art_guidance` | short text | Palette and mood; states whether the dark-background exception applies |
| `adjacency_group` | enum | Dramatic-mode grouping used by the quota system (see §4) |
| `hard_rules` | 2–3 bullets | Non-negotiables; BLP auto-fail if violated |

---

## 3. Seed Values — Current Genres

### MYSTERY
- **Listener contract:** A fair puzzle the listener could have solved.
- **Pacing:** Methodical; information revealed in layers; tension is intellectual.
- **Ending contract:** The CLICK — a reveal that logically re-orders everything the
  listener heard. All clues planted before the reveal. Payoff is retrospective.
- **Ending failure modes:** Emotional resolution without logical solution; reveal
  depending on information never given; culprit/answer introduced late.
- **Sound profile:** Restrained music; stings on reveals only; silence as a clue-beat.
- **Narrator register:** Measured, precise, withholding.
- **Cover art:** Standard bright rule applies; intrigue via composition, not darkness.
- **Adjacency group:** INVESTIGATIVE
- **Hard rules:** (1) Solution derivable from planted clues. (2) No reveal without
  prior setup. (3) The central question posed in the opening is answered.

### THRILLER
- **Listener contract:** Escalating pressure with everything at stake.
- **Pacing:** A ticking clock; shrinking options; chapters end mid-danger, never at rest.
- **Ending contract:** RELEASE — the accumulated pressure breaks decisively. Dark
  endings satisfy; quiet endings do not.
- **Ending failure modes:** Tension deflating before the climax; threat resolved
  off-screen; stakes shrinking at the end instead of paying off.
- **Sound profile:** Tighter music ducking; harder stings; percussive beds under chase
  or pursuit sequences.
- **Narrator register:** Urgent, driving, close.
- **Cover art:** Standard bright rule applies; energy via subject and angle.
- **Adjacency group:** SUSPENSE
- **Hard rules:** (1) A clock or closing window exists and is felt. (2) The climax
  happens on-page. (3) The ending releases the pressure — through triumph or catastrophe.

### HORROR
- **Listener contract:** Dread that gets under the skin and lingers.
- **Pacing:** Slow accumulation punctuated by spikes; restraint before revelation.
- **Ending contract:** The LINGER — the immediate ordeal resolves, but one door stays
  open. Full tidy resolution is a breach in this genre alone.
- **Ending failure modes:** Over-explaining the horror; a fully safe "everything is
  fine" close; the threat neutralized so completely nothing lingers.
- **Sound profile:** Low end and silence carry the genre; what is NOT heard matters;
  sparse stings, maximum contrast.
- **Narrator register:** Controlled, intimate, unhurried.
- **Cover art:** DARK EXCEPTION APPLIES — subject matter legitimately dictates darker
  palettes. Legibility at thumbnail size still required.
- **Adjacency group:** SUSPENSE
- **Hard rules:** (1) Dread is earned by restraint, not gore. (2) The immediate story
  question resolves even when the larger dread remains. (3) One deliberate open door.

### COMEDY
- **Listener contract:** Rhythm, laughter, and order restored.
- **Pacing:** Timing is the core attribute; setups pay off on a beat; pauses before
  punchlines are a production requirement, not a script suggestion.
- **Ending contract:** The LIFT — endings land up: reconciliation, absurdity resolved,
  the world set right. Warmth is part of the payoff.
- **Ending failure modes:** Ending on a down or neutral beat; final punchline unearned;
  resolution that abandons the comic premise for sudden seriousness.
- **Sound profile:** Silence around punchlines; buoyant beds; stings only as comic
  punctuation.
- **Narrator register:** Warm, dry, impeccable timing.
- **Cover art:** Bright rule applies emphatically — light palettes are part of the promise.
- **Adjacency group:** LIGHT
- **Hard rules:** (1) The ending lands up. (2) Punchline beats get breathing room in
  the mix. (3) The comic premise is honored to the last line.

### WESTERN
- **Listener contract:** A moral code tested in a lawless space; a reckoning delivered.
- **Pacing:** Deliberate; the genre breathes; violence brief and consequential.
- **Ending contract:** The RECKONING — justice-shaped even when bittersweet. The code
  is vindicated, the cost acknowledged.
- **Ending failure modes:** Reckoning evaded; moral stakes dissolving into ambiguity
  with no verdict; the code never actually tested.
- **Sound profile:** Longer ambient beds (wind, distance, hooves); sparse music; space
  in the mix mirrors space in the setting.
- **Narrator register:** Grounded, weathered, unhurried.
- **Cover art:** Bright rule applies naturally — daylight, open country, big sky.
- **Adjacency group:** FRONTIER
- **Hard rules:** (1) The protagonist's code is stated or shown early and tested.
  (2) A reckoning occurs. (3) Consequences are paid on-page.

### SCIENCE FICTION
- **Listener contract:** An idea taken seriously to its human conclusion.
- **Pacing:** Idea-forward; wonder and unease alternate; exposition earns its place.
- **Ending contract:** The IMPLICATION LANDS — the ending resolves what the idea MEANS
  for the people in the story, not merely the plot mechanics.
- **Ending failure modes:** Plot resolved but the idea abandoned; technology as an
  unexamined magic fix; human cost raised then dropped.
- **Sound profile:** Textural beds; clean design for tech elements; room for quiet
  wonder beats.
- **Narrator register:** Thoughtful, clear, capable of scale.
- **Cover art:** Bright rule applies; wonder reads better in light than in murk.
- **Adjacency group:** SPECULATIVE
- **Hard rules:** (1) One central idea, taken seriously. (2) The ending answers the
  idea's human implication. (3) Internal rules of the world stay consistent.

### CRIME DRAMA
- **Listener contract:** The human cost of crime, on both sides of the line.
- **Pacing:** Character-forward; procedural beats serve emotional stakes.
- **Ending contract:** The VERDICT — legal or moral, delivered with its cost visible.
  Resolution can be unjust, but it must be conclusive.
- **Ending failure modes:** Case resolved with no human consequence shown; verdict
  ambiguous AND cost ambiguous (one may be open, not both); the crime forgotten.
- **Sound profile:** Urban ambient beds; restrained music; stings on turns of the case.
- **Narrator register:** Sober, streetwise, humane.
- **Cover art:** Standard bright rule applies; grit via subject, not underexposure.
- **Adjacency group:** INVESTIGATIVE
- **Hard rules:** (1) The crime's human cost is shown. (2) A verdict lands. (3) The
  opening case is the closing case.

### ADVENTURE
- **Listener contract:** A journey with real obstacles and an earned arrival.
- **Pacing:** Forward motion; set-piece obstacles; rest beats between dangers.
- **Ending contract:** The ARRIVAL — the destination (literal or personal) is reached
  or decisively transformed; the journey's cost and reward are both tallied.
- **Ending failure modes:** Journey abandoned rather than concluded; obstacles that
  never mattered; arrival with no sense of earning.
- **Sound profile:** Dynamic beds tracking terrain; movement in the mix; brighter
  palette than suspense genres.
- **Narrator register:** Energetic, vivid, companionable.
- **Cover art:** Bright rule applies — daylight, horizon, motion.
- **Adjacency group:** FRONTIER
- **Hard rules:** (1) The goal is stated early. (2) Obstacles cost something. (3) The
  ending arrives somewhere.

### HEARTWARMING
- **Listener contract:** An earned emotional payoff; the ending IS the product.
- **Pacing:** Gentle build; small moments accumulate; no manufactured jeopardy.
- **Ending contract:** The GLOW — an emotional payoff earned by everything before it.
  Sentiment must be built, never asserted.
- **Ending failure modes:** Unearned sentimentality; a twist that undercuts the warmth;
  payoff delivered by coincidence rather than character.
- **Sound profile:** Warm beds; generous space; music may swell at the payoff — the
  one genre where it should.
- **Narrator register:** Warm, sincere, unhurried.
- **Cover art:** Bright rule applies emphatically — warmth in palette is the promise.
- **Adjacency group:** LIGHT
- **Hard rules:** (1) The payoff is earned by prior scenes. (2) No cynical undercut.
  (3) A listener should finish feeling better than they started.

---

## 4. Adjacency Groups (for the Quota System)

Genre labels differ; dramatic modes overlap. Quotas constrain both (per QUAL-001:
single genre ≤30%, adjacent modes ≤45% combined).

| Group | Genres (current) |
|---|---|
| INVESTIGATIVE | Mystery, Crime Drama, Mystery/Crime, True Crime |
| SUSPENSE | Thriller, Horror |
| FRONTIER | Western, Adventure |
| LIGHT | Comedy, Heartwarming |
| SPECULATIVE | Science Fiction |

New genres must be assigned to a group (or a new group, with Marc's approval) at creation.

---

## 5. Integration Points

1. **BLP:** The ending criterion reads `ending_contract` + `ending_failure_modes` +
   `hard_rules` for the story's genre. A universal floor still applies (the opening
   problem must be addressed), but PASS/FAIL on the ending is genre-judged.
2. **Hal briefs:** CENTRAL_PROBLEM and RESOLUTION_SHAPE (required fields per QUAL-001)
   must conform to the genre's `ending_contract`.
3. **Cover generation:** Reads `cover_art_guidance`; the dark exception is a per-genre
   flag, not a per-story improvisation.
4. **Audio mix:** `sound_profile` informs music ducking, sting placement, and bed
   selection per the existing pipeline rules.
5. **Genre Manager:** Attribute fields added to the genre record schema; creating a
   genre without completed attributes leaves it inactive.

---

## 6. Resolved Questions (Marc's rulings, July 7, 2026)

1. **Mystery/Crime and True Crime are ALIASES**, not separate genre records.
   Mystery/Crime aliases to Mystery; True Crime aliases to Crime Drama. Alias labels
   may display in the catalog, but they inherit the parent genre's attributes in
   full — no separate attribute sets. The Genre Manager should support an
   `alias_of` field; a record with `alias_of` set carries no attributes of its own.
2. **`adjacency_group` is editable in the Genre Manager** — operational, not
   Marc-locked. Creating a NEW group (as opposed to assigning an existing one)
   still requires Marc's approval per §4.
3. **`hard_rules` violations are AUTO-FAIL in the BLP**, feeding the existing
   two-strike rewrite loop: the violated rule is passed to the rewrite as the
   specific instruction; two failed rewrites escalate to human review. The ending
   contract itself is judged holistically; hard rules are binary.

*Ruled by Marc July 7, 2026. Ready for canon lock and handoff to Orion.*

---

## 7. Ending Doctrine (LOCKED by Marc, July 8, 2026, 7:11 PM EDT)

### 7.1 Standalone Stories

**Opening:** every standalone must open with a REAL problem or a disturbing
question as the hook. The listener knows the stakes within the first two minutes.

**Ending:** must DRAMATICALLY RESOLVE the opening problem. Not restate it. Not
explain it. Not ignore it. The listener finishes with accomplishment,
fulfillment, completion.

**BLP hard rule (AUTO-FAIL):** an ending that does not resolve the opening
problem fails automatically and enters the two-strike rewrite loop, with the
unresolved problem named as the rewrite instruction.

**Required Hal brief fields:**
- `CENTRAL_PROBLEM` — the specific problem/question posed in the opening
- `RESOLUTION_SHAPE` — concretely how the ending resolves it (not "she finds
  peace" but "she discovers the letter was forged by her brother and confronts him")

### 7.2 Series

**Opening:** Episode 1 opens with a serious OVERARCHING problem spanning the
full arc. Stakes clear within two minutes of Ep1.

**Per episode:** each episode carries its own MINOR PROBLEM, distinct from the
overarching one, introduced and either resolved or made materially worse by
episode's end.

**Non-finale endings (Eps 1 through N-1):** must end on a strong cliffhanger
that either
(a) RESOLVES the episode's minor problem while making the overarching problem
    worse, or
(b) makes the minor problem significantly worse, raising stakes.
An episode that neither resolves nor worsens anything is a violation.

**Finale:** rewards the long listen. Every problem, question, and hanging
thread across the series is resolved. No open doors — except where Horror's
dark exception (§3) explicitly allows a lingering ambiguity. The finale is not
a cliffhanger. The finale is the payoff.

**BLP hard rules (AUTO-FAIL) for series:**
1. Non-finale ends with no resolution and no worsening
2. Finale leaves any named series problem unresolved
3. Finale ends on a cliffhanger (non-Horror)

**Required Hal brief fields (series):**
- `OVERARCHING_PROBLEM` (all episodes, carries forward)
- `EPISODE_MINOR_PROBLEM`
- `EPISODE_RESOLUTION_SHAPE` (resolve-or-worsen + cliffhanger form)
- `SERIES_THREADS_RESOLVED` (finale only — explicit list of every open thread resolved)

### 7.3 Enforcement

Implemented as BLP hard-rule checks per §5.b. Violations AUTO-FAIL into the
two-strike rewrite loop, with the violated rule and specific unresolved element
passed as the rewrite instruction. Genre ending contracts (§2) layer on top —
the doctrine is the floor, the genre contract is the ceiling.

*Locked by Marc July 8, 2026 (Telegram, 7:11 PM EDT: "locked").*
