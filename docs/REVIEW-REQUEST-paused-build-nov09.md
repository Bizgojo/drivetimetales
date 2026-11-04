# REVIEW REQUEST — paused-build-nov09 endpoint (fresh reviewer, not Atlas/self)

Branch: `feat/atlas-paused-endpoint-nov09` (from origin/main 9da96441).
**DO NOT MERGE. Merge requires Marc's explicit merge word.**

## What to verify

1. `lib/marketing/pausedBuildNov09.ts` — PAUSED hard-coded; budgets match
   campaign-approval-card-nov09.md ($50/day, tranche-1 $1–1.5k, $4k ceiling);
   exactly hook1..hook5; Hook-6 refused; PLACEHOLDER gate URL refused.
2. `app/api/admin/marketing/paused-build-nov09/route.ts` — POST creates
   1 campaign + 1 ad set + 5 ads via META_ADS_MANAGEMENT_TOKEN server-side
   only; no token value logged or returned; no ACTIVE/status/schedule path.
   `?dryRun=1` exercises validation with zero Meta calls.
3. `.../paused-build-nov09/upload/route.ts` — mp4-only, hook1..hook5 only,
   100MB cap, inert (no ad/spend).
4. `lib/marketing/metaAds.ts` additions — status PAUSED literals only;
   existing launch/pause/test paths untouched.
5. Tests: `npx jest __tests__/admin-center/paused-build-nov09.test.ts` (8/8).
6. Spend proof: dry-run touches no Meta endpoints; live run creates PAUSED
   objects only ($0). Confirm no `ACTIVE` literal added anywhere:
   `git grep -n ACTIVE -- <new files>` should return nothing.

## Reviewer report (paste below when done)

- Reviewer:
- Date:
- Verdict: APPROVE / CHANGES-REQUESTED
- Notes:
