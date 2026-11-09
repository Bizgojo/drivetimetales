# CANON-07 — Music & Final Mix
Status: DRAFT for Marc's approval · Nov 9, 2026 · Owner: Marc
Covers: the six mix channels from Marc's drawing, the sting, music levels, fades and timing, music under backgrounds and under Belle's outro, voice levels inside the mix, the music source, the final export, and how mix changes are tested. Does not cover: which sounds play and when (CANON-06 Sound Effects); what Belle says (Belle writing canon); script writing; voices and casting; publishing; the player (docs/PLAYER-RULES.md).

## Marc's channel drawing (Nov 1, 2026)
Marc drew six channels on Nov 1, 2026 (chat "Clearing CEO series flag"). Claude redrew it as "Episode mix: your plan vs. today". Marc corrected it the same day: no closing sting, the background channel is only a soft undertone, the music fades smoothly into the story, follows tension, crescendos, and fades to 0 three seconds after the outro. That version was built as MIX-V3-001 and MIX-V4-001 and is live.

```
TIME ->            INTRO           | STORY BODY                                  | OUTRO
-------------------------------------------------------------------------------------------------
1 STING            ###\__          |                                             |  (no closing sting)
2 BELLE              [ intro ]     |                                             | [ outro ]
3 MUSIC            (none) ..../^^\_|_ ___--__--___---___--^^^/^^\                |\___________\__ 0
                          swell    | fade   bed follows tension   crescendo swell| soft bed   3 s fade
4 STORY (Hal/Claude)               |[====== one continuous story ======]         |
5 SFX SPOT                         |   |    |     |   ||   |  ||                 |
6 SFX BACKGROUND                   |      /~~\         /~~\          /~~\        |
                                   |   short soft scene-setters, own track       |
```

| Channel | Intro | Story body | Outro |
|---|---|---|---|
| 1 Sting | Plays once at the very start (gain 1.75). Fades as Belle starts. | Never | Never |
| 2 Belle | Intro line. No music under it. | — | Outro, soft music under it |
| 3 Music | Silent under Belle's intro. 2.5 s alone before the first line: fade in 1 s, swell, fade to the bed by 1.5 s into the first line. | Bed 0.10–0.20, follows tension; dips under backgrounds; crescendo at the end; swell after the last line. | Drops to 0.13 in 1 s, holds under Belle, fades to 0 over 3 s after her. |
| 4 Story | — | One continuous story; only short beats after reaction sounds | — |
| 5 SFX spot | — | On the word, under the voice (CANON-06) | — |
| 6 SFX background | — | ~10 s soft scene-setters (CANON-06) | — |

## Rules

### A. Order and the sting
1. Every episode runs: sting, Belle's intro, story, Belle's outro. — **Agreed** (STING-001, Canon Registry Aug 28; PLAYER-RULES #2, Marc Nov 8)
2. The sting plays exactly once, at the very start, before Belle's first line. Never before the outro, never mid-story. There is no closing sting. — **Agreed** (STING-001 Aug 28; Marc Nov 1: "no sting at the end")
3. The sting file is audio/sting/ET_Signature_Sting_v7.mp3.mp3, played at gain 1.75. — **Agreed** (MUSIC-002, Canon Registry Aug 31, as cited in core.ts); file **In force (code)**
4. Belle starts 1.5 seconds into the sting. The sting fades out over 1.2 seconds from that point. — **Agreed** (Bible/MIX_SPEC.md, Marc canon Aug 24: BELLE_ENTER_SEC 1.5, STING_FADE_DUR 1.2) — see C3 and Q1
5. No music plays under Belle's intro. — **Agreed** (MIX_SPEC.md Aug 24: "NO music bed under narration"; MUSIC-002)
6. There are 0.75 seconds of silence between the intro block and the story body. — **Agreed** (MIX_SPEC.md Aug 24, SILENCE_PRE_STORY)

### B. Music into and through the story
7. The music plays alone for 2.5 seconds before the first story line. It fades in over 1.0 second to the swell level (1.30) and holds. — **Agreed** (MIX_SPEC.md 2.5 s pre-roll; MIX-V3-001, Marc's drawing, approved Nov 1); numbers **In force (code)** lib/mixV3.ts
8. The music never drops suddenly when the story starts. From 1.2 seconds into the pre-roll it fades down to the bed, finishing 1.5 seconds into the first line. — **Agreed** (Marc Nov 1: "does not abruptly quit after the story starts … but fades smoothly"); numbers **In force (code)** lib/mixV3.ts
9. One continuous piece of music plays under the whole story. It never restarts from 0:00. — **Agreed** (MIX-V3-001, approved Nov 1)
10. The music under the story follows its tension. Claude rates each stretch 1 to 5 at mix time (usually 3–8 marks, at most 14). Levels: 1 = 0.10, 2 = 0.12, 3 = 0.14, 4 = 0.17, 5 = 0.20. Changes ramp over 5 seconds. — **Agreed** (Marc Nov 1: "fluctuate in volume based on the tension"; MIX-V4-001 approved live Nov 1); numbers **In force (code)** lib/mixPlan.ts, lib/mixV3.ts
11. The music always stays under the voices. — **Agreed** (MIX-V4-001 plan Marc approved, Nov 1)
12. If Claude's tension plan fails, the mix still runs with a flat bed at 0.13. — **Agreed** (MIX-V4-001, Nov 1); **In force (code)** lib/mixPlan.ts
13. The music builds (crescendo) through the last 25 percent of the story, at most the last 45 seconds, to at least 0.22 at the last line. — **Agreed** (Marc Nov 1: "crescendo at the end"); numbers **In force (code)** lib/mixV3.ts
14. After the last line the music swells to 1.30 over 1 second and holds 1 second. — **Agreed** (MIX-V3-001 / MUSIC-002 swell 1.30); **In force (code)**
15. While a background sound plays, the music fades down to one tenth of its level over 3 seconds, then back up over 3 seconds after it. Close backgrounds (under 6 seconds apart) are joined so the music does not pump. This never changes the end swell. — **Agreed** (MUSIC-UNDER-BG-001, Marc Nov 2: "the music should go very quiet or silent but not abruptly"); numbers **In force (code)** lib/mixV3.ts `bedDuckEnvelope`

### C. Belle's outro
16. There is no silence between the story and the outro. The same music runs on from where the story music stopped. — **Agreed** (MIX_SPEC.md Aug 25: "Music transitions continuously from the story body into the outro"; MIX-V3-001)
17. The music drops from the swell to 0.13 in 1 second, before Belle speaks. It holds at 0.13 under her whole outro. — **Agreed** (Marc Nov 1: "scales down under the outro"); numbers **In force (code)** lib/mixV3.ts `outroMusicEnvelope`
18. After Belle's last word the music fades evenly to 0 over exactly 3 seconds. Then the episode ends. — **Agreed** (Marc Nov 1: "goes 3 seconds after the outro as it fades to 0")
19. There is no gap between Belle's outro and the personalization statement. — **Agreed** (PLAYER-RULES #9, Marc Nov 8)

### D. No dead air and safety checks
20. The last 10 seconds of the final mix must not be silent. If the loudest point there is under −60 dB, the render fails and nothing is uploaded. — **In force (code)** (core.ts post-render check; OUTRO-MUSIC-WRAP-001 fixed a 20-second dead-air bug)
21. Belle's outro must stay audible to the end. If its loudest point is under −35 dB, the render fails. — **In force (code)** (core.ts)
22. A final mix shorter than 60 seconds fails. — **In force (code)** (core.ts)
23. Every voice line ends with at least 0.3 seconds of quiet before the next line, so no line sounds cut off. — **Agreed** (ORION-MIX-TRAILPAD-001, Marc merge word Jul 15); **In force (code)** core.ts
24. Gaps in the story come only from the script's [BEAT] and [PAUSE] marks, scene breaks, and the short beat after a reaction sound (CANON-06). — **Proposed** (states the current behavior as a rule)

### E. Voices inside the mix
25. Belle's voice sits at 1.5 times the level of the story's other voices. — **Agreed** (BELLE-008, Canon Registry Aug 29) — not applied in code today, see Enforcement
26. Each character gets one fixed loudness change so all characters match. Only speakers more than 1.5 dB off are changed; at most +9 dB up or −6 dB down; peaks never above −1 dB. — **Agreed** (VOICE-LEVEL-001, Marc Nov 2: "make sure that all the voices have a volume loud enough to hear"); numbers **In force (code)** lib/voiceLevel.ts
27. Any story voice line measured below −28 LUFS stops the render for a re-record. It is never boosted. — **Agreed** (LOUDNESS-001, Canon Registry Sep 7)
28. The story body (voices and sounds) is levelled in one pass to −16 LUFS, true peak −1.5 dB. Belle's intro and outro are not levelled, only resampled. — **In force (code)** (core.ts `loudnorm=I=-16:TP=-1.5:LRA=11`)
29. The intro, story and outro are matched in loudness: no section more than 2 LU louder or quieter than the story body. — **Proposed** (no check exists; the intro and story mixes may be halved by the mixer while the outro is not, see Q4)

### F. Music source
30. Every story has its own music file (background_music.mp3), made from the script's SUNO PROMPT (2–3 sentences: genre, instruments, tempo, mood) through Kie.ai (Suno). — **Agreed** (STAGE2 v2.3, Marc approved June 10; Marc understands music comes from Kie, memory audio-pipeline.md)
31. If a story has no music file, the final mix stops. It never mixes without music. — **In force (code)** (core.ts "Missing story-specific background_music.mp3")
32. Music is made at most 3 times per story or episode. After that the story is flagged for attention; only Marc can re-queue it. — **In force (code)** (MUSIC-CAP-001, run-next/route.ts)
33. The music starts at a strong point in the track, not always at 0:00. — **In force (code)** (core.ts `findStrongMusicOffset`)
34. audio/intro_outro_music.mp3 never plays under Belle's intro or outro. — **Agreed** (MIX_SPEC.md, Marc canon Aug 24)
35. Only music Endless Tales has commercial rights to may be used, and its source is recorded for each story. — **Proposed** (no licence record found for Kie/Suno output or the shared music library in lib/music-library.json)

### G. Export
36. The final mix is MP3, 192 kbps, 44.1 kHz, stereo. — **In force (code)** (core.ts)
37. Each render writes final_mix.mp3, story_body.mp3, story_body_with_outro.mp3 and outro_with_music.mp3 to asc3/<story_id>/. — **In force (code)** (core.ts)
38. After every re-mix, the stored links get a new version (?v=<render time>), so phones fetch the new mix and personalized mixes rebuild. — **Agreed** (MIX-VERSION-001, Marc Nov 7, Rerouted EP1)

### H. Testing and changing the mix
39. Every mix change goes behind an on/off switch. A test copy goes to a preview folder. Marc listens before it goes live. If it goes wrong, the switch goes off. — **Agreed** (two-stage mix plan Marc approved Nov 1; MIX_SPEC.md listen-approval rule, Aug 21)
40. MIX_V3=on and MIX_V4=on stay on in production. — **Agreed** (Marc approved Stage 1 and "Proceed with stage 2", Nov 1)
41. A mix-only test reuses the published sound plan, so only the mix changes. — **In force (code)** (core.ts `mixOnly`)
42. If a mix problem happens once, fix that mix. If it happens in 2 or more stories, change the rule. — **Agreed** (docs/MIX_NOTE_PROTOCOL.md v1.0, owner Marc)
43. No corrected episode replaces a published final_mix.mp3 until Marc listens and approves. — **Agreed** (MIX_SPEC.md, Marc Aug 21) — see Q5

## Conflicts found
- C1. Bible/MIX_SPEC.md (Aug 24–25) and the MUSIC-002 header in core.ts give older outro numbers: music down to 0.019, then "rises to 0.50", a 2-second fade (Aug 25), and the code value set to 0 (Belle with no music). Marc's Nov 1 drawing rule is 0.13 under Belle and a 3-second fade. Recommendation: Nov 1 wins; rewrite MIX_SPEC.md and the core.ts header. Marc decides.
- C2. lib/musicBedGate.ts checks for MUSIC-002 levels (flat 0.13 bed, outro rise to 0.50). Today's mixes would fail it. It is not wired into any render. Recommendation: update it to MIX-V3/V4 shapes or retire it. Marc decides.
- C3. Four sting timings exist: core.ts (Belle at 1.5 s over the sting, 1.2 s fade), lib/personalizedFinalMix.ts (sting fades from 0.5 s, then 0.4 s silence, then the name opener), Bible/et_mix_assembly.py (sting v6, Belle at 1.2 s), and memory "sting crossfade 1200 ms". Marc's drawing showed the sting ending before Belle. Recommendation: one timing for both paths; see Q1. Marc decides.
- C4. docs/MIX_NOTE_PROTOCOL.md (April) lists levels in dB (bed −28 dB, Belle −60 dB, beats −18 dB, swell −10 dB, sound effects −6 dB under dialogue). docs/INTRO_OUTRO_* (May) and the memory note "music ducks to 15%" are also older. Recommendation: replace those tables with this document's levels. Marc decides.
- C5. STAGE2 v2.3 (June 10) lets writers use [MUSIC:OUT] / [MUSIC:IN] (music to silence and back, "to its 15% bed", at most twice). The mixer ignores these marks, so nothing happens. Recommendation: either build it (fade to 0 over 3 s, back to the tension level over 3 s) or remove it from STAGE2. Marc decides.
- C6. Bible/et_mix_assembly.py targets −14 LUFS with an old v6 sting and an old Belle voice ID. core.ts targets −16 LUFS. Recommendation: core.ts wins; mark the .py file as history. Marc decides.
- C7. Rule 43 (Marc listens before a published mix is replaced, Aug 21) conflicts with Marc's Nov 7 wish for fully autonomous production. Recommendation: see Q5.

## Open questions for Marc
- Q1. Should Belle start over the sting (1.5 s in, today's main mix), or after the sting ends (your drawing, and the personalized path)? Suggested answer: keep 1.5 s over the sting for both paths, so every listener hears the same opening.
- Q2. Which music do we have rights to? Kie/Suno output and the shared tracks in lib/music-library.json have no licence record. Suggested answer: confirm the Kie/Suno plan allows commercial streaming and ads, and record the source per story.
- Q3. Should [MUSIC:OUT] / [MUSIC:IN] work? Suggested answer: build it, at most twice per story, with 3-second fades.
- Q4. There is no loudness target for the whole episode, and no check that intro, story and outro match. Suggested answer: measure the whole final mix; target −16 LUFS (±1), true peak no higher than −1 dB, and no section more than 2 LU off the story.
- Q5. Who approves a re-mix of a published episode now that production should run without you? Suggested answer: Gemini reviews the new mix for timestamped problems; you are asked only when it flags one.
- Q6. Is BELLE-008 (Belle at 1.5x) still wanted? The code does not apply it; Belle is only resampled. Suggested answer: measure Belle against the story voices and set her about 3 dB above them.

## Enforcement status
- 1–2 → enforced in core.ts assembly order; lib/stingDetectorGate.ts checks the sting but runs only in lib/assembleAndVerifyFinalMix.ts, not in the main render.
- 3–6 → enforced: core.ts (BELLE_ENTER_SEC, STING_FADE_DUR, SILENCE_PRE_STORY). Personalized path differs (C3).
- 7–18 → enforced when MIX_V3=on and MIX_V4=on: lib/mixV3.ts, lib/mixPlan.ts, core.ts. Unit tests: __tests__/mix-v3-001.test.ts, mix-v4-001.test.ts.
- 15 → enforced unless MUSIC_BED_DUCK=off.
- 20–22 → enforced: core.ts post-render validation (blocks upload).
- 23 → enforced: core.ts MIN_TRAILING_SILENCE_SEC 0.3.
- 25 → not enforced (core.ts resamples Belle only).
- 26 → enforced unless VOICE_LEVEL=off: lib/voiceLevel.ts.
- 27 → enforced: core.ts LOUDNESS-001 (unmeasurable lines are skipped).
- 28 → enforced: core.ts.
- 29, 35 → not enforced.
- 31–33 → enforced: core.ts, run-next/route.ts.
- 36–38 → enforced: core.ts.
- 39, 42, 43 → process only.

## Sources reviewed
- Repo /tmp/dtt: app/api/asc3/render-final-mix/core.ts; lib/mixV3.ts, mixPlan.ts, sfxLayeredMix.ts, musicBedGate.ts, stingDetectorGate.ts, loudness-gate.ts, voiceLevel.ts, outroMusicClip.ts, personalizedFinalMix.ts, assembleAndVerifyFinalMix.ts, music-library.json; app/api/asc3/generate-music/route.ts; app/api/admin/production-jobs/run-next/route.ts; Bible/MIX_SPEC.md, Bible/et_mix_assembly.py, Bible/CANON_REGISTRY_STORY_RULES.md; docs/MIX_NOTE_PROTOCOL.md, INTRO_OUTRO_PRODUCTION_RULES.md, STAGE2_SCRIPT_PROMPT.md, SCRIPT_VALIDATOR.md, PLAYER-RULES.md; AGENTS.md; __tests__/mix-*.test.ts. Git history is shallow (18 commits), so commit messages gave nothing.
- Memory: /projects/01a177ad-…/areas/audio-pipeline.md, player-rules.md, story-pipeline.md; /areas/audio-pipeline.md.
- Chats: "Clearing CEO series flag" (Nov 1–2: the drawing, Marc's 4-point reply, Stage 1 and Stage 2 approvals, SFX off); "Cover story map pattern" (Nov 7).
- The drawing itself: Marc's photo is not stored anywhere I could reach. Claude's redraw is the artifact "Episode mix: your plan vs. today" (claude.ai/artifact/QcCPFB47GnhteKZ2NzMAhh, file reports/mix-lanes.html in that session). The table above is rebuilt from Claude's reading of it and Marc's corrections.
- Project docs: the Projects tool was not available to me.

## Replaces (once approved)
- Bible/MIX_SPEC.md (Aug 24–25), MUSIC-002 values (Aug 31), ATL-PIPE-007 "Production Standard v2" outro (June 10).
- Bible/et_mix_assembly.py ("ET Mix Spec v2.3.67").
- docs/MIX_NOTE_PROTOCOL.md "Quick reference — mix level standards" table (the process steps stay).
- docs/INTRO_OUTRO_PRODUCTION_RULES.md and docs/INTRO_OUTRO_BIBLE.md mix parts.
- STAGE2 "[MUSIC:IN] returns to its 15% bed" wording.
