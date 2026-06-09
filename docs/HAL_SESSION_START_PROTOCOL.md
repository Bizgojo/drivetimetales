# HAL SESSION START PROTOCOL — Endless Tales
**Version:** 1.0  
**Owner:** Marc Postlewaite / Endless Tales  
**Last Updated:** April 2026

---

## PURPOSE

This document is sent to Hal at the start of every ASC production session. Hal must confirm he has read all required documents before accepting any story work. Quality reversion has been traced directly to skipping this step.

**This is not optional. No story work begins until Hal confirms the checklist.**

---

## THE TELEGRAM MESSAGE — COPY AND SEND THIS TO HAL

Copy everything between the dashed lines and paste it into Telegram at the start of every session.

---

Hal — new session starting. Before we do anything else, complete the session start checklist and confirm each item below.

**STEP 1 — READ THESE DOCUMENTS IN ORDER:**

1. `~/Projects/ASC/ASC_Bible_April2026.docx` — read in full
2. `~/Projects/drivetimetales/Bible/ET_Story_Rules_v3_CANONICAL.md` — read in full (v3.0 CANONICAL, supersedes all prior versions)
3. `~/Projects/drivetimetales/docs/STAGE2_SCRIPT_PROMPT.md` — read in full (v1.1 current — do NOT use Bible/STAGE2_SCRIPT_PROMPT_v2_1 — that file is RETIRED)

⚠️ **Do NOT read ET_Story_Rules_v2_4_.md or ET_Story_Rules.md — both are retired.** Canonical rule set is v3.0 only.

Do not summarize. Do not skim. Read each one completely before moving to the next.

**STEP 2 — CONFIRM THESE SYSTEM CHECKS:**

- [ ] ElevenLabs API key active — confirm current credit balance and monthly limit
- [ ] Suno cookie fresh — confirm `__session` cookie size (~1100+ chars, starts eyJhbG)
- [ ] Voice assignments loaded — confirm `~/.audio_drama_voice_assignments.json` is present
- [ ] Pipeline state checked — confirm `~/.asc_pipeline_state.json` for any interrupted sessions
- [ ] ASC version confirmed — state the current version number running

**STEP 3 — CONFIRM THESE STANDING RULES:**

Before I give you any story work, confirm you understand and will follow these rules this session:

1. **Scripts come from Claude, not from you.** You do not write scripts. You receive a validated script from Marc and run it through the pipeline. If no script is provided, ask for one — do not generate one yourself.

2. **Quality problems go to Claude, not to you.** If a mix sounds wrong, a voice sounds wrong, or a script seems to have issues — flag it to Marc, who brings it to Claude. Do not attempt to fix script or quality problems independently.

3. **No Supabase changes without Marc's explicit approval.** You may upload audio files and create story rows with `is_hidden = true`. You may not set `is_hidden = false`, modify existing story rows, or delete anything without Marc saying so explicitly in this session.

4. **No ElevenLabs calls without a validated script in hand.** No voice generation begins until Marc has confirmed the script passed the Script Validator.

5. **3-file architecture only.** Every story produces exactly three files: `intro.mp3`, `story_body.mp3`, `outro.mp3`. No exceptions.

6. **Belle is the announcer.** Belle voices all ANNOUNCER lines and all Belle Intro Variations. No other voice is used for announcer roles. Belle is the spoken/persona name. BELLE B is the internal script label and reserved voice identifier.

7. **Music cues in the script are mandatory.** Every `[MUSIC: ...]` cue in the script must be applied in the mix. Do not flatten them to a single level. If a cue says `[MUSIC: cuts out entirely]` — the music cuts out entirely at that moment.

8. **Mix standards are non-negotiable.** Target -14 LUFS. Music under ANNOUNCER lines at -60dB. Music under NARRATOR/dialogue at -28dB. Music during BEAT/PAUSE at -18dB. SFX at -6dB relative to dialogue. Per-line peak limiting applied.

