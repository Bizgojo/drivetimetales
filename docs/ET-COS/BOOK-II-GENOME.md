# ET-COS Book II — The Story Genome
**Version:** 1.0 · Founding Edition
**Status:** DRAFT for Marc review
**Authority:** This Book owns story classification. Every story in the catalog has a Genome. The Genome is set before production and updated at each lifecycle stage.

---

## Chapter 1 — What the Genome Is

The Story Genome is a 52-dimension fingerprint for every Endless Tales story. It is not a rating system. It is a classification system.

**Why it exists:**
- To make story selection systematic, not intuitive
- To prevent catalog gaps (too many of one kind, none of another)
- To enable intelligent recommendation (listeners who liked X will like Y)
- To make quality problems diagnosable (a story that scored 4/10 on Hook Speed will always have a slow open)
- To build a database of creative intelligence that guides every future production decision

**The Genome is set three times:**
1. **Brief stage** — estimated from the story concept
2. **Script stage** — updated after the script is written
3. **Published stage** — final, confirmed from listener behavior where available

---

## Chapter 2 — The 52 Dimensions

### Dimension Group 1: Identity (6 dimensions)
These describe what the story is. They never change after the Published stage.

| # | Dimension | Values | Notes |
|---|-----------|--------|-------|
| 1 | Story Type | standalone, series, mini-series | |
| 2 | Primary Genre | Mystery, Thriller, Drama, Western, Sci-Fi, Horror, Comedy, Adventure, Historical, True-Crime-Style | |
| 3 | Sub-Genre 1 | (genre-specific — see Appendix II-A) | |
| 4 | Sub-Genre 2 | (genre-specific — see Appendix II-A) | |
| 5 | Tone | dark, gritty, warm, comic, elegiac, suspenseful, intimate, epic, tense, lyrical | |
| 6 | Setting Period | contemporary, historical, near-future, far-future, timeless | |

### Dimension Group 2: Structure (8 dimensions)
These describe how the story is built.

| # | Dimension | Values | Notes |
|---|-----------|--------|-------|
| 7 | Hook Type | inciting-incident, in-medias-res, atmosphere, mystery-open, character-open | |
| 8 | Hook Speed | 1–10 (10 = listener is hooked within 60 seconds) | |
| 9 | Narrative POV | first-person-close, third-person-close, third-person-omniscient, ensemble | |
| 10 | Episode Arc Shape | rising, flat-then-spike, slow-burn, twist-ending, converging | |
| 11 | Series Arc Shape | linear, modular, converging, anthology | |
| 12 | Cliffhanger Type | question, reversal, escalation, revelation, threat, none (standalone) | |
| 13 | Cliffhanger Strength | 1–10 | |
| 14 | Resolution Satisfaction | 1–10 (finale only) | |

### Dimension Group 3: Character (8 dimensions)
These describe who carries the story.

| # | Dimension | Values | Notes |
|---|-----------|--------|-------|
| 15 | Protagonist Archetype | reluctant-hero, investigator, survivor, outsider, guardian, flawed-authority, seeker | |
| 16 | Protagonist Wound | grief, guilt, shame, fear, exile, regret, ambition | The irreversible thing driving them |
| 17 | Protagonist Want | explicit statement of what they're trying to do this episode | |
| 18 | Protagonist Gap | 1–10 (gap between what they want and what they need) | |
| 19 | Antagonist Type | person, institution, nature, self, unknown, systemic | |
| 20 | Antagonist Presence | 1–10 (how actively the antagonist threatens each episode) | |
| 21 | Cast Size | solo, small (2-3), medium (4-6), ensemble (7+) | |
| 22 | Franchise Potential | 1–10 | Would listeners return for this character across multiple series? |

### Dimension Group 4: Emotional Contract (6 dimensions)
These describe what the listener feels.

| # | Dimension | Values | Notes |
|---|-----------|--------|-------|
| 23 | Primary Emotion | suspense, dread, warmth, grief, wonder, humor, anger, longing, awe | |
| 24 | Emotional Intensity | 1–10 | |
| 25 | Listener Investment Trigger | character-bond, mystery-pull, atmosphere-immersion, stakes-urgency | How the listener gets pulled in |
| 26 | Catharsis Type | relief, revelation, loss, triumph, ambiguity, earned-sadness | |
| 27 | Resonance Target | universal, niche-community, age-specific, region-specific | |
| 28 | Replayability | 1–10 (would a listener relisten with new knowledge?) | |

