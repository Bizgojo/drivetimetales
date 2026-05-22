# Story Lineage and Classification

**Version:** 1.0
**Status:** Planning/specification only
**Scope:** Endless Tales story library, production history, and future admin filtering

This document defines the target model for story provenance, version lineage, and content classification. It is intentionally documentation-only. Do not treat this spec as an app-code change, production behavior change, validator change, or schema migration.

## Purpose

Endless Tales now has multiple generations of content:

- Early legacy stories created before the canonical story architecture.
- Stories generated under the series-first production workflow.
- Recovered stories with completed assets but stale production jobs.
- Redos and repairs that may supersede earlier versions.
- Experiments, blocked stories, and incomplete packages that should not be confused with canonical production library entries.

The system needs a stable way to explain where a story came from, what doctrine it was produced under, whether it belongs in the canonical library, and what should happen to older or incomplete content.

## Story Provenance

Every story or episode should eventually expose a provenance object that answers:

- How was this story created?
- Which production job or manual action produced it?
- Which prior story version, if any, does it supersede?
- Which story doctrine and audio doctrine versions governed it?
- Is it suitable for the canonical listener-facing library?
- Why is it hidden, blocked, deprecated, or marked as a redo?

Recommended future fields:

```json
{
  "production_provenance": {
    "lineageId": "stable-family-id",
    "versionNumber": 1,
    "versionDate": "2026-05-22T00:00:00.000Z",
    "versionType": "canonical",
    "sourceJobId": "production-job-id-or-null",
    "sourceWorkflow": "story-production-v2",
    "supersedesStoryId": null,
    "supersededByStoryId": null,
    "redoReason": null,
    "changeSummary": null,
    "classification": "canonical",
    "classificationReasons": [],
    "doctrine": {
      "storyArchitectureVersion": "1.1",
      "introOutroVersion": "1.0",
      "realityAnchorEnabled": true,
      "difficultSolutionEnabled": true,
      "qcVersion": "transcript-qc-2026-05"
    }
  }
}
```

The exact storage location may be `stories.production_provenance`, a related lineage table, or an equivalent normalized model. The requirement is that the information is stable, queryable, and visible to admin tooling.

## Version Lineage

A lineage is the family tree of a story concept across versions.

Lineage should support:

- Original version.
- Redo versions.
- Manual repair versions.
- Legacy migration classifications.
- Supersession links.
- Audit history without deleting older rows.

Version rules:

- `lineageId` should remain stable across redos of the same story or episode.
- `versionNumber` should increase when a story is materially regenerated, rewritten, repackaged, or redone.
- `versionDate` should represent the date the version became production-visible or approval-visible.
- `supersedesStoryId` should point to the prior story row when this version replaces another row.
- `supersededByStoryId` should point forward when this row is no longer the active version.
- Redos should preserve prior rows for audit unless there is a separate deletion policy.

Series lineage should exist at both levels:

- Series-level lineage for the overall package.
- Episode-level lineage for each episode row.

## Classification Types

Classification should describe the story's production/library state. A story may need one primary classification and optional secondary flags.

### `legacy`

Content created before the current canonical production rules.

Use when:

- The story predates the Story Resolution Map.
- The story predates series-first production.
- The story predates Belle/Intro-Outro Bible enforcement.
- The story is listener-facing but not produced under the current doctrine.

Admin behavior:

- Hidden by default in future "canonical only" views.
- Available through "show legacy" filters.
- Eligible for migration, redo, or archival review.

### `canonical`

Content produced under the current approved Endless Tales doctrine and suitable for the main library.

Use when:

- Story Architecture version is current or accepted.
- Intro/Outro version is current or accepted.
- Reality Anchor and Difficult Solution rules are applied where required.
- QC version is current or accepted.
- The story has passed approval readiness and editorial review.

Admin behavior:

- Visible in canonical library views.
- Eligible for publish once approval rules pass.

### `experimental`

Content generated to test new prompts, genres, audio workflows, validators, or production methods.

