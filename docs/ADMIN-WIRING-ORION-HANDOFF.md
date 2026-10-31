# Approved Admin wiring — Orion release handoff

Owner requested deployment on October 30, 2026 (Eastern). **Production deployment has not been performed.** Orion remains the only authorized EC2 deployer; deploy only a reviewed merge on `main`. This branch must not be deployed directly.

## Current release state

Development implementation integrates the approved eight-section design with existing server adapters and retained specialist pages. It supersedes the older draft PR #421. It is **not accepted as a fully operational autonomous Admin**. Missing credentials, worker cutover, device acceptance and remaining implementation gaps below are real limitations.

- `/admin` has the approved responsive shell and eight sections. Unknown source figures remain unavailable.
- Production visibly links Authors & Narrators, Genres, Content Review & Approval and Sound Effects Library. All existing pages remain. Publication, voices and SFX have independent controls. New voice/SFX holds are off unless `ADMIN_REVIEW_CONTROLS_ENABLED=true` and apply to new jobs according to policy history; they do not waive quality, series, or spending gates.
- Stories preserves the existing `/admin/stories` Published Stories format, expandable series and governed actions, with added period/session rankings, genre/length sorting, attributed cost columns and horizontal slider. The original URL remains available.
- Stripe recap adapter uses paid-invoice history for new paid customers and opening-cohort churn, cancellation events for requests, and ledger net collections. Source reads must complete; no partial totals presented as verified actuals. Live acceptance remains outstanding.
- Customers links original support records, supplied profiles, saved listening progress/preferences and referrals; AI drafts require explicit substantive send. Provider acceptance is not delivery. Durable unsent drafts and provider delivery webhook reconciliation remain unfinished.
- Marketing reuses Airtable data, frozen campaign forecasts, real supported Meta previews, internal audited proposals and approvals. Campaign lifecycle mapping/sync and direct provider launch/pause/budget writes remain unfinished; TikTok is not connected. No spend is enabled.
- Budget shows four undated twelve-month zero-format worksheets; dates and population wait until after the full 6+2-week test. Known $4,000 test envelope and 75% target are labeled separately. Monthly profit preparation is durable with a database constraint requiring `enabled=false`; no bank transfer API exists.
- Documentation has 18 searchable guides and the existing information-flow reference. Belle shares stored history/read receipts and has guarded foreground/device notification adapters; actual assets, credentials, scheduler and device acceptance remain necessary.

## Required before production cutover

1. **Inventory every machine caller of `/api/admin/*`.** New middleware denies anonymous calls. Known runner/self-fetch calls carry `x-et-internal-key`; not every historical script/agent is migrated. Configure a strong `ADMIN_INTERNAL_TOKEN` (32+ characters) in app and runner environments and exact `ADMIN_INTERNAL_ORIGINS` for actual self-fetch origins. Service auth allows only run-next, generate-voices, complete-story-package and generate-belle-variants. Other callers need verified Admin auth or a separately reviewed, narrowly scoped transport change. Never weaken authorization or pause/reset live jobs to force this release through.
2. Apply both additive migrations to an isolated staging database matching current production schema, through the reviewed migration process:
   - `supabase/migrations/20261029182953_admin_command_center.sql`
   - `supabase/migrations/20261030232203_admin_command_center_wiring.sql`
   Verify anonymous/subscriber denial, authorized Admin access, service-token scope, RLS, same-origin mutation checks, policy CAS, review fingerprints, worker-lock protection and duplicate reply protection. No migration in this handoff was applied to production.
3. Leave `ADMIN_REVIEW_CONTROLS_ENABLED`, `ADMIN_PUSH_ENABLED` and `ADMIN_SUPPORT_ACK_ENABLED` off. Validate worker holds/resumes on disposable jobs before any review activation. Preserve existing `publish_mode` and all production spending authorization.
4. Verify existing Supabase, Stripe live read, Mercury read, Meta ads-read/preview, Airtable, AI providers and Resend configuration using the deployed environment. No actual provider keys were available to this local build. Confirm the canonical campaign/ad IDs and complete source coverage. Missing expense history prevents verified CAC/LTV, full profit/burn/variance and autonomous money decisions.
5. The published artifact https://claude.ai/artifact/GgPuEUCcaDWSeun2uivPeJ now supplies weekly forecasts and all six Strategos Decision Rules. These are copied as reference; the source marks the thresholds awaiting owner approval. Native XLSX download is disabled in that shared view; exact unrounded cells remain unavailable. The owner has supplied its weekly schedule and outcome forecast: November 6 start; $500/$500/$700/$700/$800/$800, then two $0-spend trial-conversion weeks, with 270 trials/135 paid/$29.63 CAC forecast at week 8. The UI combines the owner identification of the final workbook with directly read published artifact figures, not native workbook bytes. Other costs and actuals remain unverified; campaign launch remains gated.
6. Configure approved sting/Belle assets, VAPID keys, activation cutoff and secure scheduler only after review. Test authenticated navigation, audio and push on actual Mac Safari, iPhone and iPad/Home Screen app; fixture Chromium dimensions are not device acceptance. Verify each notification opens its exact authorized action and history syncs.
7. Review the remaining gaps above explicitly. Owner's deploy request is not evidence that these integrations or unfinished controls have passed acceptance. Do not label this release complete or activate automatic advertising/bank operations.