### Dimension Group 5: World (5 dimensions)
These describe where the story lives.

| # | Dimension | Values | Notes |
|---|-----------|--------|-------|
| 29 | World Scale | intimate (one location), local (one town), regional, national, global, cosmic | |
| 30 | World Texture | 1–10 (how vivid and specific is the setting?) | |
| 31 | Setting Anchors | key locations named in the story | |
| 32 | SFX Density | sparse, moderate, rich | |
| 33 | Music Mood | none, ambient, tense, warm, dramatic, comic | |

### Dimension Group 6: Audio Design (5 dimensions)
These describe how the story sounds.

| # | Dimension | Values | Notes |
|---|-----------|--------|-------|
| 34 | Narrator Voice Type | NR code (from Author Registry) | |
| 35 | Character Voice Count | integer | |
| 36 | Dialogue Density | mostly-narration, balanced, mostly-dialogue | |
| 37 | Pacing Tempo | slow, measured, fast, variable | |
| 38 | Audio Complexity | 1–10 (simple voice vs. full production) | |

### Dimension Group 7: Production (6 dimensions)
These describe how the story was made.

| # | Dimension | Values | Notes |
|---|-----------|--------|-------|
| 39 | Author | (from Author Registry) | |
| 40 | Script Version | 1, 2, 3... | How many drafts? |
| 41 | Production Method | ASC-auto, ASC-assisted, manual | |
| 42 | NEDS Score | 0–100 | (from Book VI) |
| 43 | Preflight Pass | true/false + date | |
| 44 | Voice Code Assigned | true/false | Were character voice_codes used? |

### Dimension Group 8: Lifecycle (8 dimensions)
These describe where the story is now.

| # | Dimension | Values | Notes |
|---|-----------|--------|-------|
| 45 | Workflow State | queue, in-production, repair, ready-for-review, ready-to-publish, published, cold-storage | |
| 46 | Published On | date or null | |
| 47 | Listen Count | integer | |
| 48 | Completion Rate | 0–100% | % of listeners who finish the episode |
| 49 | Series Continuation Rate | 0–100% | % who start episode N+1 within 24 hours |
| 50 | Review Score | 0–5 stars (average) | |
| 51 | Franchise Status | none, candidate, active, retired | |
| 52 | Catalog Tier | standard, featured, flagship | |

---

## Chapter 3 — How to Set the Genome

### At Brief Stage (required before production begins)
Set dimensions 1–18, 23–28, 29–33, 39.
Leave dimensions 19–22, 34–38, 40–52 blank or estimated.

### At Script Stage (required before voice generation)
Set dimensions 34–38, 40–43.
Update 7–14 if the script diverged from the brief.

### At Published Stage (set when story goes live)
Set dimensions 44–52 (except 47–51, which populate from analytics).

---

## Chapter 4 — Genome and Catalog Intelligence

The Genome is the foundation for three systems:

**1. Catalog Gap Analysis**
At any time, the catalog can be queried by genre, tone, setting period, and franchise potential. If a gap exists (e.g., no published Horror standalone in contemporary setting), it becomes a production priority.

**2. Recommendation Engine**
Listeners who engage deeply with stories sharing Genome profiles 23, 24, 15, and 2 are predictably good candidates for new stories with similar scores. Genome enables algorithmic recommendation without relying solely on listen history.

**3. Quality Diagnostics**
When a story underperforms, its Genome dimensions 7, 8, 13, 23, 24, 25 are the first things examined. Patterns across underperforming stories reveal systematic production weaknesses.

---

## Chapter 5 — The Franchise Threshold

A story with Franchise Potential ≥ 8 and Series Continuation Rate ≥ 70% is automatically flagged for Franchise Candidate review.

Franchise Candidates are reviewed quarterly by Marc.

A confirmed Franchise has:
- A named character who appears in multiple series
- A defined world that accumulates across stories
- Production priority for new installments
- A dedicated entry in Book IV (Author Registry) linking the character to all associated authors and narrators

---

## Appendix II-A — Sub-Genre Reference
*(To be populated in v1.1 after Marc review of primary genre taxonomy)*

---

## Appendix II-B — Genome Storage
The Genome maps to the `stories` table in Supabase. Dimensions 1–44 are production-set fields. Dimensions 45–52 are populated by the platform automatically.

Current DB columns for Genome dimensions are mapped in Appendix D (Migration Map).
