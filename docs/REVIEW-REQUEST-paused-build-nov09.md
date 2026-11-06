# REVIEW REQUEST — paused-build-nov09 endpoint + Claude-review fixes (fresh reviewer, not Atlas/self)

Branch: `feat/atlas-paused-endpoint-nov09` (from origin/main 9da96441 + P1–P3 + endpoint-fixes-7).
**DO NOT MERGE. Merge requires Marc's explicit merge word.**

## What changed in endpoint-fixes-7 (this round)

1. `lib/marketing/pausedBuildNov09.ts`
   - `promoted_object` builder = `{pixel_id, custom_event_type:'START_TRIAL'}` (app StartTrial).
   - `customConversionId` / `custom_conversion_id` DROPPED — refused if supplied.
   - `thumbnails {hook1..hook5}` required: exactly one `image_hash` (hex) XOR `image_url` (https) per hook.
   - `spendCapCents: 400000` added (was paper-only ceiling).
   - Resume: optional `campaignId` / `adSetId` (digits-only) to continue, not duplicate.
   - Pure builders `buildPromotedObject()` / `buildAdSetTargeting()` for unit pinning.
   - Targeting = Adv+ audience (`targeting_automation: {advantage_audience: 1}`) + Adv+ placements
     (fixed `facebook_positions`/`instagram_positions` lists dropped); US 25-54 (+en_US) as suggestions.
2. `lib/marketing/metaAds.ts` — `createPausedCampaign(name, spendCapCents)` sets `spend_cap`;
   `createPausedAdSet` uses the builders (no `customConversionId`); `createPausedAd` writes the
   per-hook thumbnail into `video_data`. Pre-existing launch/pause/preview paths untouched.
3. `app/api/admin/marketing/paused-build-nov09/route.ts` — skips campaign/ad-set creation when
   resume IDs are supplied; reports `campaignReused` / `adSetReused`; thumbnails wired per ad.
   Auth unchanged (admin session via `requireAdminEmail`); NO internal-token path added;
   `INTERNAL_ADMIN_PATHS` unchanged (see runner note in campaign-6plus2-paused-build-nov09.md).
4. Tests: `npx jest __tests__/admin-center/paused-build-nov09.test.ts` — 14/14 (was 8/8).
   New: customConversionId refused, START_TRIAL promoted_object, spend_cap, Adv+ targeting
   (no fixed lists), thumbnail validation (missing/both/neither/bad-hash), resume IDs.
5. Type check: 0 NEW diagnostics. Note: 1 pre-existing narrowing nit
   (`v.error` access in route.ts) exists identically on the base commits — left untouched
   per smallest-change scope; the project's own `check-types.cjs` (0 diagnostics) does not cover this file.

## What to verify

1. PAUSED hard-coded on campaign + ad set + all 5 ads; no ACTIVE path added by this branch
   (`git grep -n ACTIVE` hits are pre-existing comments + pre-existing `setAdStatus`, untouched).
2. Budgets: $50/day ad set, tranche-1 $1–1.5k, $4k ceiling as `spend_cap` on the campaign.
3. Exactly hook1..hook5; Hook-6 refused; PLACEHOLDER gate URL refused.
4. `?dryRun=1` exercises validation with zero Meta calls; no token value logged or returned.
5. Upload route: mp4-only, hook1..hook5 only, 100MB cap, inert (no ad/spend).
6. Spend proof: dry-run touches no Meta endpoints; live run creates PAUSED objects only ($0).
   HOLD: no live run until Marc OKs 5 videos + ad copy.

## Reviewer report (paste below when done)

- Reviewer:
- Date:
- Verdict: APPROVE / CHANGES-REQUESTED
- Notes:
