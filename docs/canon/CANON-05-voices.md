# CANON-05 — Voices & Voice Generation
Status: DRAFT for Marc's approval · Nov 9, 2026 · Owner: Marc
Covers: Belle's voice, narrators, character casting, voice reuse, recasting, the checks at the voice step, ElevenLabs credits, and when audio must be re-made. Does not cover: what Belle says (CANON-04), how scripts are written (writer canon), voice loudness, EQ and mixing (sound/mixing canon), the gate order (CANON-08).

## Rules

### A. Belle's voice
1. Belle's voice is ElevenLabs voice GMhgX8fCR9GUtd3kmlKC, settings: stability 0.49, similarity 0.51, style 0.0, speaker boost on, speed 1.0, model eleven_multilingual_v2. No one changes or tests a substitute without Marc's separate approval. — **Agreed** (BELLE-007, Bible/CANON_REGISTRY_STORY_RULES.md, Aug 29). **In force (code)**: lib/voiceConstants.ts CANONICAL_BELLE_B_VOICE_ID; liveGreetingService.ts settings.
2. Old Belle voices wewocdDkjSLm9ZwjO7TD and KWDD3Wyq30ZF5NEL01EJ are retired and never used. — **Agreed** (PUBLISHED_STORY_SPEC.md v1.5; memory /areas/audio-pipeline.md). **In force (code)**: LEGACY_BELLE_B_VOICE_IDS (also blocks EXAVITQu4vr4xnSDxMaL).
3. Belle's voice is never used for a narrator or a character. — **Agreed** (PUBLISHED_STORY_SPEC.md v1.5). **In force (code)**: lib/castCollision.ts CAST-COLLISION-001, checked before any spend.

### B. Narrators
4. Every Endless Tales author has one assigned narrator. — **Agreed** (AGENTS.md Data rules)
5. No script is written for a narrator that is not in the voice list. — **In force (code)** WRITER-SELF-CHECK-001, run-next/route.ts
6. A series keeps Episode 1's narrator voice for every episode. — **Agreed** (PIPELINE-CANON Rule 3 Defaults: "Default narrator reference: Episode 1's locked voice")
7. In a first-person story, the narrator voice's gender matches the main character's gender. Unknown gender blocks. — **In force (code)** generate-voices/route.ts narratorGenderCheck
8. Nick Brennan always has his own voice, never a regular narrator's voice, even in first-person stories. Jack Malone's narrator voice is Nick's and is used only for Nick Brennan stories by that author. — **Agreed** (NICK-VOICE-001, Marc Oct 28 10:01 EDT; memory /projects/…/areas/story-pipeline.md Oct 28). **In force (code)**: lib/reservedTalent.ts.

