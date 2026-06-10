# PERSONALIZATION & ANCHOR SFX — IMPLEMENTATION SPEC
**Version 1.0 · June 10, 2026 · Endless Tales**
**Decisions locked by Marc:** one Belle B intro line · anchor SFX 3–6 per story · server-side pre-stitch · Belle voice = GMhgX8fCR9GUtd3kmlKC (improved May 2026 voice — name clips and intro parts MUST be rendered in this voice)

This document covers the build work. The rules live in PUBLISHED_STORY_SPEC v1.5, STAGE2_SCRIPT_PROMPT v2.2, and SCRIPT_VALIDATOR v1.1.

---

# PART A — BELLE B NAME STITCH

## A1. Database (requires Marc's explicit approval before any Supabase change — test localhost first)

**New table: `belle_name_audio`** (shared name clip cache — one row per unique first name, not per user)

| Column | Type | Notes |
|---|---|---|
| name_text | text PK | lowercase, trimmed first name |
| audio_url | text | Supabase storage path to name clip |
| duration_ms | int4 | |
| status | text | 'ready' / 'failed' / 'blocked' |
| created_at | timestamp | |

**New table: `story_intro_assets`** (per-story intro renders)

| Column | Type | Notes |
|---|---|---|
| story_id | uuid PK/FK | |
| part_a_url | text | intro audio before [LISTENER_NAME] |
| part_b_url | text | intro audio after [LISTENER_NAME] |
| noname_url | text | full no-name render (fallback + default) |
| name_position | text | 'start' / 'mid' / 'end' |

**New table: `user_intro_stitch_cache`** (per user × story stitched intro — same pattern as the news `user_intro_cache`)

| Column | Type | Notes |
|---|---|---|
| user_id | uuid | composite PK with story_id |
| story_id | uuid | |
| audio_url | text | stitched intro mp3 |
| created_at | timestamp | |

## A2. Name eligibility rules (fallback to no-name render when ANY fail)
- 2–20 characters after trim
- Letters, hyphens, apostrophes only (covers Mary-Anne, O'Brien)
- Not in a small blocklist (profanity, "admin", "test", obvious non-names)
- ElevenLabs render succeeded and clip is 200ms–2500ms
- No retry loops on failure — mark status 'failed' once and fall back forever until manually cleared

## A3. Render flow — name clips
Trigger: first play by any subscriber whose lowercase first name has no `belle_name_audio` row.
1. Validate per A2 → if fail, write status 'blocked', serve no-name.
2. ElevenLabs TTS: voice `GMhgX8fCR9GUtd3kmlKC`, stability 0.49, similarity 0.51, style 0.0, speaker_boost true, speed 1.0, model eleven_multilingual_v2. Input text: the name with a trailing comma (renders more natural prosody at a pause boundary) — trim trailing silence after.
3. Loudness-normalize to match Belle B intro renders (EBU R128, same target as intro parts).
4. Upload to storage, insert row status 'ready'.
Cost note: name clips are ~1 second and shared across every subscriber with that name — a few hundred names covers the overwhelming majority of US subscribers, total cost is pocket change.

## A4. Render flow — per-story intro parts (added to generate-voices step)
1. Script intro line contains `[LISTENER_NAME]` once at a prosodic pause (validator-enforced).
2. Render THREE intro assets: Part A (text before placeholder), Part B (text after placeholder), and the full no-name line (placeholder + an adjacent comma/space removed, line must read naturally — validator enforces graceful-without-name).
3. If the placeholder is the first word, Part A is the sting-tail silence only — store part_a_url null and name_position 'start'.
4. final_mix is built with the NO-NAME intro. Named intros are stitched per listener at play time — the story body is never re-mixed.

## A5. Stitch-at-first-play flow (server-side)
~~~
GET /api/play-intro?storyId=...
1. cache hit in user_intro_stitch_cache → return audio_url            (instant)
2. belle_name_audio ready for user's first name?
     no  → return story_intro_assets.noname_url                       (instant, also cache as user's answer)
     yes → ffmpeg: partA ⨝ name ⨝ partB, acrossfade 30–40ms per seam,
            loudness-touch, upload, insert cache row, return url
3. any error anywhere → noname_url. Silent fallback. Never block playback.
~~~
Player change: the player requests the intro URL from this endpoint, then plays intro → final story file (or the pipeline produces a per-user full file — simpler v1: keep intro as a separate first track in the player queue, since the 0.75s silence gap after the intro masks the track boundary).

## A6. QA gate before this ships
- Stitch test matrix: 5 names (short: "Al", long: "Christopher", hyphenated, apostrophe, and one 'blocked' case) × 2 stories. Marc listens for seam clicks/gaps on phone speaker AND car audio.
- The no-name render of every intro must sound complete, not amputated.

---

# PART B — ANCHOR SFX PIPELINE

## B1. Script side (already enforced by Stage 2 v2.3 / Validator v1.1)
3–6 `[SFX: specific concrete description]` markers, own line, natural gaps, no ambience beds.

## B2. Audio sourcing
Per marker, in order of preference:
1. **ElevenLabs sound-generation API** from the marker description (fits the existing ElevenLabs account/flow), duration cap 4 seconds.
2. Curated local library for the ~20 most common anchors (door, gunshot, phone, car, train, glass, thunder, footsteps-stop, knock, engine-start) — consistent quality, zero generation risk. Build this library over time from generated effects Marc approves.
Each effect: trim silence, loudness-normalize to the dialogue target, hard-limit peaks (no startles at highway volume).

## B3. Mix placement (render-final-mix step)
- SFX inserts at its marker position in the segment sequence, as its own timeline event between voice segments
- Pad: 250ms before, 350ms after the effect (it gets room to land)
- Music ducking: SFX is treated like voice — music stays at 15% under it (do NOT let music rise during an SFX gap)
- Never time-overlap any voice segment — if a marker would collide, the mix fails loudly rather than burying dialogue

## B4. Pilot before catalog-wide rollout
Produce TWO new stories under the full v1.3 spec (name stitch + anchor SFX). Marc grades both with the rubric, listening specifically for Dimension 4 (Audio Quality) regressions, in the car. Both pass at 18+ with no audio-dimension score below 4 → anchor SFX and name stitch are production-standard. Any ghost-voice / balance / missing-segment regression → stop, Mix Note Protocol, fix before any further SFX stories. Do not retrofit already-published stories until the pilot passes.

---

# PART C — ROLLOUT ORDER (fits the North Star: production reliability before everything)

1. **Today:** Commit the four updated documents (Spec v1.3, Stage 2 v2.3, Validator v1.1, this spec). Archive the superseded versions out of the active bible path — canonical mode applies to documents too. Update STORY_BRIEF_TEMPLATE → v2.1 (restore SFX_ENVIRONMENTS as *anchor candidates*, keep BELLE_B_INTRO field, remove the 4-variations example language).
2. **Build 1 (small):** `belle_name_audio` + intro part rendering + stitch endpoint. (Localhost first; Marc approves the Supabase migration.)
3. **Build 2 (small):** SFX insert support in render-final-mix.
4. **Pilot:** two stories, full v1.3 path, Marc grades in the car.
5. **Pass → production standard.** All new stories follow v1.3. Beta listeners start hearing their names.

---
*PERSONALIZATION_AND_SFX_IMPLEMENTATION.md — Endless Tales · v1.0 · June 2026*
