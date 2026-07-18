# PREMISE-UNIQUENESS-001 — Premise Uniqueness Canon Rule

**Status:** Canon (Marc ruling, 2026-07-18 09:24 EDT)
**Scope:** Every brief entering Stage 2 (script generation), all pipelines (V2 manual routes and the server production runner).
**Merge authority:** Marc's explicit merge word required (OPS-CHARTER-001-R1 — publish/brief pipeline surface).

---

## The Rule

> **No new brief proceeds to Stage 2 with a premise substantially similar to any
> story that is published or sitting in `ready_for_review`, `repair_queue`, or
> `approved_ready`. Cold storage is exempt — those premises are reusable.**

### "Substantially similar" — definition

A candidate premise is substantially similar to an existing story's premise
when it shares **both**:

1. **The same core hook** — the inciting situation/question that pulls the
   listener in (the leading sentence(s) of the premise), and
2. **The same central situation** — the overall who/what/stakes described by
   the full premise.

**Shared genre or setting alone does NOT collide.** Two South Boston winter
detective mysteries with different hooks are both welcome.

Deterministic implementation (lib/premiseGate.ts): content-token containment
of the extracted core hook (threshold ≥ 0.6) **and** of the full premise
(threshold ≥ 0.5). Both must trip for a COLLISION. No LLM in the verdict path
— verdicts are reproducible in tests and audits.

### Core-hook extraction rule

1. Trim the premise, split into sentences on terminal punctuation.
2. `core_hook` = the first sentence; if it carries fewer than 6 content tokens
   (after stopword removal and stemming) and a second sentence exists, append
   the second sentence.
3. Cap at 300 characters.

The brief template leads the 2–5 sentence premise with the inciting situation,
so the first sentence(s) are the hook. The same rule is implemented in
`lib/premiseGate.ts` (TypeScript, gate) and
`scripts/backfill-premise-index.js` (plain JS, backfill); a jest parity test
keeps the two in lockstep.

---

## Cold-storage exemption

Premises belonging to stories in `cold_storage` are **reusable**:

- A transition **into** `cold_storage` deletes the story's `premise_index`
  row, freeing the premise immediately.
- Cold-storage stories are never indexed by the backfill.
- If a cold-storage story is later recovered and re-enters a protected state,
  its premise is re-reserved at that transition (first brief to claim the
  premise in the meantime wins — the recovered story would then collide and
  need Marc's word or a rework, which is the intended behavior).

---

## The premise index (`public.premise_index`)

- One row per story in a protected state (`published`, `ready_for_review`,
  `repair_queue`, `approved_ready`).
- Columns: `story_id` (unique), `series_id`, `title`, `status`, `genre`,
  `logline` (story-card description), `core_hook`, `premise` (full premise
  text — the central-situation comparison source), `updated_at`.
- Maintained by `lib/premiseIndex.ts` → `syncPremiseIndexForTransition`,
  called by every guarded `workflow_state` writer **after** a successful
  transition:
  - `app/api/admin/content-approval/route.ts` (single story + series + set_series_ready_for_review)
  - `app/api/admin/publish-story/route.ts` (single story + series publish)
  - `app/api/admin/production-jobs/run-next/route.ts` (runner promotion → ready_for_review)
  - `app/api/cron/dispatch-queue/route.ts` (failure-circuit → repair_queue / cold_storage)
- Sync is best-effort and never blocks a legal transition; drift is repaired by
  re-running `scripts/backfill-premise-index.js --apply` (idempotent upsert).
- Migration: `supabase/migrations/20260718140000_premise_index.sql` — **file
  only**; Marc applies it in the Supabase SQL editor. No DDL from agent
  machines. Backfill runs post-migration on Marc's word.

---

## The gate (mandatory, before Stage 2)

`lib/premiseGate.ts` → `runPremiseGate` / `evaluatePremiseGate`. Wired at every
Stage 2 entry point:

| Path | Behavior on COLLISION |
| --- | --- |
| `app/api/v2/generate-script` (standalone manual) | HTTP 409 with citation |
| `app/api/v2/series-package/generate-scripts` (series manual) | HTTP 409 with citation, whole package bounced |
| run-next `generate_script` step | job → `failed`, `error_json.kind = premise_collision`, `marc_required`, story flagged needs_attention |
| run-next `generate_episode_script` step | same as above |

Every COLLISION carries a citation: colliding `story_id` + title + what
matched (core-hook % + central-situation % overlap). The brief is **bounced
for rework** — the job/request does not proceed and is never auto-retried
(`lib/pipeline-runner/classify.ts` classifies `premise_collision` as
not-retryable, needs-Marc).

Sibling exclusion: a brief never collides with its own story row, and a series
episode never collides with other episodes of the same series (they share the
series premise by design).

Fail-closed: if `premise_index` cannot be read (e.g., migration not applied),
the gate throws — briefs do not silently skip the mandatory check.

---

## Override procedure (Marc's word only)

There is **no silent override and no boolean shortcut**. To let a colliding
brief proceed, Marc's explicit word must be recorded as an object on the
brief:

```json
brief_json.premise_gate_override = {
  "approved_by": "marc",
  "reason": "<Marc's stated reason / message reference>",
  "approved_at": "2026-07-18T13:30:00Z"
}
```

- Both `approved_by` and `reason` are required; anything less is ignored and
  the COLLISION stands.
- An overridden gate still logs the full collision citations it overrode
  (route logs / runner logs) — the override is auditable, never invisible.
- Only Marc authorizes creating this record. Agents must not self-approve.

---

## Test evidence

`__tests__/premise-uniqueness-001.test.ts`:

- **CLEAR** — distinct premise vs. populated index.
- **COLLISION** — reworded same hook + same situation, with citation
  (story_id + title + match description).
- **Genre/setting alone** — same genre and setting, different hook → CLEAR.
- **Cold-storage exempt** — premise identical to a cold-storage story → CLEAR
  (cold-storage stories are not index-eligible; transition to cold_storage
  deletes the row).
- **Override flag** — collision + valid recorded override → proceeds with
  `overrideApplied` and citations; missing/partial override records are
  rejected (still COLLISION).
- **JS/TS parity** — backfill script's extraction matches `lib/premiseGate.ts`
  on fixtures.

---

## Amendment: known-adjacent clusters (Marc ruling, 2026-07-18 09:47 EDT)

The retroactive sweep (PREMISE-SWEEP-20260718) found three MEDIUM published
near-twin pairs. **Marc's ruling: no story action** — both sides of each pair
stay published — **but the pairs are recorded as KNOWN-ADJACENT CLUSTERS so
future briefs near those hooks get flagged earlier.**

### The three seeded clusters

| Slug | Saturated hook | Members (all published) |
| --- | --- | --- |
| `staged-fall-accidental-ruling` | Staged-fall ruled accidental; investigator vs resistant local authority | Murder at Falls Park + The Hardin Falls Inquiry (Mystery, sweep pair #2) |
| `impossible-desert-highway-location` | Officially-nonexistent desert-highway location with fresh physical evidence | Dry Run + Signal at Mile Forty (Thriller, sweep pair #3) |
| `staged-proof-impostor-farce` | Impostor must physically stage proof of a fabricated skill before live witnesses | Commuter of the Year + Dead in the Water (Comedy, sweep pair #4) |

Member story ids are hardcoded in `scripts/backfill-premise-index.js`
(`KNOWN_ADJACENT_CLUSTERS`), taken verbatim from the sweep report.

### Mechanism

- **Storage:** `public.premise_adjacent_clusters` (slug, label, hook, ruling)
  holds one row per cluster; `premise_index.adjacent_cluster` tags each member
  story row with its cluster slug. Both are seeded by
  `scripts/backfill-premise-index.js --apply` (idempotent; re-running repairs
  lost tags). Live workflow sync never writes the tag column.
- **Hook text = matchable variants, not display prose.** Each cluster's `hook`
  holds newline-separated variants: one abstract engine phrasing plus one
  concrete phrasing per member pair. The gate scores a candidate premise
  against each variant and keeps the best (`clusterHookScore`).
- **ADJACENT verdict (warning — NEVER a bounce).** At every Stage 2 entrance
  the gate now returns `CLEAR | ADJACENT | COLLISION`. ADJACENT fires when
  either trigger trips, at thresholds strictly below the collision bar:
  1. **Cluster-hook trigger:** max variant containment vs the candidate
     premise **≥ 0.5** (`ADJACENT_CLUSTER_HOOK_THRESHOLD`).
  2. **Member-proximity trigger** (the sub-collision band): vs any
     cluster-tagged index entry, hookScore **≥ 0.4** AND situationScore
     **≥ 0.35** (`ADJACENT_MEMBER_HOOK_THRESHOLD`,
     `ADJACENT_MEMBER_SITUATION_THRESHOLD`) — closer to one member than the
     published pair are to each other, yet below COLLISION's 0.6/0.5.
- **Behavior on ADJACENT:** the brief **proceeds**. The pairs are published
  precedent, not blockers. The warning (cluster label + member story
  citations + score) is logged loudly at all four Stage 2 entrances and
  returned in the v2 route payloads (`premiseGate.adjacencies`), so Orion and
  Marc see hook saturation before a third near-twin is written. No job fails,
  no 409, no `needs_attention`, no retry-classification change.
- **Precedence:** COLLISION > ADJACENT > CLEAR. Collision behavior is
  unchanged — anything at/above 0.6 hook + 0.5 situation still bounces. An
  override clears a COLLISION but never silences an ADJACENT warning.

### Calibration evidence (2026-07-18, read-only scan)

Against all live protected premises (148 stories → 40 premise units at scan
time): the six member stories flag **only their own cluster** (best-variant
scores 0.75–1.0); every non-member unit scores ≤ 0.318 on the cluster-hook
trigger and below 0.29/0.35 on member proximity — **zero false ADJACENT
flags** at the chosen thresholds, with a wide margin either side of 0.5.
Note: the sweep's HIGH sinkhole pair does not deterministically collide on its
real stored ep-1 premises (0.5 hook / 0.28 situation — the sweep's HIGH call
was semantic); that pair was resolved by Marc cold-storaging the Limestone
series, and the fixture-level regression test keeps a same-hook/same-situation
sinkhole near-twin colliding at 0.73/0.76.

### Adding or retiring a cluster

Only on Marc's word. Add/edit the entry in `KNOWN_ADJACENT_CLUSTERS`
(backfill script), re-run the backfill with `--apply`, and record the ruling
citation in the `ruling` column. Retiring = deleting the
`premise_adjacent_clusters` row and clearing the member tags (then re-run the
backfill to verify).