Use when:

- The story was intentionally made outside the canonical production path.
- The story uses an unapproved prompt, narrator, structure, audio treatment, or doctrine variant.
- The story is a sandbox or A/B test candidate.

Admin behavior:

- Hidden from canonical views by default.
- Requires explicit promotion to become canonical.

### `incomplete`

Content that has not completed expected production steps.

Use when:

- Expected episodes are missing.
- Script exists but audio is missing.
- Audio exists but final mix is missing.
- Final mix exists but packaging metadata is missing.
- Approval readiness cannot be determined.

Admin behavior:

- Visible in blocked/incomplete views.
- Not eligible for normal approval or publishing until resolved.

### `blocked`

Content that cannot proceed because a specific blocker exists.

Use when:

- QC failure requires repair.
- Package completion is blocked.
- Stale job state needs reconciliation.
- Required metadata is missing.
- Editorial review explicitly blocks release.

Admin behavior:

- Visible in blocked/incomplete views.
- Must display blocking reasons and next safe action.

### `hidden`

Content intentionally hidden from the public library.

Use when:

- Story is awaiting approval.
- Story is a test, repair, redo, or legacy row.
- Story is not intended for public playback.

Admin behavior:

- Hidden state should not imply broken state.
- Hidden content may be complete, incomplete, blocked, legacy, or canonical-awaiting-review.

### `deprecated`

Content no longer intended as the active version.

Use when:

- A redo supersedes the row.
- Doctrine has moved on and the row should not represent current standards.
- The story remains only for audit, analytics, or archival purposes.

Admin behavior:

- Excluded from default approval/library views.
- Visible through audit or deprecated filters.

### `redo`

Content created to replace, repair, or improve a prior version.

Use when:

- A story is regenerated after review.
- A series episode is redone due to doctrine, QC, voice, structure, or editorial issues.
- A manual exception creates a replacement version.

Admin behavior:

- Must show prior version, redo reason, version date, and what changed.
- Should clearly indicate whether the redo supersedes the prior row.

### `orphaned`

Content that lacks required lineage or grouping context.

Use when:

- An episode has `series_id` but no discoverable series peers.
- A story row references missing production jobs or missing assets.
- A production job produced assets that are not linked to a current story row.
- A row exists without enough provenance to classify confidently.

Admin behavior:

- Visible in audit/incomplete views.
- Requires reconciliation before canonical promotion.

## Doctrine and Version Tracking

Each story should eventually record which doctrine versions governed production.

Required doctrine fields:

- `storyArchitectureVersion`
- `introOutroVersion`
- `realityAnchorEnabled`
- `difficultSolutionEnabled`
- `qcVersion`

### Story Architecture Version

Tracks which version of the canonical story system governed drafting and validation.

Source-of-truth docs:

- `CLAUDE_STORY_ARCHITECTURE_BIBLE.md`
- `STORY_RESOLUTION_MAP_RULES.md`
- `ENDING_SATISFACTION_VALIDATION.md`
- `SERIES_EPISODE_STRUCTURE_RULES.md`

### Intro/Outro Version

Tracks which Belle and audio-transition doctrine governed intro/outro writing and validation.

Source-of-truth docs:

- `INTRO_OUTRO_BIBLE.md`
- `INTRO_OUTRO_PRODUCTION_RULES.md`
- `BELLE_B_PROMPT_RULES.md`

### Reality Anchor Enabled

Boolean flag indicating whether the Reality Anchor Doctrine was required for this story.

Expected default:

- `true` for mystery, thriller, drama, true crime, and grounded fiction.
- `true` for emotional/character logic even when genre bends reality.
- `false` only for explicit exception cases that still document why.

### Difficult Solution Enabled

Boolean flag indicating whether the Difficult Solution Rule was enforced.

Expected default:

- `true` for all new canonical stories and episodes.

### QC Version

Tracks the transcript/audio QC behavior used during voice generation and validation.

Examples:

- `transcript-qc-2026-05`
- `transcript-qc-pre-unicode-apostrophe-fix`
- `transcript-qc-post-clean-prefix-guardrails`

QC versioning should help explain why older audio may pass or fail differently from newer audio.

## Future Admin Filtering

Admin tools should eventually support classification-aware views.

### Hide Legacy

Default library and approval views may hide `legacy` content unless explicitly enabled.

Purpose:

- Keep current canonical review focused.
- Avoid mixing old-rule stories with new-rule content.

### Show Only Canonical

Displays only stories classified as `canonical`.

Purpose:

- Review the production library as it should appear to listeners.
- Audit whether the library meets the 90% series-first/canonical goal.

### Show Only New-Rule Stories

Displays stories that have current doctrine fields:

- Current Story Architecture version.
- Current Intro/Outro version.
- Reality Anchor enabled where required.
- Difficult Solution enabled.
- Current or accepted QC version.

Purpose:

- Verify modern production compliance independent of publish state.

### Show Blocked/Incomplete

Displays stories classified as `blocked`, `incomplete`, or `orphaned`.

Purpose:

- Recovery queue.
- Packaging completion queue.
- Stale job reconciliation.
- Missing metadata and missing asset triage.

Recommended visible fields:

- Classification.
- Blocking reasons.
- Expected vs present episode count.
- Audio readiness.
- Packaging readiness.
- Source job id.
- Last production event date.
- Recommended next action.

## Migration Strategy for Old Stories

Migration should be conservative and non-destructive.

### Phase 1: Read-Only Classification Report

Create a report or read-only endpoint that classifies existing stories without writing to the database.

Inputs:

- Story row fields.
- Series grouping fields.
- Review status.
- Hidden/published state.
- Audio and package readiness.
- Production job history where available.
- Known doctrine cutover dates or commit ids.

Outputs:

- Proposed classification.
- Classification reasons.
- Missing provenance fields.
- Suggested migration action.

### Phase 2: Admin UI Labels

Display classification labels in admin pages without changing story behavior.

Examples:

- `Legacy`
- `Canonical`
- `Blocked`
- `Incomplete`
- `Redo`
- `Deprecated`

### Phase 3: Provenance Field Backfill

Backfill `production_provenance` or equivalent storage for existing stories.

Rules:

- Do not infer canonical status unless evidence exists.
- Prefer `legacy` or `orphaned` when doctrine/version evidence is missing.
- Preserve old rows even when a redo supersedes them.

### Phase 4: Filtering Defaults

Only after labels are trusted:

- Hide legacy content from default canonical views.
- Add explicit "show legacy" controls.
- Add blocked/incomplete recovery views.
- Add canonical library health reporting.

### Phase 5: Production Writes Provenance Automatically

New production flows should write provenance automatically when:

- Script generation completes.
- Validation passes.
- Voice generation passes.
- Final mix completes.
- Package completion writes approval readiness.
- A redo supersedes a prior version.

## Canonical Promotion Rules

A story should not become `canonical` merely because it exists or is playable.

Canonical promotion should require:

- Current or accepted story doctrine version.
- Required Story Resolution Map evidence.
- Difficult Solution compliance.
- Reality Anchor compliance where required.
- Intro/outro compliance where applicable.
- Audio/transcript QC pass under an accepted QC version.
- Packaging readiness.
- Editorial approval.

Legacy stories can remain published while still classified as `legacy`. Classification describes provenance and doctrine compliance, not necessarily public availability.

## Open Questions

- Should lineage be stored directly on `stories` or normalized into a separate `story_lineage` table?
- Should version lineage be series-first, episode-first, or both?
- Which existing published stories should be grandfathered as listener-visible legacy?
- What is the exact doctrine cutover date for canonical classification?
- Should repairs inherit the original story architecture version or receive a repair-specific version marker?

## Non-Goals

This document does not:

- Change production code.
- Change validators.
- Change Content Approval behavior.
- Change publish behavior.
- Reclassify any existing story.
- Define a schema migration.

