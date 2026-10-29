# Admin Command Center — requirements audit

Date: October 29, 2026. Scope: the approved specification, the new Admin implementation, the previous navigation, existing specialist pages/APIs, the two reported omissions, and the supplied Information Flow screenshot. This is a source/requirements audit, not live provider or physical-device acceptance.

**Finding:** PR #421 is a partial implementation. Its prior builds and fixture tests do not establish that the complete requested operating system exists. Some omissions are missing code or consolidation, not merely missing credentials.

## Corrections made during this audit

1. Recovered the original interactive Information Flow / process guide shown in the screenshot. Added it to Agents and Documentation, plus a full-size view under the same protected Admin. It includes Story production / Marketing / Both, selectable stages and roles, and the four detail tabs: What happens, Handoff package, AI models & tools, Usage & costs. Reference models/roles remain identified as source/design or unverified. Demonstration credit colors and sample financial result displays were removed; actual costs link to the existing operational dashboard.
2. Restored direct access to the existing `/admin/marketing/campaign-plan` spreadsheet/timeline. That page reads the existing Airtable campaign API. Its existence does **not** prove that the specific first six-week campaign record, next-week start date or original expanded workbook is present. Those records have not been read in an authenticated live session here. The earlier conclusion that only a summary existed overlooked this existing specialist page.
3. Restored an expandable directory of existing tools within the eight sections, including Landing Page Stories, subscription controls, authors/narrators, genres, ASC, analytics/funnel/signup/trial-paid views, growth, waitlist, existing social analytics, workspace and settings. Their route files were retained previously, but their direct entry points had been lost or buried. Route visibility is not a new live functional test of every tool.

## Requirement-by-requirement result

