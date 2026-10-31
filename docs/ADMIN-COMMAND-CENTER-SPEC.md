# Endless Tales Admin Command Center — Governing Specification

**Status:** APPROVED DESIGN; PARTIAL IMPLEMENTATION.  
**Recorded:** October 29, 2026.  
**Source of truth:** This file in GitHub. Changes to approved business rules must be explicitly authorized by the owner.  
**Implementation:** PR #420 (foundation) and PR #421 (integrated development implementation; incomplete). **Do not treat a successful preview build as functional acceptance or an EC2 production deployment.**

## Mission and UX rules
One responsive Admin at `/admin` for Mac, iPhone, and iPad. Replace the existing cluttered Admin interface, **not** establish two competing Admins. Keep screens brief; put advanced details in expandable areas or linked views. The owner should manage routine operations without leaving Admin wherever provider APIs allow. Preserve working services and underlying data during migration. Mobile-first, clear actionable status, verifiable numbers, and direct deep links.

## Eight primary sections
1. **Overview:** bank balance, monthly burn/run rate, active paid subscriptions, new paid subscribers (30 days), CAC, published stories and new stories (30 days), average production cost (label per episode vs story), active campaigns, MRR. One Action Center for urgent items, decisions and replies.
2. **Agents:** responsibility roster (Orion operations, Hal production, Susan marketing, Bart finance, Atlas technology, Vega QC, Lex legal, and other active agents); operational status; real technical data-flow map; AI model usage, charges, subscriptions, balances and authorized credit-replenishment links.
3. **Production:** ideas/queue, production stages including V2 and ASC3, exceptions and ready-for-review; keep automatic publication upon passing required production and series gates. Routine voice casting remains autonomous; alert for voice approval **only when a specific review is actually required**. Do not reintroduce a routine approval gate.
4. **Stories:** covers, titles, episode counts, durations, genres, status, audio playback, administrative editing, performance, published-library view.
5. **Customers:** shared Inbox for support messages, story suggestions, referrals and user responses; subscriptions, billing, customer histories, preferences, travel-insights choice, listening genres/duration/completion/retention, broad location where permitted. Separate self-reported demographics from observed behavior. **Do not infer individual gender from first name.** Aggregate and privacy-aware reporting. AI sends routine acknowledgments; owner reviews substantive replies. Track delivery, audit history and follow-up status.
6. **Marketing:** Susan and Strategos operate campaigns from Admin: full ad preview and test link, audiences, budgets, start/pause/adjust within approved limits, approvals, conversion tracking, Meta reporting and comments/messages where permitted, CAC/LTV and forecasts. Susan may optimize/pause within an approved campaign budget; **no spending beyond authorization and no launch without owner approval**. Social Media has a clearly non-operational **Future** placeholder for eventual content publishing, scheduling, replies and reporting.
7. **Finance:** bank cash, reconciled Stripe revenue, AI and other expense feeds, monthly budget, actuals, variance, scenario forecasts, marketing allocation controls, cash reserves, profit ledger/transfers. Accounting classifications: **Story Production, Marketing, R&D, Operations**. Cards are payment methods, not expense categories. Distinguish API usage estimates, billed charges, prepaid credits, and cash paid; do not double-count credit purchase and usage.
8. **Documentation:** searchable system overview, operator manual, current business rules, integrations, operational and recovery procedures.

## Five owner-approved operating decisions
1. Routine customer acknowledgments may be automatic. Substantive responses require the owner's review.
2. Susan can optimize and pause within existing authorized budgets; higher spend requires approval. New campaigns remain drafts until owner authorizes launch.
3. **Initial marketing allocation target: 75% of eligible net collected business revenue**, *subject to* essential expenses, taxes and minimum reserve protection; the owner can modify the percentage in Admin. Owner capital contributions/loans are **not** subscription revenue.
4. Bart calculates verified monthly distributable surplus; owner wants automatic profit transfer into a separate **Mercury** account, with optional future external bank destination. **No live bank transfers enabled until Mercury permissions, secure controls, recipient, accounting/tax rules and sufficient-funds reconciliation are verified.** Profit is after expense and reserve commitments.
5. One Admin interface replaces existing navigation/functions, preserving working integrations; validate on a development branch and against production data before deployment, with rollback. Maintain `main` as only deployment line and Orion as exclusive EC2 deployer.

