# CANON-06 — Sound Effects
Status: DRAFT for Marc's approval · Nov 9, 2026 · Owner: Marc
Covers: where sound effects come from, the licence, the sound catalog, Gemini screening, the replace loop, when a sound plays, spot vs background sounds, the [SFX:] cue in scripts, what happens when a sound is missing, locked sounds, and never touching published episodes. Does not cover: music, levels of music and the final mix (CANON-07 Music & Final Mix); how writers write scenes and Belle (script-writing canon); voices; publishing; the player.

## Where Marc decides

Every rule in this document that needs Marc. **[MARC DECIDES]** = Marc approves, chooses or gives his OK. **[MARC DOES]** = something only Marc does himself (tests on his phone, listens, enters a key). The same tag marks each rule below.

- **Rule 4 [MARC DECIDES]:** Marc agreed to pay the one-time $500 API setup fee once Ron (Sound Ideas) confirms in writing that the key can search AND download, uses the…
- **Rule 5 [MARC DOES]:** Soundsnap downloads are done by Marc by hand.
- **Rule 6 [MARC DOES]:** API keys and logins are entered on the server by Marc himself. They are never pasted in chat or printed.
- **Rule 14 [MARC DECIDES]:** A discarded take never comes back. Every discard runs as a dry run first and then needs Marc's explicit word.
- **Rule 19 [MARC DOES]:** Gemini is a screen, not the final judge. Marc listens to the final test mix.
- **Rule 23 [MARC DECIDES]:** The loop may not run until the library confirms in writing that automated search-download-check is allowed, and Marc approves the code on a branch.
- **Rule 44 [MARC DECIDES]:** All sound effects stay off in every mix (SFX_OFF=on) until the professional library is in and Marc approves a test. Voices and music are not…
- **Rule 53 [MARC DECIDES]:** A published episode is re-mixed for sound only on Marc's explicit word.
- **Rule 54 [MARC DECIDES]:** The first test with the new library is one episode only (Rerouted EP1). Nothing else gets sounds until Marc approves that test.
- **Rule 55 [MARC DOES]:** When sounds are added back to published episodes, it is done one series at a time: one test episode, Marc listens, then the rest.
- **Decision 80 [MARC DECIDES]:** Once a week, Claude proposes new sound names from the "wanted" list; Marc approves the list.
- **Still open:** nothing. Every conflict and question below is RESOLVED (CANON-99 Parts 1 and 2, Nov 9, 2026).

## Rules

### A. Where sounds come from
1. Only recorded sounds from a paid professional library may play in a story. Never ElevenLabs or other AI-made sounds. Never the old kept library (Sonniss, Soundly exports). — **Agreed** (SOUNDSNAP-ONLY-001, Marc Nov 3: "I do not want to use any old sounds or ElevenLabs sounds, only Soundsnap", quoted in lib/sfxSwitch.ts; widened to Sound Ideas Nov 5, memory /projects/…/areas/audio-pipeline.md)
2. Sound Ideas (Complete Access, bought Nov 5, 2026) is the main library. Soundsnap (12-month plan, bought Nov 2, 2026) is the backup. — **Agreed** (chat "Apple App Store commission deals", Nov 5: "I want to use Sound Ideas API and we can use Soundsnap as a backup"; memory audio-pipeline.md)
3. Sound Ideas sounds come in through the SourceAudio API only. No hand downloads from Sound Ideas while the API key is pending. — **Agreed** (same chat, Nov 5: "Wait for the API")
4. **[MARC DECIDES]** Marc agreed to pay the one-time $500 API setup fee once Ron (Sound Ideas) confirms in writing that the key can search AND download, uses the 5,000-a-day limit, and has the same licence. Connecting it waits until after the Meta launch and the reliability fixes. — **Agreed** (chat "Cover story map pattern", Nov 7)
5. **[MARC DOES]** Soundsnap downloads are done by Marc by hand. — **Agreed** (memory audio-pipeline.md, Nov 2)
6. **[MARC DOES]** API keys and logins are entered on the server by Marc himself. They are never pasted in chat or printed. — **Agreed** (AGENTS.md "Agent rules (Marc, standing)"; Orion note Nov 5)
7. Library downloads run one session at a time, at a normal human pace, never in bursts. — **Agreed** (SFX-REPLACE-LOOP-001 spec, Marc approved Nov 3; Sound Ideas terms: one user at a time)
8. Library sounds are only ever mixed into finished episodes. They are never offered on their own and never used to train any AI model. — **Agreed** (Marc's licensing emails to Soundsnap and Sound Ideas, Nov 1–2; Ron's written reply Nov 2)

