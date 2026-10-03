# Fix #1 — Adjacent Writer Sites Survey

**Author:** Vex 🔧 (agent `deepseek-v3`, pipeline engineer)
**Date:** 2026-10-03
**Spec base:** Lyra's `FIX-1-STORAGE-IDEMPOTENCY-SPEC.md` v0.1 (§5 "must not miss" list)
**Repo:** `~/Projects/drivetimetales` @ `b6044067` (branch `feat/fix1-storage-idempotency-1a`)
**Method:** direct read of every listed site. No code edited. No §10 questions answered.
**Risk classes:** F1–F7 per spec §2.

---

## Summary table

| # | Site | Operation | Upsert | Risk class | One-line note |
|---|---|---|---|---|---|
| 1 | `lib/assembleAndVerifyFinalMix.ts:754` | `upload` final mix | `upsert:true` | **F1 + F3** | Clobbers live mix output; error throws, but no checksum and no journal |
| 2 | `lib/personalizedFinalMix.ts:242` | `upload` opener clip | `upsert:true` | **F1 (low)** | Deterministic key (`user/opener`); clobber is benign if bytes identical, destructive if template changed |
| 3 | `lib/personalizedFinalMix.ts:333` | `upload` personalized final mix | `upsert:true` | **F1 + F5** | Clobber + no idempotency key; re-run re-renders and re-spends TTS even for identical inputs |
| 4 | `app/api/admin/generate-voices/route.ts:3397` | `remove` existing segments (HOOK-GATE-STALE-001 purge) | n/a | **F2** | Purge-then-regenerate: gated behind explicit `purgeExisting=true`, aborts on purge error — safest of the delete-first sites, but a crash between purge and regen still leaves segments missing |
| 5 | `app/api/admin/generate-voices/route.ts:3596` | `remove` stale segments | n/a | **F2** | Unconditional purge before regen in the Belle-regen path; no `purgeExisting` gate here — crash window leaves episode segment-less |
| 6 | `app/api/admin/generate-voices/route.ts:3467` | `upload` silence buffer (beat/pause) | `upsert:true` | **F1 (minimal)** | Content is deterministic (generated silence); clobber is idempotent in practice — lowest-priority wrap |
| 7 | `app/api/admin/generate-voices/route.ts:3652` | `upload` silence buffer (beat/pause, second path) | `upsert:true` | **F1 (minimal)** | Same as #6, duplicate code path |
| 8 | `app/api/admin/generate-voices/route.ts:3673` | `upload` restored locked-SFX buffer | `upsert:true` | **F1 (low)** | Bytes come from a hash-verified locked cue (ATL-SFX-WIRE-001), so clobber rewrites identical bytes — safe content, still needs journaling for F5 |
| 9 | `scripts/rerecord-episodes.ts:116` (`moveFile` helper) | `.move()` old voice files → backup dir | n/a | **F3** | Only `.move()` in repo (with call sites :251, :274). Non-atomic server-side copy+delete; error throws `BatchStop`, but no post-move verification and no journal — a partial move is undetectable on resume except via the `/tmp` state file |
| 10 | `scripts/rerecord-episodes.ts:121` (`copyFile` helper) | `.copy()` current mix → backup dir | n/a | **F3** | Only `.copy()` in repo (call site :250). Same gaps as #9: no checksum compare of backup vs source |

**Site count: 10 spec-listed sites, all found and confirmed.**

---

## Per-site notes