### C. Casting characters
9. Marc does not approve casts. Casting is automatic, from the screened voice list, with hard checks. — **Agreed** (Marc Nov 4, replaces his Oct 29 cast-approval rule; memory story-pipeline.md and audio-pipeline.md)
10. After the first episode of each new series is voiced, Gemini listens. Only mismatches Gemini flags go to Marc. — **Agreed** (chat "Gemini sound replacement loop", Nov 4–5)
11. The voice list is one grid that scripts and casting both use: code/number, name, gender, age, accent, accent strength, tone/personality, best use, status, reserved-for, Gemini clarity and accent scores. — **Agreed** (Marc Nov 4, memory audio-pipeline.md; chat Nov 4–5)
12. Only voices with clear English. Accents are fine but never too strong to understand. No squeaky voices. — **Agreed** (Marc Nov 4)
13. The list holds hundreds of voices, not a few dozen. Keep adding more. — **Agreed** (Marc Nov 4 and Nov 7)
14. Once a voice is used, it goes to the bottom of the list. — **Agreed** (Marc Nov 4). **In force (code)**: recency rotation on last_used_at, generate-voices/route.ts.
15. A main character's voice is not reused for 30 stories or series. — **Agreed** (VOICE-REUSE-001, Marc Nov 7). **In force (code)**: lib/voiceReuseWindow.ts.
16. Main characters and narrators of ongoing series get custom-made voices that only Endless Tales can use, reserved for that series. — **Agreed** (memory audio-pipeline.md, Nov 4)
17. One voice per character for the whole story or series. A character keeps that voice under every name form (John Smith, Mr. Smith, John). — **Agreed** (memory story-pipeline.md Oct 30; CASTING-ALIAS-001 approved, memory /areas/story-pipeline.md). **In force (code)**: character_voice_assignments; series_character_roster.
18. A character's gender must match the voice's gender. Gender is read from plain words in the description (grandmother, his, boy). — **In force (code)** lib/characterGender.ts CAST-GENDER-002; lib/voiceFallbackGate.ts
19. A character's age must fit the voice. A two-band miss (old man → young voice) is not allowed. — **In force (code)** lib/castingVoiceFilter.ts CAST-BLOCK-001
20. No speaking character under 14. A 14–17 character gets a voice that truly sounds that age. No voice cloning of anyone under 18. — **Agreed** (CONTENT-002, Aug 28; MINOR-VOICE-001, memory /areas/story-pipeline.md)
21. Auto-casting never picks voices made for other jobs: social clips, ASMR, sleep, meditation, customer service, phone systems, assistants, tutorials, cartoon/novelty voices, or voices labeled in another language. — **Agreed** (CAST-BLOCK-001, Marc Oct 28). **In force (code)**: lib/castingVoiceFilter.ts (CAST-VOICE-FIT-001).
22. If no voice matches a character's accent, casting stops and says so. It never picks a random voice. — **In force (code)** lib/voiceFallbackGate.ts VOICE-FALLBACK-001
23. Every speaking character is in the script's character guide with a description. A speaker missing from the guide is blocked; a missing description is auto-cast by the casting step. — **In force (code)** CAST-GUIDE-001 (lib/scriptReadiness.ts), CASTING-ALIAS-001 (generate-voices)
24. Syncing voices from ElevenLabs never undoes our own decisions about a voice. — **Agreed** (VOICE-SYNC-KEEP-001, Marc Nov 7). **In force (code)**: lib/voiceSyncKeep.ts.
25. In one story, no two speaking characters share a voice, and characters in the same scene have clearly different voices. — **Proposed** (speaker identifiability; story-clarity check 7 asks for it, but no casting check guarantees distinct voices)

### D. How text is spoken (checked at the voice step)
26. Every number in a spoken line is written as words. Digits block voicing and send the script back to the writer (up to 3 tries). "Episode 4" in Belle's lines is allowed. — **Agreed** (numbers as words, PIPELINE-CANON STORY-CLARITY "Interactions"). **In force (code)**: Gate 5, lib/numeralPreTtsScan.ts, run at voice_preflight; writer auto-fix NUMERAL-AUTOFIX-001.
27. No stage directions inside spoken lines: no [brackets] and no (whispers)/(pause)-style notes. They block voicing. — **In force (code)** generate-voices/route.ts findInlineProductionCues
28. Every story line has a speaker label. Unlabeled lines block voicing. — **In force (code)** generate-voices/route.ts
29. A scene-break line ("NARRATOR: ---") is never sent to ElevenLabs. — **In force (code)** WORDLESS-LINE-001, generate-voices/route.ts
30. Listener first names with tricky spelling use a pronunciation table (example: Sean → "shawn"). — **In force (code)** lib/personalization/nameKey.ts name_overrides
31. Writer-only rules (dashes, "That was…", speaker naming in dialogue): not checked at the voice step. They belong in the writer canon.

