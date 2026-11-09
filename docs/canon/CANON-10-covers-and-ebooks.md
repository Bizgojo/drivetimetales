# CANON-10 — Covers, Images & eBooks
Status: DRAFT for Marc's approval · Nov 9, 2026 · Owner: Marc
Covers: how cover art is made, checked, remade and paid for; author and narrator photos; the eBook text (`prose_text`) that goes with every story. Does not cover: ad images and ad creative (marketing canon), when a story goes live (CANON-09), story writing (CANON-03).

## Where Marc decides

Every rule in this document that needs Marc. **[MARC DECIDES]** = Marc approves, chooses or gives his OK. **[MARC DOES]** = something only Marc does himself (tests on his phone, listens, enters a key). The same tag marks each rule below.

- **Rule 13 [MARC DECIDES]:** A cover darker than 100 out of 255 is remade once brighter. If still too dark, it is flagged for Marc.
- **Rule 20 [MARC DECIDES]:** Bulk remakes need Marc's OK on the list and the cost first.
- **Rule 27 [MARC DOES]:** Marc tops up image credits himself. No key or card number is ever sent in chat. Image spend is charged to the ET-R&D card, or ET-Marketing for ad…
- **Rule 33 [MARC DECIDES]:** Applies to new production only. Stories published before Oct 4, 2026 are not forced back. Backfill is a separate order from Marc.
- **Still open:** nothing. Every conflict and question below is RESOLVED (CANON-99 Parts 1 and 2, Nov 9, 2026).

## Rules

### A. When covers are made
1. **Every episode has its own cover** (`stories.cover_url`). — **In force (code)** (app/api/asc3/regenerate-cover/route.ts writes per story id)
2. **Cover making never blocks audio work.** Covers are made early and in parallel; a failed cover does not stop packaging. — **In force (code)** (COVER-PIPELINE-DECOUPLE-001, Marc directive Oct 8, 2026; COVER-PIPELINE-REGRESSION-20261008.md)
3. **No story goes live without a cover.** — **In force (code)** (lib/story-gates.ts and lib/publishReadiness.ts require cover_url; READY-PUBLISH-URLS-001, Marc Oct 5)
4. **A failed cover retries up to 3 times;** after 2 failures an alert is logged. — **In force (code)** (lib/cover/coverRetry.ts COVER_MAX_RETRIES = 3)

