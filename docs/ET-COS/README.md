# ET-COS — Endless Tales Creative Operating System
## Founding Edition · v1.0 Draft

**Status:** DRAFT — Architecture Blueprint for Marc Review
**Issued:** 2026-06-26
**Owner:** Marc Postlewaite / Endless Tales
**Author:** Hal (Orion/Hal session, June 26, 2026)

---

## What This Is

ET-COS is the Creative Operating System for Endless Tales. It replaces the fragmented Story Bible system with a single, structured, versioned architecture that governs everything from story philosophy to production workflow to listener retention.

The current Bible (v3.2 / v4.0) is technically sound but scattered across multiple documents with no clear authority hierarchy, no systematic evaluation framework, and no living governance model. ET-COS fixes this by organizing everything into Seven Books with defined ownership, cross-references, and a versioning system built for a company that produces hundreds of stories per year.

**ET-COS is not just rules. It is the creative mind of the company made explicit.**

---

## The Seven Books

| Book | Name | What It Owns |
|------|------|--------------|
| I | The Mission | Why Endless Tales exists, the listener promise, primary tests |
| II | The Story Genome | The 52-dimension classification and evaluation system for all stories |
| III | The Production Law | Script format, voice rules, Belle B, audio spec, mix standards |
| IV | The Author Registry | Author profiles, narrator assignments, voice codes, persona integrity |
| V | The Series Doctrine | Series structure, franchise criteria, episode arcs, cliffhanger standards |
| VI | The Health System | NEDS scoring, quality gates, repair triggers, story lifecycle |
| VII | The Governance Charter | Version control, authority hierarchy, migration rules, amendment process |

---

## Repository Structure

```
docs/ET-COS/
├── README.md                          ← This file (master index)
├── BOOK-I-MISSION.md                  ← The Why
├── BOOK-II-GENOME.md                  ← Story classification system
├── BOOK-III-PRODUCTION-LAW.md         ← How stories are made
├── BOOK-IV-AUTHOR-REGISTRY.md         ← Who tells the stories
├── BOOK-V-SERIES-DOCTRINE.md          ← How series are built
├── BOOK-VI-HEALTH-SYSTEM.md           ← How quality is measured
├── BOOK-VII-GOVERNANCE.md             ← How ET-COS governs itself
├── appendices/
│   ├── A-GENOME-REFERENCE.md          ← All 52 genome dimensions
│   ├── B-NEDS-RUBRIC.md               ← Scoring rubric (30-point)
│   ├── C-AUTHOR-PROFILES.md           ← All 45 authors + narrators
│   ├── D-MIGRATION-MAP.md             ← Current Bible → ET-COS
│   └── E-CHANGELOG.md                 ← Version history
└── archive/
    └── (previous Bible versions, read-only)
```

---

## Authority Hierarchy

When two ET-COS books appear to conflict, the higher-numbered book wins **only for its domain**. Within-domain, the most specific rule wins.

```
Story must appear in one Book's domain. If it genuinely crosses, Book VII decides.

Book I   → Philosophy (overrides all on purpose/mission)
Book VI  → Health (overrides all on quality gates)
Book VII → Governance (overrides all on process)
Books II-V → Domain-specific (no cross-domain override)
```

---

## Version Policy

- **Major version (v2.0):** New Book, structural change, or Marc-approved paradigm shift
- **Minor version (v1.1):** New rule, rule change, or appendix addition — same-day archive of prior
- **Patch (v1.0.1):** Typo, clarification, no rule change

Every change: dated, signed, archived. Old versions are never deleted — moved to `archive/` with `.archived-YYYY-MM-DD` suffix.

**Current version:** v1.0 (Founding Edition)
**Next planned:** v1.1 (post-Marc review of this architecture)

---

## Migration Status

| Current Document | ET-COS Destination | Status |
|---|---|---|
| ET_Story_Rules_v3_2_CANONICAL.md | Books I, III, V, VI | Migration plan in Appendix D |
| ENDLESS_TALES_STORY_BIBLE.md (v4.0) | Books I, VI | Migration plan in Appendix D |
| STAGE2_SCRIPT_PROMPT.md (v2.3) | Book III | Migration plan in Appendix D |
| SCRIPT_VALIDATOR.md (v1.2) | Book VI | Migration plan in Appendix D |
| PUBLISHED_STORY_SPEC.md (v1.5) | Book III | Migration plan in Appendix D |
| Author/Narrator assignments (DB) | Book IV | Already current — sync on amendment |

**Migration target:** Post-launch (no production changes until launch is stable)

---

## Working Principles

1. **The Listener Comes First.** Every rule exists to serve the listener's experience.
2. **Story Before Technology.** The pipeline serves the story. The story does not serve the pipeline.
3. **One Rule, One Home.** No rule lives in two Books. Cross-references point, not copy.
4. **Explicit Over Assumed.** If it's not written, it doesn't exist as policy.
5. **Marc Is the Final Authority.** No amendment takes effect without Marc's approval.
6. **Archive, Never Delete.** All superseded rules are preserved, dated, and accessible.
7. **Built for Decades.** Every decision is made with the assumption that this system will outlast its current tooling.
