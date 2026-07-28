# The Fourth Woman — Production Plan
**Status:** ACTIVE PLAN  
**Decision Date:** 2026-07-27 (Marc)  
**Replaces:** Cass acquisition test  

---

## 1. Story Switch — Why Cass Was Retired

Cass is retired from the acquisition funnel.

**Root cause:** Doppelganger voice confusion. The Cass concept required the listener to track that the voice they hear in the car might be a copy of the driver. When used as a short promo arm, listeners could not distinguish the "original" from the "copy" quickly enough — this contaminated arm data by introducing a comprehension variable we couldn't isolate. Conversion differences between arms could reflect confusion, not story length preference.

Cass remains in the library as an existing series but will not be used as the primary acquisition vehicle.

**Replacement:** The Fourth Woman.

---

## 2. The Fourth Woman — Premise

**Character:** Claire Bennett  
**Background:** Radio reporter, Greenville Herald  
**Location:** Greenville, SC  

Claire is investigating the disappearances of three local women. Following a tip, she arrives at a bus station storage locker — Locker 214 — and hears a voice through a pair of found headphones. The voice tells her the women didn't disappear. They were hidden.

**Core guardrail:** The Fourth Woman is a *separate person* from the three missing women. She is the reporter/investigator, not a doppelganger, not a copy, not a voice from the future. There is no identity ambiguity in the premise.

**Three distinct voices (must be maintained throughout production):**
1. Male anchor — radio broadcast framing device, heard in first 10 seconds
2. Claire Bennett — protagonist, first-person narration
3. Voice in headphones — the witness speaking to Claire from hiding

Maintaining voice distinctness is a production gate (see Section 6).

---

## 3. Story Structure

### PROMO TRACK (Acquisition)

One story. Three lengths. Same cliffhanger.

| Arm | Label | Target Length | Content |
|-----|-------|---------------|---------|
| arm=1 | 90s promo | ~90 seconds | Radio anchor intro + Claire arrives at locker |
| arm=2 | 3min promo | ~3 minutes | Above + more setup, tension builds |
| arm=3 | 5min promo | ~5 minutes | Above + full scene to cliffhanger |

**Mandatory cliffhanger (identical across all three arms):**
> Locker 214. Lights go dark. Voice through headphones:  
> *"Claire… they told everyone we disappeared. We didn't."*

All three arms end on this line. The cliffhanger is not negotiable and must not be cut for brevity in arm=1.

**Wall:** After cliffhanger, playback stops. User must sign up or log in to continue.

**After wall:** Promo listeners enter at **Episode 2** (not Episode 1).

### LIBRARY TRACK (Browse / Start Over)

| Episode | Length | Notes |
|---------|--------|-------|
| Ep1 | 12–15 min | Full intro. Belle introduced. Ends on the same cliffhanger as promos. |
| Ep2 | ~15 min | Story continues. Both promo converts and browse-in listeners start here. |
| Ep3–6 | ~15 min each | Arc deepens. Hal subplot. Councilman Merritt. |
| Ep7 | ~20 min | FINALE. Full resolution. No cliffhanger (see ENDING-RULES-001). |

**Two-door model:**
- Door 1 (promo → wall → sign up) → enters at Ep2
- Door 2 (browse app, tap "Start Over") → enters at Ep1

Both doors converge at Ep2. Ep2 must work as a cold entry for promo converts who skipped Ep1.

---

## 4. Landing Page — "The Greenville Herald"

**Concept:** Fake newspaper article as the landing/share page for the series.

**Design requirements:**
- Serif masthead — "The Greenville Herald"
- Bold headline (story hook, not series title)
- Byline: Claire Bennett
- Article body: 2–3 paragraphs, journalistic tone
- Disclaimer: **"A dramatized story from Endless Tales"** — must be visible on load, not buried below fold
- No autoplay on landing. User taps to listen.

**Purpose:** Increases perceived authenticity. Share-able artifact. Works as cold traffic landing page from paid ads.

---

## 5. Hal Arc Summary (Ep2–Ep7)

This is the full story the listener is buying into after the cliffhanger.

**Diana Voss** — forensic accountant. One of the four women. Alive. In hiding. She discovered the financial thread.

**Councilman Merritt** — rezoning fraud. Claire's investigation reveals Merritt has been manipulating land use records to route city contracts to shell companies. The four women were witnesses or investigators of different threads of the same scheme.

**Ep7 Finale:**
- Claire broadcasts live on Greenville radio
- FBI moves on Merritt
- All four women are free at Liberty Bridge
- Full resolution. No dangling threads. No cliffhanger.

---

## 6. Production Gates (Ordered — No Skipping)

```
Arc approval
    ↓
Script approval (per episode, Marc reads)
    ↓
Voice casting sheet + ear auditions on real script lines
    ↓
Voice approval (Marc approves by ear)
    ↓
Render (final audio produced)
    ↓
QA (listen full episode)
    ↓
Ship
```

**Rule:** Nothing ships on verbal "done." Each gate requires explicit sign-off before the next gate opens. Arc approval is a prerequisite for scripts. Voice approval requires scripts locked. Render requires voice approved.

### Voice Approval Gate — Spec (Marc, 2026-07-28)

After scripts are approved, before any render:

1. Identify every speaking character and their line count across all episodes.
2. For each character, source **2–3 candidate voices** from the ElevenLabs library.
3. Render **short audition clips on ACTUAL lines from the real scripts** — not generic samples.
4. Deliver clips to Marc for approval by ear.
5. **No voice renders until Marc approves by ear.** Not on "sounds good," not on written description alone.

**Required characters (at minimum):**
- Male news broadcaster — must sound like a real news anchor; clearly NOT Claire
- Claire Bennett — primary female narrator/protagonist
- Diana Voss — distinct female voice; she is both the headphone voice AND a major recurring character
- Dale Merritt — antagonist
- Renata Osei, Mara Fields, Diane Cho — if they have spoken lines

**Critical constraint:** Every voice must be clearly distinguishable from the others by ear. This is the primary reason Cass was retired — identity confusion between voices. No two major characters may share a register. The register separation table (one row per character, low/mid/high) must accompany the casting sheet.

**Format:** Same as VOICE-APPROVAL-GATE spec (Marc, 2026-07-14): numbered list by line count descending, proposed voice name + ID + preview link or clip, one-sentence justification, register separation table.

---

## 7. Launch Blocker — LISTEN_ARM Column

**BLOCKER:** The `listen_arm` column on the `users` table MUST exist in production before any paid traffic is sent to the promo arms.

Without this column:
- We cannot attribute conversions to the correct arm
- A/B test data is unrecoverable after the fact
- Paid spend cannot be optimized

**Migration file:** `supabase/migrations/20260727200000_add_listen_arm_to_users.sql`

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS listen_arm SMALLINT;
COMMENT ON COLUMN users.listen_arm IS 'Acquisition funnel arm variant: 1=90s promo, 2=3min promo, 3=5min promo';
```

**Route update required:** `app/api/listen/signup/route.ts` must write `listen_arm: armNum` in both the new-user and existing-user upsert blocks.

**Pre-paid-traffic checklist:**
- [ ] Migration applied to production Supabase
- [ ] Route confirmed writing listen_arm for new signups
- [ ] Route confirmed writing listen_arm for returning users (upsert)
- [ ] QA: sign up via arm=1 URL, confirm listen_arm=1 in DB

---

## 8. Docs Needing Update

When scripts are locked, update these documents to reflect Fourth Woman:

| Doc | What Needs Updating |
|-----|---------------------|
| `GVL-MYSTERY-DELIVERY-PLAN` | Replace Cass references with Fourth Woman. Update arm descriptions. |
| `GVL-MYSTERY-TEST-PLAN` | Update acquisition test parameters: 3 arms, new cliffhanger, Locker 214. |

---

## 9. What Does NOT Change

- Episode delivery infrastructure (CanonicalPlayer, token gates) — unchanged
- Supabase schema (except listen_arm addition) — unchanged
- Ep2–Ep7 can reuse existing delivery pipeline
- Library browse flow unchanged
- SERIES-RELEASE-RULE.md still applies

---

## 10. Open Questions (Do Not Block On These)

- Belle's full name and backstory (can be established in Ep1 script)
- Exact Ep2–Ep6 episode titles
- Whether Diana Voss is named in Ep1 or introduced in Ep2
- Casting for male anchor voice

---

## Decision Record

| Decision | Value | Made By | Date |
|----------|-------|---------|------|
| Retire Cass from acquisition | Yes | Marc | 2026-07-27 |
| Replace with Fourth Woman | Yes | Marc | 2026-07-27 |
| Cliffhanger line | "Claire, they told everyone we disappeared… We didn't" | Marc | 2026-07-27 |
| Three arms, three lengths, one cliffhanger | Yes | Marc | 2026-07-27 |
| Two-door model (promo→Ep2, browse→Ep1) | Yes | Marc | 2026-07-27 |
| Landing page = Greenville Herald fake article | Yes | Marc | 2026-07-27 |
| listen_arm = launch blocker | Yes | Marc | 2026-07-27 |
| Ep7 = full resolution, no cliffhanger | Yes (per ENDING-RULES-001) | Marc | 2026-07-27 |
| Arc approved (7-episode) | Yes | Marc | 2026-07-28 |
| Antagonist / engine | Councilman Dale Merritt / Reedy River rezoning fraud | Hal→Marc | 2026-07-28 |
| Fourth woman identity | Diana Voss — forensic accountant, alive in hiding (SEPARATE person, never Claire's double) | Hal→Marc | 2026-07-28 |
| Ep7 resolution | Claire broadcasts evidence; FBI acts; women freed; Merritt network arrested; Diana emerges on Liberty Bridge | Hal→Marc | 2026-07-28 |

---

### Arc Approval Note (2026-07-28)

The 7-episode arc (governance/drafts/FOURTH-WOMAN-ARC.md, commit 34718c82) is APPROVED. Hal may proceed to scripts. Two clarifications MUST hold: (1) Ep1 is TWO separate recordings — PROMO Ep1 (3 lengths, ~90s/3m/5m, cold open) and LIBRARY Ep1 (full 12–15 min, Belle intro) — same events, same cliffhanger, different episodes; the "promo + library" shorthand must not collapse into a single 90-second episode for the library. (2) Ep2 opens from the shared Ep1 cliffhanger and must make sense to both a promo listener (short cut) and a library listener (full Ep1).
