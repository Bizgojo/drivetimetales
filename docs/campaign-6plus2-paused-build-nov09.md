# Campaign 6+2 Paused Build — Nov 9 (branch copy, endpoint branch only)

Commission: campaign-6plus2-nov09-20261104 = option1-atlas-paused-endpoint (Marc 2026-11-04).
Source card: Orion workspace `outbox/governed-6-build-20261103/campaign-approval-card-nov09.md`.
Builder: `POST /api/admin/marketing/paused-build-nov09` (this branch). ALL PAUSED. $0 spend.

## Live Meta IDs (filled on successful build run — DO NOT FABRICATE)

| Object | Name | Meta ID |
|---|---|---|
| Campaign | ET_Governed6_TrialStart_20261104 | _(pending live run)_ |
| Ad set | ET_G6_US2554_AdvPlus_Broad | _(pending live run)_ |
| Ad hook1 | ET_G6_Hook1_CaseWentCold_PAUSED | _(pending)_ |
| Ad hook2 | ET_G6_Hook2_BellRangOnce_PAUSED | _(pending)_ |
| Ad hook3 | ET_G6_Hook3_LedgerBell_PAUSED | _(pending)_ |
| Ad hook4 | ET_G6_Hook4_FallsPark_PAUSED | _(pending)_ |
| Ad hook5 | ET_G6_Hook5_StayQuiet_PAUSED | _(pending)_ |

Previews/LAUNCH resolve via: `/api/admin/marketing/approvals/[campaignId]?ad_ids=<id,…>`
using the ad IDs above once filled.

## Video IDs (Hal-captioned uploads via `.../paused-build-nov09/upload`)

| Hook | Captioned file (Orion outbox/captioned/) | Meta video ID |
|---|---|---|
| hook1 | clip1-commuter-hookb.mp4 (26.20s) | _(pending)_ |
| hook2 | clip-hook-a-le30s.mp4 (23.60s) | _(pending)_ |
| hook3 | clip-hook-c.mp4 (19.50s) | _(pending)_ |
| hook4 | clip-hook-d-pattern.mp4 (30.00s) | _(pending)_ |
| hook5 | clip2-falls-park-2m02-2m18.mp4 (16.00s) | _(pending)_ |

Hal captions PASS 2026-11-04 ~08:55 EST (HAL-CAPTIONS-DONE.md): all 5 verified
1080x1920, 15–30s band, single clean burned-in captions. Hook-6 deferred.

## Guards (enforced in code, not convention)

- Status PAUSED hard-coded on campaign + ad set + all 5 ads; no ACTIVE path exists.
- Budgets: $50/day ad set (~$1,500/30d tranche-1), $4k total ceiling; caller overrides → 400.
- No schedule/start date, no CBO, Hook-6 refused, PLACEHOLDER gate URL refused.
- Launch still requires Marc explicit merge word + Amendment-1 launch gate.

## Status

- [x] Endpoint + upload wiring built, unit-tested (8/8), type-clean
- [ ] Fresh reviewer verification (see REVIEW-REQUEST.md)
- [ ] Live run (needs Marc word; token server-side only)
- [ ] IDs filled above after live run
- [ ] Merge — MARC ONLY, explicit merge word required
