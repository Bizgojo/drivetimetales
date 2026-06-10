# ENDLESS TALES — STORY PRODUCTION PROCESS
**One sheet. Every story. Start to finish.**
*Version 1.1 · June 10, 2026*
**Changes from v1.0 (approved by Marc):** grading moved to six dimensions / 30 points (gates 22+ publish, 26+ gold). One Belle intro line (variations removed). Story Resolution Map added to review. PIPELINE_MODE step added. Series Release Rule added at publish. Document table updated for the v1.4 canonical set.

---

## WHERE YOUR DOCUMENTS LIVE

| Document | Version | Location |
|---|---|---|
| Master Bible (session-start doc) | v3.0 | `~/Projects/drivetimetales/docs/ENDLESS_TALES_MASTER_BIBLE.md` |
| This process sheet | v1.1 | `~/Projects/drivetimetales/docs/STORY_PRODUCTION_PROCESS.md` |
| Story Brief Template | v2.1 | `~/Projects/drivetimetales/docs/STORY_BRIEF_TEMPLATE.md` |
| Stage 2 Script Prompt | v2.2 | `~/Projects/drivetimetales/docs/STAGE2_SCRIPT_PROMPT.md` |
| Script Validator | v1.1 | `~/Projects/drivetimetales/docs/SCRIPT_VALIDATOR.md` |
| Published Story Spec | v1.4 | `~/Projects/drivetimetales/docs/PUBLISHED_STORY_SPEC.md` |
| Personalization & SFX build spec | v1.0 | `~/Projects/drivetimetales/docs/PERSONALIZATION_AND_SFX_IMPLEMENTATION.md` |
| Hal Session Start Protocol | — | `~/Projects/drivetimetales/docs/HAL_SESSION_START_PROTOCOL.md` |
| Mix Note Protocol | — | `~/Projects/drivetimetales/docs/MIX_NOTE_PROTOCOL.md` |
| Story Grading Rubric | needs Investment update | `~/Projects/drivetimetales/docs/STORY_GRADING_RUBRIC.md` |

---

## STEP 1 — FILL OUT THE STORY BRIEF
**Your time: ~10 minutes**