| Area / requirement | Actual implementation | Status / remaining work |
|---|---|---|
| One Admin at `/admin`, eight sections | New shell and section screens; specialist pages remain inside the same authenticated Admin | Implemented. Some specialist views still need visual/interaction consolidation. |
| Mac, iPhone, iPad | Chromium fixture checks at 390×844, 820×1180, 1440×1000 | Responsive fixture checks pass. Physical iPhone/iPad, Safari, real sessions, touch/audio/push remain unverified. |
| Overview subscriptions, MRR, new paid, collections | Live-capable Stripe adapter; explicit availability/source definitions | Not live reconciled here. MRR is before discounts/tax and uses paid latest-invoice eligibility; subscription variants and large-account runtime still require validation. |
| Overview bank cash | Mercury available-balance adapter | Not live verified here. Eligible operating accounts versus separate profit/reserve accounts are not configured. |
| Overview library counts | Reconciles source publication, analytics visibility and covers | Read-only production comparison verified 111 eligible episodes, versus 113 raw visible analytics rows. |
| Burn, CAC, LTV, average production cost | Deliberately unavailable | Missing complete expense/attribution reconciliation and authoritative period definitions. These KPIs are not completed. |
| Unified Action Center | Durable event inbox and links; support count is a limited latest-record sample | Support messages, campaign decisions, suggestions, referrals, funding and all other exceptions are not one complete sortable action queue. No resolved-action lifecycle or full history pagination. |
| Agent responsibilities | Existing declared roster reused | Configured/active roster and real per-agent model assignments not independently verified. |
| Agent activity and status | Agent logs, worker heartbeat rows and existing operations links | No complete authoritative live status across all agents; stale heartbeat labels are not proof of actual work. |
| Information Flow map and detailed guide | Recovered reference now integrated | The previously omitted interactive view is restored. It is not a live execution/credit telemetry map. Source references need continuing reconciliation with current code. |
| AI usage, expenses, subscriptions, credits | Existing AI-spending dashboard and provider replenishment links retained | Usage/billed/prepaid/cash distinctions exist, but attribution and completeness are not verified. Production lacks the `expenses_log` table expected by existing expense code. No automatic replenishment. |
| Production ideas, queue, V2/ASC3, progress | Reads recent jobs/queue; links existing controls | No complete series-level timeline, dependency view or all-history pagination. Existing specialist actions not all retested. |
| Requested voice decisions | Exact pending-review/version checks and atomic approval/audit | Database contract tested with fixtures. Provider demos can be read; story-line auditions remain in original delivery, not embedded recordings. No routine gate introduced. |
| Automatic publication | Existing rules/series gates untouched | No production episode was run/published as an Admin acceptance test. |
| Stories library, playback, editing, performance | Eligible episode cards, covers, metadata, audio controls, existing editor links | Fixture rendering checked. Complete series grouping/navigation, editing and real playback/performance flows still need end-to-end acceptance. |
| Customer shared inbox | Reads support messages, including idea-submission subjects; referral/suggestion tools linked | Referral events, customer responses and suggestions are not normalized into a full shared conversation timeline. |
| Customer AI draft and one-tap sending | AI suggestion path plus explicit approval; recipient derived from saved message; claimed/idempotent send | Input/idempotency contracts tested. No live test email sent. Provider delivery webhooks, confirmed delivery and uncertain-send reconciliation missing. |
| Routine acknowledgments | Worker only addresses confirmed account email matching saved support message | Code exists, disabled pending provider/scheduler verification. Fixed acknowledgment text, not an autonomous support agent. |
| Customer history and follow-up | Subscriber records and limited listening/preferences samples; existing billing/history tools linked | Full per-customer timeline, reply audit UI, assignments, follow-up status and retention cohorts are incomplete. |
| Customer intelligence | Self-reported preferences/travel choice kept separate; no gender inference | No complete listening genre/duration/cohort/retention report or privacy-reviewed broad-location aggregation. |
| First six-week campaign spreadsheet | Existing Airtable Campaign Plan link restored; summary of approved envelope | The specific campaign/workbook, dated weekly rows, first-wave ad/persona schedule and missing expanded plan have not been verified/recovered. No invented dates or weekly allocations. |
| Campaign source of truth | Existing Airtable intelligence plus new local creative/budget review records | These approval records are not synchronized. A local draft approval is not approval/activation of an actual Meta campaign. This needs integration, not just credentials. |
| Real ad previews and test destinations | Stored creative/destination plus read-only Meta creative/placement-preview adapter | Requires live account/permission tests. No actual landing-to-listen-to-paid journey verified. |
| Susan/Strategos operation and recommendations | Declared roles, draft review UI and existing campaign intelligence links | No fully connected autonomous creation/optimization/recommendation loop. |
| Start/pause/adjust within approved limits | No direct write automation | Missing implementation. No ads launched or spend activated. The local aggregate $4,000 cap does not account for external commitments/spend. |
| Meta reporting, comments/messages, CAC/LTV | Read-only campaigns and recorded database metrics | No complete comments/messages inbox, reconciled acquisition attribution or verified CAC/LTV. |
| Pixel/CAPI funnel and launch gates | Requirements documented | PageView, PlayStart, Listen30s, StartTrial, Subscribe deduplication and older-campaign shutdown not verified for this release. |
| Social Media future placeholder | Clearly marked non-operational | Implemented as specified. Existing social tools retained separately. |
| Finance budget/actual/variance | New evidence ledger and category variance; existing finance/AI/CFO tools linked | Manual recorded inputs are not complete independently verified actuals. No automatic matching across bank, Stripe, invoices, usage and prepaid credits. |
| 75% adjustable marketing allocation | Versioned owner policy and protected-funds calculation | Implemented and database-tested. Actual funds are not earmarked/reserved by saving the policy. |
| Twelve-month forecasts | Editable conservative/base/optimistic calculator | Projections only. Not connected to a reconciled baseline; lacks complete annual-billing timing, tax/reserve/commitment and actual distributable-profit modeling. |
| Operating reserves and funding | Policy commitments can be attested; fresh Mercury cash comparison produces funding event | Bank/account eligibility and full reconciliation remain unverified. Attestation is not an independent accounting audit. |
| Profit ledger and monthly transfer preparation | Disabled transfer intent and explanation; no bank-write endpoint | No complete monthly surplus ledger, recipient selection, transfer-proposal/reconciliation workflow or scheduled transfer engine. Live transfers intentionally cannot activate without the required capabilities, controls and explicit authorization. |
| Documentation | Searchable short cards, release/recovery document and now detailed interactive process reference | Full current operator manual for every workflow, integration ownership/runbooks and ongoing source/version maintenance are incomplete. |
| Belle four event categories | Source reconciliation produces voice, publication, campaign and funding records | Schema/logic tested with fixtures. Runtime scheduler, freshness, resolved-action behavior and complete backlog handling need acceptance. Campaign events currently cover local drafts, not all Susan/Airtable activity. |
| Foreground sting + Belle | Audio setting and sequential playback code; approved asset URLs required | No assets provisioned or actual-device autoplay/quiet-hour behavior verified. Browser permission/settings UI is limited. |
| Closed-app push and synchronized history | Admin-only subscriptions, separate push worker, read receipts, quiet hours and delivery-attempt ledger | Requires configured delivery and real device tests. Provider acceptance is not confirmed display. Failed/pending attempts do not have an automatic reconciliation loop. Only the most recent event window is exposed. |
| Exact alert action links | Links to selected story/job/campaign/funding sections | Some are fixture-tested; source changes can leave a historical alert pointing to a resolved item. Full lifecycle/permissions/device tests outstanding. |
| Server authorization | Server Admin layout plus API-wide middleware; scoped service authentication | Focused access tests pass. Deployment must first migrate and test all real worker/agent/script callers. Only the core self-fetches and one loop client were updated. |
| Audit all actions | New financial/campaign/policy/voice/reply decisions have audit records | Historical specialist mutation routes, settings/read-state changes and provider failures do not yet have complete uniform before/after/approval/provider-result audit coverage. |
| No fabrication | Unavailable financial results kept unavailable; projections labeled; guide demo balances removed | Some limited samples and recorded metrics are not complete actuals. Continue checking all reused legacy screens before acceptance. |
| Preserve working functionality | Existing route files retained; lost entry points restored in this follow-up; device planning keys preserved | Full regression test of the old tool inventory and all saved device planning workflows remains outstanding. |
| Keep pipeline/player safe and rollback | No production deployment/migration/jobs changed; player untouched; transport authentication changes isolated | Main-only, Orion-only deployment remains in force. Worker-authentication cutover is a release blocker. |

