# CANON-98 — Every Marc Decision Point
Status: DRAFT for Marc's approval · Nov 9, 2026 · Owner: Marc
Covers: one list of every place in the canon where Marc must decide or act himself, document by document. Does not cover: the rules themselves (each is in its own document) or the open decisions (CANON-99).

93 decision points across 15 documents (84 from the audit, 8 added by CANON-99 Part 2 and 1 by item 125, Nov 9, 2026). Every audit item in CANON-99 is answered; new requests appear in CANON-99 Part 3.

**[MARC DECIDES]** = Marc approves, chooses or gives his OK. **[MARC DOES]** = something only Marc does himself (tests on his phone, listens, enters a key). Agents never act in Marc's place on these.

## CANON-01 — Story Production Process (the end-to-end map)

- **CANON-01 rule 14 [MARC DECIDES]:** Publish switch. The switch is read at this moment. Review: Marc listens and approves. Direct: the story goes live with no review. Owner: CANON-09.
- **CANON-01 rule 20 [MARC DECIDES]:** Marc decides: merges outside Claude's own pipeline PRs, every database migration, the publish switch, the release of the publication hold, and…
- **CANON-01 rule 32 [MARC DECIDES]:** Adding episodes never re-plans or rewrites existing episodes. Use scripts/series/continue-series.ts (dry run, Marc approves the plan). Never run…
- **CANON-01 rule 35 [MARC DECIDES]:** Never merge a PR without Marc's word (except rule 18), and never run a migration without Marc's OK.
- **CANON-01 rule 56 [MARC DECIDES]:** Stop and ask Marc when any step could overwrite or hide live content.
- **CANON-01 rule 57 [MARC DECIDES]:** Author-written series (Sunset of Competition) are never rewritten by the pipeline. On a failed check it stops and reports; only approved…
- Open in this document: Nothing open in this document (CANON-99 answered Nov 9, 2026).

## CANON-02 — Story Ideas, Series Planning & Briefs

- **CANON-02 rule 8 [MARC DECIDES]:** No story is written for an author who lacks a style model or a complete style sheet. The job stops and asks Marc.
- **CANON-02 rule 19 [MARC DECIDES]:** A colliding brief is bounced for rework, never retried automatically. Only Marc can let it through, by a recorded override with his name and…
- **CANON-02 rule 20 [MARC DECIDES]:** A premise near a known-adjacent cluster gets a warning but proceeds. Only Marc adds or retires a cluster.
- **CANON-02 rule 28 [MARC DECIDES]:** Preferred series lengths are 3, 5, 7 or 13 episodes. Any other length needs Marc's explicit approval.
- **CANON-02 rule 30 [MARC DECIDES]:** Long Pocket FM series (e.g. 30 episodes) are allowed when Marc orders them, planned in arcs of 10, with one big turn every 10 episodes.
- **CANON-02 rule 31 [MARC DECIDES]:** When Marc or Maya sets an episode count, the story has exactly that many episodes.
- **CANON-02 rule 39 [MARC DECIDES]:** Pocket FM–style writing is used only when Marc says "use the rules for Pocket FM type stories."
- **CANON-02 rule 53 [MARC DECIDES]:** After a series finale, the series is scored for character attachment (0–8); 5+ = recommend a new season to Marc. New seasons must raise stakes,…
- **CANON-02 rule 54 [MARC DECIDES]:** Adding episodes never re-plans, rewrites, re-titles, re-hides or re-voices episodes that already exist. New episodes are planned only for the…
- **CANON-02 rule 63 [MARC DECIDES]:** When Marc or Maya sets a per-episode length, each episode lands within ±20% of it.
- Open in this document: Nothing open in this document (CANON-99 answered Nov 9, 2026).

## CANON-03 — The Writer (Script Rules)

- **CANON-03 rule 2 [MARC DECIDES]:** Author-written series (today only The Sunset of Competition) are never rewritten or regenerated. On a failed check the pipeline stops and reports;…
- **CANON-03 rule 58 [MARC DECIDES]:** NARRATIVE_VOICE is declared (first_person, third_limited, third_omniscient) and held on every narrator line. second_person needs Marc's approval.
- **CANON-03 rule 59 [MARC DECIDES]:** NARRATOR_IS_CHARACTER: true needs Marc's approval and a non-platform voice.
- **CANON-03 rule 90 [MARC DECIDES]:** Gemini reads the scripts before voicing (continuity, easy listening, logic, promise, credibility) and lists exact fixes. Report-only until Marc…
- Open in this document: Nothing open in this document (CANON-99 answered Nov 9, 2026).