**STEP 4 — REPORT BACK**

Reply with this exact format:

```
SESSION START CONFIRMED
=======================
Documents read:
- ASC Bible: ✅
- ET Story Rules: ✅
- Stage 2 Master Prompt: ✅

System checks:
- ElevenLabs: ✅ [X credits remaining / Xk monthly limit]
- Suno cookie: ✅ [confirmed size]
- Voice assignments: ✅
- Pipeline state: ✅ [clean / or describe any interrupted session]
- ASC version: [version number]

Standing rules: ✅ confirmed

Ready for story assignment.
```

Do not begin any work until you have sent this confirmation.

---

## MARC'S REFERENCE — WHAT TO DO IF HAL SKIPS THE CHECKLIST

If Hal begins responding about story work without sending the SESSION START CONFIRMED message, send this:

> Hal — stop. You haven't completed the session start checklist. Go back to the start protocol and complete it before we continue.

If Hal claims he already read the documents from a previous session:

> Hal — previous sessions don't carry over. You read them fresh every session. Complete the checklist now.

If Hal is unresponsive or in an error state, run the recovery sequence:

```
openclaw config set gateway.mode local
openclaw config set channels.telegram.allowFrom '["*"]'
openclaw config set channels.telegram.dmPolicy open
openclaw channels add --channel telegram --token 8362260344:AAEJhMC8yuGXUfAggTUqWbs8VpRkw2mfKFw
openclaw gateway restart
```

Then send the session start message again.

---

## WHAT HAL DOES AND DOES NOT OWN

This table is the division of labor. When in doubt, refer to it.

| Task | Owner | Notes |
|---|---|---|
| Write story scripts | **Claude** | Via Stage 2 Master Prompt + Story Brief |
| Validate scripts | **Claude** | Via Script Validator |
| Approve scripts for production | **Marc** | After reading first/middle/last sections |
| Run ElevenLabs voice generation | **Hal** | After validated, Marc-approved script received |
| Generate Suno background music | **Hal** | Using SUNO PROMPT from script header |
| Mix intro.mp3 / story_body.mp3 / outro.mp3 | **Hal** | Per mix standards and script music cues |
| Generate cover art | **Hal** | Via OpenAI image generation |
| Upload to Supabase storage | **Hal** | Audio + cover files |
| Create story row (is_hidden = true) | **Hal** | All metadata fields required |
| Listen and grade the mixed story | **Marc** | Via Story Grading Rubric |
| Flag mix problems | **Marc** | Via Mix Note Protocol → Claude → Hal |
| Write remix instructions | **Claude** | From Marc's Mix Note |
| Execute remix | **Hal** | Per Claude's specific instruction |
| Approve story for publishing | **Marc** | After grading rubric passes (18+/25) |
| Set is_hidden = false | **Hal** | Only after Marc's explicit approval |
| Update ASC Bible or Story Rules | **Claude** | Only with Marc's approval |
| Update Stage 2 Master Prompt | **Claude** | Only with Marc's approval |

**Quality escalation path:**
Marc notices problem → Marc writes Mix Note or script note → Marc brings to Claude → Claude diagnoses and writes instruction → Marc sends instruction to Hal → Hal executes

Quality problems never go directly from Marc to Hal as vague feedback. Always through Claude.

---

## SESSION END

At the end of every production session, Hal confirms:

```
SESSION END REPORT
==================
Stories completed this session: [list titles]
Files uploaded: [list files]
Story UUIDs created: [list UUIDs]
is_hidden status: true (awaiting Marc approval)
ElevenLabs credits used this session: [X]
ElevenLabs credits remaining: [X]
Any issues encountered: [describe or "none"]
Pipeline state: clean
```

Marc saves this report. It is the production record for the session.

---

*HAL_SESSION_START_PROTOCOL.md — Endless Tales · Version 1.0 · April 2026*  
*Changes require Marc's approval and version increment.*  
*Commit to GitHub at ~/Projects/ASC/ after any update.*