## Belle Alerts — approved behavior; code in PR #421, live acceptance pending
Four event categories:
- Voice approval actually needed → Production review.
- New story successfully published → published Story detail.
- Urgent funding shortfall → Finance funding detail.
- Susan campaign ready to review → Marketing campaign approval.

When Admin is open and user has enabled audio: play licensed Endless Tales sting followed by short Belle spoken purpose. On closed iPhone/iPad Home Screen PWA, platform push notification with standard sound and text; custom background spoken audio cannot be assumed. Tapping opens exact relevant authorized Admin route. Unread actionable inbox is synchronized across devices. De-duplicate notifications; allow quiet hours for nonurgent items; user can configure alerts. Secure admin-only event and push subscription handling; requests for permission are user initiated. **Event inbox, push and foreground-audio code now exist in PR #421. Live delivery, approved assets, provider configuration and actual-device acceptance remain unverified; no production activation has occurred.**

## Approved Meta CAC proof-of-concept
- Claude/Strategos/Susan plan dated October 27, 2026, approved in principle.
- Budget **$4,000 over 6 weeks**, roughly **$95/day**; goal **paid subscriber CAC under $30**.
- Four personas, eight first-wave ad variants (two/persona), weekly Monday reviews, 3–4 new ads/week.
- Pre-launch gates: anonymous first listen on landing page and mobile ad preview tested; Pixel + Conversions API verified for PageView, PlayStart, Listen30s, StartTrial (Stripe), and Subscribe (first paid charge), with deduplication; older competing campaigns stopped; separate fresh campaign; correct Meta ads-management permissions; Mercury marketing card limit adjusted **only via explicit authorized process**.
- All ads paused/draft until owner launches. Do not exceed the specifically approved $4,000 test envelope merely because the general marketing allocation is 75%.
- **Plan sections 1–3 and 5–9 were pasted with missing expanded detail/tables.** Recover original Claude artifact/full workbook before operationalizing detailed milestones or go/no-go logic. Do not invent missing plan criteria.

## Financial model details
Net customer collections → protected essential expenses/taxes/reserves → target marketing allocation → uncommitted verified distributable profit. Track marketing budget as an allocation, distinct from actual ad spend; unused committed funds are not profit. Suggest alternative allocation percentages with 12-month conservative/base/optimistic subscriber, cash and distributable-profit forecasts; owner must approve policy changes. Favor Mercury linked ACH for owner deposits, with funding/deposit shortcut, initially outside Admin if embedded banking not supported. Verify bank data freshness and actual account capabilities; never claim money moved from a draft UI.

## Cross-cutting implementation requirements
- Role/authorization on every admin API route; do not rely on client-side email checks. Audit historical debug-era Admin code granting access on timeout.
- One verifiable source of truth per KPI; display last refreshed timestamp and **unavailable/stale**, not fabricated zero, when connection is down.
- Audit all actions: actor, timestamp, before/after, approval, provider response.
- Customer messages: real inbox with AI draft, explicit Send for substantive replies, reliable sent state, no duplicate outbound messages.
- Safeguards on cash movement, marketing spend, publication and customer privacy.
- Responsive iPhone, iPad, Mac layout; accessible controls, safe alert deep links.
- Keep the story pipeline, player and subscriber app unchanged unless separately authorized.