### E. Before spending credits
32. Every free check runs before any ElevenLabs spend: narrator, numbers, labels, stage directions, Belle lines, runtime floor (12.5 minutes estimated at 160 words per minute), cast collision. A failure spends nothing. — **In force (code)** run-next voice_preflight / series_voice_preflight; generate-voices preflight. Runtime floor **Agreed** (Marc Oct 26, memory story-pipeline.md).
33. ElevenLabs extra-usage (overage) cap: 200,000 credits. — **Agreed** (Marc Nov 5, memory audio-pipeline.md)
34. Hook series may be voiced past the monthly quota. — **Agreed** (Marc Nov 5, memory hook-series.md)
35. Credits are spent on the order of the production queue, and the 1.56 million credits expiring Nov 9, 2026 were to be used first. — **Agreed** (memory audio-pipeline.md). Expired today: see Q1.
36. Spend is recorded per call so every credit can be traced to a story. — **Proposed** (Anthropic writer calls are metered in run-next; ElevenLabs billing is recorded only on success in generate-voices; no per-story credit report found)

### F. Stale audio and re-making audio
37. If a script is edited after its voices were made, the story fails as "stale audio" and can't reach review until it is re-voiced. — **In force (code)** lib/hookGate.ts HOOK-GATE-STALE-001, check 7
38. A fresh voicing run first deletes the old voice files for that story, then checks none survived. — **In force (code)** HOOK-GATE-STALE-001 purge, generate-voices/route.ts
39. When only a Belle line was edited, that Belle line is re-recorded and the story is re-stamped as current. — **In force (code)** BELLE-ONLY-FORCE-REGEN-001, BELLE-ONLY-STAMP-001
40. Every recorded line must use the character's current voice. A line in an old voice blocks the mix. — **In force (code)** VOICE-001 and lib/voiceMapGate.ts
41. A line whose audio doesn't match its words (over 40% word error) blocks the mix and is re-recorded, up to 2 times, then the story is parked. — **In force (code)** GARBLE-001; lib/unifiedGateEngine.ts
42. A near-silent voice line (below −28 LUFS) blocks the mix and is re-recorded. — **Agreed** (LOUDNESS-001, Sep 7)
43. Recasting a character re-records only that character's lines. Nothing else is touched. — **Agreed** (VOICE-ONLY-REPAIR-001 approved, memory /areas/story-pipeline.md). Tools: scripts/recast-character.js, recast-series-character.ts, recast-published.ts.
44. An episode that has passed and locked is never re-voiced because of a later episode's problem. — **Agreed** (PIPELINE-CANON Rule 3)
45. Adding episodes to a series never re-voices the existing ones. — **Proposed** (SERIES-CONTINUATION RULE, PIPELINE-CANON, pending Marc sign-off)
46. Author-written scripts (Sunset) are never regenerated. Only episodes missing audio are voiced. — **Agreed** (memory sunset-of-competition.md, Nov 3)
47. A published story is re-voiced only with Marc's approval, and the new version is delivered as a link first. — **Agreed** (Episode Correction Loop, PIPELINE-CANON)

## Conflicts found
- C1. Cast approval. CAST-REVIEW-001 (lib/castReview.ts, Marc Oct 29: "let me listen to the voices… and approve") vs Marc Nov 4 (no longer approves casts). Code keeps it behind CAST_REVIEW, off by default. Recommendation: Nov 4 wins; retire CAST-REVIEW-001 and say so in lib/castReview.ts.
- C2. Two voice tables. The voice grid Marc asked for is narrator_voices (107 active, Nov 5). The character caster draws from character_voices (683 synced, memory /areas/audio-pipeline.md), and VOICE-FALLBACK-001 requires a voice to be in narrator_voices. Recommendation: one grid for all voices, as Marc asked on Nov 4. Marc decides.
- C3. Old reuse rule vs new. Code once excluded voices from "the last 20 stories" (never worked, per lib/voiceReuseWindow.ts). VOICE-REUSE-001 says 30. Recommendation: 30 wins; remove any remaining 20-story logic.
- C4. Custom voices vs screened library. Nov 4: custom voices for main characters/narrators of ongoing series. VOICE-REUSE-001 (Nov 7) assumes main characters come from the shared pool. Recommendation: custom voices for ongoing-series leads (reserved forever); the 30-story rule for everyone else.