## CANON-04 — Belle Intro/Outro & Listener-Name Personalization

- **CANON-04 rule 19 [MARC DECIDES]:** Broad time-of-day mood: see Conflict C3. Until Marc decides, writers use none.
- **CANON-04 decision 72 [MARC DOES]:** Turn the live name greeting on for everyone after Marc tests it on his phone.
- Open in this document: Nothing open in this document (CANON-99 answered Nov 9, 2026).

## CANON-05 — Voices & Voice Generation

- **CANON-05 rule 1 [MARC DECIDES]:** Belle's voice is ElevenLabs voice GMhgX8fCR9GUtd3kmlKC, settings: stability 0.49, similarity 0.51, style 0.0, speaker boost on, speed 1.0, model…
- **CANON-05 rule 10 [MARC DECIDES]:** After the first episode of each new series is voiced, Gemini listens. Only mismatches Gemini flags go to Marc.
- **CANON-05 rule 47 [MARC DECIDES]:** A published story is re-voiced only with Marc's approval, and the new version is delivered as a link first.
- **CANON-05 decision 78 [MARC DOES]:** Re-voicing a published story always waits for Marc's listen, even in Direct mode.
- Open in this document: Nothing open in this document (CANON-99 answered Nov 9, 2026).

## CANON-06 — Sound Effects

- **CANON-06 rule 4 [MARC DECIDES]:** Marc agreed to pay the one-time $500 API setup fee once Ron (Sound Ideas) confirms in writing that the key can search AND download, uses the…
- **CANON-06 rule 5 [MARC DOES]:** Soundsnap downloads are done by Marc by hand.
- **CANON-06 rule 6 [MARC DOES]:** API keys and logins are entered on the server by Marc himself. They are never pasted in chat or printed.
- **CANON-06 rule 14 [MARC DECIDES]:** A discarded take never comes back. Every discard runs as a dry run first and then needs Marc's explicit word.
- **CANON-06 rule 19 [MARC DOES]:** Gemini is a screen, not the final judge. Marc listens to the final test mix.
- **CANON-06 rule 23 [MARC DECIDES]:** The loop may not run until the library confirms in writing that automated search-download-check is allowed, and Marc approves the code on a branch.
- **CANON-06 rule 44 [MARC DECIDES]:** All sound effects stay off in every mix (SFX_OFF=on) until the professional library is in and Marc approves a test. Voices and music are not…
- **CANON-06 rule 53 [MARC DECIDES]:** A published episode is re-mixed for sound only on Marc's explicit word.
- **CANON-06 rule 54 [MARC DECIDES]:** The first test with the new library is one episode only (Rerouted EP1). Nothing else gets sounds until Marc approves that test.
- **CANON-06 rule 55 [MARC DOES]:** When sounds are added back to published episodes, it is done one series at a time: one test episode, Marc listens, then the rest.
- **CANON-06 decision 80 [MARC DECIDES]:** Once a week, Claude proposes new sound names from the "wanted" list; Marc approves the list.
- Open in this document: Nothing open in this document (CANON-99 answered Nov 9, 2026).

## CANON-07 — Music & Final Mix

- **CANON-07 rule 32 [MARC DECIDES]:** Music is made at most 3 times per story or episode. After that the story is flagged for attention; only Marc can re-queue it.
- **CANON-07 rule 39 [MARC DOES]:** Every mix change goes behind an on/off switch. A test copy goes to a preview folder. Marc listens before it goes live. If it goes wrong, the…
- **CANON-07 rule 43 [MARC DECIDES]:** No corrected episode replaces a published final_mix.mp3 until Marc listens and approves.
- Open in this document: Nothing open in this document (CANON-99 answered Nov 9, 2026).

## CANON-08 — Quality Gates & Marc's Review

