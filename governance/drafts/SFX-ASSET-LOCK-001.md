# SFX-ASSET-LOCK-001 v1.1 (DRAFT)

**Author:** Marc Postlewaite  
**Status:** DRAFT — not canon. Marc declares canon.  
**Branch:** feat/sfx-asset-lock-001  
**Completed:** 2026-07-29 18:01 EDT — Rules 1–15 now complete (Rules 3–8 received in full; Part B confirmed via 18:01 message)

---

# PART A — SFX CUES

## PURPOSE

ElevenLabs SFX generation is non-deterministic. An
approved sound cannot be reproduced by re-running the
same prompt. Approved audio is therefore an artifact to
be preserved, not a step to be repeated. Re-rendering a
story to fix three cues currently re-rolls all of them,
degrading sounds that were already approved.

## RULE 1 — LOCK BY DEFAULT ON REVISION

From the second render of any story onward, every SFX cue
is LOCKED except cues Marc names for change in his
revision instruction. A named cue is UNLOCKED for exactly
one regeneration, then re-locks.

## RULE 2 — LOCKED CUES ARE NEVER REGENERATED

The render path must reuse the locked file byte for byte.
No re-prompt, no re-roll, no "improvement."

## RULE 3 — MISSING LOCKED FILE IS A HARD STOP

If a locked file is absent or its hash does not match the
manifest, the render ABORTS and reports which cue. It
must never fall back to generating a replacement.

## RULE 4 — LOCKED FILES ARE IMMUTABLE

No clear, reset, or re-dispatch operation may delete or
overwrite a locked asset. Clearing segments/sfx to force
a re-render must skip locked assets.

## RULE 5 — ONLY MARC UNLOCKS

No agent may unlock a cue, and no agent may regenerate a
locked cue on its own judgment that it can do better.

## RULE 6 — MANIFEST

Per cue: cue id, script cue text, file path, sha256,
locked true/false, revision at which it locked. The
manifest is the authority, not the folder contents.

## RULE 7 — SERIES SIGNATURE SOUNDS

A cue may be designated series-signature (example: the
iron bell in The Bell Beneath Falls Park). Signature cues
promote to a series-level asset and every episode uses
the identical file, so the sound stays recognizable
across the series.

## RULE 8 — GATE

render-final-mix validates the manifest before mixing.
Hash mismatch or missing locked file = abort with the cue
named. Passing renders write the updated manifest.

---

# PART B — VOICE SEGMENTS

## RULE 9 — WHY

An approved ElevenLabs performance is not reproducible.
Same line, same voice, same settings yields a different
read. Approved voice audio is an artifact to preserve,
identical in kind to an approved SFX file.

## RULE 10 — LOCK KEY IS CONTENT, NOT POSITION

Each segment is keyed by sha256 of: character name +
exact line text + voice ID + voice settings (stability,
similarity, style, boost, speed) + model. Index or
segment number must NEVER be part of the key.

## RULE 11 — LOCK BY DEFAULT ON REVISION

From the second render onward, a segment whose content
key already has approved audio is LOCKED and reused. A
segment with no matching key is generated. Consequence:
a script edit regenerates only the lines whose text
changed; added or cut lines shift nothing.

## RULE 12 — PERFORMANCE RE-ROLL IS EXPLICIT ONLY

If Marc wants a different read of an UNCHANGED line, he
names that line. It unlocks for exactly one generation.
The prior file is archived, never overwritten, and Marc
chooses which read survives.

## RULE 13 — ARCHIVE BEFORE ANY CLEAR

No clear, reset, or re-dispatch may run until the current
approved segments and final mix are copied to an archive
path and the copy is verified. Abort the clear if the
archive fails. Applies to every story.

## RULE 14 — MISSING LOCKED SEGMENT IS A HARD STOP

Absent file or hash mismatch aborts the render and names
the segment. Never generate a replacement.

## RULE 15 — MANIFEST

Per segment: content key, character, line text, voice ID,
settings, model, file path, sha256, approved true/false,
revision at which it locked.

---

# IMPLEMENTATION NOTES (Atlas)

## Manifest schema v1.1 — `sfx-manifest.json` per story

```json
{
  "story_id": "<uuid>",
  "schema": "sfx-asset-lock.v1.1",
  "locked_sfx": {
    "<cue-id>": {
      "locked": true,
      "cue_text": "<script SFX line text>",
      "storage_path": "asc3/<story_id>/sfx-locked/<cue-id>-<rev>.mp3",
      "public_url": "https://...",
      "sha256": "<hex>",
      "size_bytes": 0,
      "locked_at": "<ISO-8601>",
      "locked_revision": "rev4",
      "duration_secs": 0,
      "series_signature": false
    }
  },
  "series_signature_sfx": {
    "<cue-id>": {
      "series_path": "asc3/series/<series-slug>/sfx/<cue-id>.mp3",
      "sha256": "<hex>",
      "promoted_at": "<ISO-8601>",
      "promoted_from_story": "<uuid>"
    }
  },
  "voice_segments": {
    "<content-key>": {
      "character": "MARA",
      "line_text": "...",
      "voice_id": "...",
      "voice_settings": { "stability": 0.5, "similarity_boost": 0.75, "style": 0.0, "use_speaker_boost": true, "speed": 1.0 },
      "model": "eleven_multilingual_v2",
      "storage_path": "asc3/<story_id>/voice-archive/<content-key>.mp3",
      "file_sha256": "<hex>",
      "size_bytes": 0,
      "approved": true,
      "locked_revision": "rev4",
      "locked_at": "<ISO-8601>"
    }
  }
}
```

## Implementation items (this document)

| # | Rule | Item | Status |
|---|------|------|--------|
| 1 | Rule 4 | `clearSkippingLocked()` — delete only non-locked assets | `lib/sfxAssetLock.ts` |
| 2 | Rule 7 | `designateSeriesSignature()` — promote to series-level path | `lib/sfxAssetLock.ts` |
| 3 | Rule 8 | `validateManifestGate()` — pre-mix hash check, abort on mismatch | `lib/sfxAssetLock.ts` |
| 4 | Rule 13 | `archiveBeforeClear()` — timestamped archive + verify | `lib/sfxAssetLock.ts` ✅ |
| 5 | Rule 10/11 | `resolveVoiceSegment()` / `lockVoiceSegment()` | `lib/sfxAssetLock.ts` ✅ |
| 6 | Pipeline | Wire `resolveVoiceSegment()` into `generate-voices` route | Pending pipeline PR |
| 7 | Pipeline | Wire `validateManifestGate()` into `render-final-mix` route | Pending pipeline PR |
| 8 | Backfill | `scripts/sfx-lock-backfill.js` — PV1+PV2 (54 segments) | ✅ run complete |

## Archive path convention (Rule 13)

```
asc3/<story_id>/archives/<YYYYMMDD-HHMMSS>/segment_XXXX.mp3
asc3/<story_id>/archives/<YYYYMMDD-HHMMSS>/final_mix.mp3
```

## Series signature path (Rule 7)

```
asc3/series/<series-slug>/sfx/<cue-id>.mp3
```

Example: `asc3/series/bell-beneath-falls-park/sfx/bell-strike.mp3`

---

*Promoted to `governance/SFX-ASSET-LOCK-001.md` and declared canon by Marc Postlewaite when ready.*
