# Admin Command Center release record — October 29, 2026

Status: **development implementation; NOT accepted for production**. Nothing merged or deployed. The governing business specification remains `docs/ADMIN-COMMAND-CENTER-SPEC.md`. This release extends the foundation in PR #420.

## Implemented

- One `/admin` interface with eight sections, responsive tabs, mobile drawer, expandable detail and existing specialist controls retained as linked views.
- Server-validated Admin page authorization and API-wide middleware covering `/api/admin/:path*`. No timeout-based access grant. Same-origin mutation checks. Separate service secret restricted to four production transport endpoints.
- Overview reads live-capable Stripe/Mercury/Meta adapters; source status and timestamps accompany results. Missing or failed feeds are unavailable rather than zero. Library eligibility joins source publication status, analytics visibility and cover availability.
- Agents reuse the roster, usage/credit dashboard and provider replenishment links; worker heartbeats and activity are read from existing tables.
- Production reads the queue and jobs without advancing them. Specific parked cast reviews have versioned, audited approval; no new routine casting gate. Existing V2/ASC3, series gates and publication rules remain unchanged.
- Published library covers, episode metadata, performance and HTML audio playback; links to existing editing controls.
- Shared customer-message inbox, AI draft review and explicit email approval. Recipients come from the original database record. Atomic claim and provider idempotency prevent duplicate substantive replies; accepted is distinguished from delivered. Routine acknowledgment worker only addresses confirmed account email matching the saved support record.
- Campaign drafts with real creative/destination fields, review submissions, recorded creative/budget approvals and atomic aggregate $4,000 cap. Drafts never create or launch a Meta ad. Existing Airtable campaign intelligence remains linked. Read-only Meta campaign and ad creative/placement-preview adapters are included. Social Media remains Future.
- Owner allocation policy starts at 75%; changes are version checked/audited. Protected expenses, tax, reserve and unspent commitments precede modeled distributions. Evidence ledger separates budget, cash paid, invoices, usage estimates and credit purchases; category variance is shown only for recorded inputs. Twelve-month editable scenarios are clearly projections.
- Durable de-duplicated Belle inbox, per-account cross-device read receipts, quiet hours, optional foreground sting then Belle assets, user-initiated push subscription and isolated Admin push service worker. Scheduled worker reconciles source events and push acceptance. Voice, publication, campaign and funding event categories are implemented. Funding uses a fresh bank reading and commitments attested within 30 days.
- Searchable operating reference, policies, integration definitions and deployment guidance.

## Verification completed

- `npm ci --ignore-scripts --no-audit --no-fund`: passed. Lockfile repaired; web-push pinned at 3.6.7.
- Focused Jest suite: 42 tests passed (access denial, middleware coverage, service-secret scope/non-disclosure, financial protections, deep links, quiet hours, actual voice exceptions, provider failures, push endpoint validation, reply validation).
- New Admin/middleware code type check: zero diagnostics across 46 entry files (`npm run typecheck:admin`). Historical production modules reached by the small authentication transport changes have existing errors; they are not reported as clean.
- Production build with explicit placeholder credentials: passed. This does not test credentials or live provider operations. Final code rerun is recorded in the PR.
- Browser fixture QA: all eight sections at 390×844, 820×1180 and 1440×1000; no horizontal document overflow or page errors. Customer reply form tested. This verifies responsive layout and basic interaction in Chromium, **not real Safari/iOS push, audio, authenticated sessions or live provider integrations**.
- Additive migration and contract assertions executed in a transaction on `drivetimetales-dev`, then rolled back: policy/version/attestation, reply claim/idempotency/provider acceptance, campaign cap, audits and client-access isolation passed. The final contract rerun also passed exact requested-review approval and repeated-approval rejection.
- Read-only production audit: 111 source-published visible episodes; 113 visible analytics rows; reconciled library intersection 111. Seven non-answered support records and one running production job were observed. No production rows, jobs, policies, credentials or accounts changed.
- Full repository `tsc --noEmit` fails on pre-existing syntax errors in `lib/belleGenerator.ts`. Build configuration already ignores TypeScript errors. A successful build must not be treated as clean repository type checking.

## Blocking integrations and acceptance work