1. Open `STORY_BRIEF_TEMPLATE.md` (v2.1)
2. **Set PIPELINE_MODE first** — `transition` until Builds 1+2 are live and the two-story pilot has passed; `full` after
3. Fill every REQUIRED field; fill OPTIONAL fields as specifically as you can
4. For standalones: fill NEXT_LISTEN if the author has a series or recurring protagonist (this triggers Belle's bridge line)
5. Save as `Brief_[StoryTitle].md` in `~/Projects/drivetimetales/docs/Briefs/`

**Series batch reminder:** the Series Release Rule means Episode 1 cannot publish without Episode 2 live, and 3-episode series publish complete — brief and produce series as a batch, not one episode at a time.

---

## STEP 2 — GET THE SCRIPT FROM CLAUDE
**Your time: ~5 minutes setup, Claude writes it**

1. Open a **new Claude chat**
2. Paste in this order, nothing between: full `STAGE2_SCRIPT_PROMPT.md` (v2.2) → your completed Brief
3. Say: **"Write the script."**
4. Save the output as `Script_[StoryTitle]_DRAFT.md` in `~/Projects/drivetimetales/docs/Scripts/`

**The script will include:** the Story Resolution Map comment block at the top · ONE Belle intro line ([LISTENER_NAME] only in full mode) · complete header · Character Guide · the full script (anchor SFX and music markers only in full mode) · Belle outro (+ bridge line if NEXT_LISTEN was filled).

---

## STEP 3 — MARC REVIEWS THE SCRIPT
**Your time: ~6 minutes**

Read these four things:

- **The Resolution Map** — is the FINAL SOLUTION concrete? Does the VARIETY GUARDRAIL name real differences from recent stories?
- **First 8 lines after the Belle intro** — does it open with action AND clarity? Within 60 seconds, do you know WHO, WHERE, WHAT?
- **One scene in the middle** — does it turn (a reveal, reversal, or escalation)? Does the voice match the author?
- **Last 4 lines + outro** — standalone: resolved and matching the map's FINAL SOLUTION. Series non-finale: hard cliffhanger. Finale: closed. Bridge line (if any): one sentence, warm, not a plug.

**If yes on all four** → Step 4. **If no** → reply in the same chat with specific notes. Claude fixes. Re-read.

---

## STEP 4 — VALIDATE THE SCRIPT
**Your time: ~2 minutes**

1. New Claude chat → paste full `SCRIPT_VALIDATOR.md` (v1.1) → paste the draft script
2. Say: **"Validate this script."**
3. ✅ PASS → save as `Script_[StoryTitle]_VALIDATED.md` → Step 5. ❌ FAIL → paste the failure list back into the writing chat, say *"Fix these,"* re-validate.

---

## STEP 5 — SEND TO HAL FOR PRODUCTION
**Your time: ~5 minutes**

1. Telegram → Hal → send the Session Start Protocol; wait for SESSION START CONFIRMED
2. Send the validated script
3. Say: **"Run the full ASC pipeline on this script. Two-step only: generate-voices then render-final-mix. Belle voice GMhgX8fCR9GUtd3kmlKC. Strip the Resolution Map comment block before voice generation. Set is_hidden = true when publishing to Supabase."**
4. Wait for production-complete confirmation and the story UUID

---

## STEP 6 — LISTEN AND GRADE
**Your time: story runtime + 5 minutes**

Listen to the complete story — in the car if possible. Score **six** dimensions, 1–5 each:

1. **Hook** — did the first 90 seconds earn attention?
2. **Clarity** — could a distracted driver follow everything without rewinding?
3. **Pacing** — did it turn every few minutes, or did the middle go flat?
4. **Audio Quality** — voices level, music ducking, SFX in gaps, name stitch seamless (full mode), nothing cut off
5. **Landing** — did the ending resolve and satisfy (or the cliffhanger burn)?
6. **Investment** — did you care what happened to this person? Did you feel something at the ending?

Total out of **30**.

---

## STEP 7 — DECISION

| Score | Action |
|---|---|
| **26–30** | ✅ Publish. Record in Gold Standard log. |
| **22–25** | ✅ Publish. Log any dimension scoring 2 or below. |
| **17–21** | ⚠️ Fix first. Audio dimension failed → `MIX_NOTE_PROTOCOL.md` → Claude → Hal re-mix → re-listen. Any other dimension → writing chat with notes → revise → re-validate → re-produce. |
| **Below 17** | ❌ Bring full scores + notes to Claude: *"This story failed the grading rubric. Diagnose and advise."* |

Same problem in 3+ stories → Pattern Log → bring to Claude to update the rules.

---

## STEP 8 — PUBLISH
**Your time: 1 minute**

**Series Release Rule check first:** if this is Episode 1, Episode 2 must be approved and ready to go live in the same release. Three-episode series go live complete. Never strand a listener on a cliff.

Tell Hal: *"Approved. Set is_hidden = false for story UUID [UUID]"* (listing all UUIDs releasing together for a series).

---

## QUICK TROUBLESHOOTING

| Problem | What to do |
|---|---|
| Bad script | Reply in the same writing chat with specific notes — don't start a new chat |
| Validator FAIL | Paste failures into the writing chat: "Fix these." Re-validate |
| Script ending doesn't match the Resolution Map | One of them is wrong — tell the writing chat which one to fix |
| Hal unresponsive | Re-send protocol; if still down, run Hal recovery commands |
| Wrong audio from Hal | Mix Note Protocol → Claude → Hal re-mix |
| Score below 17 | Rubric scores to Claude for diagnosis before rework |
| [LISTENER_NAME] audible in produced audio | PIPELINE_MODE was wrong — the brief said full before Builds 1+2 were live. Re-produce in transition mode |
| Same problem in 3+ stories | Pattern Log → Claude → rules update |

---

## SESSION SUMMARY — AFTER EVERY STORY

~~~
STORY PRODUCTION RECORD
========================
Title:
Author:
Genre:
Type: standalone / series episode X of Y
Pipeline mode: transition / full
Date produced:
Story UUID:
Grading score: ___ / 30
  Hook:_/5 Clarity:_/5 Pacing:_/5 Audio:_/5 Landing:_/5 Investment:_/5
Published: yes / no (series batch UUIDs if applicable)
Notes:
~~~

Save as `Record_[StoryTitle].md` in `~/Projects/drivetimetales/docs/Records/`

---

*Pick this sheet up at the start of every story. Put it down when it publishes.*
*STORY_PRODUCTION_PROCESS.md — Endless Tales · Version 1.1 · June 2026*
