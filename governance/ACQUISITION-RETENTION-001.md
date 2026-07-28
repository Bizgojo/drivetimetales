# ACQUISITION-RETENTION-001 (v1.6)

**Status:** Canon. Source of truth for the acquisition serial and the retention library.
**Owner:** Marc. No agent may override, reinterpret, or "improve" these rules.
**Why this file exists:** Rules that live only in conversation cannot be checked, so a subagent built a promo story that ignored them and cost days. Every produced story is checked against THIS file before it is built. If a story is not checked against this file, that omission is the defect — stop and fix it first.

---

## PART A — ACQUISITION LAYER
*The front door. Turn a cold ad-clicker into a no-card free-week signup, then convert to paid before the story ends.*

### A1. The episode ramp (each episode: hook in first 15 spoken words + strong cliffhanger)
| Episode | Length | ~Words | Notes |
|---|---|---|---|
| Ep 1 | ~90 sec | ~250 | Cold open, no Belle. First spoken line is story. |
| Ep 2 | ~3 min | ~500 | Ramp step. |
| Ep 3 | ~5 min | ~750 | Ramp step. |
| Ep 4+ | 12–15 min | ~2,500–3,500 | Full retention length, for the rest of the series. |

The listener is eased in — each episode asks a little more as they get more hooked. This matches the proven audio-serial pattern (Pocket FM ramps its first three episodes, then runs 10–15 min standard).

