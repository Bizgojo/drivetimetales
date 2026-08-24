# Endless Tales — Audio Mix Specification

**Canon (Marc Postlewaite, Aug 24 2026)**
**Production Standard: ASC3 v2 | SUNSET-MIX-SPEC-001**

---

## Structure

1. **Intro**: ET Signature Sting (v7) → Belle B narration begins at 1.5s while sting fades → narration completes → 0.75s silence. **NO music bed under narration.**
2. **Story body**: Music pre-roll (2.5s at 65%) → continuous genre music bed (12% under dialogue) → story narration → music swell (2s, peaks at 85%) at body end.
3. **Outro**: ET Signature Sting → Belle B outro narration begins at 1.5s while sting fades → narration completes. **NO music bed under narration.**

---

## Key Constants (from core.ts)

| Constant | Value | Notes |
|---|---|---|
| `NARRATION_BED_VOL` | 0.12 | 12% under dialogue (ATL-MUSIC-BED-003, 2026-08-14) |
| `BELLE_ENTER_SEC` | 1.5 | Seconds into sting before Belle begins |
| `STING_FADE_DUR` | 1.2 | Seconds for sting to fade after Belle enters |
| `SILENCE_PRE_STORY` | 0.75 | Gap between intro block and story body |
| `MUSIC_PREROLL_SEC` | 2.5 | Music plays alone before voices begin |
| `PREROLL_VOL` | 0.65 | Music volume during pre-roll |
| `POST_STORY_VOL` | 0.85 | Music swell peak at story body end |
| `POST_STORY_TAIL` | 2.0 s | Duration of music swell after last voice line |
| `V2_DUCK_VOL` | 0.019 | Music level under outro Belle narration (v2 path) |
| `V2_DUCK_RAMP` | 0.5 s | Ramp time from swell peak to duck level |
| `V2_TAIL_FADE` | 3.0 s | Music fade to silence after Belle outro ends |
| Sting file | `audio/sting/ET_Signature_Sting_v7.mp3.mp3` | Canonical ET sting |
| Belle B voice | `GMhgX8fCR9GUtd3kmlKC` | Belle B (ElevenLabs) |

---

## Corrected File Convention (SUNSET-MIX-SPEC-001)

For episodes that have gone through the Aug 24 2026 correction pass:

| File | Purpose |
|---|---|
| `asc3/<story_id>/intro_corrected.mp3` | Canonical corrected intro: ET sting + Belle narration. NO music bed. |
| `asc3/<story_id>/outro_corrected.mp3` | Canonical corrected outro: ET sting + Belle narration. NO music bed. |

`core.ts` gives these files **absolute priority** over all other intro/outro files when they exist in storage.

**Hard fail behavior** (no silent fallback): If `intro_corrected.mp3` or `outro_corrected.mp3` appears in the storage listing for a story but fails to download, `core.ts` throws:
```
MISSING_CORRECTED_INTRO: story_id <id>
MISSING_CORRECTED_OUTRO: story_id <id>
```

---

## Common Violations — Guard Against These

### ❌ intro_outro_music.mp3 under intro/outro narration

`audio/intro_outro_music.mp3` (root bucket, March 2026) **must NEVER be laid under intro or outro narration**. It is a music bed file and may only be used for the story body section when it is genre-appropriate.

**Root cause of EP7/EP8/EP9 defect (fixed Aug 24 2026):** Correction scripts for EP7 and EP9 used `intro_outro_music.mp3` as IO stings that played simultaneously with or immediately around Belle narration, violating the "no music bed under narration" rule.

### ❌ Hardcoded segment counts

Do not hardcode segment counts in correction scripts. List from storage dynamically.

### ❌ Intro/outro files surviving after correction pass

After generating `intro_corrected.mp3`/`outro_corrected.mp3`, rename the old intro/outro files with `.stale-<date>` suffix so the pipeline cannot accidentally pick them up:
```
intro_00.1.mp3  →  intro_00.1.mp3.stale-aug24
outro_0172.mp3  →  outro_0172.mp3.stale-aug24
```

### ❌ Deploying a corrected episode without Marc's listen-approval

Per standing workflow (Marc, Aug 21 2026): **no corrected episode goes live until Marc listens to the staged version and gives explicit approval.** Never overwrite `final_mix.mp3` with a staged version without that approval.

---

## Episodes Covered by This Spec

| Episode | Story ID | Correction Date |
|---|---|---|
| EP7 "How to Be a Person" | `efbd0bcf-4ac0-4d3b-b13a-330692867b52` | Aug 24 2026 |
| EP8 "What Are You to God?" | `410d82dc-1dbd-4470-b8e8-a45f1c615597` | Aug 24 2026 |
| EP9 "Into the World" | `5d5c8539-8964-4c2f-bf3e-cc2673ce9828` | Aug 24 2026 |

---

## Assembly Diagram

```
[ET Sting v7] ─────┐
                   ├──(overlap at 1.5s)──► [Belle intro narration] ─► [0.75s silence]
[Belle enters]─────┘

[Music preroll 2.5s @ 65%] ─► [Music bed 12% under dialogue]
                                       ↕ (mixed under)
                             [Story voice segments] ─► [Music swell 2s @ 85%]

[ET Sting v7] ─────┐
                   ├──(overlap at 1.5s)──► [Belle outro narration] ─► [Music fades 3s]
[Belle enters]─────┘
```

---

*This spec supersedes any prior per-episode assembly notes that reference `intro_outro_music.mp3` for intro/outro stings.*