## Open questions for Marc
- Q1. The 1.56 million credits expired today (Nov 9). What is the monthly credit budget from now on? Suggested answer: set a monthly cap and a stop-and-ask point at 80%.
- Q2. Character and place names that ElevenLabs mispronounces: is there a pronunciation list for story names? None found. Suggested answer: the writer adds a pronunciation hint to the character guide; the voice step uses it.
- Q3. Is Gemini's listen of each new series' Episode 1 built and running? Not found in code. Suggested answer: build it before the next new series is voiced.
- Q4. Is the "hundreds of voices" pool filled, and are the custom lead voices made for the five hook series? Unverified. Suggested answer: report the count of active, screened voices each week.
- Q5. Should a recast of a published story wait for your listen even in "direct" mode? Suggested answer: yes; a recast is a correction and follows the Episode Correction Loop.

## Enforcement status
- 1–3 → lib/voiceConstants.ts, lib/castCollision.ts (blocks before spend).
- 4 → data rule; not checked in code. 5 → run-next WRITER-SELF-CHECK-001. 6 → not built as a check (Rule 3 implementation not authorized). 7 → generate-voices. 8 → lib/reservedTalent.ts, lib/voiceEq.ts.
- 9 → code: CAST_REVIEW off by default. 10 → not found. 11–13 → partly (grid columns exist; fill level unverified). 14 → generate-voices last_used_at. 15 → lib/voiceReuseWindow.ts. 16 → not enforced in code. 17 → character_voice_assignments + series roster. 18–19, 21–22 → lib/characterGender.ts, lib/castingVoiceFilter.ts, lib/voiceFallbackGate.ts. 20 → not checked in code. 23 → lib/scriptReadiness.ts, generate-voices. 24 → lib/voiceSyncKeep.ts. 25 → not built.
- 26–30 → lib/numeralPreTtsScan.ts, generate-voices/route.ts, lib/personalization/nameKey.ts.
- 32 → run-next voice_preflight. 33–35 → ElevenLabs account settings, not code. 36 → not built.
- 37–42 → lib/hookGate.ts, generate-voices, lib/voiceMapGate.ts, GARBLE-001, LOUDNESS-001 (core.ts).
- 43 → scripts/recast-*.  44 → partly (head-of-line logic). 45 → pending. 46 → lib/authorWrittenExempt.ts. 47 → manual.

## Sources reviewed
- Repo /tmp/dtt: lib/voiceConstants.ts, lib/voiceReuseWindow.ts, lib/castingVoiceFilter.ts, lib/voiceFallbackGate.ts, lib/castCollision.ts, lib/reservedTalent.ts, lib/castReview.ts, lib/voiceSyncKeep.ts, lib/voiceMapGate.ts, lib/characterGender.ts, lib/voiceLevel.ts, lib/hookGate.ts, lib/numeralPreTtsScan.ts, lib/unifiedGateEngine.ts, lib/scriptReadiness.ts, lib/scriptRuntimeEstimate.ts, lib/personalization/nameKey.ts, app/api/admin/generate-voices/route.ts, app/api/admin/production-jobs/run-next/route.ts, Bible/CANON_REGISTRY_STORY_RULES.md, docs/PUBLISHED_STORY_SPEC.md, docs/PIPELINE-CANON.md, AGENTS.md.
- Memory: /areas/audio-pipeline.md, /projects/…/areas/audio-pipeline.md, /areas/story-pipeline.md, /projects/…/areas/story-pipeline.md, /projects/…/areas/sunset-of-competition.md, /areas/sunset-of-competition.md, /projects/…/areas/hook-series.md.
- Past chats: "Gemini sound replacement loop" (Nov 4–5 casting decisions), "Cover story map pattern" (Nov 7 voice reuse).
- NOT reviewed: Claude project docs (Projects tool not available to this auditor), e.g. claude/sunset-of-competition-cast-2026-11-03.md, claude/altar-series-bible.md.

## Replaces (once approved)
- BELLE-007 and CONTENT-002 in Bible/CANON_REGISTRY_STORY_RULES.md (move or point here).
- Voice sections of docs/PUBLISHED_STORY_SPEC.md ("Belle voice settings", voice IDs).
- lib/castReview.ts CAST-REVIEW-001 as a standing rule (becomes history).
