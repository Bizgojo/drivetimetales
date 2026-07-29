# SFX-ASSET-LOCK-001 v1.0 (DRAFT)

**Author:** Marc Postlewaite  
**Status:** DRAFT — not canon. Marc declares canon.  
**Branch:** feat/sfx-asset-lock-001  

---

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

> ⚠️ **DOCUMENT TRUNCATED** — Marc's message ended here mid-sentence.
> Rule 3 body is incomplete. Awaiting Marc's completion before this
> rule is implementable in full. The intent is clear from the title:
> missing/hash-mismatched locked file = render halted, not silently
> re-rolled. Enforcement implemented to hard-stop on missing file;
> hash-check wired pending the complete rule text.

---

## IMPLEMENTATION NOTES (Atlas)

**Manifest format** (`sfx-manifest.json` per story in storage):

```json
{
  "story_id": "<uuid>",
  "schema": "sfx-asset-lock.v1",
  "locked": {
    "<cue-key>": {
      "storage_path": "asc3/<story_id>/sfx-locked/<file>.mp3",
      "public_url": "https://...",
      "sha256": "<hex>",
      "size_bytes": 0,
      "locked_at": "<ISO-8601>",
      "approved_revision": "rev4",
      "prompt": "<original EL prompt text>",
      "duration_secs": 0
    }
  }
}
```

**Cue keys for Bell Beneath Falls Park PV2** (first application):
- `bell-strike` → `sfx-locked/bell-strike-r4.mp3`
- `door-latch` → `sfx-locked/door-latch-r4.mp3`
- `river-roar` → `sfx-locked/river-roar-r4.mp3`
- `hum-drip` → `sfx-locked/hum-drip-r4.mp3`

**Render enforcement** (see `lib/sfxAssetLock.ts`):
1. Before any SFX generation, load manifest for story
2. For each SFX cue: if locked → copy from `sfx-locked/` to active position; verify file exists; fail hard if missing
3. If unlocked (named by Marc for this revision): generate, normalize, upload to active position, then write new lock entry
4. Manifest written/updated after every successful render

---

*This document will be promoted to `governance/SFX-ASSET-LOCK-001.md`
and declared canon by Marc Postlewaite. Until then it is a draft.*
