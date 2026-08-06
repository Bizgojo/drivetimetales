# FUNNEL DELTA SPEC — Bell / Arms A & B
**Status:** Proposal for Marc. No code. No production changes.
**Date:** 2026-08-06
**Scope:** What changes to point the existing /listen funnel at Bell, Arms A and B only.

---

## Baseline

The /listen funnel exists and has run in production (Wearing My Face / Cass Greenville). What works today:

- `/listen?arm=N` routing, promo audio serving, wall intercept, name+email capture, auto-continue
- Arm semantics: how many episodes play before wall (arm=1 → 1 ep, arm=2 → 2 eps, arm=3 → 3 eps)
- `users.listen_arm` (INT) written at signup; 216 events logged
- 18-event instrumentation in go_listen_events
- Wall fires on episode completion, not a time threshold

The /listen page hardcodes four WMF story IDs (EP1–EP4) and a single hook line. The signup API writes `listen_arm` (int) but **never writes `listen_arm_label` (TEXT 'A'/'B'/'C')**. The column exists on the table, all 17 rows are NULL.

---

## Change 1 — Episode IDs and Audio Source

**What changes:** Replace hardcoded WMF episode IDs in `page.tsx`.

Bell promo IDs:
- PV1 story ID: a8c8b8d0 (arm=1, Arm A) — 84.96s
- PV2 story ID: a88084ab (arm=2, Arm B) — 186.99s (canon; rebuild in progress)
- Bell EP1 ID: not yet published (placeholder needed at publish time)

**Arm semantic shift:** Currently arm=2 plays episodes[0]+episodes[1] in sequence. For Bell, arm=1 = PV1 only, arm=2 = PV2 only (not PV1 then PV2). The server component (`page.tsx`) should serve the correct promo per arm, rather than always loading a sequential array from index 0.

Cleanest approach: `page.tsx` fetches the right audio per arm before passing to the client. arm=1 gets `[PV1, BellEP1]`; arm=2 gets `[PV2, BellEP1]`. `ARM_EP_COUNTS` stays `{1:1, 2:1}` — one promo before wall for both arms. The client plays episodes[0] then shows wall; episodes[1] is the post-wall continue.

**Length fit confirmation:** Wall fires on episode completion. PV1 (84.96s) for arm=1, PV2 (186.99s) for arm=2. No timing threshold conflict. Lengths fit.

---

## Change 2 — Hook Text

**What changes:** The hook card text, currently a single constant for all arms.

Bell needs arm-specific hook lines (PV1 and PV2 open from different angles). Current structure is a single `EP1_HOOK` string. Needs to become arm-indexed: `{ 1: "[Bell arm=1 hook]", 2: "[Bell arm=2 hook]" }`.

Marc approves exact copy before render. Atlas does not propose hook text — that is story content.

---

## Change 3 — listen_arm_label Chain (the missing link)

**What changes:** One line in `app/api/listen/signup/route.ts`.

Current state: `listen_arm: armNum` is written (INT). `listen_arm_label` is never written. All 17 GVL rows are NULL.

Fix: add `listen_arm_label: armNum === 1 ? 'A' : 'B'` to the users upsert in the signup route.

The column constraint already accepts 'A', 'B', 'C' (migration 20260804120000 Section 1, live). Section 2 (arm_c event constraints) is moot now that Arm C is on hold — do not apply it.

**Backfill question:** The 17 existing GVL signups have `listen_arm_label = NULL`. Those rows could be backfilled (`arm=1 → 'A'`, etc.) from the existing `listen_arm` column with a one-time SQL update. This is a production users table write. Marc decides: backfill or accept historical NULL.

---

## Change 4 — Post-Wall Continue

**What changes:** The hardcoded `EP4_ID` in `app/api/listen/signup/route.ts`.

Current: WMF EP4 (`eac2b1ef`). For Bell: Bell EP1 ID (not yet published).

This is the hard dependency: **the funnel cannot go live until Bell EP1 has a live `story_audio_url` in production**. The auto-continue plays Bell EP1 on the "Go to Endless Tales" tap. Without a live audio URL, the user taps through to silence.

The sessionStorage key used for handoff (`gvl_nowplaying`) will carry Bell EP1 data correctly. The key name is GVL-branded but functional — not a blocker.

---

## Change 5 — Arm C Removal

**What is simplified:**
- Signup route arm validation: `![1,2,3]` → `![1,2]`
- `ARM_EP_COUNTS[3]` in EavesdropClient becomes dead code (can be dropped)
- `listen_arm_label: 'C'` mapping never written

**What is left stranded:**
- `go_listen_events` variant type union still includes `'listen-arm3'` — dead but harmless
- Migration 20260804120000 Section 2 (arm_c event type constraints) should not be applied; document it as superseded by the Arm C hold ruling

No structural damage from removing Arm C. No active users on arm=3, no traffic.

---

## Herald Shell Decision — Three Sentences

The current `/listen` page on main uses the WMF visual (black hook card, orange type, cover-art morph) and is live, tested, and requires no visual cleanup to reuse for Bell. The Fourth Woman herald shell (`wip/fourth-woman-herald-shell`) applies a newspaper/article format to the hook card — thematically appropriate for Bell's cold-case story and gives the funnel a distinct identity from WMF, but requires stripping Fourth Woman content and merging branch changes. **Marc's call:** WMF shell gets Bell live faster with zero cleanup risk; herald shell matches Bell's mystery tone better and sets up future series differentiation, at the cost of ~2–4 hours of additional work.

---

## Estimate

| Item | Work | Risk |
|------|------|------|
| Change 1 (episode IDs + arm fetch logic) | 1–2 hours | Low — one file, ID swap + conditional fetch |
| Change 2 (hook text) | 30 min after Marc approves copy | None once copy is approved |
| Change 3 (listen_arm_label) | 30 min | Low — one line in signup route |
| Change 4 (post-wall EP ID) | 10 min | **HIGH — gated on Bell EP1 publish** |
| Change 5 (arm C cleanup) | 30 min | None |
| Herald shell (if WMF) | 0 | None |
| Herald shell (if fourth-woman) | 2–4 hours | Low — branch port, content strip |
| **Total (WMF shell)** | **~half a day** | **Gated on Bell EP1 publish** |
| **Total (herald shell)** | **~one full day** | **Gated on Bell EP1 publish** |

---

## Hard Dependency — Gates the Launch Date

**Bell EP1 must be published (story_audio_url live in production) before the funnel can go live.** The code can be written and staged in one day. The funnel cannot accept real traffic until the post-wall audio exists. Susan's launch date = Bell EP1 publish date (or shortly after — allow one day for smoke test).

---

## Susan's Launch Date Answer

Susan can plan around: **Bell EP1 publish date + 1 day for smoke test.** The funnel delta is approximately half a day of dev work after Marc approves hook copy and the herald shell choice. These decisions can be made today. Dev starts when Marc gives the word.

---

## Items NOT in This Spec (out of scope, Marc decides separately)

- UTM parameters for Bell ads (different from GVL campaign)
- go_variant_config table row for Bell (if variant config DB is used)
- Stripe trial length / offer copy (current funnel uses 7-day trial)
- Whether Bell uses the same /listen route or a new route slug
