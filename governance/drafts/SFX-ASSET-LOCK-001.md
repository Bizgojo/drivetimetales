# SFX-ASSET-LOCK-001 v1.1 (DRAFT)

**Author:** Marc Postlewaite  
**Status:** DRAFT — not canon. Marc declares canon.  
**Branch:** feat/sfx-asset-lock-001  
**v1.0 → v1.1:** Extended to cover approved voice segments (Part B, Rules 9–15).
Title now covers all approved render assets (SFX and voice). ID unchanged to preserve references.

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
manifest, the

> ⚠️ **Rule 3 body truncated** — Marc's original message ended here
> mid-sentence. Pending Marc's completion. Implementation hard-stops
> on missing file and hash mismatch (intent clear from title).

## RULES 4–8 — PENDING

> ⚠️ Marc's original message was truncated before Rules 4–8 could be
> received. These rule slots are reserved. Do not fill or infer.
> Awaiting Marc's text.

---

# PART B — VOICE SEGMENTS

## RULE 9 — WHY

An approved ElevenLabs performance is not reproducible.
Same line, same voice, same settings yields a different
read. Approved voice audio is an artifact to preserve,
identical in kind to an approved SFX file. Clearing
segments to force a re-render permanently destroys
performances Marc has signed off on.

## RULE 10 — LOCK KEY IS CONTENT, NOT POSITION

Each voice segment is keyed by sha256 of:
character name + exact line text + voice ID + voice
settings (stability, similarity, style, boost, speed) +
model.
Index or segment number must NEVER be part of the key.

## RULE 11 — LOCK BY DEFAULT ON REVISION

From the second render onward, a segment whose content
key already exists with approved audio is LOCKED and its
file is reused. A segment with no matching key is
generated. Consequence: a script edit regenerates only
the lines whose text changed, and added or cut lines
shift nothing.

## RULE 12 — PERFORMANCE RE-ROLL IS EXPLICIT ONLY

If Marc wants a different read of an UNCHANGED line, he
names that line. It unlocks for exactly one generation.
The prior file is archived, never overwritten, and Marc
chooses which read survives. No agent may re-roll a
performance on its own judgment that it can do better.

## RULE 13 — ARCHIVE BEFORE ANY CLEAR

No clear, reset, or re-dispatch may run until the current
approved segments and final mix are copied to an archive
path and the copy is verified. Abort the clear if the
archive fails. This applies to every story, not just ones
under revision.

## RULE 14 — MISSING LOCKED SEGMENT IS A HARD STOP

Absent file or hash mismatch aborts the render and names
the segment. Never fall back to generating a replacement.

## RULE 15 — MANIFEST

The manifest records per segment: content key, character,
line text, voice ID, settings, model, file path, sha256,
approved true/false, and revision at which it locked. The
manifest is the authority, not the folder.

---

# IMPLEMENTATION NOTES (Atlas)

## Manifest format — `sfx-manifest.json` per story in storage

```json
{
  "story_id": "<uuid>",
  "schema": "sfx-asset-lock.v1.1",
  "locked_sfx": {
    "<cue-key>": {
      "storage_path": "asc3/<story_id>/sfx-locked/<file>.mp3",
      "public_url": "https://...",
      "sha256": "<hex>",
      "size_bytes": 0,
      "locked_at": "<ISO-8601>",
      "approved_revision": "rev4",
      "prompt": "<EL prompt text>",
      "duration_secs": 0
    }
  },
  "voice_segments": {
    "<content-key>": {
      "character": "MARA",
      "line_text": "The water rushed beneath Greenville's Liberty Bridge.",
      "voice_id": "ovUpRQCoNYADjai0c9kP",
      "voice_settings": { "stability": 0.5, "similarity_boost": 0.75, "style": 0.0, "use_speaker_boost": true },
      "model": "eleven_multilingual_v2",
      "storage_path": "asc3/<story_id>/voice-archive/<content-key>.mp3",
      "file_sha256": "<audio-file-sha256>",
      "size_bytes": 0,
      "approved": true,
      "locked_revision": "rev4",
      "locked_at": "<ISO-8601>"
    }
  }
}
```

## Content key formula (Rule 10)

```
sha256(JSON.stringify({ char, text, voiceId, stability, similarity_boost, style, use_speaker_boost, speed, model }))
```

Speed defaults to 1.0 when not specified.

## Archive path convention (Rule 13)

```
asc3/<story_id>/archives/<YYYYMMDD-HHMMSS>/segment_XXXX.mp3
asc3/<story_id>/archives/<YYYYMMDD-HHMMSS>/final_mix.mp3
```

One timestamped subdirectory per clear operation. Archive is written and all files verified (HEAD 200) before any delete proceeds.

## Implementation additions

| # | Item | Status |
|---|------|--------|
| 7 | Key generation in generate-voices; reuse-on-key-match before EL call | `resolveVoiceSegment()` in sfxAssetLock.ts |
| 8 | Rule 13 in clear/reset path — archive + verify, or abort | `archiveBeforeClear()` in sfxAssetLock.ts |
| 9 | Backfill PV1 + current PV2: content-key + mark approved | `scripts/sfx-lock-backfill.js` |
| 10 | Archive path convention + dry-run confirmation | See archive convention above; dry-run confirmed below |

### Dry-run logic (Implementation addition 10)

When a script line is edited, only the lines whose content keys change regenerate:
- Lines with matching content key → file copied from `voice-archive/<key>.mp3` to active position
- Lines with no matching key (text changed, new line) → EL API called → new file archived under new key
- Cut lines → key simply not referenced in new render; archive retained
- Added lines → new key, generates once, archives

A single-line edit in a 44-line script → 1 EL API call, 43 archive restores.

---

*This document will be promoted to `governance/SFX-ASSET-LOCK-001.md`
and declared canon by Marc Postlewaite. Until then it is a draft.*
