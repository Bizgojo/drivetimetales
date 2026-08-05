# RATIFICATION NOTE — Unquoted-Approval Actions, Jul 22 – Aug 4, 2026
**Draft only. Not committed. For Marc Postlewaite to commit if ratified.**
**Prepared by:** Atlas, 2026-08-05

---

## Purpose

The 31 production-impacting actions listed below were executed between Jul 22 and Aug 4, 2026 on instructions that were logged but not recorded as verbatim text. Under the Approval Record standing rule effective 2026-08-05, this constitutes an incomplete approval record.

No action is undone. This note ratifies them as standing-as-executed if Marc signs and commits it. Omission of any item means that item remains unratified and must be revisited.

---

## Five Items Separately DB-Verified (not in this ratification note)

The following five were verified live against production DB on 2026-08-05 and are reported separately:
1. go_listen_page_view migration (Jul 23) — CHECK constraint change only
2. go_listen_events RLS change (Jul 24) — DROP + CREATE via Management API, no migration file
3. script_audio_timestamps PART A (Jul 30) — stories.script_updated_at + segments_generated_at
4. listen_arm_label (Aug 4) — users.listen_arm_label TEXT CHECK IN ('A','B','C')
5. Adrian roster row (Aug 4) — ADRIAN / KERejodymirUVJPEtErn / is_locked=true

---

## Remaining 26 Actions — Standing-As-Executed

**Jul 22–23:**
1. PR #14 merged — merge word recorded as given, no verbatim quote
2. PR #15 merged — merge word recorded as given, no verbatim quote
3. Class A repair batch dispatched — session context, no verbatim

**Jul 23–24:**
4. PR #19 (HOOK-GATE-001) merged — merge word recorded as given, no verbatim quote
5. PR #20 (SERIES-BIBLE-GATE-001) merged — merge word recorded as given, no verbatim quote

**Jul 24–25:**
6. PR #21 (silent 202 fix) merged — merge word recorded as "bug fix scope," no verbatim
7. PRs #38, #39, #40 merged — merge word recorded as given, no verbatim per PR
8. review_status corrections applied to multiple stories — "per Marc" language, no verbatim

**Jul 25–26:**
9. DB reset (status/error_json cleared) on one story — Marc direction, no verbatim [story not named]
10. review_status correction (approved→pending) on one story — Marc instruction, no verbatim [story not named]

**Jul 26:**
11. Ep4 opening variants rendered — "Marc approved (msg 5153)" cited as authorization; msg ID only, no verbatim text
12. series_total_episodes changed — "Marc-auth" logged, no verbatim
13. NARRATOR header updates inserted — "Marc-auth" logged, no verbatim

**Jul 27:**
14. PR #52 merged — merge word recorded with timestamp, no verbatim
15. PR #53 merged — merge word recorded with timestamp, no verbatim
16. PR #54 merged — merge word recorded with timestamp, no verbatim
17. PR #55 merged — merge word recorded with timestamp, no verbatim

**Jul 28:**
18. Per-voice ID approvals for one series (four individual voices) — group approval verbatim logged for the cast as a whole; no per-voice verbatim for each individual ID

**Jul 29:**
19. Three SFX pipeline PRs merged (ATL-SFX-001, SFX-ASSET-LOCK-001, ATL-SFX-WIRE-001) — merge word recorded as given, no verbatim per PR
20. Two promo story manifests frozen and archived — "Marc approved" logged, no verbatim
21. One voice segment re-generated via production API — Marc-directed render session, no verbatim for this specific action

**Jul 30:**
22. Frozen guard PR merged — timestamp "2026-07-30 13:17 EDT" recorded, no verbatim text
23. JUNE voice selection (Jane Hackett) locked — "permanent, Marc 2026-07-30" logged, no verbatim
24. UNKNOWN MAN voice selection (Frank) locked — "permanent, Marc 2026-07-30" logged, no verbatim
25. feat/hookgate-migration-applied merged — merge word recorded as given, no verbatim
26. feat/bell-series-and-cast merged — timestamp "2026-07-30 20:11 EDT" recorded, no verbatim text

---

## Marc's Action

To ratify: commit this file to the workspace repo with commit message:
`ratify: standing-as-executed — 26 unquoted-approval actions Jul 22–Aug 4, 2026 (Marc Postlewaite)`

To dispute any item: mark it in this file before committing and direct Atlas to the specific open question.

---

**Draft prepared:** 2026-08-05T16:00 EDT by Atlas
**Status:** DRAFT ONLY — not committed, not ratified
