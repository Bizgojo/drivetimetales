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

## Review corrections applied (endpoint-fixes-7, in-branch, unmerged)

Per Claude review of P1–P3, corrected without changing PAUSED-only scope:

1. **promoted_object** = `{pixel_id, custom_event_type:'START_TRIAL'}` (app
   StartTrial). `customConversionId` dropped entirely — refused if supplied.
2. **video_data thumbnail** per hook (exactly one `image_hash` XOR `image_url`).
3. **spend_cap = 400000** ($4k) set ON the campaign object (was paper-only).
4. **Targeting**: Adv+ audience (`targeting_automation: {advantage_audience: 1}`)
   + Adv+ placements (fixed `facebook_positions`/`instagram_positions` lists
   dropped). US 25-54 (+en_US) retained as suggestions.
5. **Resumable**: POST accepts `campaignId` / `adSetId` (digits-only) to
   continue instead of duplicating; response reports `campaignReused` /
   `adSetReused`.

## Video IDs (Hal-captioned uploads via `.../paused-build-nov09/upload`)

| Hook | Captioned file (Orion outbox/captioned/) | Meta video ID |
|---|---|---|
| hook1 | clip1-commuter-hookb.mp4 (26.20s) | _(pending)_ |
| hook2 | clip-hook-a-le30s.mp4 (23.60s) | _(pending)_ |
| hook3 | clip-hook-c.mp4 (19.50s) | _(pending)_ |
| hook4 | clip-hook-d-pattern.mp4 (30.00s) | _(pending)_ |
| hook5 | clip2-falls-park-2m02-2m18.mp4 (16.00s) | _(pending)_ |

## Thumbnails (one per hook, `image_hash` XOR `image_url`)

| Hook | Thumbnail source | image_hash / image_url |
|---|---|---|
| hook1 | _(Marc to confirm)_ | _(pending)_ |
| hook2 | _(Marc to confirm)_ | _(pending)_ |
| hook3 | _(Marc to confirm)_ | _(pending)_ |
| hook4 | _(Marc to confirm)_ | _(pending)_ |
| hook5 | _(Marc to confirm)_ | _(pending)_ |

Hal captions PASS 2026-11-04 ~08:55 EST (HAL-CAPTIONS-DONE.md): all 5 verified
1080x1920, 15–30s band, single clean burned-in captions. Hook-6 deferred.

## Guards (enforced in code, not convention)

- Status PAUSED hard-coded on campaign + ad set + all 5 ads; no ACTIVE path exists.
- Budgets: $50/day ad set (~$1,500/30d tranche-1), $4k total ceiling; caller overrides → 400.
- No schedule/start date, no CBO, Hook-6 refused, PLACEHOLDER gate URL refused.
- Launch still requires Marc explicit merge word + Amendment-1 launch gate.

## Runner (admin session only — no internal token)

- Live run executes as a logged-in admin browser session against the deployed
  branch build (`requireAdminEmail` allowlist). No service runner, no cron.
- Therefore NO internal-token path was added and `INTERNAL_ADMIN_PATHS`
  (lib/admin-center/access-policy.ts) is UNCHANGED — no new auth surface.
- Small pieces, report after each: (1) campaign → record `campaignId`;
  (2) ad set → record `adSetId`; (3) 5 ads one at a time → record ad IDs.
  On any piece failure, re-POST with the recorded IDs to resume (no dupes).
- HOLD: no Meta upload/call until Marc OKs 5 videos + ad copy. $0 until then.

## Status

- [x] Endpoint + upload wiring built, unit-tested (14/14), type-clean (0 new diagnostics; 1 pre-existing narrowing nit in route.ts, untouched)
- [x] Claude-review corrections applied in-branch (promoted_object, thumbnails, spend_cap, Adv+, resumable)
- [ ] Fresh reviewer verification (see REVIEW-REQUEST.md)
- [ ] Live run (needs Marc word; token server-side only; HOLD until 5 videos + ad copy OK)
- [ ] IDs + thumbnails filled above after live run
- [ ] Merge — MARC ONLY, explicit merge word required
