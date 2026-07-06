# ET-COS Book IV — The Author Registry
**Version:** 1.0 · Founding Edition
**Status:** DRAFT for Marc review
**Authority:** This Book owns author personas, narrator assignments, and voice architecture. The canonical source of record for all 45 active authors and 26 narrators.

---

## Chapter 1 — What an Author Is

An Endless Tales author is a **creative persona** — not a legal identity and not a real person (with the exception of Origin 2.0, where Marc Postlewaite is the credited author by his name).

An author persona has:
- A name and style identity (genre sensibility, prose texture, thematic territory)
- A narrator assignment (one narrator per author, resolved before any production begins)
- A voice code prefix (reserved character voice codes for recurring characters)
- A franchise ownership list (if applicable)

The author system exists because listeners should feel they are returning to a known creative voice — even across stories that are produced by different pipeline versions at different times.

---

## Chapter 2 — Author Architecture

### Author-to-Narrator Assignment

Every author has exactly one narrator. The narrator is assigned to the author, not to individual stories.

**Assignment rules:**
- Confidence threshold: ≥ 8/10 for autonomous assignment (Hal may assign without Marc approval)
- Below 8/10: escalate to Marc — no silent low-confidence assignments
- No random assignments: every assignment requires documented rationale
- No fallback narrators: if the chain is broken, production stops

**Current state (June 26, 2026):** 45/45 active authors assigned, all confidence ≥ 8/10.

### Narrator Roster (26 narrators, as of June 26, 2026)

| Narrator | DB ID | EL Voice ID | Voice Profile |
|----------|-------|-------------|---------------|
| Beckett Lowe | 2482f5a9 | lWDDHwXsJXJM7nv2YgHY | Dark, gravelly male |
| Bill Brody | c1de85b2 | TbEd6wZh117FdOyTGS3q | Authoritative British male |
| Blair Rose | 008c0c77 | E819nNJEjUWvUHA3lfDl | Warm intimate female |
| Charles Moore | 9f5b0423 | (see DB) | Classic American male |
| Desmond Vale | 1ecb227c | (see DB) | Calm measured male |
| Elliott Crane | 2096fea1 | (see DB) | Tense crisp male |
| Eve | 8a9c772f | (see DB) | Warm expressive female |
| Evelyn Bales | 3b8e2563 | (see DB) | Elegant composed female |
| Finn Calloway | c748a022 | (see DB) | Young energetic male |
| Iris Calloway | 792581c9 | (see DB) | Measured authoritative female |
| Isla Sterling | a0c15e7e | (see DB) | Warm Southern female |
| James Alcott | e9d71d58 | (see DB) | Dry literary male |
| June Harlow | a299850d | (see DB) | Crisp precise female |
| Katherine Bell | 38392bef | (see DB) | Warm narrative female |
| Marcus Hale | cd68fc3d | (see DB) | Cinematic baritone male |
| Morgan Veil | 6cae680e | (see DB) | Atmospheric mysterious |
| Nora Ashby | 69bba740 | (see DB) | Warm investigative female |
| Quinn Merritt | e8d68497 | (see DB) | Engaging versatile female |
| Ray Dolan | f957e0db | (see DB) | Dark intense male |
| Riley Quinn | 66acfb83 | (see DB) | Sharp intelligent female |
| Sage Wilder | 76f37ec7 | (see DB) | Lyrical contemplative |
| Walter Hayes | 4490f819 | v9LgF91V36LGgbLX3iHW | Cinematic warm male |
| **Holt Rannick** ✨ | 3b06368f | 64ZIZpnfEIjUuIyw3uKc | Weathered Texas male, late 50s |
| **Beau Slade** ✨ | daa199dd | 9hGxRHDrJPVBk2ipyuuk | Sardonic Florida male, mid-40s |
| Cole Hargrove | 895722b2 | IRHApOXLvnW57QJPQH2P | ⚠️ NON-PLATFORM — removed from active rotation |
| Samuel Cord | c3e866e8 | (see DB) | ⚠️ NON-PLATFORM — removed from active rotation |

✨ = Created via ET-COS Voice Design API (June 26, 2026)

---

## Chapter 3 — Active Author Assignments (All 45)

Full assignment details are in Appendix C (Author Profiles). Summary by narrator utilization:

| Narrator | Authors (Count) |
|----------|----------------|
| Ray Dolan | Declan Marsh, Dex Carver, J. Calloway Reid, Jack Malone, Roman Steele, Wade Tolliver (×6) |
| Walter Hayes | Dale Harmon, Linus Vane, Zara Osei, Zara Storm (×4) |
| Eve | Ada Rourke, Holland Reese, Iris Fontaine (×3) |
| Iris Calloway | Caroline Drake, Diana Reeve, Sloane Prescott (×3) |
| Riley Quinn | Claire Ashford, Dr. Halvard Reese, Maeve Kelly (×3) |
| James Alcott | Daniel Wren, Gus Pendry, Theo Wicks (×3) |
| Isla Sterling | Edith Vance, Frances Adler, Rita Salazar (×3) |
| Others | 1–2 authors each |

---

## Chapter 4 — The Franchise Registry

A franchise is a recurring character (or world) with confirmed listener loyalty that spans multiple series.

**Franchise Candidate criteria:**
- Franchise Potential score ≥ 8 (Genome dim. 22)
- Series Continuation Rate ≥ 70% (Genome dim. 49) — once data is available
- At least 2 completed series with this character

**Active Franchises:** None yet (catalog pre-launch state as of June 26, 2026)

**Franchise Candidate watch list:** To be populated as listener data accumulates post-launch.

A franchise character has:
- A permanent entry in this Book
- A reserved name: the character's name is never reassigned to a different author persona
- A voice code reservation: the character's voice codes are protected from reuse
- Continuity protection: stories featuring this character are held to higher continuity standards

---

## Chapter 5 — Voice Code Architecture

### Prefix System

| Prefix | Meaning |
|--------|---------|
| `NR-` | Narrator voice (pre-seeded in registry) |
| `CH-` | Character voice (created on first use) |
| `FC-` | Franchise character (reserved, protected) |
| `BL-` | Belle B related (reserved — do not create) |

### Reserved Codes

`GMhgX8fCR9GUtd3kmlKC` (Belle B canonical voice ID) — **never assigned as a character or narrator voice. Ever.**

---

## Chapter 6 — Author Persona Integrity Rules

1. An author's prose voice must be consistent across all stories credited to that author
2. An author's narrator never changes mid-series without Marc's explicit approval
3. An author's name may only appear on a story that matches their established genre territory — a Horror specialist author should not be credited on a Comedy unless Marc has explicitly expanded their range
4. Authors are not real people — do not use real names without Marc's explicit authorization
5. The exception: **Marc Postlewaite** is credited by name on Origin 2.0 only

---

## Appendix IV-A — Non-Platform Narrators

The following narrator IDs exist in the database but are **non-platform** (outside ET's contracted voice set). Do not assign new stories to these narrators. Do not use as fallbacks.

- Cole Hargrove (895722b2) — removed from 3 authors (Archie Bloom, Declan Marsh, Silas Cutter)
- Samuel Cord (c3e866e8) — removed from 2 authors (Dr. Kai Osei, Linus Vane)

These rows are preserved for historical integrity but are inactive.
