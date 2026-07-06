# ET-COS Book VII — The Governance Charter
**Version:** 1.0 · Founding Edition
**Status:** DRAFT for Marc review
**Authority:** This Book governs how ET-COS governs itself. It is the highest-authority document on process.

---

## Chapter 1 — Authority Model

### The Single Decision Authority

Marc Postlewaite is the sole final authority on all ET-COS decisions.

No rule amendment takes effect without Marc's explicit approval.
No Book addition takes effect without Marc's explicit approval.
No architectural change takes effect without Marc's explicit approval.

Hal (AI assistant) may:
- Draft amendments
- Propose new rules
- Flag conflicts and inconsistencies
- Implement approved changes
- Apply rules as written

Hal may not:
- Unilaterally add, change, or remove any rule
- Declare an existing rule superseded without Marc's approval
- Resolve genuine conflicts between Books by inventing new rules

### Atlas (Admin/Coordination Role)

Atlas is a virtual role within the same session/bot system. Atlas activates on "Atlas task" label.
Atlas may: coordinate admin/UI workflow, manage Codex work, triage workflow issues.
Atlas may NOT: write stories, generate audio, alter production jobs, publish, set is_hidden=false.

---

## Chapter 2 — The Amendment Process

### Standard Amendment

1. **Identify:** A gap, conflict, or needed update is identified (by Hal, Marc, or production experience)
2. **Draft:** Hal drafts the amendment with: old text (if replacing), new text, rationale, affected Book
3. **Review:** Marc reviews the draft
4. **Approve:** Marc says "approved" or equivalent
5. **Implement:** Hal updates the Book file, bumps the version, and archives the prior version
6. **Log:** Entry added to Appendix E (Changelog)

**Amendment turnaround target:** Same-day for minor amendments; within 48 hours for structural changes.

### Emergency Amendment

If a production failure reveals a missing or incorrect rule that is actively blocking work:
1. Hal identifies the failure and proposes an emergency fix
2. Marc may approve verbally (via message)
3. Hal implements immediately, logs the approval, and adds to changelog
4. Full documentation follows within 24 hours

---

## Chapter 3 — Version Control Policy

### File Naming

Every Book file is versioned by its content, not by the filename.

The version appears in the file header:
```
**Version:** 1.2 · Founding Edition
**Last amended:** 2026-06-30 by Marc Postlewaite
```

When a Book is amended:
1. The old version is copied to `archive/BOOK-[N]-[NAME]-v[X.X]-archived-YYYY-MM-DD.md`
2. The active file is updated with the new content and bumped version number
3. Changelog entry is added

### Version Numbering

| Change Type | Version Bump | Example |
|------------|-------------|---------|
| New Book or structural reorganization | Major | v1.0 → v2.0 |
| New rule, rule change, new appendix | Minor | v1.0 → v1.1 |
| Clarification, typo, formatting | Patch | v1.0 → v1.0.1 |

The entire ET-COS system has a master version that matches the highest Book version:
- ET-COS v1.0 → all Books are v1.0 at launch
- ET-COS v1.1 → at least one Book has been amended to v1.1

---

## Chapter 4 — The Authority Hierarchy

When two rules conflict, the following order resolves them:

1. **Book I** — on questions of story mission and purpose
2. **Book VI** — on questions of quality gates and publishing decisions
3. **Book VII** — on questions of process and amendment
4. **Most specific rule wins** — a rule about a specific scenario beats a general rule
5. **Most recent approved rule wins** — if two rules conflict and neither is more specific, the later one supersedes

If a conflict cannot be resolved by these rules, **Marc decides**.

---

## Chapter 5 — What Lives in ET-COS vs. What Lives Elsewhere

### Belongs in ET-COS

- Story philosophy and mission (Book I)
- Story classification system (Book II)
- Production format and audio standards (Book III)
- Author/narrator assignments (Book IV)
- Series structure standards (Book V)
- Quality gates and scoring (Book VI)
- Governance process (Book VII)

### Does NOT Belong in ET-COS

- Platform code (lives in the repo, not in docs)
- Database schema details (lives in Supabase migrations)
- Specific story briefs (lives in `docs/Briefs/`)
- Session-specific decisions (lives in Hal's memory files)
- External API credentials (lives in `.env.local`, NEVER in docs)

---

## Chapter 6 — The Migration Plan

ET-COS Founding Edition (v1.0) does **not** immediately replace the current production documents. Production stability takes priority over clean architecture.

### Phase 1 — Architecture (Complete with this draft)
- ET-COS v1.0 drafted and reviewed by Marc
- All Seven Books present as a complete blueprint
- No production changes made

### Phase 2 — Marc Review (Pending)
- Marc reviews and approves each Book
- Amendments incorporated
- ET-COS v1.1 issued (first approved version)

### Phase 3 — Reconciliation (Post-launch)
After the launch period is stable (minimum 4 weeks post-launch):
- Each current document is reconciled against its ET-COS Book destination
- Rules are moved (not copied) — one rule, one home
- Cross-references replace duplicated text
- Old documents are archived, not deleted

### Phase 4 — Full Migration
- All production systems reference ET-COS Books as the canonical source
- Old Bible files are in `archive/`
- ASC pipeline documentation updated to reference ET-COS

### Phase 5 — Living System
- ET-COS is the creative mind of the company
- Amendments are routine and fast (not rare and ceremonial)
- Story Genome data is populated for every story
- Story Health Dashboard is built and in regular use

**Migration target start:** 4 weeks after launch
**Migration target completion:** 8 weeks after launch

---

## Chapter 7 — What ET-COS Must Never Do

1. **Slow down production** — Rules exist to serve production, not the reverse
2. **Be used as a reason to not ship** — "It doesn't meet ET-COS standard X" is never a reason to not publish; it is a reason to repair
3. **Accumulate rules that no one reads** — If a rule has not been referenced in 6 months, it should be reviewed for removal
4. **Become the territory instead of the map** — ET-COS describes what Endless Tales is. If Endless Tales changes, ET-COS must change with it

---

## Chapter 8 — Founding Commitments

At the time of ET-COS Founding Edition (June 26, 2026), Marc Postlewaite commits to:

1. Reviewing the Seven Books and providing amendments within 2 weeks
2. Designating a quarterly review cycle for ET-COS health (30 minutes per quarter)
3. Treating ET-COS as the governing document for all future production decisions once migration is complete
4. Never allowing ET-COS to be modified without his explicit approval
