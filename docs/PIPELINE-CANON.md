# PIPELINE CANON

**The single home for all standing pipeline governance rules.**

This document is the canonical, authoritative source for the five-part pipeline rules
that govern how stories and series move through the Drive Time Tales pipeline. It
consolidates the previously separate draft/sign-off documents into one living home.
When a rule here is marked **APPROVED**, it is standing pipeline law and implementation
may reference it; merges, DB changes, and production actions still require separate
go-aheads. When a rule is marked **PENDING**, it is included for completeness but is
**not yet effective** and changes nothing until Marc signs it.

Each rule is expressed in a consistent five-part structure:

- **Statement** — the durable, verbatim-style wording Marc approved (or is reviewing).
- **Rationale** — one line on why the rule exists.
- **Scope** — what the rule covers.
- **Defaults** — initial values and default postures where applicable.
- **Interactions** — how the rule relates to the other rules in this canon.

Prior standing rules referenced throughout remain in force and are not contradicted:

- CLASSIFY-BEFORE-FIX LOOP (Marc, 2026-10-03)
- Episode Correction Loop (Marc, 2026-08-21, PERMANENT)
- Sequencing Rule — No Dispatch Before PR Merge (Marc, 2026-07-22, PERMANENT)
- Pre-Merge Check — Component Rename/Replace Diff (Marc, 2026-07-23, PERMANENT)

---

## Rule Registry

| Rule | Title | Status | Effective Date |
|------|-------|--------|----------------|
| PIPELINE-CANON-001 · Rule 1 | Block Classification | APPROVED | 2026-10-04 |
| PIPELINE-CANON-001 · Rule 2 | Quality Gates Block, Not Warn | APPROVED | 2026-10-04 |
| PIPELINE-CANON-001 · Rule 3 | Episode Strict-Ordering / Sequential Gate | APPROVED | 2026-10-04 |
| PIPELINE-CANON-001 · Rule 4 | Publish-Mode Switch (initial `direct`, option A) | APPROVED | 2026-10-04 |
| EPISODE-ADDITION RULE | Episodes Publish Complete, As One Unit | APPROVED | 2026-10-04 |
| EPISODE-NUMBERING RULE | Start at 1, Count Up, No Gaps, No Zero | APPROVED | 2026-10-04 |

---

# PIPELINE-CANON-001 (Rules 1–4)

**Status:** APPROVED 2026-10-04 10:34 EDT — standing pipeline law (all four rules + Rule 4
open question resolved as option A). Implementation may reference; merges/DB/production
actions need separate go-aheads.
**Scope:** Standing pipeline rules. Applies to all stories and all series going forward
unless Marc explicitly amends.

---

## RULE 1 — BLOCK CLASSIFICATION (extends CLASSIFY-BEFORE-FIX LOOP)

**Status: APPROVED 2026-10-04, effective now.**

### Statement

> When a story gets stuck in the pipeline, classify BEFORE fixing. There are exactly two classes. (A) Pipeline defect: the pipeline logic or code is wrong — fix the code. (B) Story defect: the pipeline is correct but the story's content or metadata is bad — the fix is the missing capability: auto-detect the failure class, send the story back for correction (Hal rewrite or direct metadata fix), and auto-reprocess it when the correction lands. There is no standing human step for text or metadata corrections. Every block report states A or B and confirms the auto-send-back-and-retry path exists — not merely that one story got fixed. Final audio always needs Marc's ear before going live.

### Rationale

Fixing symptoms one story at a time hides systemic defects; classifying first forces the durable fix.

### Scope

- Covers every stall, failure, or needs_attention state on any story at any pipeline stage (C1–C8 and any future stages).
- Class A triggers a code fix plus a regression guard so the same defect cannot recur silently.
- Class B triggers (or, where the capability does not yet exist, requires building): automatic failure-class detection, automatic send-back for correction, and automatic reprocessing on correction — with no standing human in the loop for text/metadata corrections.
- Human reporting obligation: each block report must state the A/B classification explicitly.
- UNCHANGED from CLASSIFY-BEFORE-FIX LOOP: final audio always needs Marc's ear before live (see reconciliation note under Rule 4).

### Defaults

- Default classification discipline: no fix work begins until the A/B call is recorded.
- Default Class B correction routes: Hal rewrite for prose/content faults; direct metadata fix for metadata faults (e.g., contradictory tags, missing fields, naming contradictions).
- Default retry: automatic reprocessing once the correction lands; no manual re-queue.