- **CANON-08 rule 14 [MARC DECIDES]:** Premise gate (PREMISE-UNIQUENESS-001), before writing → the premise is not a near-copy of another story → sent back for a new premise variant, up…
- **CANON-08 rule 17 [MARC DECIDES]:** validate_script → (a) story-card copy rules, (b) no duplicated passages (Gate 4), (c) AI validator. Failures go back to the writer, up to 2 times,…
- **CANON-08 rule 35 [MARC DECIDES]:** Final audio always needs Marc's ear before going live, except in "direct" mode, which waives it fully. Nothing may assume Marc catches bad audio…
- **CANON-08 rule 36 [MARC DECIDES]:** One publish switch, set only by Marc: "Review" (hold at ready for review) or "Direct" (go live without review). It is read at the moment a story…
- **CANON-08 rule 39 [MARC DECIDES]:** Episode Correction Loop: Marc listens → approves or sends corrections → the corrected version comes to him as a link, not published → Marc…
- **CANON-08 rule 41 [MARC DOES]:** Marc checks player changes on a real phone before they are accepted.
- **CANON-08 rule 44 [MARC DECIDES]:** A Gemini final read of the whole series decides publish / fix (2 rounds) / hold, and Marc gets one message only on hold.
- Open in this document: Nothing open in this document (CANON-99 answered Nov 9, 2026).

## CANON-09 — Publishing & Release

- **CANON-09 rule 3 [MARC DECIDES]:** Review: every story waits at Ready for Review until Marc listens and approves. Then it goes live.
- **CANON-09 rule 5 [MARC DECIDES]:** Only Marc changes the switch, with a one-line instruction or the Admin page switch. It stays until he changes it again.
- **CANON-09 rule 9 [MARC DECIDES]:** In Review, corrections follow the Episode Correction Loop: Marc listens → approves or sends fixes → the fixed version comes to him as a link, not…
- **CANON-09 rule 11 [MARC DECIDES]:** A story goes live complete, with all its episodes at once. A series stays hidden until every episode is finished and approved.
- **CANON-09 rule 16 [MARC DECIDES]:** Sunset of Competition goes live all 26 episodes at once. Marc's release of it counts as his approval of each episode.
- **CANON-09 rule 34 [MARC DECIDES]:** Only Marc releases the hold. Claude or Orion may turn it on to stop test content or a wrong publish, then must tell Marc at once.
- **CANON-09 rule 42 [MARC DECIDES]:** A live story with a problem stays live unless Marc says otherwise ("After the Last Train" stays up).
- **CANON-09 rule 45 [MARC DECIDES]:** A partly published series breaks rule 11. On finding one, do not publish more single episodes. Either finish all episodes and publish them…
- Open in this document: Nothing open in this document (CANON-99 answered Nov 9, 2026).

## CANON-10 — Covers, Images & eBooks

- **CANON-10 rule 13 [MARC DECIDES]:** A cover darker than 100 out of 255 is remade once brighter. If still too dark, it is flagged for Marc.
- **CANON-10 rule 20 [MARC DECIDES]:** Bulk remakes need Marc's OK on the list and the cost first.
- **CANON-10 rule 27 [MARC DOES]:** Marc tops up image credits himself. No key or card number is ever sent in chat. Image spend is charged to the ET-R&D card, or ET-Marketing for ad…
- **CANON-10 rule 33 [MARC DECIDES]:** Applies to new production only. Stories published before Oct 4, 2026 are not forced back. Backfill is a separate order from Marc.
- Open in this document: Nothing open in this document (CANON-99 answered Nov 9, 2026).

## CANON-11 — The Player

- **CANON-11 rule 37 [MARC DECIDES]:** All episodes publish together. A series stays hidden until every episode is finished and approved, then they all go live at the same time.
- **CANON-11 rule 40 [MARC DECIDES]:** The publish switch on the Admin page decides who approves. It is checked when a story is ready to publish. On "Review", every story waits for Marc…
- **CANON-11 rule 46 [MARC DOES]:** Marc checks it on a real phone before any player change is accepted.
- Open in this document: Nothing open in this document (CANON-99 answered Nov 9, 2026).

## CANON-12 — The Listener App

- **CANON-12 rule 10 [MARC DECIDES]:** The Founding Member plan is retired. No page may offer it without a new pricing decision from Marc.
- **CANON-12 rule 60 [MARC DECIDES]:** A new landing story serves only after Marc adds it to the live list.
- **CANON-12 rule 68 [MARC DECIDES]:** Push notifications are off until Marc approves what they say and when.
- **CANON-12 rule 73 [MARC DOES]:** Marc checks every listener-facing change on a real phone before it is accepted.
- Open in this document: Nothing open in this document (CANON-99 answered Nov 9, 2026).

## CANON-13 — Marketing & Ads

