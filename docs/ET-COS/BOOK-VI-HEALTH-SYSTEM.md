# ET-COS Book VI — The Health System
**Version:** 1.0 · Founding Edition
**Status:** DRAFT for Marc review
**Authority:** This Book owns quality measurement, gates, repair triggers, and the story lifecycle. Book VI overrides all other Books on quality gate decisions.

---

## Chapter 1 — Why Stories Need Health Scores

A production system without a quality measurement system produces stories of unknown quality. Endless Tales cannot build listener loyalty on unknown quality.

The Health System exists to make quality explicit, traceable, and correctable before a story reaches the listener.

**Three principles:**
1. Every problem that reaches a listener was a problem that was detectable before publishing
2. Quality gates exist to catch problems — not to slow production
3. A story that fails a gate is not a failed story — it is a story that needs more work

---

## Chapter 2 — The NEDS Score (0–100)

NEDS (Narrative Engagement and Delivery Score) is the 30-point rubric scaled to 100.

### Scoring Rubric

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| Hook Speed | 5 pts | Does the listener lock in within 90 seconds? |
| Hook Type | 3 pts | Is the hook appropriate for the genre and premise? |
| Protagonist Investment | 5 pts | Do we care what happens to this person within 2 minutes? |
| Stakes Clarity | 4 pts | Are we clear on what the protagonist stands to lose? |
| Cliffhanger Strength | 5 pts | Would the listener immediately start Episode N+1? |
| Pacing | 3 pts | Does the story move at the right speed for its genre? |
| Audio Quality | 3 pts | Is the audio clean, well-mixed, and comfortable to listen to? |
| Belle B Execution | 2 pts | Does the intro/outro serve the story and land emotionally? |

**Total: 30 points × (100/30) = 100-point scale**

### NEDS Thresholds

| Score | Status | Action |
|-------|--------|--------|
| 85–100 | ✅ Excellent | Publish as-is; flag for featured tier |
| 70–84 | ✅ Good | Publish; note improvement areas for next story |
| 55–69 | ⚠️ Acceptable | Publish with watch; monitor completion rate after launch |
| 40–54 | 🔧 Needs Work | Hold for repair; specific dimension targets must be identified |
| 0–39 | ❌ Fail | Do not publish; fundamental story problem; Marc review required |

---

## Chapter 3 — The Nine Preflight Checks

Before voice generation begins, all nine preflight checks must pass. A single failure blocks production.

| # | Check | What It Tests |
|---|-------|--------------|
| 1 | Script Metadata | All 6 headers present and non-empty |
| 2 | Belle B Intro | BELLE B INTRO section present; BELLE B: line present |
| 3 | Belle B Outro | BELLE B OUTRO section present; BELLE B: line present |
| 4 | Series Metadata | series_name, episode_number, episode_title, genre, duration_mins set |
| 5 | Author Resolved | story.author_id links to a valid author with narrator_id set |
| 6 | Narrator Resolved | author's narrator_id links to narrator_voices.elevenlabs_voice_id |
| 7 | Voice Code Format | All characterVoiceCodes match `/^[A-Z0-9]{2}(-[A-Z0-9]{2}){5}$/` |
| 8 | Voice Code Registry | All characterVoiceCodes resolve in registry (or will be created) |
| 9 | Known Failures | No lines in the script matching known TTS failure patterns |

---

## Chapter 4 — The Audio Gate (Production Exit Gate)

Before any story leaves production for Review, all four must be confirmed:

1. `final_mix.mp3` exists in Supabase storage (`asc3/{story_id}/final_mix.mp3`)
2. `final_mix.mp3` returns HTTP 200 with `content-type: audio/mpeg`
3. Duration > 0 (verified via ffprobe)
4. URL is loadable by the Approval Console audio player

Failure of any condition → story stays in production. **No exceptions.**

---

## Chapter 5 — The Runtime Gate

| Format | Required Duration | Action if Failed |
|--------|------------------|-----------------|
| Standard episode | 15–22 minutes | Hold; expand script or move to cold_storage |
| Mini series | 15–22 minutes per episode | Hold; same |
| Short-form (designated) | No minimum | Marc must designate before production |
| Standalone short | Marc-defined | Marc must set target in Brief |

Duration is measured from `ffprobe` output on `final_mix.mp3`. DB field `duration_mins` is set from this measurement, not estimated.

---

## Chapter 6 — The Repair Shop

A story enters the Repair Shop when:
- Audio Gate fails after production
- Runtime Gate fails after production
- Marc flags a published story for correction
- A QC check fails on a previously passing story

### Repair Shop Rules

1. **Repair has absolute priority over new production.** Finish current job, then check repair queue before starting anything new.
2. Verify all four Audio Gate conditions before moving a repaired story to Ready for Review.
3. Verification checklist:
   - `final_mix.mp3` exists ✅
   - HTTP 200 + audio/mpeg ✅
   - Nonzero duration ✅
   - Approval Console can play it ✅
4. If repair succeeds → move directly to `ready_for_review`. Notify Marc.
5. If repair fails → leave in `repair_queue` with `repair_status = failed` and document failure in `review_notes`. Do NOT move to RFR.

### Hal Operational States (visible in Production Console)

| State | Indicator | Meaning |
|-------|-----------|---------|
| 🔵 Actively Producing | Blue | A new story generation job is running |
| 🟡 Waiting | Yellow | No job running; repair queue empty; no active instruction |
| 🔧 Actively Repairing | Wrench | Working through repair queue |
| 🔴 Blocked | Red | Repair attempted and failed; Marc attention required |
| 🟢 Finished | Green | Repair complete; story in RFR; ready for Marc review |

---

## Chapter 7 — The Story Lifecycle