### B. The sound catalog
9. Claude may only use sounds from a closed catalog of fixed names. Draft v1 has 166 names. IDs start with ALL, CR, MY, WE, SF or RH; the prefix is only for sorting, so any story may use any name. — **Agreed** (SFX-CATALOG-001, Marc Oct 31; lib/sfxCatalogNames.ts)
10. Each name is marked "spot" (plays once at a moment) or "background" (a place sound). — **Agreed** (SFX-CATALOG-001; lib/sfxCatalogNames.ts)
11. Each name holds up to 3 takes. Different places in a story rotate takes. The same place gets the same take on every re-mix. — **Agreed** (Marc Oct 31, memory story-pipeline.md; SFX-ROTATE-001 Oct 30)
12. A take is used in a published mix only if it is a licensed library sound and approved. A name goes live only when it has 3 approved takes. — **Agreed** (Marc Oct 31: "3 takes he approves by ear"); threshold **In force (code)** lib/sfxCatalog.ts `liveNames()`
13. Test mixes use only licensed sounds (candidates are fine), never kept-library sounds. — **Agreed** (SFX-TEST-LICENSED-ONLY-001, Marc Nov 2; lib/sfxCatalog.ts)
14. **[MARC DECIDES]** A discarded take never comes back. Every discard runs as a dry run first and then needs Marc's explicit word. — **Agreed** (SFX-REPLACE-001 Nov 2; replace-loop spec Nov 3; Orion discard run approved by Marc Nov 3 11:48)
15. Downloaded files are filed in one folder per catalog ID (for example ALL-01/). The folder decides the name; no word guessing. — **In force (code)** (SFX-SOUNDSNAP-001, lib/sfxCatalog.ts `catalogIdFromLibraryId`)
16. A background take is kept up to 60 seconds long at ingest, so a loop is not obvious. — **In force (code)** (scripts/sfx-library-ingest.ts)
17. The catalog lives in storage as audio/sfx-library/catalog.json (library list: sfx-library/manifest.json). There are no sound tables in the database. Marc reviews sounds on the admin page /admin/sfx-library in large text. — **Agreed** (SFX-REVIEW-001, Marc Oct 30: "a list of sounds … that I can hear and approve"; app/api/admin/sfx-library/route.ts)

### C. Gemini screening and the replace loop
18. Gemini listens to every new candidate sound before it enters the catalog and marks it OK or BAD. — **Agreed** (SFX-GEMINI-CHECK-001, Marc Nov 3; scripts/sfx-gemini-check.ts)
19. **[MARC DOES]** Gemini is a screen, not the final judge. Marc listens to the final test mix. — **Agreed** (SFX-REPLACE-LOOP-001 spec, Nov 3) — see Q2
20. When Gemini marks a sound BAD, the loop downloads the next search result not tried before, and Gemini checks it again. — **Agreed** (SFX-REPLACE-LOOP-001, Marc Nov 3 11:33 ET)
21. The loop stops after 5 tries per catalog name. If nothing passes, that name gets no sound, and the cue stays silent in mixes. — **Agreed** (Marc Nov 3: "5 tries and if nothing passes do not use a SFX and move on")
22. The loop writes one report line per name: tries used (x/5), result (passed id, or NO SFX), and Gemini's reason for each BAD try. — **Agreed** (SFX-REPLACE-LOOP-001 spec)
23. **[MARC DECIDES]** The loop may not run until the library confirms in writing that automated search-download-check is allowed, and Marc approves the code on a branch. — **Agreed** (SFX-REPLACE-LOOP-001 spec "Not allowed to start until")
24. The loop runs against Sound Ideas (API) first and Soundsnap second. — **Proposed** (the Nov 3 spec names only Soundsnap; the Nov 5 decision made Sound Ideas the main library)

