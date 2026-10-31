# New Admin live release — Orion handoff

The owner has authorized making New Admin live, with the New Admin / Classic Admin switch. **Database preparation is now installed in production. The EC2 serving release has not been changed by Codex.** Orion remains the sole authorized EC2 deployer; deploy only a reviewed merge on `main`.

## Completed live database preparation

Project: `vmyhlfeouzslixtkmddy`. These exact migration versions/names were installed through Supabase on October 31, 2026 and read back from migration history:

- `20261031173103_admin_command_center.sql`
- `20261031173118_admin_command_center_wiring.sql`

Do not reapply them or run their superseded October 29/30 filenames. Repository filenames now match the actual applied migration history.

All 13 `admin_center_*` tables have RLS enabled. `PUBLIC`, `anon` and `authenticated` have no table access; Admin server endpoints use the privileged service role after verifying administrator identity. Every Admin function is security invoker and denies anonymous/authenticated execution. The 75% initial marketing target is stored in policy version 1, with commitments explicitly unverified. Profit-transfer preparation is constrained off; campaign launch is constrained off. No messages, pushes, ads, transfers, review approvals or production jobs were initiated by installation.

Before/after readback confirmed `publish_mode=direct` and its existing timestamp `2026-10-11T21:09:36.272572+00:00` were unchanged. Existing support policies were deliberately preserved during preparation because the currently served Classic support page reads with the anon key. No existing inbox records or access were removed before its replacement is served.

Local disposable PostgreSQL tests cover both preparation alone (existing support/publication/job state stays unchanged) and the final three-migration state (role denial, policy CAS, exact review fingerprints, locked-job protection, one-time resume, audit/duplicate reply handling and disabled profit transfers). Both roll back to zero public tables. The final contract also tests real subscriber own-row and anonymous inbox filtering under their database roles. Production verification used catalog/state reads; no synthetic production jobs or financial transactions were inserted.

Supabase advisors report only INFO “RLS enabled, no policy” for these new tables. That is the intentional deny-all browser design with revoked client grants and server-only access; do not add permissive client policies to silence it. [Advisor reference](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Remaining cutover work — Orion only

1. Record the current serving SHA, BUILD_ID, app/worker status, publication setting, job/lock snapshot and runnable source/build rollback pair. Do not terminate, reset, requeue or advance active jobs for this Admin deployment. Preserve queued work and locks. Any necessary poller/worker credential reload must happen only at an Orion-verified idle boundary, without interrupting in-flight work. Preserve all current production spending authority and publication/quality/series gates.
2. Review PR #436 and arrange its merge into current `main`. The feature includes `main` through `eac0ef89` (PRs #437/#438); preserve any newer main work. Never serve the feature branch directly or build on the serving source tree.
3. Verify a strong `ADMIN_INTERNAL_TOKEN` (32+ characters) exists identically in app and every runner/agent that calls `/api/admin/*`. Inventory every machine caller before cutover. Only run-next, generate-voices, complete-story-package and generate-belle-variants accept this scoped service transport. Other callers need verified Admin auth or a separately reviewed narrow change. Verify actual self-fetch origins in `ADMIN_INTERNAL_ORIGINS`; loopback ports in `lib/admin-center/internal-fetch.ts` are built in. Never weaken authorization or pause jobs to get through this gate. A non-mutating transport check against the isolated candidate server is GET `/api/admin/production-jobs/run-next`: the correct scoped token should reach Next's 405 (POST-only route), while missing/wrong auth should be denied. Do not POST to that route for testing.
4. Keep `ADMIN_REVIEW_CONTROLS_ENABLED`, `ADMIN_PUSH_ENABLED` and `ADMIN_SUPPORT_ACK_ENABLED` off until their separate acceptance checks pass. Preserve current `publish_mode`, per-episode spending authorization and all unrelated production configuration. Code approval does not activate ad spend, bank transfers or new routine review holds.
5. Create an isolated checkout of the exact reviewed main merge SHA and use the existing app environment without printing secrets. Required server configuration is the existing Supabase URL, anon key and service-role key. Stripe live reads, Mercury, Meta, Airtable, Anthropic, Resend and notification assets retain their current permissions/status; unavailable sources must remain explicitly unavailable. No paid provider action is required to test this release.
6. Run the read-only prerequisite command:

   ```sh
   node scripts/admin-center/check-release-readiness.cjs --env-path /absolute/path/to/existing-app-env-file
   ```

   Exit 1 blocks serving. A pass confirms automated table/config prerequisites only, not live provider integration or correct runner configuration. The two preparation migrations above are already installed; do not reinstall them to fix a credential or API-access problem.
7. In staging/disposable fixtures, run `npm run test:admin`, `npm run typecheck:admin`, the database contracts below and `npm run test:admin:mobile` with installed Chromium. Build the isolated release using `npm ci` and `npm run build` with the verified environment. Whole-repo TypeScript has historical pipeline failures; Next ignores type errors, so the focused check is required.
8. Use the established isolated source/build swap and **app-only** reload after in-flight requests have drained naturally. Do not kill a production request or reset its job. If a dispatcher requires an environment reload for the scoped credential, coordinate it at an idle request boundary; preserve its queue and resume normal dispatch afterward. Do not perform blanket worker restarts. Verify authorized `/admin`, New/Classic switching, both menus, shared reporting, and the server-authenticated support replacement at `/admin/support` before changing the old support policy.
9. Apply **only the pending cutover migration** `supabase/migrations/20261031173407_admin_support_read_cutover.sql` through the reviewed migration process, recording its version. This replaces the old public support SELECT policy with authenticated own-row access. Do this with the code cutover, not before the old anon-key inbox is replaced. It leaves support INSERT behavior and inbox contents untouched. Verify anonymous SELECT denial, subscriber own-row access and Admin server inbox access immediately afterward.
10. Verify health and the exact serving SHA/BUILD_ID; New Admin defaults at `/admin`, Classic is available via the top switch or `/admin?adminView=classic`. Check both shared recaps with the same period/as-of timestamp, Production resources and settings readback, full customer details, story filters/pinned cover-title, CSV/XLSX downloads and legal links. Check ordinary-user/anonymous denial for both versions and Admin APIs. Smoke-test subscriber Home, Library, saved-position recovery and episode navigation. Do not advance paid jobs, send customer mail/push, launch ads or move money just to test.
11. Record serving SHA, acceptance results and rollback source/build paths. If verification fails, restore the previous runnable app pair. Keep additive private tables/audit evidence. Do not reopen the public support-read policy to restore an old UI; retain the privacy correction and repair/roll forward the authenticated inbox.

## Version switch and reporting parity

The switch is at the top of each menu. New is the default. `et_admin_version` is a cosmetic per-browser preference, and `adminView=new|classic` supports direct links. Neither authorizes access or changes production rules. Both run under the same server-validated Admin layout and API authorization.

Overview and Finance use canonical reporting selectors. Overview retains the period while switching and shares a 60-second in-memory snapshot; Refresh bypasses it. Classic subscriber cards use the same server summary as New Customers. Published Stories is the same component. Classic retains grouped navigation, session re-auth, specialist tools and saved historical finance tools. Old home-page debug auth bypasses, failed-read-zero totals and obsolete subscriber-status recaps are not restored. Historical/manual Classic worksheet defaults and browser-saved figures are labeled separately from verified actuals and the future 12-month Budget.

## Reproducible database checks — local only

Install PGlite outside the repository and point `ADMIN_QA_PGLITE` to that package:

```sh
ADMIN_QA_PGLITE=/absolute/path/to/@electric-sql/pglite node tests/admin-center/local-db-contract.cjs --preparation
ADMIN_QA_PGLITE=/absolute/path/to/@electric-sql/pglite node tests/admin-center/local-db-contract.cjs
```

The fixture deliberately creates local support/job/settings tables inside a rollback transaction. Never run its SQL against production.

## Verification and remaining integration limits

77 Admin tests / 13 suites and focused type checking (76 entry files) passed. The integrated main sound-effects changes passed 44 tests / 4 suites. Both local database contracts passed. Chromium fixtures passed all eight sections at iPhone 390×844, iPad portrait 820×1180, iPad landscape 1194×834 and Mac 1440×1000, including version round trips, period retention, exact shared recap display parity, canonical subscriber summary, fixed cover/title, SFX filter, CSV/Excel bytes and diagram fit. Full local Next build with placeholders passed. Browser checks also verify that Refresh recovers from a temporary settings-source outage; stale action notices clear on refresh/section changes. Production catalog verification confirms the new private database objects and unchanged publication/support settings; authenticated app acceptance and the EC2 serving swap remain Orion's work.

Cost attribution is incomplete: existing ElevenLabs/cover/shared-writing/music costs are not all tied to canonical story IDs, and usage estimates are not invoices. Connected plan actuals, complete CAC/LTV/profit reconciliation, campaign identity/control synchronization, durable delivery reconciliation, legal registration files, native Excel and physical-device audio/push acceptance remain limitations. No guessed financial total substitutes for missing evidence. TikTok remains unconnected. The recovered six-plus-two plan and independent CSV/XLSX exports remain available; Decision Rules marked awaiting owner approval are references, not activated ad controls.
