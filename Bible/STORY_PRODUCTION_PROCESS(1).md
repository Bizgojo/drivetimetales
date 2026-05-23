# ENDLESS TALES — STORY PRODUCTION PROCESS
**One sheet. Every story. Start to finish.**
*Version 1.0 · April 2026*

---

## WHERE YOUR DOCUMENTS LIVE

| Document | Location |
|---|---|
| This process sheet | `~/Projects/drivetimetales/docs/STORY_PRODUCTION_PROCESS.md` |
| Story Brief Template | `~/Projects/drivetimetales/docs/STORY_BRIEF_TEMPLATE.md` |
| Stage 2 Script Prompt | `~/Projects/drivetimetales/docs/STAGE2_SCRIPT_PROMPT.md` |
| Script Validator | `~/Projects/drivetimetales/docs/SCRIPT_VALIDATOR.md` |
| Hal Session Start Protocol | `~/Projects/drivetimetales/docs/HAL_SESSION_START_PROTOCOL.md` |
| Mix Note Protocol | `~/Projects/drivetimetales/docs/MIX_NOTE_PROTOCOL.md` |
| Story Grading Rubric | `~/Projects/drivetimetales/docs/STORY_GRADING_RUBRIC.md` |

---

## STEP 1 — FILL OUT THE STORY BRIEF
**Your time: ~10 minutes**

1. Open `STORY_BRIEF_TEMPLATE.md`
2. Fill out every REQUIRED field — author, genre, premise, setting, runtime, music energy
3. Fill out OPTIONAL fields as specifically as you can — the more detail, the better the script
4. Save your completed brief as `Brief_[StoryTitle].md` in `~/Projects/drivetimetales/docs/Briefs/`

**If you're unsure which author fits your story idea** — open a Claude chat, describe the story in a sentence, and ask: *"Which ET author fits this and why?"*

---

## STEP 2 — GET THE SCRIPT FROM CLAUDE
**Your time: ~5 minutes setup, Claude writes it**

1. Open a **new Claude chat** at claude.ai
2. Paste in this order — no other text between them:
   - The full contents of `STAGE2_SCRIPT_PROMPT.md`
   - The full contents of your completed Story Brief
3. Say: **"Write the script."**
4. Claude outputs the complete script — copy it
5. Save it as `Script_[StoryTitle]_DRAFT.md` in `~/Projects/drivetimetales/docs/Scripts/`

**The script will include:**
- Header block with all metadata
- Belle B Intro Variations (4 of them)
- Character Guide
- Full audio drama script with SFX and music cues
- ANNOUNCER outro

---

## STEP 3 — MARC REVIEWS THE SCRIPT
**Your time: ~5 minutes**

Open the saved draft script and read these three sections:

- **First 8 lines after the ANNOUNCER intro** — does it open with action? Does something happen immediately?
- **One scene in the middle** — does the narrative voice feel right for the assigned author?
- **Last 4 lines** — does it end properly? (Standalone: resolved. Series non-finale: cliffhanger. Finale: closed.)

**If yes on all three** → proceed to Step 4.
**If no on any** → reply in the same Claude chat with specific notes. Claude fixes it. Re-read those sections.

---

## STEP 4 — VALIDATE THE SCRIPT
**Your time: ~2 minutes**

1. Open a **new Claude chat** at claude.ai
2. Paste in this order:
   - The full contents of `SCRIPT_VALIDATOR.md`
   - The full contents of the draft script
3. Say: **"Validate this script."**
4. Claude returns either ✅ PASS or ❌ FAIL with specific failures listed

**If PASS** → save the script as `Script_[StoryTitle]_VALIDATED.md` → proceed to Step 5.
**If FAIL** → go back to the script writing chat, paste the failure list, say *"Fix these."* → re-validate.

---

## STEP 5 — SEND TO HAL FOR PRODUCTION
**Your time: ~5 minutes**

1. Open Telegram → Hal
2. Send the **Session Start Protocol** (copy/paste the Telegram block from `HAL_SESSION_START_PROTOCOL.md`)
3. Wait for Hal's SESSION START CONFIRMED reply
4. Send Hal the validated script — paste the full contents directly into Telegram
5. Say: **"Run the full ASC pipeline on this script. Produce intro.mp3, story_body.mp3, outro.mp3. Set is_hidden = true when publishing to Supabase."**
6. Wait for Hal to confirm production complete and give you the story UUID