### A2. The cold open
- The opening episode starts **cold** — first spoken line is story dialogue or action, hook within the **first 15 spoken words**, no scene-setting.
- **The acquisition hook is spoken by a CHARACTER, in-scene — not the narrator** (Marc's ruling, Option 1). Maximum immediacy: the listener is dropped straight into the character's crisis. Because keyword HOOK-GATE-001 reads narrator lines only, **acquisition openers are verified by the LLM-rubric hook check, not the keyword gate** (the LANDING-STORY exemption path — this is expected, not a failure).
- **Greenville-local:** the test market is Greenville, SC. The location name is spoken at or near the **very first line**, before the listener can back out (geo-targeted stories rule).
- Every pre-signup episode ends on a **hard cliffhanger**.
- Pre-signup episodes have **no Belle** — the ad-clicker is anonymous.

### A3. The ask
- To continue past the free episodes, the listener signs up for the **free week**: **name + email only, no credit card.**
- After signup, **Belle personalizes the intro and re-emphasizes the cliffhanger on the outro** from that point on.
- Lowest-friction ask: **test one-tap login (Google/Apple) + progressive name capture** against a plain name+email form.

### A3b. The post-signup transition (anonymous → known)
- **Seamless auto-continue:** the instant name + email are entered, playback **auto-continues into the first post-signup episode** — no manual restart, no dead stop on the cliffhanger.
- **Belle's first appearance:** that first post-signup episode **opens with Belle warmly welcoming the listener to Endless Tales by name**, then flows into the personalized intro and the episode. This is the anonymous→known handoff.
- **One-time welcome:** the "welcome to Endless Tales" plays **only on this first post-signup episode**. Every episode after gets Belle's standard personalized intro, not the welcome again. *(Confirm with Marc if he wants it every session instead.)*
- **Full app unlocks:** at signup the listener has full catalog access. Auto-continue is the default, but they can pause and play anything else.
- **Adaptive bridge opening (REQUIRED):** because the wall falls after a different ramp episode in each test arm (A/B/C), the listener enters the first post-signup episode having **skipped** the ramp episodes that came after their wall. That episode MUST therefore provide a **distinct bridge opening for each entry point** (from Ep1 / from Ep2 / from Ep3) that catches the listener up on the skipped beats in-character, then merges into a **common episode body** (identical across arms — only the first ~60–90 sec adapts). The from-latest-episode arm (e.g. Test C entering from Ep3) opens as written; earlier entry points get progressively longer catch-up bridges. The platform serves the correct opening per test arm — same mechanism as the Belle-welcome injection. Each bridge must still: hook inside 15 words, name Greenville, and leave no continuity gap.

### A4. The trial
- Free week = **7 days to start** — deliberately shorter than the time to finish the series, so the conversion moment lands mid-story. Extend to 2 or 4 weeks later, once we've proven we can convert.
- During the trial: **nothing locked, full catalog access.**
- **CTA to subscribe fires at trial end**, before the series ends, at maximum hunger. Lock screen: *"Continue the story — $7.99/month."*

### A5. Judging
- The acquisition series is judged as a **marketing asset** — does a stranger tap again, sign up, and convert — **not** by the 30-point library rubric.

---

## PART D — THE GREENVILLE TEST MATRIX

### D1. What we're testing
1. **How many free episodes before the name+email ask** converts best: after Ep1 (Test A), Ep2 (Test B), or Ep3 (Test C).
2. **Which genre** pulls best in the Greenville market.

### D2. Structure — 12 test cells, but only 4 stories written
- **4 genres:** Mystery/Thriller, Horror, Comedy, Heartwarming.
- **Write ONE Greenville-local series per genre = 4 stories total.** Each series = the 3-episode ramp opening (Ep1/2/3 per A1) followed by **twenty-five 12–15 min episodes** after the ask.
- **Test A/B/C is a gate-position setting, not a rewrite.** The episodes are the same content; only *where the name+email gate is inserted* moves:
  - **Test A:** Ep1 → ask → standard episodes.
  - **Test B:** Ep1 → Ep2 → ask → standard episodes.
  - **Test C:** Ep1 → Ep2 → Ep3 → ask → standard episodes.
- **4 genres × 3 gate positions = 12 test cells** — produced from **4 story writes**, not 12. (Do NOT write 12 separate series; that is ~300 episodes of production for the same learning.)
- **CONFIRMED BY MARC:** Test A/B/C is a **gate-position setting on the same content**, not three separate story rewrites. Four writes total — one per genre.

### D3. Generic control — OUT (decided by Marc)
The July 2026 Meta test was designed to answer "do Greenville-local stories beat generic?" (it ran a `grave-he-dug` generic control) but produced **zero signups and ~90% no-play**, so the local-vs-generic question was never answered. **Marc's decision: no generic control arm.** All 12 cells are Greenville-local. This matrix tests episodes-before-ask and genre, not local-vs-generic.

---

## PART E — AD CREATIVE & LANDING (sound-off first)

### E1. The ad must work with SOUND OFF
Meta feed ads autoplay **muted** — the spoken hook is never heard in the ad. Therefore:
- The 15-word character hook appears as **bold on-screen text** in the first seconds of the ad video, captioned throughout.
- The ad is a **silent, captioned teaser** whose only job is to stop the muted scroll and earn the tap.
- The **spoken** hook is the post-click payoff on the landing page, not the ad's first job.
- The ad's click button uses Meta's **preset** CTA (no custom label possible in the ad unit); "Listen Now" is the closest to the invitation feel. Susan confirms the current preset list.

### E2. The landing page invitation button (full control here)
- The bold hook is shown on screen.
- A single button invites the listener to **overhear**, framed as eavesdropping — **NOT a media player**. No play triangle, no scrubber. Copy in the family of *"Listen in…" / "Press to overhear" / "Come closer."* Visual cue of curiosity (keyhole / ear / soft pulse), not a media control.
- **On press:** audio starts from the **very first line** (the cold-open hook), and the image **morphs from the hook card to the story's cover art.**
- Rationale: "play" makes a cold stranger weigh whether they have time; "eavesdrop" spikes curiosity at near-zero perceived commitment — the same low-commitment thesis as the 90-second episode.

---

## PART F — VOICE CASTING
No voice is auditioned or rendered until a CASTING SHEET exists and Marc has approved the voice by ear on real script lines.

F1. The casting sheet (required before any audition)
For EVERY speaking character, Hal delivers: name & role; age (specific); gender; vocal quality/mood (ElevenLabs descriptors — warm, gravelly, clipped, weary, authoritative, anxious…); accent/regional; emotional register across the arc (and whether it shifts); line count per-episode AND total; adjacency (which characters they share scenes with); and a distinctness flag ("must be clearly distinct from ___") for every character they appear alongside.

F2. Distinctness is the priority (anti-doppelganger rule)
The casting sheet MUST map adjacency and flag danger pairs — any two characters in the same scene must sound clearly different (age/register/accent). Two confusable voices in one scene is the failure that retired the Cass story. The SET must be mutually distinguishable, not just each voice good alone.

F3. Approval
Marc approves every voice by ear, on actual lines from the real scripts — 2–3 candidate clips per role. No render proceeds until each voice is approved. ElevenLabs minor-voice rule still applies (no cloning under 18; minimum speaking-character age 14).

---

## PART C — PERMANENT FREE TIER (unconverted users)
1. A non-subscriber may play **Episode 1 of any SERIES exactly once** — a one-time free sample per series.
2. **Replaying that Episode 1, or playing anything past it, requires a subscription.**
3. **Standalones are excluded** — subscriber-only, no free Episode 1.
4. Every free series Episode 1 ends on a **cliffhanger** with a **"continue the story" CTA**.
5. The paywall sits at the **Episode 2 boundary, on the cliffhanger** — never mid-episode.
6. Enforcement: the one-play limit is tracked **against the user's account** (post-trial lapsed users have an account from signup).

---

## PART B — RETENTION LIBRARY
1. The full variety of story lengths and formats already produced.
2. Series run **1 to 30 episodes**.
3. Episodes are **12–15 minutes**.
4. Every episode opens with a strong hook in the **first 15 spoken words**.
5. Every **non-final** series episode ends on a **cliffhanger**.
6. **Standalones and series finales** end on a **satisfying resolution that answers all questions** — not a cliffhanger.
7. Belle gives the personalized intro using the listener's name and re-emphasizes the cliffhanger on the outro.
8. ENDING-RULES-001 codifies the cliffhanger-vs-ending distinction with an LLM-judgment gate.

---

## BELLE RECONCILIATION
The **only** Belle-free moment in the entire system is the pre-signup acquisition episodes. The instant the listener signs up, Belle personalizes everything after — beginning with a one-time "welcome to Endless Tales" on the first post-signup episode (per A3b), then her standard personalized intro/outro on every episode thereafter.

---

## OPEN TESTS (decisions on record, not assumptions)
1. Free episodes before the ask: **1 vs 2 vs 3** (Tests A/B/C).
2. Genre pull: **Mystery/Thriller vs Horror vs Comedy vs Heartwarming**.
3. Signup form: **one-tap login + progressive name capture** vs plain name+email form.
4. Trial length: **start 7 days**; test 14 and 28 once conversion is proven.
5. Generic control arm: **OUT** (decided — all cells Greenville-local).

---

## THE GATE — pre-render checklist (mandatory)
No story renders until it passes this checklist and the **filled-in result is shown to Marc**. Checked against THIS file. "Orion says it passed" is not acceptable — pass/fail per line, with evidence (quotes, word counts).

### Gate A — each acquisition ramp episode
- [ ] Opens cold; first spoken line is story; **no Belle**. *(quote first line)*
- [ ] Hook within first **15 spoken words**. *(quote words 1–15)*
- [ ] **Greenville named at/near the first line.** *(quote it)*
- [ ] Length matches the ramp (Ep1 ~250w / Ep2 ~500w / Ep3 ~750w). *(state actual word count)*
- [ ] Ends on a hard cliffhanger. *(quote final line + name the open question)*
- [ ] No LISTENER_NAME / Belle anywhere pre-signup. *(confirm absent)*
- [ ] **Audio matches approved script** — final-mix transcript vs script. *(paste first 15 transcript words)*

### Gate B — post-signup episodes + all Retention stories
- [ ] Hook within first **15 spoken words**. *(quote words 1–15)*
- [ ] Belle personalized intro (uses name) + outro re-emphasizes cliffhanger. *(quote both)*
- [ ] First post-signup episode only: **Belle "welcome to Endless Tales" by name** is present. *(quote it)*
- [ ] First post-signup episode: a **bridge opening exists for each test arm's entry point** (from Ep1 / Ep2 / Ep3), each catching up the skipped ramp beats with no continuity gap and hook inside 15 words. *(confirm all arms)*
- [ ] Correct ending: **cliffhanger** if non-final series episode; **full resolution** if standalone/finale. *(state which + why)*
- [ ] Length 12–15 min. *(state actual duration)*
- [ ] **Audio matches approved script** — transcript vs script. *(paste first 15 transcript words)*
- [ ] Casting sheet exists for all speaking characters (age/gender/mood/accent/line-count/adjacency/distinctness), danger pairs flagged, and every voice was approved by Marc by ear on real script lines. *(confirm sheet + approvals)*

### Enforcement
1. Checklist filled and shown to Marc **before** render; audio-match line re-run **after** render, before the story reaches the review queue.
2. Any failed line stops the story — fixed and re-checked, not waved through, not "reframed" to pass.
3. A skipped checklist is itself the failure. Marc stops production there.
4. No agent marks this "done." Done = every line checked, shown, passing against this file.

---

## CHANGE CONTROL
Changes only by Marc's explicit word, committed as a new version. No subagent edits it. Any story or funnel behavior that conflicts with this file is wrong, regardless of what any agent reported.