## Existing code / migration inventory
Baseline pre-work had numerous admin links in `app/admin/layout.tsx`; `app/admin/page.tsx` includes outdated credit/plan assumptions and risky development-era auth shortcuts; `app/admin/finance/page.tsx` contains preset expense estimates; `app/admin/marketing/dashboard/page.tsx` mostly indexes multiple marketing dashboards.
Existing pages/endpoints include `/admin/support` with an AI response suggestion and reply pathway, `/admin/story-ideas`, `/admin/referrals`, `/admin/ai-spending`, `/admin/story-production-v2`, `/admin/production/approval`, `/admin/marketing/campaign-intelligence`, `/admin/stories`, and many others. Audit actual data and permissions before declaring integrations live.
PR #420 development branch already regrouped navigation into eight sections, added `/admin/action-center` with *manual shortcuts only*, and `/admin/social-media` future placeholder. **Do not misrepresent those shortcuts as live Belle alert event handling or the finished replacement.** Preview build was READY; EC2 deployment not performed for this feature.

## Remaining work / acceptance criteria
1. Audit complete admin route inventory, connected services and live data quality, including Supabase, Stripe, Meta, Mercury, AI provider invoices/credits, email and customer submissions; recover complete approved Meta plan.
2. Fix server-side Admin authorization. Define and verify KPI reconciliation rules.
3. Build consolidated Overview/Action Center with live actionable counts and durable event inbox.
4. Integrate customer inbox, profile insights and reply workflows, with per-message audit trails.
5. Consolidate Story Production, Library, Agents and Marketing with real operations and approval boundaries.
6. Implement Finance dashboard, categorized budget/actuals, variance, forecast and allocation preference. Release bank transfer automation only after independent authorization and provider/integration safety review.
7. Implement Belle alert triggers, sting/audio permissions and scripts, optional PWA push, synchronized inbox, deep linking, quiet hours, and device tests.
8. Integrate documentation/user manual and social media future placeholder.
9. Verify every endpoint and UI flow on Mac, iPhone and iPad; preserve old functionality; no active-production-job disruption. Merge via main and deploy to EC2 only through Orion's established gate/isolated-build/rollback procedure.

## Project coordination
Keep this file current whenever a business rule, implementation milestone, source-of-truth connection, or acceptance result changes. Record dates, corresponding PR/commit IDs and remaining blockers. Claude and Orion should read this spec before changing Admin. Do not imply work continues asynchronously or that development branches are production deployments.


## October 29 implementation record — development only

The continuation of PR #420 implements a consolidated interface, authenticated data adapters, durable event inbox, explicit customer email approval, campaign draft/budget review, allocation/evidence ledger/scenarios, optional push worker and requested voice-review controls. Business rules above are unchanged. See [release record and Orion handoff](ADMIN-COMMAND-CENTER-RELEASE.md) for the exact tested scope and remaining blockers.

Local production builds with placeholder credentials, focused tests, responsive Chromium fixture checks and rolled-back development database contract tests passed. Production data was inspected read-only; no production schema, jobs, ads or banking actions changed. The 111-episode reconciled library count uses source publication status in addition to analytics visibility. This is **not** functional acceptance, a production deployment, or a claim that provider permissions, real device delivery, complete finance reconciliation or autonomous operation have been verified.

### October 29 follow-up requirements audit

The owner identified the missing first-campaign spreadsheet and the missing interactive Information Flow / detailed process guide. A full [requirements audit](ADMIN-COMMAND-CENTER-REQUIREMENTS-AUDIT.md) records additional missing or incomplete functionality, independently of credential blockers. The recovered guide is now included as a protected process reference with demo financial displays removed. Existing Campaign Plan and other lost specialist-tool entry points are restored. This does not verify the specific six-week campaign record or complete its missing plan. Business decisions and deployment restrictions remain unchanged.

### Owner amendment — Budget placeholder, October 29

Finance must include a **Budget** link. The 12-month spreadsheet budget will be created **only after the 6+2-week test is completed**, with its budget period beginning after that completion. It is a placeholder now; do not invent a start date, populate budget figures or create the workbook before the test is complete.

Planned workbook tabs: **Budget**, **Actual**, **Actual vs. Budget**, **Variance Analysis**. The spreadsheet will show Sources of Income; expenses in **Operating, Story Production, Marketing, and R&D**, with every expense account represented through detailed subcategories; totals for each category; Total Expenses; Profit; and Cash Flow. The earlier accounting class name Operations maps to the owner's displayed label Operating for this workbook. Existing scenario projections are separate from this future approved budget.