## Test coverage gaps that matter

The prior 42 tests did not exercise every Admin API, a real authenticated account, real campaign/financial/customer data, email/push delivery, actual Safari/iPhone/iPad behavior, bank reconciliation, or preservation of every specialist workflow. The mobile tests use fixtures and cover layout plus selected interactions. Those limits remain explicit; neither a successful build nor the new navigation is completion evidence.

This follow-up adds checks for the recovered guide's channel selectors and four detail tabs at each of the three viewport sizes. It checks that reference financial values are unavailable rather than demonstration figures. It also confirms the guide is behind Admin authorization and packaged with the server route.

## Priorities before operational acceptance

1. Verify the actual first six-week Campaign Plan record and recover its original expanded plan. Load its dated weekly/ad/persona/budget/approval rows; connect the same campaign identity to all views.
2. Finish shared campaign approvals/control boundaries, accounting/revenue/expense matching and customer inbox/history/follow-up workflows. Fill missing financial KPIs only from reconciled sources.
3. Provision and verify provider permissions, approved Belle assets and delivery configuration; complete email/push lifecycle handling and actual-device tests.
4. Complete the specialist action/audit and worker-caller inventories. Demonstrate safe authentication cutover and regression acceptance before Orion's reviewed main-only deployment.

No advertising launch, bank transfer, routine production authorization change, production schema change, merge or EC2 deployment is authorized or performed by this audit.

## Owner follow-up: future Budget workbook

Finance → Budget now has an explicit protected placeholder with four planned tabs (Budget, Actual, Actual vs. Budget, Variance Analysis). The 12-month budget will begin after completion of the 6+2-week test and will not be created/populated before then. Its income sources, detailed Operating/Story Production/Marketing/R&D expense subcategories, category totals, Total Expenses, Profit and Cash Flow are recorded as requirements. This placeholder is intentional, not a claimed completed budget. The exact start date and detailed accounts remain unset.

### Follow-up validation record

- 44 focused tests passed.
- New Admin type check passed with zero diagnostics across 53 entry files.
- Chromium fixture checks passed at all three viewport sizes, including all eight sections, recovered guide channel selectors/detail tabs, restored specialist entry points, and all four future Budget placeholder tabs. No populated budget table or budget-entry inputs exist on the placeholder.
- All original navigation targets from the previous main Admin layout are represented in the new shell, section controls or expandable tool directory. This checks access paths, not live execution of each legacy tool.
- No budget workbook was created. No dates, amounts, income-source accounts or expense subcategory values were invented.