- **CANON-13 rule 1 [MARC DECIDES]:** No ad spends money or goes live until Marc approves its creative and its budget.
- **CANON-13 rule 5 [MARC DECIDES]:** Susan writes ad copy with Claude through her own key, capped at $25 a month. Marc approves the final copy.
- **CANON-13 rule 8 [MARC DECIDES]:** Any new idea for an agent's role in ads (for example, Strategos sending his brief straight to Susan) needs Marc's word before it is used.
- **CANON-13 rule 12 [MARC DECIDES]:** If Meta's preview won't load, the card says "INTERNAL SIMULATION — NOT META'S PREVIEW" and Approve stays off. Only Marc can override, in writing.
- **CANON-13 rule 16 [MARC DOES]:** Marc tests every ad himself, on his phone, before it is uploaded or launched.
- **CANON-13 rule 19 [MARC DECIDES]:** Approval covers only the exact version tested. Any change to video, headline, text, button, link, claims or spend ceiling makes a new version that…
- **CANON-13 rule 22 [MARC DECIDES]:** LAUNCH appears only after Marc approves, and only for Susan and Orion. Each launch records who and when.
- **CANON-13 rule 25 [MARC DOES]:** The Meta write key (ads_management) lives only on the server. Marc enters it himself. Susan never holds it; she calls the gated route.
- **CANON-13 rule 34 [MARC DECIDES]:** Weekly spend never goes over the weekly plan without Marc's approval.
- **CANON-13 rule 41 [MARC DECIDES]:** After the test, monthly ad spend may not go over that month's "Available for ads" amount (plow back, defined in CANON-14) without Marc's approval.
- **CANON-13 rule 51 [MARC DECIDES]:** Low-cost video promo clips (one still image per scene, slow pan, story audio) are a future option only. No build until Marc approves a test, and…
- **CANON-13 rule 61 [MARC DOES]:** TikTok ads use the same approval card, 6 checks, Marc's phone test and playbook read as Meta before any spend.
- **CANON-13 decision 105 [MARC DECIDES]:** Meta's own phone preview never counts as approval, except as a written, dated, one-time override by Marc.
- **CANON-13 decision 107 [MARC DECIDES]:** After the $4,000 test, the monthly ad budget is "Available for ads"; more needs Marc's approval.
- **CANON-13 decision 109 [MARC DOES]:** "Owner tested personally" must be ticked before Approve works.
- **CANON-13 decision 110 [MARC DECIDES]:** Amendment 1 is overridden only in writing on the approval card, with the date.
- Open in this document: Nothing open in this document (CANON-99 answered Nov 9, 2026).

## CANON-14 — Finance & Reporting

- **CANON-14 rule 52 [MARC DECIDES]:** Susan may use the marketing card only with Marc's approval.
- **CANON-14 rule 59 [MARC DECIDES]:** No automatic profit transfers. Any transfer needs Marc's explicit word.
- **CANON-14 decision 125 [MARC DECIDES]:** What Marc reinvests from Part B (money outside operations), and when, is his choice.
- Open in this document: Nothing open in this document (CANON-99 answered Nov 9, 2026).

## CANON-15 — Agents, Code & Operations

- **CANON-15 rule 1 [MARC DECIDES]:** Only the documents in the AGENTS.md "Canon index" are law. Everything else is history or reference. When two canon documents disagree, ask Marc.
- **CANON-15 rule 2 [MARC DECIDES]:** No agent declares canon. Canon changes only on Marc's explicit word.
- **CANON-15 rule 3 [MARC DECIDES]:** Never merge a pull request (PR) without Marc's explicit word.
- **CANON-15 rule 5 [MARC DECIDES]:** Never run a database migration or schema change without Marc's explicit OK.
- **CANON-15 rule 8 [MARC DECIDES]:** Stop and ask Marc when a step could overwrite or hide live content.
- **CANON-15 rule 10 [MARC DECIDES]:** No crontab hold line (#HOLD-…) or paused service is turned back on without Marc's word.
- **CANON-15 rule 54 [MARC DOES]:** Marc enters money-spending keys himself (for example Meta ads_management). Low-risk test keys may be passed through Orion.
- **CANON-15 decision 118 [MARC DECIDES]:** Orion's INCIDENT-RULE-001 is Proposed until Marc approves it.
- Open in this document: Nothing open in this document (CANON-99 answered Nov 9, 2026).