## Owner amendment: visible spreadsheet formats

The owner subsequently requested a clickable budget spreadsheet format now, with zero placeholders except for verified known numbers. This supersedes the no-layout interpretation above: show all four worksheets, twelve undated months, subcategories, totals, profit and cash flow now. Zero cells are explicitly unfilled placeholders, never verified actuals. The approved populated budget and its calendar period still await the completed 6+2-week test. The owner also requested a visible 6+2-week plan and spreadsheet; expose confirmed six-week test requirements and mark unrecovered follow-up details and dates as pending.

## Owner-approved design amendments — October 30, 2026

The owner approved the eight-section design and directed implementation. These amendments preserve the requirements above:

- Production must visibly expose the existing Authors & Narrators, Genres, Content Review & Approval, and Sound Effects Library. Preserve their existing functionality and URLs.
- Stories must reuse the existing `/admin/stories` Published Stories layout, sorting, expandable series and controls, as requested by the owner; do not replace that inventory with the proposed card format.
- Publication, voice review and SFX review are three independent controls. Default automatic behavior and all quality/series gates remain in force. New review controls require verified worker acceptance before activation.
- Overview recap includes new paid subscriptions, cancellation requests, paid acquisition CAC and subscriber churn for the selected period. Missing evidence is unavailable.
- Marketing shows planned/current/past campaigns, real platform previews where supported, funnel counts/conversions/costs against frozen campaign budget and sourced national/audio-app comparisons. Missing benchmarks are not estimated actuals.
- Finance Budget is an undated, twelve-month format beginning only after the complete 6+2-week test. Budget, Actual, Actual vs. Budget and Variance Analysis remain zero placeholders except separately identified known inputs. It includes income, Operating, Story Production, Marketing and R&D subcategories, category totals, total expenses, profit and cash flow.
- External tools include ChatGPT, Claude, Telegram for Orion and Mac Terminal instructions. Do not fabricate an unverified Orion session/chat deep link.
- Deployment remains Orion-only from reviewed `main`, with rollback and no production-job interruption. The owner's deployment request does not waive acceptance checks or authorize advertising spend or bank transfers.

### Six-plus-two-week marketing workbook follow-up

The owner requested separate Budget and Variance Analysis worksheets alongside Actual Results in the marketing test plan. Show four matching eight-week formats: Budget, Actual Results, Actual vs. Budget, and Variance Analysis. Include separate weeks 1–6 and eight-week totals, spending categories, funnel outcomes and cost/conversion measures. Variance analysis reserves space for percentage variance, causes, corrective actions, ownership and review. Unknown cells remain explicitly unfilled placeholders; known approval limits are separate from weekly allocations and actual results.

### Final October 29 marketing budget recovered by owner

The owner identifies `Endless-Tales-Meta-Test-Plan(2).xlsx`, saved October 29 at 12:24 PM, as the final version with Strategos's Decision Rules. The following owner-provided transcription supersedes the October 27 daily allocations and earlier downloads. Original workbook bytes and exact Decision Rules have not yet been received; provenance must say transcription, not imported/verified workbook.

| Week | Starts (2026) | Phase | Ad budget |
| --- | --- | --- | ---: |
| 1 | November 6 | Test 4 hooks | $500 |
| 2 | November 13 | Test 4 hooks | $500 |
| 3 | November 20 | Top 2 ads | $700 |
| 4 | November 27 | Top 2 ads | $700 |
| 5 | December 4 | Winner + reserve | $800 |
| 6 | December 11 | Winner + reserve | $800 |
| 7 | December 18 | Trials convert | $0 |
| 8 | December 25 | Trials convert | $0 |
| Total | | | $4,000 |

