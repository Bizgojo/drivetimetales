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
4. Every canon document starts with a **"Where Marc decides"** list, and each of those rules carries a tag: **[MARC DECIDES]** (Marc approves, chooses or gives his OK) or **[MARC DOES]** (something only Marc does himself, such as testing on his phone, listening, or entering a key). Agents never act in Marc's place on a tagged rule. CANON-98 lists every one of them in one place.
5. A document marked **DRAFT** is not law yet, except the rules in it already marked Agreed. When Marc approves a document, its status changes to **APPROVED** with the date.
   - **Nov 9, 2026: Marc approved CANON-01 to CANON-15.** Every rule in them is law, including rules marked In force (code) or Proposed that a decision did not change; a Proposed rule that Marc wants changed goes through CANON-99.

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
| 98 | Every Marc Decision Point | One list of every rule that needs Marc's decision or action |
| 99 | Decisions Needed | Every open conflict and question, with a recommendation |

## Which document wins

6. When two canon documents seem to disagree, the one that owns the step wins (for example, the Player wins on playback; the Writer wins on script text). If it's still unclear, ask Marc. Never guess.
7. A newer decision by Marc beats an older one. The date on each rule shows which is newer.
8. The files the story writer loads into its prompts (Bible/CANON_REGISTRY_STORY_RULES.md, Bible/ET_Story_Rules_v3_2_CANONICAL.md, docs/STAGE2_SCRIPT_PROMPT.md, docs/BELLE_B_PROMPT_RULES.md) must say the same thing as CANON-03 and CANON-04. When they differ, the canon document wins and the prompt file is updated.
9. Any document not on this list is history or reference, not law.

## How a new rule is made (the only way)

10. **Anyone may spot the need:** Marc, Claude, or an agent. An agent that meets a situation no canon rule answers, or two rules that disagree, **stops that step and reports "RULE NEEDED:"** with the situation in one or two sentences. It never guesses or invents a rule.
11. **Claude drafts it.** Claude picks the one canon document that owns the step, writes the rule in plain words, checks it against every canon document for conflicts and gaps, and adds a recommendation (and the options, when there is a real choice).
12. **It goes on CANON-99 as the next numbered item, marked Proposed,** naming its document, the rule text, why it is needed, any conflict it settles, and the code it would change.
13. **Marc decides.** Marc replies "approve N", "change N: …", or "reject N". Several at once are fine ("approve 125–130"). Nothing is law until Marc says so.
14. **Claude writes it in.** An approved rule goes into its document marked **Agreed (Marc, date)**, with a **[MARC DECIDES]** or **[MARC DOES]** tag where it needs Marc, and its CANON-99 item is marked APPROVED. Admin is rebuilt in the same pull request. Claude lists any code that must change to match; those changes are separate pull requests that Marc merges.
15. **Changing or removing a rule** follows the same path: Claude proposes the change on CANON-99, Marc decides.
16. **Only Marc adds, changes or removes a rule. Agents never edit canon.**
17. **Every canon document can be read in Admin → Documentation → Canon (rules).** The files live in the code repository at docs/canon/. CANON-99 always shows what is waiting for Marc.
18. **The canon's numbers live in one code file, lib/canon/numbers.ts,** and an automatic test (CANON-GUARD-001) fails whenever the code or a writer prompt file disagrees with them. When Marc approves a changed number, the canon document, that file and the code change together in one pull request. — **Agreed** (Marc, Nov 9, 2026)

## Earlier canon this set brings together

- docs/PLAYER-RULES.md: copied into CANON-11 word for word. CANON-11 was approved Nov 9, 2026, so CANON-11 is now the rule; PLAYER-RULES.md carries a banner pointing to it.
- docs/PIPELINE-CANON.md: its rules are in CANON-01, 03, 04, 08, 09 and 10, approved Nov 9, 2026. Those documents are now the rule; PIPELINE-CANON.md carries a banner pointing to them.
- AGENTS.md keeps a short Canon index that points here.