**Hal will produce:**
- Voice audio for all characters via ElevenLabs
- Background music via Suno
- ET Signature Sting
- Three mixed files: `intro.mp3` + `story_body.mp3` + `outro.mp3`
- Cover art
- Supabase story row (hidden)

---

## STEP 6 — LISTEN AND GRADE
**Your time: ~story runtime + 5 minutes**

1. Open `STORY_GRADING_RUBRIC.md`
2. Go to the app at `app.endless-tales.com` — find the story (it's hidden, visible in admin)
3. **Listen to the complete story** — in the car or with headphones if possible
4. Score all five dimensions as you listen or immediately after:
   - Dimension 1: Hook (1–5)
   - Dimension 2: Clarity (1–5)
   - Dimension 3: Pacing (1–5)
   - Dimension 4: Audio Quality (1–5)
   - Dimension 5: Landing (1–5)
5. Add the scores → total out of 25

---

## STEP 7 — DECISION

| Score | Action |
|---|---|
| **22–25** | ✅ Publish. Tell Hal: *"Set is_hidden = false for [UUID]."* Record in Gold Standard log. |
| **18–21** | ✅ Publish. Tell Hal: *"Set is_hidden = false for [UUID]."* Log any dimension scoring 2 or below. |
| **14–17** | ⚠️ Fix first. See Fix Decision below. |
| **Below 14** | ❌ Bring full scores + notes to Claude. Say: *"This story failed the grading rubric. Diagnose and advise."* |

**Fix Decision (scores 14–17):**
- Dimension 4 failed (Audio Quality) → Open `MIX_NOTE_PROTOCOL.md` → write a Mix Note → bring to Claude → Claude writes Hal instruction → Hal re-mixes → re-listen
- Any other dimension failed → Go back to the script writing chat with your notes → Claude revises → re-validate → re-send to Hal → re-listen

---

## STEP 8 — PUBLISH
**Your time: 1 minute**

Tell Hal in Telegram:
> *"Approved. Set is_hidden = false for story UUID [UUID]."*

Hal confirms. Story is live in the app.

---

## QUICK TROUBLESHOOTING

| Problem | What to do |
|---|---|
| Claude writes a bad script | Reply in same chat with specific notes. Don't start a new chat — Claude has the context. |
| Script fails validator | Paste failure list back into the script writing chat. Say "Fix these." Re-validate. |
| Hal doesn't confirm session start | Send the protocol message again. If still unresponsive, run Hal recovery commands. |
| Hal produces wrong audio | Use Mix Note Protocol → Claude → Hal re-mix |
| Story scores below 14 | Bring rubric scores to Claude for diagnosis before any rework |
| Same problem in 3+ stories | Log it in Pattern Log in grading rubric. Bring to Claude to update the rules. |

---

## FOLDER STRUCTURE TO CREATE NOW

Run this once in Terminal to set up your working folders:

```
mkdir -p ~/Projects/drivetimetales/docs/Briefs && mkdir -p ~/Projects/drivetimetales/docs/Scripts
```

Then your working files always live at:
- Briefs: `~/Projects/drivetimetales/docs/Briefs/Brief_[StoryTitle].md`
- Draft scripts: `~/Projects/drivetimetales/docs/Scripts/Script_[StoryTitle]_DRAFT.md`
- Validated scripts: `~/Projects/drivetimetales/docs/Scripts/Script_[StoryTitle]_VALIDATED.md`

---

## SESSION SUMMARY — FILL THIS OUT AFTER EVERY STORY

```
STORY PRODUCTION RECORD
========================
Title:
Author:
Genre:
Type: standalone / series episode X of Y
Date produced:
Story UUID:
Grading score: ___ / 25
  Hook: _/5  Clarity: _/5  Pacing: _/5  Audio: _/5  Landing: _/5
Published: yes / no
Notes:
```

Save each record as `Record_[StoryTitle].md` in `~/Projects/drivetimetales/docs/Records/`

---

*Pick this sheet up at the start of every story. Put it down when it publishes.*
*STORY_PRODUCTION_PROCESS.md — Endless Tales · Version 1.0 · April 2026*