Expected eight-week result: 270 trials, 135 paid subscribers, $29.63 ad-spend CAC. These are forecasts, never actuals; weekly conversion timing is not provided. The reported $400 reserve must not be added to the $4,000 total; exact handling awaits the file. Actuals and all variances remain pending verification. Recording this plan does not launch/schedule ads or change spending controls. The separate twelve-month budget still follows completion of the test.

### Budgeted acquisition outcomes must be prominent

The owner reported that expenditures were visible while subscription/CAC/result targets were missing from view. Put budgeted trials, paid subscriptions and CAC before spending details, and expose the eight-week targets beside metric names rather than requiring a horizontal search. Show 270 trial subscriptions, 135 new paid subscriptions and $29.63 paid CAC as forecasts. Cost per trial $14.81 and trial-to-paid conversion 50% may be explicitly calculated from those supplied period totals, not attributed to an unread workbook. Monthly/annual mix, revenue, weekly conversion timing and remaining funnel targets must say they await the original workbook. Do not distribute period forecasts across weeks or invent other original-plan metrics.

### Published original plan recovered from Claude artifact

Owner supplied https://claude.ai/artifact/GgPuEUCcaDWSeun2uivPeJ. Its visible published content was read directly. This supersedes previous statements that the weekly result forecast and Decision Rules were missing. The shared view disables native XLSX download; do not claim that native workbook formulas were imported.

| Week | Ad views | Signups | Trials | Paid subs | Cost/trial | CAC to date |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 35,714 | 54 | 34 | — | $14.81 | — |
| 2 | 35,714 | 54 | 34 | — | $14.81 | — |
| 3 | 50,000 | 75 | 47 | 17 | $14.81 | $100.74 |
| 4 | 50,000 | 75 | 47 | 17 | $14.81 | $71.11 |
| 5 | 57,143 | 86 | 54 | 24 | $14.81 | $55.77 |
| 6 | 57,143 | 86 | 54 | 24 | $14.81 | $49.38 |
| 7 | — | — | — | 27 | — | $37.04 |
| 8 | — | — | — | 27 | — | $29.63 |

The source headline is approximately 286,000 ad views, 270 trials, 135 paid subscribers and $29.63 CAC. Paid conversions lag trial starts by two weeks; judge weeks 1–4 on cost per trial. Final CAC review is January 1, 2027, with $0 January ad spend until that review.

Preserve source rounding: weekly displayed paid cells total 136, not the 135 headline; views total 285,714 versus the approximately 286,000 headline. Do not force rounded weekly values to reconcile or invent unrounded workbook cells. Unprovided period signup totals, monthly/annual split and subscription revenue remain unprovided.

Decision Rules are reference-only, labeled by the source “Set by Strategos Oct 29. Awaiting your approval.” Scale/stop thresholds: page load per ad $1.17/$1.75 after $75 on that ad; signup per ad $9.33/$15 after $75–150; trial pause $15/$22.50 after $600 total; trial hard kill $15/$25 after $600 total; trial-to-paid 50%/35% after 30 trials aged 14 days; blended CAC $30/$45 whenever measurable. Source standing rules and reserve conditions are displayed without activating controls or emails. The $400 reserve release requires $600 spent, 10+ trials per ad set aged 14 days, cost/trial at most $15 AND early paid rate at least 40%; otherwise hold. Preserve the $4,000 total and weekly caps.

### Group the marketing spreadsheets for Excel

The owner requested one grouped Excel workbook and an Admin link for opening it in Excel. Marketing and the 6+2-week plan must expose a prominent `.xlsx` download. Include Budget, Actual Results, Actual vs Budget, Variance Analysis, Decision Rules and Cash. Preserve the published plan's forecasts, dates, source rounding and approval-pending rules. Actuals and cash inputs begin blank; differences and ratios calculate only from entered, evidenced, verified data. Downloaded Excel edits stay in that copy and do not silently update Admin records. Serve the packaged workbook through an authenticated Admin endpoint, not a public asset. This is a grouped workbook prepared from the published source, not an assertion that the disabled original native workbook was downloaded. The deferred 12-month Finance budget remains its separate placeholder.