### Interactions

- **With Rule 2 (quality gates block):** a blocking gate trip is itself a block event and must be A/B-classified. A gate that trips on bad story content is evidence of Class B; a gate that trips on correct content (false positive) is evidence of Class A. Warn-only gates are not permitted to silently pass content that later stalls — see Rule 2.
- **With Rule 3 (strict ordering):** classification is per-episode. A block on the currently-running episode never re-opens or re-classifies already-passed episodes. The auto-send-back-and-retry path applies to the head-of-line episode only.
- **With Rule 4 (publish-mode switch):** block classification applies to anything stuck *before* the publish check. The publish-mode setting never overrides or bypasses classification — a story that cannot pass its gates does not reach the RFR-vs-live decision at all.

---

## RULE 2 — QUALITY GATES BLOCK, NOT WARN

**Status: APPROVED 2026-10-04, effective now.**

### Statement

> Any quality check the pipeline runs must be able to stop the run and force a fix — never log a warning and continue. New gates default to blocking. Any warn-only exception requires explicit justification recorded in that gate's definition, stating what is checked, why non-blocking is safe, and what downstream check will catch the defect instead.

### Rationale

Warn-and-continue turned a deterministic defect into a repeat incident: the intro/outro Belle-naming bug (deterministic content-gate failures Jul 9/10/24 on *Everything Below*, marc_required:true, repair failed on metadata contradiction) passed through warn-only gates repeatedly instead of stopping the run once.

### Scope

