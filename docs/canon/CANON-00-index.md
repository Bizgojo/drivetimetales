# CANON-00 — Canon Index & How Canon Works
Status: DRAFT for Marc's approval · Nov 9, 2026 · Owner: Marc
Covers: the list of canon documents, which one wins when they disagree, and how a rule is added or changed. Does not cover: any rule itself (each lives in its own canon document).

## What canon is

1. Canon is the set of rules for how Endless Tales works. If code, an older document, an agent's memory or a chat disagrees with canon, canon wins and the code or document is fixed to match.
2. Every rule lives in exactly one canon document, the one for its step. Other documents point to it; they never repeat it.
3. Every rule is marked one of three ways:
   - **Agreed:** Marc decided it. The source and date are shown.
   - **In force (code):** the code does this today, but Marc never decided it. It needs Marc's OK to become Agreed.
   - **Proposed:** a rule the audit thinks is needed. It is not in force until Marc approves it.
4. A document marked **DRAFT** is not law yet, except the rules in it already marked Agreed. When Marc approves a document, its status changes to **APPROVED** with the date.

## The canon documents

| # | Document | The step it governs |
|---|---|---|
| 00 | Canon Index (this document) | How canon works |
| 01 | Story Production Process | The whole path from idea to live story; who does each step |
| 02 | Story Ideas, Series Planning & Briefs | Genres, authors, premises, series length, series bible, hook series |
| 03 | The Writer | Everything about writing the script, including text the voices will speak |
| 04 | Belle & Personalization | Belle's intros and outros, the listener's name |
| 05 | Voices | Casting, narrators, voice reuse, ElevenLabs |
| 06 | Sound Effects | Sound library, licenses, spot and background sounds, screening |
| 07 | Music & Final Mix | The six-channel mix drawing, levels, sting, fades, loudness |
| 08 | Quality Checks & Review | Every check from brief to publish, and what Marc reviews |
| 09 | Publishing & Release | The publish switch, publishing all episodes together, hiding, unpublishing |
| 10 | Covers & eBooks | Cover images and eBook text |
| 11 | The Player | How playback, saving, auto-continue and the end of a story work |
| 12 | The Listener App | Sign-up, trial, prices, library, playlists, ratings, paywall, settings |
| 13 | Marketing & Ads | Meta rules (Amendment 1), hook ads, budgets, testing, stop rules |
| 14 | Finance & Reporting | The finance statement, revenue, costs, plow back, LTV and CAC |
| 15 | Agents & Operations | Agent rules, merges, deploys, security, who does what |
| 99 | Decisions Needed | Every open conflict and question, with a recommendation |

## Which document wins

5. When two canon documents seem to disagree, the one that owns the step wins (for example, the Player wins on playback; the Writer wins on script text). If it's still unclear, ask Marc. Never guess.
6. A newer decision by Marc beats an older one. The date on each rule shows which is newer.
7. The files the story writer loads into its prompts (Bible/CANON_REGISTRY_STORY_RULES.md, Bible/ET_Story_Rules_v3_2_CANONICAL.md, docs/STAGE2_SCRIPT_PROMPT.md, docs/BELLE_B_PROMPT_RULES.md) must say the same thing as CANON-03 and CANON-04. When they differ, the canon document wins and the prompt file is updated.
8. Any document not on this list is history or reference, not law.

## How a rule is added or changed

9. Only Marc adds, changes or removes a rule.
10. To change one, Marc tells Claude the document number and rule number (for example, "CANON-11 rule 7: make the gap 2 seconds"). Claude edits the document, Marc approves, and Claude lists any code that must change to match.
11. Agents never edit canon. They may propose a change to Marc.
12. When a new situation comes up that no rule answers, it goes on CANON-99 as an open question until Marc decides. Then the answer is added to the right document.
13. Every canon document can be read in Admin → Documentation → **Canon (rules)**. The files live in the code repository at docs/canon/.

## Earlier canon this set brings together

- docs/PLAYER-RULES.md (approved Nov 9) is copied into CANON-11 word for word. Once CANON-11 is approved, PLAYER-RULES.md becomes a pointer to it.
- docs/PIPELINE-CANON.md's rules are placed in the documents for their steps: production (01), writer (03), Belle (04), quality checks (08), publishing (09) and covers and eBooks (10). Once those are approved, PIPELINE-CANON.md becomes a pointer.
- AGENTS.md keeps a short Canon index that points here.