### 1. `lib/assembleAndVerifyFinalMix.ts:754` — F1 + F3
Uploads the assembled final mix to `asc3/<FOLDER>/<outputFilename>` with `upsert:true`, `cacheControl:'0'`. Runs *after* the sting gate passes, so signal-content is validated — but storage integrity is not: no sha256, no size check, no journal row. A partial write with `error:null` (the SDK behavior core.ts's own comment warns about) would leave a corrupt live object. **Fix direction:** route through `putObject` with content hash; verify by bytes, not by gate-pass.

*Bonus, same file:* `:308` uploads the scan report with `upsert:false` and versioned names (`scan-report-v<N>.json`) — append-only, good pattern — but failure is only `console.warn`. Report loss is non-fatal; note for the sweeper design, not P0.

### 2. `lib/personalizedFinalMix.ts:242` — F1 (low)
Opener-clip upload to deterministic key `personalized-openers/<hash>/<name>/<openerId>.mp3`, `upsert:true`, long cache (`31536000`). Clobber only matters if template text changed while the key stayed the same — same-shape input reproduces same bytes, so this is near-idempotent already. **Fix direction:** Phase 1 wrap in `putObject`; key derivation can stay.

### 3. `lib/personalizedFinalMix.ts:333` — F1 + F5
Personalized final-mix upload, `upsert:true`, same long cache. No idempotency key on the render path: re-running the same `(storyId, userId, preferredName)` re-renders TTS + re-uploads even when nothing changed (contrast with the `renderOrReuse` opener check at :232 and the `cached` fast-path — the mix itself has no reuse check visible at this site). Double-spend + clobber. **Fix direction:** deterministic idempotency key `sha256(storyId, userId, nameHash, openerId)` + reuse check before render.

### 4. `generate-voices/route.ts:3397` — F2 (mitigated)
`HOOK-GATE-STALE-001` purge: removes all existing segments when `purgeExisting=true`, then refreshes the listing so the inventory regenerates everything. Two mitigations present: (a) purge failure returns 500 *before* any regen, (b) it's caller-gated, not default. Residual risk is the crash window between purge and regen completion — no journal, so resume can't distinguish "purged, regen pending" from "never had segments." **Fix direction:** journal the purge as an op with the regen as its completion; or invert to render-to-staging-then-swap (spec §4.3).

### 5. `generate-voices/route.ts:3596` — F2 (unmitigated)
Stale-segment delete in the Belle-regen path (`deleteAudioError` → 500). Unlike #4, there is no caller gate — this purge runs unconditionally on this path. Same crash window, wider trigger surface. **Fix direction:** same as #4; consider whether this path actually needs a purge at all vs. overwrite-by-regen.

### 6 & 7. `generate-voices/route.ts:3467, :3652` — F1 (minimal)
Silence-buffer uploads for beat/pause lines in two parallel code paths (retry-missing loop vs. full-regen loop). `generateSilenceBuffer(duration)` is deterministic, so `upsert:true` clobber rewrites identical bytes. These are the cheapest `putObject` conversions in the file — include for completeness, prioritize last.

### 8. `generate-voices/route.ts:3673` — F1 (low)
Locked-SFX restore upload: buffer comes from `restoreLockedSfxCue`, which is hash-checked upstream (ATL-SFX-WIRE-001 Rule 3 hard-stops on mismatch). Content is therefore trustworthy; the gap is purely operational — no journal row, no idempotency key, so duplicate delivery re-uploads. **Fix direction:** journal only.

### 9. `scripts/rerecord-episodes.ts:116` (`moveFile`) — F3
The repo's only `.move()`. Helper throws `BatchStop` on error (fail-loud, good). Call sites: `:251` (old voice files → `_backup_rr_<stamp>`) and `:274` (failing segments → touch-up dir). Never deletes user data outright — destination is always a backup dir. Gaps: (a) Supabase move is copy+delete, non-atomic — a mid-move crash can leave the file in both places or neither, and resume logic (via `/tmp/rerecord-episodes-state.json`) doesn't verify backup integrity; (b) no sha/size compare after move. **Fix direction:** `moveObject` per spec §4.2 (copy → verify → delete source), with the existing state file as the resume pointer.

### 10. `scripts/rerecord-episodes.ts:121` (`copyFile`) — F3
The repo's only `.copy()`. Call site `:250` backs up `MIX_FILES` before any mutation — the safety net for the whole script. Same gaps as #9 minus the delete half: if the backup copy itself is partial/corrupt, the script proceeds believing it has a good backup. **Fix direction:** verify backup copies by size (min) / hash (preferred) before proceeding past step A.

*Adjacent, same file:* `:125` (`removeFiles`, call site `:252`) deletes only `qcskip` marker files — intentionally ephemeral, correctly scoped. No action needed; recorded here so the review doesn't re-flag it.

---

## Cross-cutting observations (for Lyra / HAL-PIPE-002 hardening)

1. **The silence-buffer duplicates (#6, #7) and the locked-SFX restore (#8) prove deterministic-content writes already exist** — they just lack the journal wrapper. These three are the lowest-risk `putObject` pilots: identical bytes in, no behavior change, immediate F5 coverage.
2. **The two purge sites (#4, #5) are the only delete-before-regen left outside `recast-character.js:389`.** #4 is gated, #5 is not — if sequencing forces a choice, harden #5 first.
3. **HAL-PIPE-002 hardening implication:** `rerecord-episodes.ts` step A (copy+move backup) is the natural place for a verified-backup gate — assert all `MIX_FILES` backups exist with matching sizes before allowing step C (voice regen) to proceed. Currently nothing checks.
4. **No new §10 questions raised.** Conflict/retention/eviction semantics are untouched by this survey.

---

## Verification

Each site confirmed by direct read on 2026-10-03 @ `b6044067`:
`sed -n` spot-checks on all 10 lines + `grep -n "upload(|\.remove(|\.move(|\.copy("` sweeps of both `lib/` files and the `:3440–3700` window of `generate-voices/route.ts`, plus `moveFile/copyFile/removeFiles` call-site grep in `rerecord-episodes.ts`.