- Covers every quality check the pipeline runs: content gates, metadata-consistency gates, audio gates, narrator-voice gates, package-arc checks, and any future gates.
- "Blocking" means: the run stops, the failure is recorded with the failing check named, and the story does not advance until the fix lands (via Rule 1's Class A or Class B path as classified).
- Warn-only is disfavored and permitted only as a named exception with written justification stored in the gate's definition — not in chat, not in a one-off comment.
- Each exception must name: (1) the check, (2) why non-blocking is safe for this specific check, (3) which downstream blocking check catches the defect if it is real.

### Defaults

- Default for every new gate: **blocking**.
- Default review posture: an existing warn-only gate is presumed non-compliant until it is either converted to blocking or given a recorded justification.
- No default warn-only categories — every exception is per-gate and explicit.

### Interactions

- **With Rule 1 (block classification):** every blocking-gate trip produces a block event that must be A/B-classified. The gate's failure output must carry enough detail (which check, which content/metadata field, expected vs. actual) to make classification possible without re-investigation.
- **With Rule 3 (strict ordering):** a blocking-gate failure on the head-of-line episode holds the line — downstream episodes wait, upstream (passed and locked) episodes are untouched. Gates never cascade backward.
- **With Rule 4 (publish-mode switch):** quality gates run *before* the publish check. Publish mode governs the RFR-vs-live decision only after all applicable quality gates pass. Neither `rfr` nor `direct` mode weakens, skips, or downgrades any gate.

---

## RULE 3 — EPISODE STRICT-ORDERING / SEQUENTIAL GATE

**Status: APPROVED 2026-10-04, effective now.**

### Statement (Marc's verbatim rule, 2026-10-04 09:33 EDT, formalized)

> Episodes in a series run STRICTLY IN ORDER, one at a time. Episode 1 runs the full pipeline first — nothing starts until Episode 1 fully passes. Episode N starts only after Episode N−1 passes; an Episode N problem never pulls back or re-checks earlier episodes. Each error affects only the currently-running episode — never backward cascade, never forward jump.

### Rationale

Out-of-order execution and backward cascades turn one episode's defect into a series-wide stall; strict ordering localizes every failure to the head of the line.

### Scope

- Covers every multi-episode series running through the pipeline, at every stage (C1–C8).
- Grounded in the completed analysis — reused here, not redone:
  - **Gate A** — dispatch-queue `needs_attention` veto (`app/api/cron/dispatch-queue/route.ts` ~380–390) skips the whole series when set.
  - **Gate B** — series failure circuit (`lib/dispatchGuards.ts` ~30–33, 130–145) parks clean siblings when a sibling fails.
  - **Gate C** — one `production_jobs` row per series (`run-next/route.ts:107–116`); shared fate at every stage C1–C8.
- Proposed model (stated here as the rule's intended shape; implementation is a separate track and is NOT authorized by this canon):
  - Per-episode gate tracking with states: **head** (currently running), **passed + locked** (done, immutable), **waiting** (not yet started), **blocked** (head failed, holding the line).
  - "Fully passes" for an episode = `complete_story_package` succeeds for that episode (per-episode verify checks of the kind in `run-next:5062–5092`).
  - Passed-episode immutability: a passed episode is locked and is never re-checked, re-run, or pulled back because of a later episode's problem.
  - Head-of-line blocking: while the head episode is blocked, no later episode starts.
  - Package-arc AI runs as a series-final step after the finale locks.
  - Narrator consistency is checked incrementally against Episode 1's locked voice (not re-derived per episode).
  - Per-episode circuit counting (failures count against the running episode, not the series as a blob).

### Defaults

- Default series posture: sequential, one episode in flight at a time.
- Default failure containment: the currently-running episode only.
- Default post-finale step: package-arc AI after the finale passes and locks — never interleaved with earlier episodes.
- Default narrator reference: Episode 1's locked voice.

### Interactions

- **With Rule 1 (block classification):** when the head episode blocks, classify A/B for that episode only. The auto-send-back-and-retry path reprocesses the head episode; passed episodes stay locked and waiting episodes stay waiting.
- **With Rule 2 (quality gates block):** a blocking-gate trip on the head episode is the normal way a line hold begins. Gates are evaluated per-episode; a gate failure never invalidates an already-passed episode.
- **With Rule 4 (publish-mode switch):** the whole series flips to live together only once EVERY episode has passed and locked. Publish mode is then read once for the series move. A series is never split across modes (some episodes RFR, some live).

---

## RULE 4 — PUBLISH-MODE SWITCH

**Status: APPROVED 2026-10-04, effective now (initial value `direct`; open question resolved as option A).**

### Statement (Marc's verbatim spec, 2026-10-04 09:52 EDT, formalized)

> One setting, `publish_mode`, two values: `rfr` (hold at ready-for-review) or `direct` (skip review, go straight to the app). Every story and every completed series checks this single setting at the moment it is about to go live. No per-story question, ever. Marc changes it with a one-line instruction; it stays until he changes it again.

### Rationale

A single durable switch replaces repeated per-story publish questions and makes the RFR-vs-live decision predictable and auditable.

### Scope

- Covers every story and every completed series at the moment it becomes eligible to go live (all prior gates passed).
- `rfr`: the item holds at ready-for-review for Marc's action under the standing Episode Correction Loop (listen → approve or send corrections → corrected version delivered as link, not published → Marc approves → only then replaces/publishes).
- `direct`: the item skips the RFR holding state and goes straight to the app.
- Change authority: Marc only, by one-line instruction (e.g., "publish_mode to direct"). No UI, no PR, no per-story override.
- Persistence: the value stays until Marc changes it again. There is no expiry, no per-series default, no silent reset.

### Defaults

- **INITIAL VALUE: `direct`.**
- Default read point: at the moment the item is about to go live — the current value at that moment governs, not the value at dispatch time.
- Default for series: the whole series flips once, together, after EVERY episode has passed per Rule 3, under whatever `publish_mode` is currently set. Never split a series across modes.

### Interactions

- **With Rule 1 (block classification):** classification applies to anything stuck *before* the publish check. Publish mode never rescues a blocked story — a story that cannot pass its gates never reaches the mode check.
- **With Rule 2 (quality gates block):** publish mode is evaluated AFTER all quality gates pass. Neither mode value weakens any gate.
- **With Rule 3 (strict ordering):** for series, the mode check happens once, after the finale locks. Per-episode RFR holds are not permitted — the series moves as a unit.

### Resolution of the ear-gate / direct-mode open question (Marc, option A, 2026-10-04)

Rule 1 (and the CLASSIFY-BEFORE-FIX LOOP it extends) states that final audio always needs Marc's ear before going live. Rule 4's `direct` value sends content straight to the app, skipping the RFR hold.

**Marc's resolution — option (a), approved 2026-10-04 10:34 EDT:** `direct` mode **fully waives the ear-gate**. Content in `direct` mode goes straight to the app without a pre-live hold and without a guaranteed post-live listen.

**Binding clarification (Marc, 2026-10-04 10:35 EDT):** option (a) explicitly declines the recommended post-live listen-and-pullback safety net. **No implementation built against this canon — sequential gate, publish-ordering gate, circuit counting, or otherwise — may assume Marc catches bad audio after a direct-mode publish.** Build and test accordingly. There is no post-live safety net under `direct`.

In `rfr` mode, the ear-gate is pre-live as today.

---

# EPISODE-ADDITION RULE

**Status: APPROVED 2026-10-04, effective now.** Ordered by Marc 2026-10-04 11:52 EDT.
Standing pipeline law in the same five-part format as PIPELINE-CANON-001 Rules 1–4.

### Statement

A story's episodes always publish complete, as one unit:

1. **Initial release.** All episodes of a story's initial release go live together. No partial or staggered release of the initial set — the whole unit flips live at once.
2. **Later additions.** After a story/series is already fully published, Marc may later decide to add one or more new episodes to it. Those new episodes are written/produced, then published together as one batch (never one at a time), appended after the existing episodes, and numbered in sequence continuing from the last published episode number.

Numbering contiguity is enforced: the new batch continues from the last published episode number with no gaps and no renumbering of already-published episodes.

Additions never reopen locked episodes of the original release. Locked stays locked; the addition is an append-only operation.

### Rationale

Listeners experience a story as a complete unit — a partial initial release breaks trust and complicates the catalog. The same logic applies to expansions: a dripped-out addition fragments the story and forces re-work (artwork, ordering, announcements) per drop instead of once per batch. Batch publication keeps releases clean, predictable, and operable, and sequential appended numbering keeps the episode order unambiguous for players and listeners.

### Scope

- Applies to all stories/series with episodic structure, whether single-season or multi-season.
- Covers (a) initial releases (all episodes of the release go live together) and (b) post-publication additions (new episodes appended later).
- Covers numbering: new episodes continue the existing sequence (last published episode number + 1, + 2, …). No gaps, no re-use of numbers, no renumbering of published episodes.
- Covers publication batching: an addition batch publishes together as one unit, never one episode at a time, regardless of batch size.
- Does not cover corrections to already-published episodes (those follow the standing Episode Correction Loop: corrected version delivered as link, published only on Marc's explicit approval) and does not cover removal/deprecation of episodes.

### Defaults

- **Default batching:** one addition decision = one batch. If Marc orders "add episodes 7–9," all three publish together once all three have passed. No per-episode early release.
- **Default ordering:** new batch appends strictly after the highest published episode number. Interleaving (inserting between published episodes) is not permitted unless Marc explicitly orders it as a signed amendment.
- **Default numbering:** continue sequence (N+1, N+2, …). No gaps. If a produced episode is cut before publication, numbering closes up before publish so the live sequence has no holes.
- **Default lock behavior:** original-release episodes retain their locked/published state throughout. Addition work (writing, production, QC) touches only the new episodes.
- **Failure/ambiguity default:** if it is unclear whether an episode belongs to the initial release or a later addition, treat it as part of the pending initial release (publish-together) unless Marc explicitly designates it an addition. Failed verification commands are UNVERIFIED, never negative findings — same standard as PIPELINE-CANON-001.

### Interactions with Rules 1–4 (PIPELINE-CANON-001)

- **Rule 1 (no partial passes):** unchanged. Each new addition episode must individually earn its pass; the batch publishes only when every episode in the batch has passed.
- **Rule 2 (no silent /tmp QC):** unchanged. Addition episodes are QC'd under the same auditable rules — no silent local-only checks.
- **Rule 3 (sequential ordering + series flips together):** two explicit touchpoints.
  - Part (1) of this item **restates and reinforces** Rule 3's series-flips-live-together clause for initial releases. No conflict — this item makes the "all episodes go live together" requirement explicit at the canon-item level.
  - Part (2) additions run **under** Rule 3 sequential ordering among themselves: the new batch runs in order (episode N+1, then N+2, …), and the batch as a whole appends after the existing published sequence.
- **Rule 4 (publish_mode):** additions publish under whatever `publish_mode` is current at the time of the addition release (auto or manual), same as any other publish event. This item does not freeze or override the mode; it only requires that the addition batch publishes as one unit under the then-current mode.

---

# EPISODE-NUMBERING RULE

**Status: APPROVED 2026-10-04, effective now.** Ordered by Marc 2026-10-04 12:10 EDT.
Standing pipeline law in the same five-part format as PIPELINE-CANON-001 Rules 1–4.

### Statement

> Every story's episodes are numbered starting from **1**, counting up in sequence — **never episode 0**. The first episode of any story is **episode 1**. A single-episode story is **episode 1** (not episode 0). Episode numbers are contiguous: **1, 2, 3, … N** with **no gaps** and **no zero-index**. There is no episode 0, no "pilot zero," no placeholder slot, and no skipped numbers anywhere in a story's published sequence.

### Rationale

A single, human-first numbering convention (start at 1, count up, no gaps) makes episode order unambiguous for listeners, the player, and every pipeline predicate that reasons about "the next episode" or "the last published episode." Zero-indexing and gaps are the two recurring sources of ordering ambiguity; banning both removes a whole class of off-by-one and missing-episode defects at the canon level rather than patching them per story.

### Scope

- Applies to **all** stories and series with episodic structure, single-episode or multi-season, now and going forward.
- Covers the **base case**: the first episode of every story is episode 1; a single story is episode 1.
- Covers **contiguity**: the published sequence is 1..N with no gaps, no reused numbers, and no zero-index.
- Covers **the floor**: episode 0 is never a valid episode number for any story, under any circumstance, including pilots, prologues, or specials — those, if they exist, take their place in the 1..N sequence like any other episode.
- Does **not** itself govern *when* episodes publish or *how many* publish together — that is the EPISODE-ADDITION RULE. This item governs only *what number each episode carries*.
- Does **not** cover internal database primary keys, array indices, or storage offsets, which may be zero-based as an implementation detail; it governs the **canonical, listener-facing episode number** only.

### Defaults

- **Default first number:** 1. Every story's first episode is episode 1 — no configuration, no per-story override.
- **Default increment:** +1, contiguous. Episode N is immediately followed by episode N+1 with no skipped value.
- **Default single-story number:** 1. A story with exactly one episode is episode 1, treated identically to episode 1 of any multi-episode story.
- **Default gap handling:** if a produced episode is cut before publication, the live sequence closes up so it remains 1..N with no hole (consistent with the EPISODE-ADDITION RULE's cut-before-publish default). The published catalog never shows a gap.
- **Default on ambiguity:** if any input, import, or legacy record presents a zero-indexed or gapped sequence, it is treated as **non-compliant and corrected to 1..N before publish** — never published as-is. Failed verification commands are UNVERIFIED, never negative findings — same standard as PIPELINE-CANON-001.

### Interactions with Rules 1–4 (PIPELINE-CANON-001) + EPISODE-ADDITION RULE

- **Rule 1 (block classification):** unchanged. A zero-indexed or gapped numbering detected at a gate is a **Class B** (story/metadata defect) — the numbering is corrected and the item reprocessed, not patched ad hoc. No numbering defect is a Class A code excuse unless the pipeline itself produced the bad number.
- **Rule 2 (quality gates block):** unchanged, and reinforced. A numbering check (first episode = 1, contiguous 1..N, no zero-index) is a **blocking** gate by default — a non-conforming sequence stops the run and forces correction; it never warns-and-continues.
- **Rule 3 (sequential ordering):** **direct reinforcement.** Contiguity (1..N, no gaps) is the numbering counterpart to Rule 3's strict sequential execution. Rule 3 governs the *order episodes run*; this item guarantees the *numbers that order is expressed in* are clean 1-based integers with no holes. Together they make "episode N starts only after N−1 passes" well-defined, because N and N−1 always exist and are adjacent.
- **Rule 4 (publish-mode switch):** unchanged. Numbering is independent of `publish_mode`; both `rfr` and `direct` publish the same 1..N sequence. Mode governs *whether* a hold occurs, never *what number* an episode carries.
- **Publish-ordering gate (Gate 1):** this item makes the gate's predicate uniform. Because every story — including single-episode stories — starts at 1 and is contiguous, the publish-ordering predicate can treat a single story as the degenerate case of the general 1..N rule (N=1) with no special-casing for "storyless" or "zero" episodes.
- **EPISODE-ADDITION RULE:** **direct reinforcement.** Later additions continue numbering from the last published episode number (N+1, N+2, …) and **never reset to 0**. This item supplies the floor and contiguity guarantee the ADDITION rule's "continue the sequence" clause depends on: additions extend 1..N into 1..M contiguously, never introducing a 0 and never leaving a gap between the original tail and the appended batch.