```
Stories in Queue
    → In Production (voice generation, mix)
    → Repair (if any gate fails)
    → Ready for Review (all gates passed)
    → Ready to Publish (Marc approved, holding)
    → Published (is_hidden = false, live to subscribers)
    → Cold Storage (retired, shelved, or superseded)
```

**A story appears in exactly ONE workflow category at all times.**

Transitions:

| From | To | Trigger |
|------|-----|---------|
| Queue | In Production | Marc initiates job |
| In Production | Repair | Gate failure |
| In Production | Ready for Review | All gates pass |
| Repair | Ready for Review | Repair passes all gates |
| Repair | Cold Storage | Repair fails; Marc decides to shelve |
| Ready for Review | Ready to Publish | Marc approves in Approval Console |
| Ready to Publish | Published | Marc sets is_hidden = false |
| Any | Cold Storage | Marc retires the story |
| Cold Storage | Queue | Marc reactivates (rare) |

---

## Chapter 8 — Frozen Inventory Rule

Once a story reaches Ready for Review, its creative content is frozen.

**Hal may NOT (without moving to Repair first):**
- Alter script, prose, or story content
- Replace or alter audio files
- Change cover art
- Modify title, author, or description

**Allowed exceptions** (log each in `review_notes` with: date, field, old value, new value, reason):
- Fix a broken thumbnail URL
- Fix a missing narrator display name
- Fix a bad status flag
- Minor non-story metadata fix

---

## Chapter 9 — Story Health Dashboard (Spec)

The Story Health Dashboard is a planned Admin Console page. Not yet built (as of June 26, 2026).

**Required views:**

| View | What It Shows |
|------|--------------|
| Production Gate Status | Live view of all stories in production — which gates have passed |
| NEDS Score Distribution | Histogram of scores across published catalog |
| Completion Rate Leaderboard | Top and bottom stories by listener completion rate |
| Series Continuation Rates | By series, EP N → EP N+1 conversion |
| Repair Queue | All stories in repair, with failure reason and assigned repair action |
| Franchise Watch | Stories with Franchise Potential ≥ 8, tracking toward threshold |

**Build priority:** Post-launch. After catalog reaches 25+ published stories with listener data.

---

## Chapter 10 — Early Investment & Orientation Gate

**Added:** 2026-06-26 · Marc Postlewaite
**Status:** Enforceable production gate. Hal must not dispatch a script to audio if this gate fails.

### Core Principle

> **Clarity of situation. Mystery of cause.**

The listener must understand enough to care before they are asked to wonder why something is happening. We do not explain everything early. But we anchor the listener in a person and a situation before we ask them to hold questions.

Mystery is welcome. Confusion is not. A confused listener stops listening. A curious listener cannot.

### The Five-Question Test (must be answerable by minute 3)

At the three-minute mark of any episode, a first-time listener must be able to answer:

1. **Who am I emotionally following?** (protagonist or emotional anchor is clear)
2. **What is happening right now?** (immediate situation is understood)
3. **What does this person want, fear, or need?** (visible pressure is present)
4. **Why does it matter?** (stakes are established at a personal level)
5. **What question am I listening to answer?** (one clear listening question has been opened)

Failure on any of these five questions is a gate failure.

### Production Requirements

| Requirement | Window | Gate |
|------------|--------|------|
| Protagonist or emotional anchor is clear | First 60–90 seconds | Hard |
| Listener understands the immediate situation | First 2 minutes | Hard |
| Visible pressure: need, wound, danger, obligation, or desire | First 2 minutes | Hard |
| One clear listening question is open | First 3 minutes | Hard |
| At least one emotional hook: sympathy, admiration, urgency, fear, curiosity, concern, or identification | First 3 minutes | Hard |
| Episode 1 of any series passes this gate with extra strictness | Full episode | Hard |
| Every non-final episode re-orients the listener quickly before deepening conflict | First 2 minutes | Hard |
| Opening does not rely on "it makes sense later" as its primary strategy | First 3 minutes | Hard |

### What Is and Is Not Allowed

**Allowed:** Mystery of cause, withheld backstory, unnamed threat, ambiguous antagonist, deferred explanation of why something is happening.

**Not allowed:** Mystery of situation — the listener not knowing what is physically happening, who they are following, or why they should care.

### Repair Protocol

| Failure Pattern | Fix |
|---------------|-----|
| Story is mysterious but confusing | Clarify the situation while preserving the deeper mystery. Do not flatten the mystery — anchor it. |
| Story introduces plot before emotional attachment | Add personal stakes, pressure, vulnerability, competence, or desire earlier. |
| Protagonist is not clear in first 90 seconds | Move the protagonist's name, action, or feeling into the first scene. |
| Opening relies on atmosphere without a person | Anchor the atmosphere to someone experiencing it. |
| The listening question is implicit, not felt | Make the question concrete. The listener should feel pulled toward an answer. |

**The fix is never "explain more." The fix is "anchor the listener earlier."**

### Enforcement Rules

- **Hal** must not dispatch a script to audio generation if the first three minutes fail this gate.
- **Orion** must treat repeated early-confusion or low-investment openings as a production quality issue — not a creative preference.
- **Series Episode 1** is held to the highest standard. It sets listener attachment for the entire series. Failure here is a series-level risk.
- This gate is checked at script review, before preflight, before voice generation.

### Script Review Checklist Item (mandatory)

Add to every script review:

> ☐ **Early Investment & Orientation Gate:** Does the first three minutes create emotional investment and basic orientation? Can a first-time listener answer all five orientation questions by minute 3?

---

*Cross-reference: Book I Ch 4 (The Listener Promise) · Book V Ch 3 (Cliffhanger Standard) · Book III Ch 1 (Production Chain)*