### D. When a sound plays
25. Motivated sound: a sound plays only when it truly happens in the scene, right now. No sound for metaphors ("like thunder"), negation, memories, plans, or thoughts inside a head. — **Agreed** (SFX-SOUNDMAP-001, Marc Oct 31; "motivated SFX", memory profile)
26. Every sound is named or reacted to by a character or the narrator, right before or right after it plays. Never only described ("The door slams." plus a slam). A sound either plays or is not mentioned. — **Agreed** (SFX-NAMED-001, Marc Oct 31; memory story-pipeline.md)
27. Every spoken line that names a sound gets a "play" or "skip" decision with a reason. Missing decisions are recorded. — **Agreed** (SFX-SOUNDMAP-001; lib/sfxSoundMap.ts)
28. There is no fixed number of sounds per episode. The story and AI decide. A safety ceiling of 40 added sounds per episode stops a runaway plan; it is never a target. — **Agreed** (SFX-NO-CAP-001, Marc Oct 31: "let the story and AI determine"); 40 **In force (code)** lib/sfxOverlay.ts
29. Action stories get many sounds (gunshots, engines, tyres, running, fights, breaking things), even where the script did not write a cue. — **Agreed** (Marc Oct 28, memory story-pipeline.md)
30. One sound per cue. At most 2 sounds on one spoken line. — **In force (code)** (lib/sfxSoundMap.ts `validateSoundMap`)
31. Every episode gets a sound report: where each sound plays, what the story asked for, which take was used, which lines were skipped and why, and which wanted sounds the catalog lacks. — **Agreed** (SFX-REPORT-001, Marc Oct 30; lib/sfxReport.ts)