### B. What a cover shows
5. **The cover shows this story.** Its picture comes only from the story text (eBook text first, then script), the description and the brief. Never from hidden production notes such as the "STORY RESOLUTION MAP" block. — **Agreed** (COVER-STORY-OBJECT-001, PR #491 merged Nov 5 after Marc's map report; lib/coverPrompt.ts stripProductionNotes)
6. **No maps, charts, blueprints or survey papers** unless the story names a map at least twice. — **Agreed** (Marc Nov 4–5 cover-map report and remake approval; COVER-NO-KEYS-001, PR #505; lib/coverPrompt.ts)
7. **No keys, key rings or a person holding up a key** unless the story names a key at least twice. — **Agreed** (Marc Nov 6: "all the covers someone is holding a key … same problem"; COVER-NO-KEYS-001, PR #505)
8. **The story prop is picked by whole words only** ("ring" never matches "during"). — **In force (code)** (lib/coverPrompt.ts inferKeyObjectSymbol)
9. **No text, words, letters or numbers in the image.** The app adds titles. — **In force (code)** (lib/coverPrompt.ts; text overlay turned off in regenerate-cover)
10. **Keep the bottom-right corner clear** of faces, text and focal points. — **Agreed** (memory /areas/story-pipeline.md "Cover art prompts: keep bottom-right corner clear"); **In force (code)** (lib/coverPrompt.ts)
11. **Readable as a phone thumbnail** (about 100 × 100 pixels): one clear subject, a visible face when there is a person, focal point in the center or upper half, square image. — **In force (code)** (lib/coverPrompt.ts ENDLESS_TALES_COVER_STANDARD)
12. **Bright by default.** Only Horror may be darker, and even Horror keeps the subject lit and readable. — **In force (code)** (lib/coverPrompt.ts isDarkExceptionStory; docs/GENRE-ATTRIBUTES-SPEC-v1.0-DRAFT.md §3, a draft)
13. **[MARC DECIDES]** **A cover darker than 100 out of 255 is remade once** brighter. If still too dark, it is flagged for Marc. — **In force (code)** (regenerate-cover/route.ts LUMINANCE_THRESHOLD)
14. **Genre styles:** thriller = bright close-ups; mystery = moody but readable; horror = gothic with lit subject; romance = warm, intimate; sci-fi = big scale, clear forms; western = golden dust, strong foreground figure; heartwarming = cozy and warm; and so on per lib/coverPrompt.ts genreStyle. — **In force (code)** (lib/coverPrompt.ts)
15. **Sunset of Competition covers never show space suits or metal-looking robots.** Its "robots" look human. — **Agreed** (Marc canon Nov 6, memory sunset-of-competition.md)
16. **Covers in one series should not all look alike,** and should not repeat a prop or setting used on recent covers. — **Proposed** (fills gap: Marc's Nov 4 report "stories feel alike" and claude/cover-and-theme-repetition-2026-11-04.md; no rule exists)
17. **Remove "clue-objects" and "Da Vinci Code" from the mystery style,** since that wording also draws maps. — **Proposed** (finding in claude/cover-and-theme-repetition-2026-11-04.md, seen via chat; not fixed in code)

### C. Remaking covers (regenerate-cover)
18. **Covers are remade only through `/api/asc3/regenerate-cover`,** with plain feedback (for example "No maps, charts or diagrams"). The feedback becomes the top instruction. — **In force (code)** (regenerate-cover/route.ts; lib/coverPrompt.ts coverFeedback)
19. **Keep every old cover file.** A remake saves a new file; nothing is overwritten. — **Agreed** (Marc's remake approvals Nov 5: "Keep every old file"); **In force (code)** (time-stamped storage path)
20. **[MARC DECIDES]** **Bulk remakes need Marc's OK on the list and the cost first.** — **Agreed** (Marc approved the 45-cover remake, about $6.77, Nov 5 10:26; chat "Apple App Store commission deals")
21. **After a bulk remake, Gemini checks each new cover;** one more try if it still fails, then Marc is told. Send Marc before/after samples. — **Agreed** (Marc-approved cover cleanup handoff, chat "Cover story map pattern", Nov 5)
22. **A remade cover on a live story replaces it at once.** Record the old cover link so it can be put back. — **Proposed** (code overwrites `cover_url` with no record of the old link)
23. **Claude cannot see images from its sandbox;** any check of what a cover shows is done by Gemini vision and labeled as such. — **Proposed** (working practice Nov 4–5)

### D. Image service and image credits
24. **The cover image model is `gpt-image-1.5`** through OpenAI. DALL·E 3 is retired. The model can be changed only by setting, not code. — **In force (code)** (lib/cover/imageRouter.ts COVER-GPT-IMAGE-DEFAULT-001, Oct 22)
25. **Belle is voice only;** no image is ever made "by Belle". — **In force (code)** (lib/cover/imageRouter.ts assertNotBelleImageAgent)
26. **Every image call logs its cost** for the finance report. — **In force (code)** (regenerate-cover/route.ts logDalleCall)
27. **[MARC DOES]** **Marc tops up image credits himself.** No key or card number is ever sent in chat. Image spend is charged to the ET-R&D card, or ET-Marketing for ad images. — **Agreed** (Marc Nov 5, chat "Apple App Store commission deals"; AGENTS.md "Never open, print … tokens")
28. **Report 101 flags any image service that is low** (under $10 or under 3 days left) with a link to add credits. — **Agreed** (Marc Nov 5, report-101 skill)
29. **Each image service the pipeline uses is named in writing** (cover renderer, Hal's image tool), so credits can be found. — **Proposed** (Hal's image service was unknown on Nov 5)

### E. Author and narrator photos
30. **Every pen-name author and narrator has a photo.** They are invented people: the prompt says so and never names the real author they write like. — **Agreed** (Marc Nov 1, 2026, memory story-pipeline.md); **In force (code)** (lib/portraitPrompt.ts PORTRAITS-001)

### F. eBooks (prose_text)
31. **Every story has a complete eBook before it is finished.** It covers every episode in the release, not an excerpt. — **Agreed** (PIPELINE-CANON EBOOK-COMPLETENESS RULE, Marc Oct 4)
32. **A missing or incomplete eBook blocks both Ready for Review and publishing.** In Direct mode the publish check is the last line of defense. — **Agreed** (EBOOK-COMPLETENESS)
33. **[MARC DECIDES]** **Applies to new production only.** Stories published before Oct 4, 2026 are not forced back. Backfill is a separate order from Marc. — **Agreed** (EBOOK-COMPLETENESS scope)
34. **Added episodes need their eBook text** before the batch can be reviewed or published. — **Agreed** (EBOOK-COMPLETENESS defaults)
35. **If it is unclear whether the eBook is complete, treat it as incomplete.** — **Agreed** (EBOOK-COMPLETENESS defaults)
36. **The eBook reads as a real book,** never a transcript: no speaker labels, episode markers, "[NARRATOR]" or "[LISTENER_NAME]" tokens, sound or music cues, or "previously on" recaps. The reader must never be able to tell the audio came first. — **Agreed** (PIPELINE-CANON EBOOK-STYLE RULE, Marc Oct 4)
37. **Same story as the audio:** same plot, people and events. Only the form changes. — **Agreed** (EBOOK-STYLE scope)
38. **When an authored book already exists (for example Origin 2.0), use it as written.** Do not rewrite it. — **Agreed** (EBOOK-STYLE use-the-original clause, Marc Oct 4 15:34)
39. **A transcript-style eBook fails and blocks,** and goes back to the writer for a rewrite (Class B). — **Agreed** (EBOOK-STYLE defaults)
40. **The eBook text is remade whenever the script changes.** Old text from an earlier script is never kept. — **Proposed** (code skips prose generation if `prose_text` already exists: complete-story-package/route.ts)
41. **The eBook writer is told to write book prose,** not "keep dialogue … preserve the story" conversion. — **Proposed** (the current prompt in complete-story-package/route.ts generateProse asks for a cleaned script, which conflicts with rule 36)
42. **The eBook is checked for leftover script marks** (labels, brackets, cue words) before review. — **Proposed** (fills the missing style gate for rules 36 and 39)
43. **The eBook is checked for length** against the script (for example at least 70% of the script's spoken words) so a cut-off text fails. — **Proposed** (the generator caps output at 4,000 tokens; a long episode could be cut off with no check)

## Marc's decisions (Nov 9, 2026)

Marc answered CANON-99 on Nov 9, 2026. These decisions are **Agreed** and override any rule above that says otherwise. Each conflict or question below that they settle is marked RESOLVED.

- **Decision 46:** **Series cover.** Decided: the Library shows one series cover (Episode 1's, unless you pick another). (10 C4, Q1) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 47:** **eBooks.** Decided: rewrite the eBook prompt to produce real book prose, and make the publish check require the eBook. (10 C1, C2) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 90:** A missing cover blocks publishing, but not Ready for Review. (10 C3) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 91:** In Direct mode, Marc does not review covers; Gemini checks each one for maps, keys, text and darkness. (10 Q2) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 92:** One eBook text per episode, shown as one book in the reader. (10 Q3) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 93:** eBooks for stories published before Oct 4 are made only for stories that stay live, as a separate low-priority order. (10 Q4) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 94:** Keep the old cover's link so Marc can switch back. (10 Q5) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)

## Conflicts found
- C1. **[RESOLVED by decision 47, Marc Nov 9, 2026]** EBOOK-STYLE (Oct 4) says the eBook must read as a genuine book. The code prompt (complete-story-package/route.ts) says "convert this audio drama script into clean readable prose … keep story meaning and dialogue … preserve the story", using a small model (claude-haiku-4-5, 4,000 tokens). Recommendation: canon wins; rewrite the prompt and add the style check (rules 41–42). Marc decides.
- C2. **[RESOLVED by decision 47, Marc Nov 9, 2026]** EBOOK-COMPLETENESS says the publish gate blocks a missing eBook. The publish checks (lib/story-gates.ts _publishMissingFields, lib/directPublish.ts) do not check `prose_text`; only Ready for Review does. Recommendation: add `prose_text` to the publish check.
- C3. **[RESOLVED by decision 90, Marc Nov 9, 2026]** READY-PUBLISH-URLS-001 (Oct 5) made a missing cover block "publish-ready". COVER-PIPELINE-DECOUPLE-001 (Oct 8) made a missing cover only a warning at Ready for Review. They fit together only if the cover blocks at publish and not before; that is how the code works today. Recommendation: confirm that reading (rule 3). Marc decides.
- C4. **[RESOLVED by decision 46, Marc Nov 9, 2026]** Covers are made per episode, but a series also has a series cover (Nov 5 handoff: "Re-upload The Third Key series cover"). No rule says where the series cover comes from or which one the Library shows. Recommendation: see Q1.

## Open questions for Marc
- Q1. **[RESOLVED by decision 46, Marc Nov 9, 2026]** Should a series show one series cover in the Library and episode covers inside? Suggested answer: yes; the series cover is Episode 1's cover unless Marc picks another.
- Q2. **[RESOLVED by decision 91, Marc Nov 9, 2026]** Should Marc see new covers before a story goes live in Direct mode? Suggested answer: no; Gemini vision checks for maps, keys, text and darkness, and fails the cover if found.
- Q3. **[RESOLVED by decision 92, Marc Nov 9, 2026]** One eBook per series, or one per episode joined in the reader? Suggested answer: one per episode in the database, shown as one book in the reader.
- Q4. **[RESOLVED by decision 93, Marc Nov 9, 2026]** Backfill eBooks for stories published before Oct 4? Suggested answer: only for stories that stay live, as a separate low-priority order.
- Q5. **[RESOLVED by decision 94, Marc Nov 9, 2026]** Should an old cover be kept in the app's history so Marc can switch back? Suggested answer: yes, store the old link (rule 22).

## Enforcement status
- 1–4, 8–9, 11–14, 18, 24–26, 30 → enforced in code at the paths given.
- 5–7 → enforced: lib/coverPrompt.ts (PR #491, #505). Old covers cleaned by the 45–56-cover remake, Nov 5 (count per chat; not re-verified).
- 10 → enforced in prompt text only (image models may not follow it).
- 15 → not enforced in code (no Sunset-specific cover rule found).
- 16, 17, 22, 23, 29 → not enforced.
- 19 → enforced (new time-stamped file each remake); old link not recorded.
- 20, 21, 27, 28 → by practice and report-101 skill.
- 31–32 → partly: blocks at Ready for Review (run-next missingReadyForReviewFields, complete-story-package missingReviewReadyFields); not at publish (C2). No series-wide completeness check.
- 33–35 → not enforced as separate checks.
- 36–39, 40–43 → not enforced (no eBook style or length gate exists).

## Sources reviewed
- /tmp/dtt: docs/PIPELINE-CANON.md (EBOOK rules), lib/coverPrompt.ts, lib/cover/coverRetry.ts, lib/cover/imageRouter.ts, lib/portraitPrompt.ts, app/api/asc3/regenerate-cover/route.ts, app/api/admin/complete-story-package/route.ts, app/api/admin/production-jobs/run-next/route.ts, lib/story-gates.ts, lib/publishReadiness.ts, app/api/story-publish/route.ts, COVER-PIPELINE-REGRESSION-20261008.md, docs/GENRE-ATTRIBUTES-SPEC-v1.0-DRAFT.md, docs/PUBLISHED_STORY_SPEC.md.
- Memory: /areas/story-pipeline.md, /projects/…/areas/story-pipeline.md, sunset-of-competition.md.
- Chats: "Cover story map pattern" (Nov 4–8; contains the text of claude/cover-and-theme-repetition-2026-11-04.md), "Apple App Store commission deals" (Nov 5, cover remake and image credits).
- Not reachable directly: Claude project docs (no Projects tool); claude/cover-and-theme-repetition-2026-11-04.md was read only as quoted in chat.

## Replaces (once approved)
- Cover parts of COVER-PIPELINE-REGRESSION-20261008.md (becomes history)
- The prose prompt wording in app/api/admin/complete-story-package/route.ts (as the eBook rule source)
- claude/cover-and-theme-repetition-2026-11-04.md (findings become history)
