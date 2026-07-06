# ET-COS Appendix D — Migration Map
**Version:** 1.0 · Founding Edition
**Status:** DRAFT — for Phase 3 execution (post-launch)

This map shows where every rule from the current Bible documents lives in ET-COS, and what the migration action is.

---

## Current Documents → ET-COS Destination

### ET_Story_Rules_v3_2_CANONICAL.md (Bible/)

| Section | ET-COS Destination | Migration Action |
|---------|-------------------|-----------------|
| Primary Mission | Book I, Ch 1–2 | Rules moved and expanded |
| Entertainment First Rule | Book I, Ch 5 | Moved verbatim |
| The Listener Promise | Book I, Ch 4 | Moved and expanded |
| The Audience | Book I, Ch 6 | NEW — added in ET-COS |
| NEDS Scoring | Book VI, Ch 2 | Moved and restructured |
| Series rules | Book V | Moved and expanded |
| Cliffhanger standards | Book V, Ch 3 | Moved and enhanced |
| Script format | Book III, Ch 2 | Moved verbatim |
| Franchise Criteria | Book II, Ch 5 + Book V | Split across Books |
| Belle B rules | Book III, Ch 2 | Moved + cross-ref to PUBLISHED_STORY_SPEC |

**Archive action:** After migration, this file moves to `docs/archive/ET_Story_Rules_v3_2-archived-[date].md`

---

### ENDLESS_TALES_STORY_BIBLE.md (docs/)

| Section | ET-COS Destination | Migration Action |
|---------|-------------------|-----------------|
| Primary Mission | Book I, Ch 1–2 | Merged with v3.2 content |
| Entertainment First | Book I, Ch 5 | Merged |
| Listener Promise | Book I, Ch 4 | Merged |
| Story Health / Rubric | Book VI | Moved |
| Author profiles | Book IV | Moved to DB + Appendix C |

**Archive action:** After migration, this file moves to `docs/archive/ENDLESS_TALES_STORY_BIBLE-v4-archived-[date].md`

---

### STAGE2_SCRIPT_PROMPT.md (docs/)

This document is the ASC generation prompt — it is **not** a rules document. It is a production artifact.

| Section | ET-COS Destination | Migration Action |
|---------|-------------------|-----------------|
| Script format rules | Book III, Ch 2 | Extract rules; keep prompt as prompt |
| Voice rules | Book III, Ch 3 | Extract and move |
| Belle B writing rules | Book III, Ch 2 | Extract and move |

**This file is NOT archived.** It remains as the active production prompt. ET-COS rules inform its content; they do not replace it.

---

### SCRIPT_VALIDATOR.md (docs/)

| Section | ET-COS Destination | Migration Action |
|---------|-------------------|-----------------|
| Preflight check list | Book VI, Ch 3 | Moved (canonical list now in ET-COS) |
| Known failure patterns | Book VI + ASC code | Stay in code; reference in ET-COS |
| Validation rubric | Book VI, Ch 2 | Moved |

**This file is NOT archived.** It is a production validator spec. ET-COS owns the rules; SCRIPT_VALIDATOR.md remains as the technical implementation spec.

---

### PUBLISHED_STORY_SPEC.md (docs/)

This document owns the **finished listening experience** — it defines what a complete published story looks like from the subscriber's perspective.

| Section | ET-COS Destination | Migration Action |
|---------|-------------------|-----------------|
| Audio spec | Book III, Ch 4–6 | Merge and cross-reference |
| Mix standards | Book III, Ch 4 | Moved verbatim |
| Belle B canonical voice | Book III, Ch 2 | Moved |
| Approval Console spec | Book VI | Reference |
| Release rules | Book III, Ch 1 | Reference |

**Relationship:** Until full migration, PUBLISHED_STORY_SPEC wins all conflicts about the finished product (this is its current charter). After migration, Book III owns those rules.

---

### MASTER-BIBLE.md + MASTER_RULES.md (Bible/)

These are the original foundational documents from early in the platform's development (Feb 2026). Much of their content has been superseded by later documents.

| Section | ET-COS Destination | Migration Action |
|---------|-------------------|-----------------|
| Platform overview | Not migrated — historical | Archive |
| ADM workflow | Not migrated — ADM is retired | Archive |
| DB schema | Not migrated — lives in Supabase | Archive with note |
| Operational rules | Book VII where relevant | Review and select |

**Archive action:** Both files move to `Bible/archive/` after Phase 3.

---

## Database Columns ↔ Genome Dimensions

| Genome Dim | DB Column | Table | Notes |
|-----------|-----------|-------|-------|
| 1 – Story Type | (derived from series_id presence) | stories | |
| 2 – Primary Genre | genre | stories | |
| 5 – Tone | (not yet in DB) | stories | Add in Phase 3 |
| 8 – Hook Speed | (not yet in DB) | stories | Add in Phase 3 |
| 13 – Cliffhanger Strength | (not yet in DB) | stories | Add in Phase 3 |
| 22 – Franchise Potential | (not yet in DB) | stories | Add in Phase 3 |
| 34 – Narrator | narrator_voice_id | stories | |
| 39 – Author | author_id | stories | |
| 42 – NEDS Score | (not yet in DB) | stories | Add in Phase 3 |
| 45 – Workflow State | workflow_state + status | stories | Two columns; reconcile in Phase 3 |
| 46 – Published On | published_on | stories | |
| 47 – Listen Count | (analytics_events) | analytics | |
| 50 – Review Score | (avg_rating — column TBD) | stories | Column not yet created |
| 52 – Catalog Tier | (not yet in DB) | stories | Add in Phase 3 |

**Phase 3 DB work:** Add Genome columns that don't yet exist (`tone`, `hook_speed`, `cliffhanger_strength`, `franchise_potential`, `neds_score`, `catalog_tier`, `avg_rating`, and narrative genome fields). This is a migration file.
