# Content Approval Provenance and Readiness

**Version:** 1.0
**Status:** Planning/specification only
**Scope:** Endless Tales production approval workflow

This document defines the target truth model for Content Approval readiness, series completeness, and production provenance. It is intentionally documentation-only. Do not treat this spec as an app-code change or a schema migration.

## Current Problem

The current Content Approval page is useful for individual review actions, but it does not yet represent the full production truth for series, redos, or partially completed packages.

Known issues:

- The approval page only sees rows that already match approval workflow eligibility. Rows outside those states can be invisible even when production assets exist.
- Series can appear incomplete or misleading because the page groups only the currently eligible rows, not the full expected series.
- Completed audio can be hidden from Content Approval if the story remains in a pre-approval status such as `validator_passed` instead of `audio_ready`.
- Stale production jobs can mislead status reporting when old failed job rows remain in audit history after assets have been completed through recovery.
- Redos do not clearly show version number, version date, redo reason, or what changed.
- The page does not explain when, why, or how a story or series entered Content Approval.

Examples observed:

- A completed hidden series can have `final_mix.mp3`, `story_body.mp3`, and `audio_url` for every episode, but still not appear in Content Approval because it has not completed packaging and has not reached `status=audio_ready`.
- A 3-episode series can appear as 2 episodes in the Ready For Review tab when one episode is in another review state, such as Not Approved.

## Required Approval Truth Model

Content Approval should be based on a normalized approval-readiness model, not on raw row eligibility alone.

Each approval object should expose:

- Full series expected count.
- Present episode count.
- Missing episode numbers.
- Audio readiness per episode.
- Production/package status per episode.
- Hidden and published state per episode.
- Review state per episode.
- Source job id.
- Version number.
- Version date.
- Version type: `new` or `redo`.
- Redo reason.
- What changed.
- Why the story or series is on Content Approval.
- Why the story or series is blocked if it is not approval-ready.

Episode-level audio readiness should include:

- `audio_url` present.
- `story_audio_url` present.
- `intro_audio_url` or split intro assets present when required.
- `outro_audio_url` present.
- `background_music_url` present when final mixing requires it.
- Storage asset observations where available.
- Final mix duration where available.

Episode-level approval readiness should include:

- `status`.
- `is_hidden`.
- `published_on`.
- `review_status`.
- `cover_url`.
- `description`.
- `prose_text`.
- `author_id`.
- `narrator_voice_id`.
- `narrator_voice_name`.
- Any blocking reasons needed before approval.

Series-level aggregation should include:

- `series_id`.
- `series_name`.
- Expected episode count from `series_total_episodes`, `series_total`, package state, or production job state.
- Present episode count from story rows.
- Missing episode numbers.
- Episode ids by episode number.
- Count of audio-ready episodes.
- Count of approval-ready episodes.
- Count of approved episodes.
- Count of not-approved episodes.
- Count of published episodes.
- Series-level blocking reasons.

## Proposed API

Add a dedicated approval-readiness endpoint:

```text
GET /api/admin/content-approval
```

The endpoint should return normalized approval objects instead of making the page infer readiness from raw `stories` and `story_analytics` rows.

Recommended response shape:

```json
{
  "success": true,
  "items": [
    {
      "type": "series",
      "seriesId": "uuid",
      "title": "Series Title",
      "expectedEpisodeCount": 3,
      "presentEpisodeCount": 3,
      "missingEpisodes": [],
      "approvalReady": false,
      "approvalEntryReason": "Audio rendered but package completion is incomplete.",
      "approvalBlockingReasons": [
        "Episode 1 missing cover_url",
        "Episode 1 status is validator_passed, expected audio_ready"
      ],
      "sourceJobId": "uuid-or-null",
      "version": {
        "number": 1,
        "date": "2026-05-22T00:00:00.000Z",
        "type": "new",
        "redoReason": null,
        "changeSummary": null
      },
      "episodes": [
        {
          "storyId": "uuid",
          "episodeNumber": 1,
          "title": "Episode Title",
          "status": "validator_passed",
          "isHidden": true,
          "publishedOn": null,
          "reviewStatus": "pending",
          "audioReadiness": {
            "audioUrl": true,
            "storyAudioUrl": true,
            "introAudio": true,
            "outroAudio": true,
            "backgroundMusic": true,
            "finalMix": true,
            "durationSecs": 1011.28
          },
          "approvalReady": false,
          "blockingReasons": [
            "status is validator_passed, expected audio_ready",
            "missing cover_url",
            "missing prose_text",
            "missing author_id",
            "missing narrator_voice_id"
          ]
        }
      ]
    }
  ]
}
```

The endpoint should support optional filters:

- `tab=review|approved|not_approved|published|all`
- `seriesId=<uuid>`
- `storyId=<uuid>`
- `includeBlocked=true`

Important behavior:

- Series aggregation must load the full series, not only rows that match the active tab.
- A story with completed audio but blocked packaging should be visible when `includeBlocked=true`.
- Stale failed production jobs should be shown as audit history, not as the final readiness truth, when completed assets supersede them.

## Proposed Storage

Use `production_jobs` as audit history. Do not delete or rewrite old job rows just because recovery completed assets later.

Add durable story-level provenance in a future phase, either as `stories.production_provenance` JSON or an equivalent normalized table.

Recommended provenance structure:

```json
{
  "sourceJobId": "uuid",
  "versionNumber": 1,
  "versionDate": "2026-05-22T00:00:00.000Z",
  "versionType": "new",
  "redoReason": null,
  "changeSummary": null,
  "approvalEntryReason": "Package completion succeeded.",
  "approvalAddedAt": "2026-05-22T00:00:00.000Z",
  "productionCompletedAt": "2026-05-22T00:00:00.000Z",
  "series": {
    "seriesId": "uuid",
    "expectedEpisodeCount": 3,
    "episodeNumber": 1
  },
  "assets": {
    "audioUrl": true,
    "storyAudioUrl": true,
    "finalMix": true,
    "coverUrl": true,
    "proseText": true
  }
}
```

Redo provenance should preserve:

- Previous version number.
- New version number.
- Redo requested by.
- Redo requested at.
- Redo reason.
- Change summary.
- Original source job id where relevant.
- Redo source job id.

## Implementation Phases

### Phase 1: Read-Only API and Reporting

Add the dedicated approval-readiness endpoint with no schema change.

The endpoint should compute readiness from existing:

- `stories`.
- `story_analytics`.
- `production_jobs`.
- Storage asset listings when needed and safe.

This phase should not publish, approve, unhide, package, regenerate, or mutate production rows.

### Phase 2: UI Display of Expected vs Present Episodes and Blockers

Update the Content Approval page to consume the read-only endpoint.

Display:

- Expected episodes vs present episodes.
- Missing episode numbers.
- Per-episode readiness chips.
- Why each story or series is on Content Approval.
- Why each story or series is blocked.
- Stale failed job superseded by completed assets when applicable.

Series should remain visibly whole across tabs. Individual episodes can show their own review state.

### Phase 3: Provenance Field or Schema Migration

Add durable provenance storage.

Preferred minimal schema:

```sql
ALTER TABLE stories
ADD COLUMN IF NOT EXISTS production_provenance JSONB NOT NULL DEFAULT '{}'::jsonb;
```

If reporting needs outgrow JSON, add a normalized table later. Do not start with a large schema unless the JSON approach blocks essential workflows.

### Phase 4: Production Completion Writes Provenance Automatically

Update production completion paths so provenance is written when a story or series enters Content Approval.

Writers should include:

- `complete-story-package`.
- production job `complete_story_package`.
- redo/recovery flows.
- manual exception flows when used.

This should happen after package completion succeeds and before the item is shown as approval-ready.

## Non-Goals

- Do not publish anything.
- Do not approve anything.
- Do not regenerate or rerender audio.
- Do not change app code during this planning/spec step.
- Do not delete stale production jobs.
- Do not use `production_jobs.status` alone as the approval truth.