### E. Spot sounds and background sounds
32. Spot and background sounds are separate tracks. The catalog decides which kind a sound is. — **Agreed** (Marc's 6-channel drawing, Nov 1; SFX-CATALOG-001)
33. A spot sound that happens inside a line plays right after the exact words named for it, using word timing. If the words are not found, it plays just before the line. — **Agreed** (SFX-WORD-001, Marc Oct 31; lib/sfxAlign.ts)
34. A spot sound never stops the story. The next line starts 0.3 seconds into the sound, and the rest of the sound drops to 0.45 of its level under the voice. — **Agreed** (MIX-V4-001, Marc approved live Nov 1); numbers **In force (code)** lib/sfxLayeredMix.ts
35. When the next line reacts to the sound (gunshot, then "Get down!"), there is a short beat of 0.6 to 1.0 seconds before the line. Claude decides which sounds get the beat. — **Agreed** (MIX-V4-001, Nov 1); numbers **In force (code)** lib/sfxLayeredMix.ts `spotGapSec`, lib/mixPlan.ts
36. A background is a short scene-setter of about 10 seconds that tells the listener where they now are. It fades in softly (2.5 seconds) and fades out. It does not run through the whole scene. — **Agreed** (BG-SCENE-SETTER-001, Marc Nov 2: "It should only be there to let the listener know where he is"); numbers **In force (code)** lib/sfxLayeredMix.ts
37. A background is a soft undertone. It is never louder than its under-voice level (0.35 gain). — **Agreed** (Marc Nov 1: "It is just a soft undertone"); 0.35 **In force (code)**
38. A background plays only when the story moves to a new place that has a sound. Never at the start of the story (not in the first 6 spoken lines of the first scene). Never the same place sound twice in a row. At least 20 spoken lines apart. — **Agreed** (Marc Nov 2: "should not start at the beginning of the story", memory audio-pipeline.md); 6 and 20 **In force (code)** lib/sfxSoundMap.ts BG-SPACING-001
39. Before mixing, each sound is set to a standard loudness: spot sounds −19 dB average, backgrounds −21 dB average, peaks no higher than −1 dB. — **In force (code)** (SFX-LEVEL-001, lib/sfxLayeredMix.ts)
40. While a background plays, the music fades down. — **Agreed**, see CANON-07 (MUSIC-UNDER-BG-001)

### F. The [SFX:] cue in scripts
41. A script marks a sound as `[SFX: <catalog name>]` on its own line, never inside a spoken line. — **Agreed** (STAGE2 v2.3, Marc approved June 10; SFX-NAMED-001 rule text, Oct 31)
42. Music is never written as an SFX cue. — **Agreed** (SCRIPT_VALIDATOR v1.2, Marc approved June 10)
43. In catalog mode the script's own cue recordings (sfx_NNNN.mp3) are never used. Each script cue is filled from the catalog by ID, or left silent and listed as "wanted". It plays just before the next spoken line. — **In force (code)** (SFX-SOUNDSNAP-001, core.ts, lib/sfxSoundMap.ts)

### G. Sounds off, missing sounds, locked sounds
44. **[MARC DECIDES]** All sound effects stay off in every mix (SFX_OFF=on) until the professional library is in and Marc approves a test. Voices and music are not affected. — **Agreed** (SFX-ALL-OFF-001, Marc Nov 1: "turn the sounds off until we have a professional library")
45. An episode mixed while sounds are off keeps its [SFX:] cues, so sounds can be added later by re-running the final mix. Voices are not re-recorded. — **Agreed** (Marc Nov 1, chat "Clearing CEO series flag")
46. A missing sound is never replaced by a near match, an old sound, or an AI sound. The moment stays silent and is listed in the report. — **Agreed** (SFX-CATALOG-001, Marc Oct 31: "he does not go to a backup, he just eliminates that sound request")
47. If a catalog take fails to download during a mix, that one sound is skipped and the mix continues. — **In force (code)** (lib/sfxOverlayRunner.ts)
48. A story marked sfx_disabled (for example The Sunset of Competition) never gets sounds. — **Agreed** (SFX-DISABLED-001, Marc Sep 23; core.ts)
49. A locked sound file is reused byte for byte. If a locked file is missing or its fingerprint (sha256) does not match the manifest, the mix stops and names the cue. It is never re-made. — **In force (code)** (SFX-ASSET-LOCK-001 Rule 3/8, `validateManifestGate` in core.ts); the rule set itself is still marked DRAFT (governance/drafts/SFX-ASSET-LOCK-001.md) — **Proposed** to declare canon, see Q6
50. Before any clear or re-run of a story with approved audio, the approved files are archived and the copy is checked; if the archive fails, nothing is cleared. — **Proposed** (SFX-ASSET-LOCK-001 Rule 13, written by Marc but still draft; not wired into the production runner, see governance/drafts/ATL-SFX-LOCK-RULE13-GAP.md)
51. A series may have a signature sound (for example the Falls Park bell) that every episode uses as the identical file. — **Proposed** (SFX-ASSET-LOCK-001 Rule 7, draft)

### H. Published episodes
52. Sound tests, discards, catalog builds and the replace loop never touch a published episode. Test mixes go only to asc3/<id>/preview/<tag>/. — **Agreed** (SFX-REPLACE-LOOP-001 spec "Never touch a published episode"; SFX-PREVIEW-001)
53. **[MARC DECIDES]** A published episode is re-mixed for sound only on Marc's explicit word. — **Agreed** (Marc Nov 1: "Quiet the stories with the bad sounds"; MIX_SPEC.md listen-approval rule, Aug 21)
54. **[MARC DECIDES]** The first test with the new library is one episode only (Rerouted EP1). Nothing else gets sounds until Marc approves that test. — **Agreed** (Orion note, Marc Nov 5)
55. **[MARC DOES]** When sounds are added back to published episodes, it is done one series at a time: one test episode, Marc listens, then the rest. — **Proposed** (Marc wants old stories reprocessed with sounds, Nov 7; no method agreed)

## Marc's decisions (Nov 9, 2026)

Marc answered CANON-99 on Nov 9, 2026. These decisions are **Agreed** and override any rule above that says otherwise. Each conflict or question below that they settle is marked RESOLVED.

- **Decision 35:** **Sound library.** Decided: Sound Ideas is the main library and Soundsnap the backup; the $169 Soundsnap upgrade is not bought; remove the old ElevenLabs sound-effect fallback. (06 C2, C3, C5) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 36:** **When sounds come back on** (off since Nov 1). Decided: after Sound Ideas is connected and screened and you approve one Rerouted test mix. (06 Q1) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 37:** **Who approves a sound.** Decided: a Gemini pass is enough; you listen to one test mix per new batch. (06 C6, Q2) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 38:** **Background sounds.** Decided: about 10-second scene-setters only; retire whole-scene beds. (06 C4) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 39:** **Rights in ads.** Decided: no library sounds or music in paid ads until the license is confirmed in writing; record each story's music source. (06 Q3, 07 Q2) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 68:** The old sound rules in the writer documents (3–6 anchor sounds, no beds, sounds 6 dB under voices) are removed; the sound and mix canons own sound. (03 C12, 06 C1, 06 C7) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 79:** A sound name may go live with 1 approved take; takes rotate once 3 exist. (06 Q4) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 80:** Once a week, Claude proposes new sound names from the "wanted" list; Marc approves the list. (06 Q5) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 81:** SFX-ASSET-LOCK becomes canon for voice locking and the manifest check. (06 Q6) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 82:** Each series' signature sound (like the Falls Park bell) is one catalog name, used by every episode. (06 Q7) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)