## Orion deployment procedure after gates pass

1. Record serving SHA, BUILD_ID, app/worker states and job/lock snapshot; preserve runnable source/build pair and rollback paths. Keep environment secrets private. Do not stop/restart workers or change job schedules for Admin deployment.
2. Have the approved change reviewed/merged to `main`. Orion fetches `main`, records the exact merge SHA, and creates an isolated build checkout at that SHA. Do not build on the serving source tree and do not deploy this feature branch.
3. Run `npm ci`, `npm run test:admin`, `npm run typecheck:admin`, disposable database contract checks and `npm run test:admin:mobile` with an installed Playwright Chromium, then `npm run build` with the verified environment. Whole-repo TypeScript has historical failures; a Next build ignores type errors and is not a substitute for focused checking.
4. Once migration/caller/device checks pass, use the established isolated source/build swap and app-only reload procedure. Preserve rollback source/build pair. Verify health, `/admin`, all eight sections, legacy Published Stories/Production tools, ordinary-user access denial and authenticated worker transport without advancing paid jobs merely for testing. Check subscriber Home, Library, player resume and episode navigation.
5. If checks fail, restore the previous runnable app source/build pair. Keep additive private tables and audit records; do not drop evidence or restore the former broad support-message read policy. If worker auth is incompatible, do not cut over in the first place. Review feature activation separately.

## Reproducible local checks

- `npm run test:admin`
- `npm run typecheck:admin`
- Install PGlite in an isolated test directory; `ADMIN_QA_PGLITE=/absolute/path/to/@electric-sql/pglite node tests/admin-center/local-db-contract.cjs`. This creates disposable in-memory PostgreSQL roles/fixtures, executes migrations/contracts inside a rollback, and checks zero tables remain. It never connects remotely.
- `npm run test:admin:mobile` with Playwright Chromium installed. `ADMIN_QA_SPARTICUZ=/absolute/path/to/@sparticuz/chromium` optionally selects an alternate test browser. All network data/actions are isolated fixtures, not live acceptance.
- `npm run build` with explicit placeholder credentials compiles/packages only; it does not verify live credentials or providers.


## October 31 screenshot review amendments

See `docs/ADMIN-SCREENSHOT-REVIEW-20261031.md` for the implemented controls, source definitions and remaining acceptance gaps. No additional migration is required for these amendments. Existing migration/caller-authentication gates above still apply.

Before declaring these additions operational, Orion must verify the six authenticated reads/mutations against staging credentials: `/api/admin/center/customer-search`, `/customer-summary`, `/story-costs`, `/story-performance`, `/variance-commentary`, plus `/api/admin/subscribers?userId=<uuid>`. Confirm no subscriber enumeration before a search, 25-result search cap, exact profile match, same-origin PATCH authorization and legacy account actions. Test missing provider/table cases as unavailable. No live customer account action is authorized by this QA handoff.

For variance commentary, keep `ANTHROPIC_API_KEY` server-only; optional `ADMIN_VARIANCE_MODEL` overrides the app's existing Sonnet model default. Verify a supported/authorized model, a selected Airtable campaign with frozen targets and recorded actuals, and provider usage logging before acceptance. No paid generation was run in QA. Budget-plan actuals remain unconnected, so its readiness review deliberately makes no AI request. Generated campaign commentary is an on-demand draft, not a verified causal finding or automatic budget change.

Read-only schema audit found ElevenLabs usage rows with no story ID and unlinked cover/shared writing costs. Do not allocate costs by title similarity or treat absent charges as zero. Complete story totals/averages require reconciled, canonical story attribution for every component. Existing usage data may be provider-rate estimates, not invoices. No production instrumentation or jobs were changed to fill those gaps.

CSV controls operate entirely on downloaded copies. Blank values represent missing/unconnected data; known planned zeros are numeric zero. Budget, Actual, Actual vs. Budget and Variance exports must be tested in the owner's Excel app. They do not import edits or change Admin records. Existing grouped six-tab XLSX remains available.

Orion deployment procedure remains: complete staging/auth/worker/device gates above, obtain the reviewed `main` merge, build in a new release directory, verify health/authorized readback, atomically switch the serving release and retain the prior release and database backup. Do not alter ad spend, transfer authorization, review defaults or in-flight jobs to pass acceptance. No merge or production deploy has been performed by Codex.
