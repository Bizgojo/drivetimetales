# Endless Tales Admin Command Center — Governing Specification

**Status:** APPROVED DESIGN; PARTIAL IMPLEMENTATION.  
**Recorded:** October 29, 2026.  
**Source of truth:** This file in GitHub. Changes to approved business rules must be explicitly authorized by the owner.  
**Implementation:** PR #420 (development branch). **Do not treat a successful preview build as functional acceptance or an EC2 production deployment.**

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

## Belle Alerts — approved concept, NOT yet wired
Four event categories:
- Voice approval actually needed → Production review.
- New story successfully published → published Story detail.
- Urgent funding shortfall → Finance funding detail.
- Susan campaign ready to review → Marketing campaign approval.

When Admin is open and user has enabled audio: play licensed Endless Tales sting followed by short Belle spoken purpose. On closed iPhone/iPad Home Screen PWA, platform push notification with standard sound and text; custom background spoken audio cannot be assumed. Tapping opens exact relevant authorized Admin route. Unread actionable inbox is synchronized across devices. De-duplicate notifications; allow quiet hours for nonurgent items; user can configure alerts. Secure admin-only event and push subscription handling; requests for permission are user initiated. **No push, audio, or live counts currently implemented.**

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