## Conflicts found
- C1. **[RESOLVED by decision 68, Marc Nov 9, 2026]** STAGE2_SCRIPT_PROMPT v2.3 and SCRIPT_VALIDATOR v1.2 (June 10) say 3–6 "anchor" sounds per story, fail above 8, "no continuous ambience beds", sounds only in a gap and never under speech. Marc's Oct 31 (no cap), Nov 1 (spot sounds under the voice, background track) and Nov 2 (short background scene-setters) decisions say otherwise. Recommendation: the Nov rules win; update STAGE2 and the validator in the script-writing canon. Marc decides.
- C2. **[RESOLVED by decision 35, Marc Nov 9, 2026]** Code rule SOUNDSNAP-ONLY-001 (Nov 3) and lib/sfxSwitch.ts say "only Soundsnap". Marc's Nov 5 decision makes Sound Ideas main and Soundsnap backup. The code has no Sound Ideas path yet. Recommendation: rename the rule to "licensed library only" and add Sound Ideas as a licensed source. Marc decides.
- C3. **[RESOLVED by decision 35, Marc Nov 9, 2026]** Memory (Nov 3) says Marc said yes to Soundsnap's $169 multi-device upgrade. The Nov 5 chat summary says he declined it and Claude advised "let the Soundsnap upgrade go". The replace loop (Nov 3) needs that upgrade. Recommendation: treat the upgrade as not bought; the loop runs on Sound Ideas. Marc confirms.
- C4. **[RESOLVED by decision 38, Marc Nov 9, 2026]** SFX-BED-SCENE-001 / SFX_V2 (Oct 31) let a background last its whole scene (up to 240 s). BG-SCENE-SETTER-001 (Nov 2) makes it about 10 s. Code applies 10 s only in catalog mode. Recommendation: Nov 2 wins everywhere; retire the whole-scene option. Marc decides.
- C5. **[RESOLVED by decision 35, Marc Nov 9, 2026]** Old code paths still contain an ElevenLabs fallback (lib/sfxLibrary.ts, lib/sfxGenerate.ts, SFX-LIBRARY-001 Oct 29). They are blocked only by the switch SFX_SOUNDSNAP_ONLY (default on; "off" brings them back). Recommendation: remove the fallback so rule 1 cannot be switched off by accident. Marc decides.
- C6. **[RESOLVED by decision 37, Marc Nov 9, 2026]** Marc wanted to approve each take by ear (Oct 31). Later he set up Gemini screening (Nov 3) and on Nov 7 asked to be left out of production. Recommendation: see Q2.
- C7. **[RESOLVED by decision 68, Marc Nov 9, 2026]** MIX_NOTE_PROTOCOL v1.0 (April) says sound effects sit 6 dB under dialogue. SFX-LEVEL-001 sets spot sounds at about the same average level as voices (−19 dB vs about −20 dB). Recommendation: SFX-LEVEL-001 wins; update the protocol table (see CANON-07). Marc decides.

## Open questions for Marc
- Q1. **[RESOLVED by decision 36, Marc Nov 9, 2026]** Sounds are off for every story since Nov 1. When do they come back on? Suggested answer: when the Sound Ideas API is connected, the catalog is filled and screened, and Marc approves the Rerouted EP1 test mix.
- Q2. **[RESOLVED by decision 37, Marc Nov 9, 2026]** Who approves a take before it goes live: Marc by ear, or a Gemini pass? Suggested answer: Gemini pass is enough for a take; Marc listens to one test mix each time a new batch of names is filled.
- Q3. **[RESOLVED by decision 39, Marc Nov 9, 2026]** Sound Ideas never said yes to its sounds in paid Facebook/Instagram ads. Suggested answer: no library sounds in ads until Ron confirms in writing.
- Q4. **[RESOLVED by decision 79, Marc Nov 9, 2026]** Names with only 1 or 2 good takes stay silent under the 3-take rule. Suggested answer: allow a name to go live with 1 approved take; rotate once 3 exist.
- Q5. **[RESOLVED by decision 80, Marc Nov 9, 2026]** The "wanted" list shows sounds the catalog lacks. Who adds new names? Suggested answer: Claude proposes new names from repeated "wanted" entries once a week; Marc approves the list.
- Q6. **[RESOLVED by decision 81, Marc Nov 9, 2026]** SFX-ASSET-LOCK-001 is still a draft, though part of it runs in code. Declare it canon? Suggested answer: yes for voice locking (Part B) and the manifest check; for sounds, the catalog already makes picks repeatable.
- Q7. **[RESOLVED by decision 82, Marc Nov 9, 2026]** Should the Falls Park bell and other series signature sounds be catalog names? Suggested answer: yes, one catalog name per series signature, used by every episode.

## Enforcement status
- 1 → enforced: lib/sfxSwitch.ts `soundsnapOnly()` (default on), core.ts; can be switched off by env (see C5).
- 2–4 → not enforced yet (no Sound Ideas code path).
- 9–13 → enforced: lib/sfxCatalog.ts, lib/sfxCatalogNames.ts, lib/sfxOverlayRunner.ts.
- 14 → partly: discardTakes in lib/sfxCatalog.ts; the Marc-word step is process only.
- 18 → script exists (scripts/sfx-gemini-check.ts); run by hand, not a gate.
- 20–24 → not built (spec only).
- 25–28, 30 → enforced in the planner prompt and validator: lib/sfxSoundMap.ts, lib/sfxOverlay.ts. 26 writer rule only when SFX_WRITER_RULE=on or SFX_V2=on.
- 31 → enforced: lib/sfxReport.ts.
- 33–39 → enforced: lib/sfxLayeredMix.ts, lib/mixPlan.ts, lib/sfxSoundMap.ts (only when SFX_LAYERED_MIX=on and the catalog planner runs).
- 44 → enforced by env SFX_OFF=on (server .env.local).
- 46 → enforced: lib/sfxSoundMap.ts, lib/sfxOverlayRunner.ts.
- 48 → enforced: core.ts (stories.sfx_disabled).
- 49 → enforced: core.ts `validateManifestGate`.
- 50 → not enforced in the production runner (ATL-SFX-LOCK-RULE13-GAP).
- 52 → enforced for previews (core.ts SFX-PREVIEW-001); process only for other tools.

## Sources reviewed
- Repo /tmp/dtt: lib/sfxSwitch.ts, sfxCatalog.ts, sfxCatalogNames.ts, sfxSoundMap.ts, sfxOverlay.ts, sfxOverlayRunner.ts, sfxLayeredMix.ts, sfxLibrary.ts, sfxPrefilter.ts, sfxReport.ts, sfxAlign.ts, sfxGenerate.ts, sfxAssetLock.ts, mixPlan.ts; app/api/asc3/render-final-mix/core.ts; app/api/admin/sfx-library/route.ts; app/admin/sfx-library/page.tsx; scripts/sfx-gemini-check.ts, sfx-library-ingest.ts, sfx-catalog-build.ts, sfx-preview.ts; supabase/migrations/20260914120000_add_sfx_disabled_and_corrections.sql; governance/drafts/SFX-ASSET-LOCK-001.md, ATL-SFX-LOCK-RULE13-GAP.md; docs/STAGE2_SCRIPT_PROMPT.md, docs/SCRIPT_VALIDATOR.md, docs/MIX_NOTE_PROTOCOL.md, Bible/ET_Story_Rules_v3_2_CANONICAL.md, Bible/MIX_SPEC.md, AGENTS.md. Git history is shallow (18 commits), so commit messages gave nothing.
- Memory: /projects/01a177ad-…/areas/audio-pipeline.md, story-pipeline.md, business-expenses.md; /areas/audio-pipeline.md, /areas/story-pipeline.md, /profile.md.
- Chats: "Clearing CEO series flag" (Oct 31–Nov 2), "Gemini sound replacement loop" (Nov 3–5), "Apple App Store commission deals" (Nov 5), "Cover story map pattern" (Nov 7).
- Project docs (claude/sfx-replace-loop-spec.md, claude/soundsnap-download-lower-wacker.md, claude/orion-gemini-library-check-2026-11-03.md, chat-summary-soundsnap-setup): the Projects tool was not available to me. The replace-loop spec text was read from the chat where it was written; the other two were not read directly.

## Replaces (once approved)
- STAGE2_SCRIPT_PROMPT v2.3 "Anchor SFX" section and SCRIPT_VALIDATOR v1.2 SFX count/ambience checks (sound parts only).
- SFX-LIBRARY-001 (Oct 29) library-then-ElevenLabs flow; ATL-SFX-001 ElevenLabs generation rules.
- SFX-BED-SCENE-001 / SFX_V2 whole-scene backgrounds.
- claude/sfx-replace-loop-spec.md (folded into rules 20–24).
- docs/PERSONALIZATION_AND_SFX_IMPLEMENTATION.md (SFX parts).