| Area | Remaining limitation |
|---|---|
| Stripe / Mercury | Adapters compile and failure handling is tested; actual credentials/permissions and reconciliation must be exercised in the authorized deployment environment. Mercury cash eligibility across accounts must be reviewed. MRR is before discounts/taxes; mixed currencies or unsupported prices fail closed. |
| Expense completeness | Production has no `expenses_log` table used by existing AI-spend/expense APIs. New evidence ledger is separate and does not fabricate missing history. Invoice/credit/bank reconciliation, complete burn, production-cost average, verified CAC/LTV and distributable profit remain unavailable. |
| Meta | Live ads-read/preview permissions, Pixel/CAPI deduplication, anonymous first listen and full placement/destination tests remain unverified. Direct launch/pause/budget-write automation is not enabled or implemented here; existing provider management and campaign-intelligence views remain available. |
| Original Meta plan | Repository and Library searches did not recover the October 27 original expanded workbook/artifact. Missing milestones and go/no-go criteria were not invented. Launch remains blocked. |
| Email | Verified Resend sender and live acceptance/delivery test required. No test email sent in this assignment. Provider delivery webhooks and automatic reconciliation of uncertain/failed outcomes remain outstanding. Pending/failed sends require inspection; they are not blindly retried. |
| Belle audio / push | Approved licensed sting and four Belle explanation assets, VAPID credentials, scheduler activation and actual Mac/iPhone/iPad tests required. No paid audio generation or device push sent. Background spoken audio is not promised. Push delivery ledger records acceptance, not confirmed display. Pending/failed delivery reconciliation remains manual. |
| Customer intelligence | Existing subscriber/preferences/referral tools are linked. Rich individual history, retention cohorts and privacy-reviewed broad-location aggregation are not completed by the sample aggregates. |
| Bank transfers | No transfer API exists. Monthly transfer intent is documented and disabled. Bank capability, recipient ownership, full accounting/tax/reserve reconciliation, controls and explicit authorization are required before implementing/activating live transfers. |
| Legacy action auditing | New policy, campaign, finance and requested voice decisions have atomic audits; reply approval/acceptance is audited. A complete historical specialist-route audit migration is still outstanding; API-wide authorization applies to those routes. |
| Worker cutover | API-wide protection intentionally removes anonymous Admin API access. All external/agent callers must carry verified Admin credentials or the narrowly scoped service token. Inventory and authenticated dry-run are mandatory before cutover. Do not deploy while this prerequisite is unmet. |

These are release blockers or explicit limitations, not hidden completed features. The assignment's fully autonomous operational acceptance has **not** been reached.

## Exact handoff for Orion

Only Orion may execute EC2 steps. Do not merge or deploy this development branch directly. Complete the blockers above, obtain a reviewed merge to `main`, and use the established isolated-build/rollback procedure.

1. Record current serving SHA, `.next/BUILD_ID`, web-app/worker service states, job/lock snapshot, environment file ownership and rollback paths. Preserve the currently runnable source and `.next` pair. **Do not stop/restart workers, alter schedules, unpause work, reset jobs or run production repair scripts for this Admin release.** If safe worker cutover cannot be achieved, defer deployment.
2. Prepare and verify a strong `ADMIN_INTERNAL_TOKEN` (at least 32 characters) in the web-app and every existing runner environment. Never print it. Set `ADMIN_INTERNAL_ORIGINS` to the exact comma-separated HTTP(S) origins actually used by `resolveSelfFetchOrigin` and the runner (including production HTTPS host and applicable loopback port). Default allowlist includes only localhost/127.0.0.1 port 3000. Inventory external scripts/agents using Admin routes; migrate their authentication. The loop script recognizes `ADMIN_INTERNAL_TOKEN` and retains `RUN_NEXT_ADMIN_TOKEN` as a client-side fallback; server expects the new token.
3. In a staging environment/database matching production schema, apply `supabase/migrations/20261029182953_admin_command_center.sql` through the reviewed migration process. Test as anonymous, ordinary subscriber, authorized Admin and scoped service token. Verify support users can read only their own messages. The migration is additive except replacing the overly broad support SELECT policy. Do not restore that public policy for rollback.
4. Configure existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY` (live read access), `MERCURY_API_TOKEN` (read-only), `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, AI-provider credentials and `RESEND_API_KEY` in the authorized environment. Verify each integration; do not copy credentials into GitHub, chats or logs.
5. Set `ADMIN_CENTER_EVENT_SINCE` to the approved activation ISO timestamp to avoid historical notification floods. Provision `ADMIN_ALERT_STING_URL` and `ADMIN_ALERT_BELLE_VOICE_URL`, `_PUBLISHED_URL`, `_FUNDING_URL`, `_CAMPAIGN_URL`. Use approved existing assets; this assignment authorizes no new spend.
6. Optional device delivery: configure `ADMIN_PUSH_VAPID_PUBLIC_KEY`, `ADMIN_PUSH_VAPID_PRIVATE_KEY`, `ADMIN_PUSH_SUBJECT` (mailto/HTTPS). Leave `ADMIN_PUSH_ENABLED` and `ADMIN_SUPPORT_ACK_ENABLED` unset/false until live provider/device verification passes. Configure the existing secure scheduler to GET `/api/cron/admin-center-alerts` with `Authorization: Bearer <CRON_SECRET>` at an appropriate interval. Do not add an unauthenticated cron URL or a duplicate scheduler.
7. Fetch `origin/main` into an isolated checkout. Record the approved merge SHA and ensure the candidate is exactly that `main` commit. Run `npm ci`, focused tests, the database contract test on disposable/dev only, full build using real authorized staging environment, and browser QA. Never build over the currently serving `.next` directory. Full-repository type failures must remain explicitly recorded.
8. Before activation, exercise all four Admin event categories, synchronized reads, quiet hours, exact deep links, foreground user-permitted audio, installed iPhone/iPad PWA push and Mac notifications. Test email with an explicitly designated test recipient; confirm provider acceptance and delivery separately. Test real ad preview and landing destination without launching ads. Validate Stripe counts and cash against provider dashboards.
9. Activate only the verified web-app source/build pair using Orion's established atomic swap. Preserve the old pair. Check the established health endpoint, anonymous Admin denial, subscriber denial, owner access on all three devices, legitimate runner authenticated transport and current-job continuity. No restart of production workers is authorized by these instructions.
10. On failure, restore the previous source and `.next` pair together through the established rollback procedure; verify health and job continuity. Keep the additive tables and audit history. Since the prior support UI reads with the anonymous key, do not undo the secure support policy to make that obsolete UI work; retain protected support access. Record exact serving SHA/build identity and test results.

Transfer execution and advertising launch are outside this deployment instruction. Neither is authorized here.


## Reproducing checks

```bash
npm ci
npm run test:admin
npm run typecheck:admin
npx playwright install chromium
npm run test:admin:mobile
# Disposable/development database only; transaction ends with ROLLBACK:
psql "$ADMIN_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/admin-center/database-contract.sql
npm run build
```

The responsive test harness uses explicit TEST FIXTURE data and makes no provider calls. An alternate Chromium binary can be supplied with `ADMIN_QA_CHROMIUM`; it is not a production dependency. Full `npx tsc --noEmit` is a separate repository-wide check with the known historical failures described above.


## Follow-up omissions audit

The owner reported the missing campaign spreadsheet and Information Flow/process documentation. See `ADMIN-COMMAND-CENTER-REQUIREMENTS-AUDIT.md` for the complete source-based gap analysis. This follow-up restores the original interactive process reference (without financial demo displays), exposes the existing Airtable Campaign Plan spreadsheet/timeline, and restores other specialist-tool entry points inside the eight sections. These corrections do not resolve live integration, complete accounting, campaign identity/control, customer intelligence or delivery-lifecycle gaps. The first six-week campaign record and its next-week start remain unverified.

The follow-up also disables Sentry build-plugin telemetry using the installed SDK's supported `telemetry: false` option. Runtime error-reporting configuration is unchanged. A local build-control action was rejected by automatic approval review because of possible telemetry to an unverified external destination; subsequent local checks use no Sentry DSN or upload token.

Finance → Budget is an intentional placeholder, per the owner's follow-up instruction. Its four planned tabs and required categories/totals are documented, but no workbook, start date or figures will be created until the 6+2-week test is completed.
