# ENDLESS TALES — Campaign Management System
## Codex Implementation Specification

**Owner:** Marc Postlewaite
**Last Updated:** May 7, 2026
**Version:** 1.2
**Audience:** Codex (Claude Code) — building the integrations and automation layer

**Changes from v1.1 (May 7, 2026):** Three formula bug fixes and one new automation discovered during end-to-end schema validation testing. See Section 5.5 (Validated Formula Reference) for canonical formula text and Section 9.5 (Complete-Status Guard) for the new automation. The stress test script in Section 9 already includes auto-freeze behavior — clarifying note added.

**Changes from v1.0:** All eight open questions answered. Funnel expanded for free-story + 14-day trial flow. Annual price corrected to $59.99. Stress floor floored at $5,000. Daily fresh recommendations from Hal with anti-anchoring rule. Hal Marketing Capabilities Buildout added as Appendix A.

---

## 1. PURPOSE OF THIS DOCUMENT

This spec defines the technical implementation of the Endless Tales Campaign Management System. The system itself — the data model, the formulas, the prompts, the templates — has already been designed and is documented here. Your job is to build the integrations that make the system run with minimal manual effort.

You are NOT being asked to redesign the system. The schema is fixed. The formulas are fixed. The prompts are fixed. If you believe a design choice is wrong, raise it as a question to Marc before changing it.

The system runs on Airtable. All integrations read from and write to Airtable as the source of truth. There is no separate database, no separate app, no separate state.

---

## 2. SYSTEM OVERVIEW

### What the system does

The system manages marketing campaigns for Endless Tales (subscription audio storytelling, $7.99/mo or $59.99/yr) across their full lifecycle: recommendation → approval → execution → analysis → archive. It enforces a cash floor stress test before any campaign is approved, tracks actuals against frozen forecasts during execution, and extracts patterns from completed campaigns to inform future recommendations.

### Five tables (plus a sixth for templates)

1. **Campaigns** — master record, one row per campaign across all states
2. **Tasks** — one row per task, linked to a campaign
3. **Recurring Expenses** — fixed monthly costs, manually maintained
4. **Cash Snapshots** — daily Mercury balance pulls + computed forecasts
5. **Patterns** — lessons extracted from completed campaigns
6. **Task Templates** — channel-specific task lists used to auto-populate Tasks on approval

### Six campaign states

Recommended → Approved → Active → Complete → Archived. Plus Rejected as a terminal alternate to Approved.

### The funnel

The Endless Tales acquisition funnel has six stages, longer than a typical SaaS funnel because of the free-story preview layer:

```
Impressions → Clicks → Landing Page Visits → Free Story Plays → 
Trial Signups (CC required) → Paid Conversions (post-14-day-trial) → 30-Day Retained
```

Each stage's conversion rate is a separate metric, tracked in both Forecast and Actual. The free-story-plays stage is critical — it's where listeners experience the product. The trial-to-paid conversion happens 14 days after trial signup, which is what drives the 28-day revenue lag in cash projections.

### Three layers Codex builds

1. **Data layer** — Airtable schema (Marc builds this; Codex verifies)
2. **Computation layer** — automations and scripts (Codex builds)
3. **Integration layer** — Mercury, Stripe, Claude API, channel APIs (Codex builds)

---

## 3. CONFIRMED DECISIONS

These are the locked answers to the questions raised during design. Do not deviate without explicit approval from Marc.

| Decision | Value |
|---|---|
| Monthly subscription price | $7.99 |
| Annual subscription price | $59.99 |
| Trial mechanism | Landing page → 2-3 free stories → 14-day free trial requiring credit card → auto-convert to paid |
| Subscriber count timing | Net at 30 days (subscriber counts toward Actual Paid Subs only if still active 30 days after first payment) |
| Annual sub treatment | Counts as 1 subscriber. Revenue projection: $59.99 / 12 = $4.99/mo equivalent. Cash impact: $59.99 lump sum in signup month. |
| Stress floor | MAX($5,000, 90 × monthly_burn / 30) — never below $5,000 |
| Monthly churn assumption | 7% (until real data accumulates) |
| Assumed retention months | 6 (gives LTV ~$47.94 monthly, $59.99 annual) |
| Annual renewal probability | 0.55 (best guess until data exists) |
| Revenue discount in stress test | 0.5 (half-credit forecast revenue) |
| Revenue lag in stress test | 28 days (campaign start → trial signup → 14-day trial → first paid conversion) |
| Recommendation cadence | Daily fresh recommendations as part of Hal's morning briefing |
| Recommendations per day | 3-5, ranked, with #1 defended at length and #2-5 sketched briefly |
| UTM convention | utm_campaign MUST exactly match Airtable Campaign Name. Marc maintains discipline; mapping table added later if it breaks. |
| Hal's role | Will execute campaigns once capabilities are built (see Appendix A). Until then, task templates assign Hal but Marc executes manually. |
| Variance analysis delay | 7 days after Complete status |
| Actuals staleness alert | 3 days without update |
| Max concurrent campaigns | 3 (soft limit) |
| Stripe fee rate | 2.9% + $0.30 per transaction |

---

## 4. WHAT YOU ARE BUILDING

In priority order. Each is independent — finish one before starting the next.

### Priority 1: Mercury daily balance pull
A scheduled job that pulls the current Mercury Bank balance once per day and writes it to a new Cash Snapshots row.

### Priority 2: Cash Snapshots calculation script
The script that runs after the Mercury pull, computes total committed campaign spend and total recurring expenses, and populates the rest of the snapshot row.

### Priority 3: Cash floor stress test (approval guard)
An Airtable automation that runs when a campaign's status changes to Approved. Computes the 90-day cash floor with the new campaign included. If it breaches the stress threshold, reverts the status to Recommended and writes the reason. Includes auto-freeze of baseline forecast values on success — see Section 9 for why this is critical.

### Priority 3.5: Complete-status guard (added in v1.2)
An Airtable automation that runs when a campaign's status changes to Complete. If Actual End Date is empty, sends Marc an email alert. Does not block the status change — see Section 9.5 for rationale.

### Priority 4: Task template auto-population
An Airtable automation that runs when a campaign's status changes to Approved. Reads the matching template from Task Templates and creates Tasks records for the campaign.

### Priority 5: Stripe subscriber attribution
Capture UTM parameters at signup. Store them on the user record. Roll up subscriber counts by campaign for use in Actual Paid Subs (with 30-day net lookback).

### Priority 6: Stripe MRR rollup
Pull current MRR from Stripe daily and write it to Cash Snapshots for use in revenue projections. Includes annual sub handling.

### Priority 7: Claude API integration for variance analysis
Scheduled job: when a campaign moves to Complete and 7 days pass, send its data to Claude API with the variance analysis prompt, write the result to the Variance Analysis field.

### Priority 8: Claude API integration for daily recommendations
Scheduled job (early morning, runs as part of Hal's briefing): send current state to Claude API with the recommendation prompt, create the resulting campaigns as Recommended-status records.

### Priority 9: Alerts
Daily check that flags: stale actuals (>3 days without update on an active campaign), cash floor breach, campaigns needing variance analysis, anchoring risk in recommendations.

### Priority 10: Reporting refinements
Once everything above works: better dashboards, retention tracking, pattern confidence updates.

Stop after Priority 4 unless explicitly told to proceed. Priorities 1, 2, 3, 3.5, and 4 deliver a usable system. The rest are enhancements.

---

## 5. AIRTABLE SCHEMA (REFERENCE)

### Campaigns table — fields you'll interact with

**Identity**
- `Campaign ID` (auto-number)
- `Campaign Name` (text) — MUST match utm_campaign exactly
- `Status` (single select: Recommended, Approved, Active, Complete, Archived, Rejected)
- `Channel` (single select: Meta, TikTok, Reddit, Email, Influencer, Content, Google, Other)

**Funnel forecast (set at recommendation, frozen at approval)**
- `Forecast Spend` (currency)
- `Forecast Start Date` (date)
- `Forecast End Date` (date)
- `Forecast Impressions` (number)
- `Forecast Clicks` (number)
- `Forecast Landing Page Visits` (number) — NEW for v1.1
- `Forecast Free Story Plays` (number) — NEW for v1.1
- `Forecast Trial Signups` (number) — was Forecast Trials
- `Forecast Paid Subs` (number) — these convert from trials after 14 days
- `Forecast 30-Day Retained` (number)
- `Forecast CAC` (formula) — Forecast Spend / Forecast Paid Subs
- `Forecast Annual Mix %` (number, 0-100) — what fraction of paid subs are projected to choose annual
- `Forecast LTV` (currency, computed)

**Frozen baseline (set by approval automation)**
- `Frozen Forecast Spend` (currency)
- `Frozen Forecast CAC` (currency)
- `Frozen Forecast Paid Subs` (number)
- `Approved Date` (date)

**Actuals (updated during execution)**
- `Actual Spend` (currency)
- `Actual Impressions` (number)
- `Actual Clicks` (number)
- `Actual Landing Page Visits` (number)
- `Actual Free Story Plays` (number)
- `Actual Trial Signups` (number)
- `Actual Paid Subs` (number) — UPDATED ONLY for subs still active at 30 days
- `Actual 30-Day Retained` (number)
- `Actual Annual Subs` (number) — count of paid subs who chose annual plan
- `Actual Start Date` (date)
- `Actual End Date` (date)
- `Last Actuals Update` (last modified time)

**Computed**
- `Cash Committed` (formula)
- `Variance Flag` (formula)
- `Variance Analysis` (long text, written by Claude API)

**Decision tracking**
- `Rejection Reason` (long text)
- `Tasks` (linked to Tasks table)
- `Stories Used` (linked to Stories table if it exists, otherwise text) — which Endless Tales stories were used as creative

### Cash Snapshots — fields you'll write

- `Snapshot Date` (date, primary)
- `Mercury Balance` (currency)
- `Total Committed Campaign Spend` (currency)
- `Total Recurring Monthly` (currency)
- `Current MRR` (currency, from Stripe)
- `Active Subscribers` (number, from Stripe)
- `Active Annual Subs` (number, from Stripe) — for cash flow timing
- `Available Cash` (formula)
- `90-Day Forecast Floor` (computed by script)
- `Min Floor Day Offset` (number)
- `Min Floor Date` (date)
- `Below Stress Threshold` (formula)

### Recurring Expenses — read only for scripts

- `Active` (checkbox)
- `Monthly Equivalent` (formula)

### Tasks — fields written at approval time

- `Task Name` (text)
- `Campaign` (linked record)
- `Owner` (single select: Marc, Hal, Codex, Claude, External)
- `Status` (single select, default "Not Started")
- `Forecast Start Date` (date)
- `Forecast End Date` (date)
- `Priority` (single select, default "P1")

### Task Templates — fields read by automation

- `Task Name` (text)
- `Channel` (single select)
- `Default Owner` (single select)
- `Days from Start` (number, signed)
- `Anchor` (single select: start, end, midpoint)
- `Active` (checkbox)
- `Order` (number)
- `Notes` (long text)

---

## 5.5 VALIDATED FORMULA REFERENCE (canonical — patched 5/7/2026)

During end-to-end schema validation on May 7, 2026, three formulas were corrected. These are the canonical versions. If Codex finds different formula text in the live Airtable base, **assume the live base is correct** (Marc applied these patches manually during testing) and use these as documentation only. If a future rebuild requires recreating these fields, use this exact text.

### Cash Committed (Campaigns table, formula field)

```
IF(
  OR({Status} = "Approved", {Status} = "Active"),
  {Frozen Forecast Spend},
  0
)
```

**Behavior:** Returns Frozen Forecast Spend for Approved or Active campaigns. Returns 0 for Recommended (not yet committed), Complete (no longer committed — money is spent or unspent but campaign is over), Archived, or Rejected.

**Why this matters:** The 90-day floor calculation in Section 8 sums Cash Committed across campaigns to project outflows. A campaign in Complete state should not show as "committed" because it's done. A campaign in Recommended state should not show as committed because it hasn't been approved.

**Bug fixed:** Earlier formula returned 0 for all states. Test campaign showed $0 committed even when Active.

### Days Active (Campaigns table, formula field)

```
IF(
  {Actual Start Date},
  IF(
    {Actual End Date},
    DATETIME_DIFF({Actual End Date}, {Actual Start Date}, 'days') + 1,
    DATETIME_DIFF(TODAY(), {Actual Start Date}, 'days') + 1
  ),
  BLANK()
)
```

**Behavior:** A campaign that started today and has no end date returns 1 (Day 1, not Day 0). A campaign with both start and end dates returns inclusive day count. A campaign with no start date returns blank.

**Bug fixed:** Earlier formula was off-by-one (returned 0 on the start date).

### Pacing % (Campaigns table, formula field; format as Percent, 2 decimal places)

```
IF(
  AND(
    {Days Active} > 0,
    {Frozen Forecast Paid Subs} > 0,
    DATETIME_DIFF({Forecast End Date}, {Forecast Start Date}, 'days') > 0
  ),
  ({Actual Paid Subs} / {Days Active}) / ({Frozen Forecast Paid Subs} / DATETIME_DIFF({Forecast End Date}, {Forecast Start Date}, 'days')),
  BLANK()
)
```

**Behavior:** Calculates subs-acquisition pacing. 100% = on track to hit Frozen Forecast Paid Subs. >100% = ahead of schedule. <100% = behind schedule. Returns blank when Days Active is 0 or forecast values are missing.

**Bug fixed:** Earlier formula caused divide-by-zero when Days Active was 0. Combined with the Days Active off-by-one fix, Pacing % now calculates correctly from Day 1 forward.

**Note:** Pacing % naturally produces extreme values (e.g., 2700%) on Day 1 because the denominator assumes evenly-distributed acquisition over the full campaign duration. Real campaigns front-load acquisition. Pacing % becomes meaningful around Day 7+.

---

## 6. CONFIGURATION CONSTANTS

These constants drive the system's behavior. Store them in an Airtable `Config` table or in `.env` files. Single source.

```
STRESS_FLOOR_USD              = MAX(5000, 90 * (monthly_burn / 30))
                              # Recompute when monthly_burn changes.
                              # Floor is $5,000 minimum, regardless.

REVENUE_DISCOUNT              = 0.5
                              # Half-credit forecast revenue in stress test.

REVENUE_LAG_DAYS              = 28
                              # Campaign start → trial signup → 14-day trial → 
                              # first paid conversion ≈ 28 days.

DAYS_TO_PROJECT               = 90

STRIPE_FEE_RATE               = 0.029
STRIPE_FEE_FIXED              = 0.30

ASSUMED_MONTHLY_CHURN         = 0.07
                              # 7% — update when 60+ days of real data exist.

ASSUMED_RETENTION_MONTHS      = 6
                              # Drives LTV calculations.

ANNUAL_RENEWAL_PROBABILITY    = 0.55
                              # Best guess until annual cohorts mature.

SUBSCRIPTION_MONTHLY          = 7.99
SUBSCRIPTION_ANNUAL           = 59.99
ANNUAL_MONTHLY_EQUIVALENT     = 4.99
                              # 59.99 / 12 = 4.999, rounded.

NET_SUB_LOOKBACK_DAYS         = 30
                              # Sub counts toward Actual Paid Subs only after 
                              # 30 days of continuous payment.

MAX_CONCURRENT_CAMPAIGNS      = 3

VARIANCE_ANALYSIS_DELAY_DAYS  = 7

ACTUALS_STALENESS_DAYS        = 3

DAILY_RECOMMENDATIONS_COUNT   = 4
                              # Number of fresh recommendations per morning briefing.

ANTI_ANCHORING_LOOKBACK_DAYS  = 14
                              # Don't propose campaigns substantially similar to 
                              # ones rejected in the last N days.
```

---

## 7. INTEGRATION 1: MERCURY DAILY BALANCE PULL

### What it does

Once daily (6 AM ET), pulls the current Mercury Bank account balance and creates a new Cash Snapshots row in Airtable.

### Mercury API basics

Mercury provides a REST API. Documentation: https://docs.mercury.com/

You will need:
- A Mercury API key (Marc generates from Mercury dashboard, stores in secure env vars)
- The account ID for the Endless Tales operating account

Endpoint: `GET https://api.mercury.com/api/v1/accounts/{accountId}`

Returns account details including current balance.

### Implementation

Recommended: Vercel cron, since it's already in the stack and Marc is familiar with it.

```javascript
// /api/cron/mercury-snapshot.ts (Vercel)
// Runs daily at 6 AM ET via vercel.json cron config

import { MercuryClient } from './mercury-client';
import { AirtableClient } from './airtable-client';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }
  
  const mercury = new MercuryClient(process.env.MERCURY_API_KEY);
  const airtable = new AirtableClient(process.env.AIRTABLE_API_KEY, process.env.AIRTABLE_BASE_ID);
  
  const account = await mercury.getAccount(process.env.MERCURY_ACCOUNT_ID);
  const balance = account.availableBalance;
  
  const today = new Date().toISOString().split('T')[0];
  const existing = await airtable.findSnapshot(today);
  
  if (existing) {
    await airtable.updateSnapshot(existing.id, { 'Mercury Balance': balance });
  } else {
    await airtable.createSnapshot({ 
      'Snapshot Date': today, 
      'Mercury Balance': balance 
    });
  }
  
  // Trigger downstream computation
  await fetch(`${process.env.BASE_URL}/api/cron/snapshot-calculate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` }
  });
  
  res.status(200).json({ success: true, balance });
}
```

### Error handling

- If Mercury API fails: do NOT create a snapshot. Log the error. Send email alert to Marc.
- If Airtable write fails: retry once with exponential backoff. If still fails, log and alert.
- If a snapshot for today already exists: update it rather than creating a duplicate.

### Mercury API permissions

Mercury API key should be **read-only** if Mercury supports that. The system never needs to move money — only read balance.

---

## 8. INTEGRATION 2: SNAPSHOT CALCULATION SCRIPT

### What it does

Runs immediately after the Mercury pull and the Stripe MRR rollup. Computes:
- Total Committed Campaign Spend (sum of Cash Committed across Approved/Active campaigns)
- Total Recurring Monthly (sum of Monthly Equivalent across Active recurring expenses)
- 90-Day Forecast Floor (computed by walking forward 90 days)
- Min Floor Day Offset and Min Floor Date

### The 90-day floor calculation

```
INPUTS:
- current_cash (today's Mercury balance)
- monthly_burn (sum of Monthly Equivalent from Recurring Expenses)
- current_mrr (from Stripe; monthly + annual-equivalent combined)
- active_annual_subs (count of currently-active annual subscribers)
- approved_active_campaigns (list with: spend, start_date, end_date, 
  actual_spend_to_date, forecast_paid_subs, forecast_annual_mix)

COMPUTE:
- daily_burn = monthly_burn / 30
- daily_mrr_net = current_mrr * (1 - STRIPE_FEE_RATE) / 30

balance = current_cash
mrr = current_mrr
min_balance = current_cash
min_day = 0
today = today's date

FOR each day d from 0 to 90:
  date = today + d days
  
  # Subtract daily burn
  balance -= daily_burn
  
  # Subtract campaign spend hitting that day
  FOR each campaign in approved_active_campaigns:
    IF date is between campaign.start and campaign.end:
      remaining = MAX(0, campaign.spend - campaign.actual_spend_to_date)
      duration = campaign.end - campaign.start (in days)
      balance -= remaining / duration
  
  # Apply daily churn to existing MRR
  mrr *= (1 - ASSUMED_MONTHLY_CHURN / 30)
  
  # Add daily MRR (net of fees)
  balance += (mrr * (1 - STRIPE_FEE_RATE)) / 30
  
  # Add forecast revenue from each campaign (DISCOUNTED, LAGGED)
  FOR each campaign:
    revenue_start = campaign.start + REVENUE_LAG_DAYS
    IF date == revenue_start:
      # Campaign revenue starts hitting MRR pool
      forecast_subs = campaign.forecast_paid_subs
      annual_mix = campaign.forecast_annual_mix / 100  # e.g., 20% annual
      
      # Monthly portion
      monthly_subs = forecast_subs * (1 - annual_mix)
      monthly_revenue = monthly_subs * SUBSCRIPTION_MONTHLY
      
      # Annual portion: lump cash + monthly recurring equivalent
      annual_subs = forecast_subs * annual_mix
      annual_lump = annual_subs * SUBSCRIPTION_ANNUAL * REVENUE_DISCOUNT
      annual_monthly_equiv = annual_subs * ANNUAL_MONTHLY_EQUIVALENT
      
      balance += annual_lump * (1 - STRIPE_FEE_RATE)
      mrr += (monthly_revenue + annual_monthly_equiv) * REVENUE_DISCOUNT
  
  IF balance < min_balance:
    min_balance = balance
    min_day = d

RETURN min_balance, min_day
```

### Notes

- **Annual subs:** treated two ways simultaneously. The $59.99 lump sum hits balance at signup. The $4.99/mo equivalent contributes to ongoing MRR for revenue projection purposes. This double-counts on day 1 but is corrected by the daily MRR drip thereafter.
- **Revenue lag:** 28 days (was 14 in v1.0). Reflects landing page → free stories → trial signup → 14-day trial → first paid conversion.
- **Stripe fees:** subtracted from all revenue.
- **Churn:** applied daily as decay on MRR.

### Output

Write to today's Cash Snapshots row:
- `Total Committed Campaign Spend`
- `Total Recurring Monthly`
- `90-Day Forecast Floor` = min_balance
- `Min Floor Day Offset` = min_day
- `Min Floor Date` = today + min_day

---

## 9. INTEGRATION 3: CASH FLOOR STRESS TEST (APPROVAL GUARD)

### What it does

When a Campaigns record's Status changes to Approved, run the stress test. If passes, copy Forecast values to Frozen Forecast values. If fails, revert status to Recommended and write rejection reason.

### Why this automation is critical (added in v1.2)

Schema validation testing on 5/7/2026 confirmed that **without this automation, Marc must manually populate four fields every time a campaign is approved** (Frozen Forecast Spend, Frozen Forecast CAC, Frozen Forecast Paid Subs, Approved Date). This is error-prone — during testing, Marc forgot to populate these fields and the variance tracking didn't work until they were filled in retroactively.

The stress test script below already includes the auto-freeze behavior in its success branch (see lines copying Frozen Forecast values when stress test passes). Codex must implement this exactly as written — the auto-freeze is not optional.

### Stress floor calculation

```
monthly_burn = sum of Active recurring expenses' Monthly Equivalent
calculated_floor = 90 * monthly_burn / 30
STRESS_FLOOR = MAX(5000, calculated_floor)
```

The $5,000 minimum protects against the case where monthly burn is artificially low (early stage with few subscriptions). It cannot be lowered without explicit approval from Marc.

### The script

```javascript
// Airtable automation — triggered when Status changes to "Approved"

const STRESS_FLOOR_MIN = 5000;
const REVENUE_DISCOUNT = 0.5;
const REVENUE_LAG_DAYS = 28;
const DAYS_TO_PROJECT = 90;
const STRIPE_FEE_RATE = 0.029;
const ASSUMED_MONTHLY_CHURN = 0.07;
const SUBSCRIPTION_MONTHLY = 7.99;
const SUBSCRIPTION_ANNUAL = 59.99;
const ANNUAL_MONTHLY_EQUIVALENT = 4.99;

let inputConfig = input.config();
let recordId = inputConfig.recordId;

let campaignsTable = base.getTable("Campaigns");
let expensesTable = base.getTable("Recurring Expenses");
let snapshotsTable = base.getTable("Cash Snapshots");

let campaign = await campaignsTable.selectRecordAsync(recordId);
let proposedSpend = campaign.getCellValue("Forecast Spend") || 0;
let proposedStart = new Date(campaign.getCellValue("Forecast Start Date"));
let proposedEnd = new Date(campaign.getCellValue("Forecast End Date"));
let proposedSubs = campaign.getCellValue("Forecast Paid Subs") || 0;
let proposedAnnualMix = (campaign.getCellValue("Forecast Annual Mix %") || 0) / 100;
let proposedDuration = Math.max(1, Math.round((proposedEnd - proposedStart) / 86400000));

// Get latest cash snapshot
let snapshots = await snapshotsTable.selectRecordsAsync({
  fields: ["Snapshot Date", "Mercury Balance", "Current MRR", "Active Annual Subs"],
  sorts: [{field: "Snapshot Date", direction: "desc"}]
});
let currentCash = snapshots.records[0]?.getCellValue("Mercury Balance") || 0;
let currentMRR = snapshots.records[0]?.getCellValue("Current MRR") || 0;

// Get monthly burn and compute stress floor
let expenses = await expensesTable.selectRecordsAsync({
  fields: ["Active", "Monthly Equivalent"]
});
let monthlyBurn = 0;
for (let r of expenses.records) {
  if (r.getCellValue("Active")) {
    monthlyBurn += r.getCellValue("Monthly Equivalent") || 0;
  }
}
let dailyBurn = monthlyBurn / 30;
let calculatedFloor = 90 * dailyBurn;
let stressFloor = Math.max(STRESS_FLOOR_MIN, calculatedFloor);

// Get existing committed campaigns (excluding this one)
let allCampaigns = await campaignsTable.selectRecordsAsync({
  fields: ["Status", "Frozen Forecast Spend", "Forecast Spend",
           "Forecast Start Date", "Forecast End Date", "Actual Spend",
           "Forecast Paid Subs", "Forecast Annual Mix %"]
});

let commitments = [];
for (let r of allCampaigns.records) {
  if (r.id === recordId) continue;
  let status = r.getCellValue("Status")?.name;
  if (status === "Approved" || status === "Active") {
    let spend = r.getCellValue("Frozen Forecast Spend") || r.getCellValue("Forecast Spend") || 0;
    let actualSpent = r.getCellValue("Actual Spend") || 0;
    let remaining = Math.max(0, spend - actualSpent);
    let start = new Date(r.getCellValue("Forecast Start Date"));
    let end = new Date(r.getCellValue("Forecast End Date"));
    let days = Math.max(1, Math.round((end - start) / 86400000));
    let subs = r.getCellValue("Forecast Paid Subs") || 0;
    let annualMix = (r.getCellValue("Forecast Annual Mix %") || 0) / 100;
    commitments.push({remaining, start, end, days, subs, annualMix, dailyBurn: remaining / days});
  }
}

// Project 90 days
let balance = currentCash;
let mrr = currentMRR;
let minBalance = currentCash;
let minDay = 0;
let today = new Date();
today.setHours(0,0,0,0);

for (let d = 0; d < DAYS_TO_PROJECT; d++) {
  let day = new Date(today);
  day.setDate(day.getDate() + d);
  
  balance -= dailyBurn;
  
  for (let c of commitments) {
    if (day >= c.start && day <= c.end) {
      balance -= c.dailyBurn;
    }
  }
  
  if (day >= proposedStart && day <= proposedEnd) {
    balance -= proposedSpend / proposedDuration;
  }
  
  // Apply daily churn
  mrr *= (1 - ASSUMED_MONTHLY_CHURN / 30);
  
  // Daily MRR contribution
  balance += (mrr * (1 - STRIPE_FEE_RATE)) / 30;
  
  // Existing campaigns' revenue
  for (let c of commitments) {
    let revenueStart = new Date(c.start);
    revenueStart.setDate(revenueStart.getDate() + REVENUE_LAG_DAYS);
    if (day.getTime() === revenueStart.getTime()) {
      let monthlySubs = c.subs * (1 - c.annualMix);
      let annualSubs = c.subs * c.annualMix;
      let annualLump = annualSubs * SUBSCRIPTION_ANNUAL * REVENUE_DISCOUNT;
      let monthlyRevenue = monthlySubs * SUBSCRIPTION_MONTHLY * REVENUE_DISCOUNT;
      let annualMonthlyEq = annualSubs * ANNUAL_MONTHLY_EQUIVALENT * REVENUE_DISCOUNT;
      balance += annualLump * (1 - STRIPE_FEE_RATE);
      mrr += monthlyRevenue + annualMonthlyEq;
    }
  }
  
  // Proposed campaign revenue
  let proposedRevenueStart = new Date(proposedStart);
  proposedRevenueStart.setDate(proposedRevenueStart.getDate() + REVENUE_LAG_DAYS);
  if (day.getTime() === proposedRevenueStart.getTime()) {
    let monthlySubs = proposedSubs * (1 - proposedAnnualMix);
    let annualSubs = proposedSubs * proposedAnnualMix;
    let annualLump = annualSubs * SUBSCRIPTION_ANNUAL * REVENUE_DISCOUNT;
    let monthlyRevenue = monthlySubs * SUBSCRIPTION_MONTHLY * REVENUE_DISCOUNT;
    let annualMonthlyEq = annualSubs * ANNUAL_MONTHLY_EQUIVALENT * REVENUE_DISCOUNT;
    balance += annualLump * (1 - STRIPE_FEE_RATE);
    mrr += monthlyRevenue + annualMonthlyEq;
  }
  
  if (balance < minBalance) {
    minBalance = balance;
    minDay = d;
  }
}

let minDate = new Date(today);
minDate.setDate(minDate.getDate() + minDay);

if (minBalance < stressFloor) {
  await campaignsTable.updateRecordAsync(recordId, {
    "Status": {name: "Recommended"},
    "Rejection Reason": `STRESS TEST FAILED. With this campaign, projected cash floor is $${Math.round(minBalance).toLocaleString()} on ${minDate.toISOString().split('T')[0]} (day ${minDay}), below threshold of $${Math.round(stressFloor).toLocaleString()}. Stress floor is MAX($5,000 minimum, 90 × daily burn = $${Math.round(calculatedFloor).toLocaleString()}). To pass: reduce spend, delay start, or wait for revenue to accumulate.`
  });
  output.set("result", "BLOCKED");
} else {
  let cac = proposedSubs > 0 ? proposedSpend / proposedSubs : 0;
  await campaignsTable.updateRecordAsync(recordId, {
    "Frozen Forecast Spend": proposedSpend,
    "Frozen Forecast CAC": cac,
    "Frozen Forecast Paid Subs": proposedSubs,
    "Approved Date": today.toISOString().split('T')[0]
  });
  output.set("result", "APPROVED");
}
```

---

## 9.5 INTEGRATION 3.5: COMPLETE-STATUS GUARD (added in v1.2)

### What it does

When a campaign's Status changes to Complete, verify Actual End Date is populated. If empty, send Marc an email alert. The status change is NOT reverted — Marc may legitimately mark a campaign Complete and fill the end date later — but the missing field will cause Days Active and Pacing % to calculate incorrectly until corrected.

### Why this exists

Discovered during 5/7/2026 schema validation testing. Marc moved a test campaign to Complete without setting Actual End Date. Days Active continued calculating from `TODAY() - Actual Start Date + 1` (returning 1 instead of 39), which produced a Pacing % of 2700% instead of the correct 69%. The bug was silent — no error, just wrong numbers.

This automation ensures Marc gets a nudge before he relies on incorrect variance numbers in decision-making.

### Implementation

Airtable Automation, triggered by Status change.

```
Trigger: Record matches conditions
  - Table: Campaigns
  - Conditions: Status changed to "Complete" AND Actual End Date is empty

Action: Send email
  - To: Marc's email
  - Subject: ⚠️ Campaign marked Complete but missing Actual End Date
  - Body:
    Campaign "{{Campaign Name}}" was marked Complete but Actual End Date is empty.

    This will cause Days Active and Pacing % to calculate incorrectly. Set 
    the Actual End Date as soon as possible to restore accurate variance 
    tracking.

    Direct link: [link to record]
```

### Why this is not a hard block

A campaign legitimately enters Complete state before all administrative fields are populated. Marc may close out a campaign Friday afternoon and not return to fill in the end date until Monday. Blocking the status change would create friction without value. The email alert balances "remind Marc" with "don't get in the way."

---

## 10. INTEGRATION 4: TASK TEMPLATE AUTO-POPULATION

### What it does

When a campaign's Status changes to Approved AND the stress test passes (Frozen Forecast Spend is populated), automatically create Tasks records based on the matching Task Template.

### Implementation

Chained Airtable automation that runs after the stress test. See v1.0 of this document for the full script — no changes in v1.1.

### Note on Hal as task owner

The task templates assign "Hal" as owner of execution tasks. Hal does not yet have marketing-execution capabilities (see Appendix A). Until Hal's capabilities are built:

- Tasks assigned to Hal effectively fall to Marc to execute manually
- Marc updates Task Status manually as work completes
- Marc updates Actual fields on the Campaign manually (until Stripe attribution and ad platform integrations are live)

When Hal's marketing capabilities ship, ownership transitions automatically — the templates don't need updating.

---

## 11. INTEGRATION 5: STRIPE SUBSCRIBER ATTRIBUTION

### What it does

Captures the campaign source for each new subscriber via UTM parameters, then rolls up subscriber counts by campaign for Actual Paid Subs — but only counting subscribers who are still active 30 days after their first payment.

### UTM capture (in the Endless Tales web app)

Modify the signup flow to read UTM parameters from URL and store on the user record.

```javascript
// On landing page or signup page load
const urlParams = new URLSearchParams(window.location.search);
const utm = {
  source: urlParams.get('utm_source'),
  medium: urlParams.get('utm_medium'),
  campaign: urlParams.get('utm_campaign'),
  captured_at: Date.now()
};

if (utm.source || utm.medium || utm.campaign) {
  localStorage.setItem('et_utm', JSON.stringify(utm));
}

// At account creation
const stored = JSON.parse(localStorage.getItem('et_utm') || '{}');
await supabase.from('users').update({
  utm_source: stored.source,
  utm_medium: stored.medium,
  utm_campaign: stored.campaign,
  utm_captured_at: stored.captured_at ? new Date(stored.captured_at).toISOString() : null
}).eq('id', userId);
```

### Schema change

```sql
ALTER TABLE users ADD COLUMN utm_source text;
ALTER TABLE users ADD COLUMN utm_medium text;
ALTER TABLE users ADD COLUMN utm_campaign text;
ALTER TABLE users ADD COLUMN utm_captured_at timestamp;
ALTER TABLE users ADD COLUMN first_paid_date timestamp;
ALTER TABLE users ADD COLUMN cancelled_at timestamp;
```

### Daily attribution rollup with 30-day net lookback

```javascript
// /api/cron/attribute-subscribers.ts — runs daily
// Counts paid subs from 30 days ago who are STILL active today

async function handler(req, res) {
  // Find users whose first paid date was 30 days ago
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const thirtyOneDaysAgo = new Date(Date.now() - 31 * 86400000);
  
  const { data: cohort } = await supabase
    .from('users')
    .select('id, utm_campaign, plan, first_paid_date, cancelled_at')
    .gte('first_paid_date', thirtyOneDaysAgo.toISOString())
    .lt('first_paid_date', thirtyDaysAgo.toISOString())
    .not('plan', 'is', null);
  
  // Filter to only those still active (no cancellation)
  const stillActive = cohort.filter(u => 
    !u.cancelled_at || new Date(u.cancelled_at) > new Date()
  );
  
  // Group by utm_campaign
  const campaignCounts = {};
  const annualCounts = {};
  for (const sub of stillActive) {
    if (!sub.utm_campaign) continue;
    campaignCounts[sub.utm_campaign] = (campaignCounts[sub.utm_campaign] || 0) + 1;
    if (sub.plan === 'annual') {
      annualCounts[sub.utm_campaign] = (annualCounts[sub.utm_campaign] || 0) + 1;
    }
  }
  
  // Update Airtable
  for (const [campaignName, count] of Object.entries(campaignCounts)) {
    const records = await airtable.findCampaignsByName(campaignName);
    if (records.length === 0) {
      console.warn(`No Airtable campaign matches utm_campaign: ${campaignName}`);
      continue;
    }
    if (records.length > 1) {
      console.warn(`Multiple Airtable campaigns match utm_campaign: ${campaignName}`);
    }
    const record = records[0];
    const currentSubs = record.fields['Actual Paid Subs'] || 0;
    const currentAnnual = record.fields['Actual Annual Subs'] || 0;
    await airtable.updateCampaign(record.id, {
      'Actual Paid Subs': currentSubs + count,
      'Actual Annual Subs': currentAnnual + (annualCounts[campaignName] || 0),
      'Last Actuals Update': new Date().toISOString().split('T')[0]
    });
  }
  
  res.status(200).json({ updated: Object.keys(campaignCounts).length });
}
```

### Other actuals (impressions, clicks, free story plays, trial signups)

These come from different sources:
- **Impressions and clicks:** ad platform APIs (Meta, TikTok, Reddit) — daily pull
- **Landing page visits:** Vercel Analytics or your analytics tool, tagged with UTM
- **Free story plays:** Endless Tales database, joined to users with UTM, played by users from a specific campaign
- **Trial signups:** Stripe customers with subscription status `trialing`, joined to users with UTM

These need separate daily pulls. Defer to Priority 6+ unless Marc requests earlier.

### UTM convention (Marc maintains)

```
utm_campaign = exact Campaign Name from Airtable (case-sensitive match)
utm_source   = channel in lowercase (meta, tiktok, reddit, email, etc.)
utm_medium   = ad format (cpc, social, email, organic, etc.)
```

If the rollup repeatedly fails to match (logged warnings), Marc and Codex add a UTM Mapping table to translate.

---

## 12. INTEGRATION 6: STRIPE MRR ROLLUP

### What it does

Pulls current MRR from Stripe daily. Handles monthly and annual subscriptions correctly.

```javascript
// /api/cron/stripe-mrr.ts

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function handler(req, res) {
  let mrr = 0;
  let activeSubs = 0;
  let activeAnnualSubs = 0;
  let starting_after = null;
  
  do {
    const subs = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      starting_after
    });
    
    for (const sub of subs.data) {
      const item = sub.items.data[0];
      const interval = item.price.recurring.interval;
      const amount = item.price.unit_amount / 100;
      
      if (interval === 'month') {
        mrr += amount;
      } else if (interval === 'year') {
        mrr += amount / 12;
        activeAnnualSubs++;
      }
      activeSubs++;
    }
    
    starting_after = subs.has_more ? subs.data[subs.data.length - 1].id : null;
  } while (starting_after);
  
  const today = new Date().toISOString().split('T')[0];
  await airtable.updateOrCreateSnapshot(today, {
    'Current MRR': mrr,
    'Active Subscribers': activeSubs,
    'Active Annual Subs': activeAnnualSubs
  });
  
  res.status(200).json({ mrr, activeSubs, activeAnnualSubs });
}
```

### Run order

Sequence (staggered cron times):
1. 6:00 AM ET: Mercury pull
2. 6:05 AM ET: Stripe MRR rollup
3. 6:10 AM ET: Snapshot calculation (90-day floor, etc.)
4. 6:15 AM ET: Subscriber attribution (30-day lookback)
5. 6:30 AM ET: Hal's morning briefing — runs daily recommendations
6. 7:00 AM ET: Daily alerts email

---

## 13. INTEGRATION 7: VARIANCE ANALYSIS VIA CLAUDE API

### What it does

Scheduled job that finds Complete campaigns where Variance Analysis is empty AND completion was at least 7 days ago. For each, sends data to Claude API and writes the result back.

### The prompt

Full prompt is in the design conversation. Implementation note: store as a constant string with `{{placeholders}}` substituted at runtime.

### Implementation

See v1.0 of this document for the full script. Update the prompt to include the expanded funnel (Free Story Plays, Trial Signups, Annual Subs) when filling the data block.

---

## 14. INTEGRATION 8: DAILY RECOMMENDATIONS VIA CLAUDE API

### What it does

Runs every morning at 6:30 AM ET as part of Hal's briefing. Sends current state to Claude API with the recommendation prompt. Creates resulting campaigns as Recommended-status records in Airtable.

### Anti-anchoring rule

Daily recommendations introduce a real risk: the engine proposes the same handful of ideas repeatedly with minor variations. To mitigate:

The recommendation prompt MUST include a section like:

```
RECENTLY REJECTED RECOMMENDATIONS (do not repropose substantially similar):
[List campaigns from Campaigns table where Status = Rejected AND Rejection Reason is non-empty AND date within last 14 days. Include: Campaign Name, Channel, Hypothesis, Rejection Reason]

If you cannot generate {{daily_recommendations_count}} meaningfully different 
campaigns from what's been proposed and rejected recently, propose fewer. 
Returning 0-1 recommendation with the note "no fresh ideas warranted today" 
is acceptable and preferred over restating rejected ideas.
```

### The "no action today" output

The recommendation prompt should explicitly allow returning 0 or 1 recommendation. Some mornings the right answer is "current campaigns are running fine, no new recommendations." This must be a normal outcome, not a system failure.

```
If existing active campaigns are performing well, the cash floor is healthy, 
and no new patterns warrant testing — return 0 recommendations with a brief 
explanation. This is preferred over generating filler proposals.
```

### Format of the morning briefing

Hal delivers the morning briefing to Marc each day. The recommendations section follows this format:

```
## Today's Campaign Recommendations

### Top Recommendation (defended at length)
[Full campaign proposal with all 10 sections from the recommendation prompt]

### Additional Ideas (sketched)
[2-4 additional proposals in compact form: name, channel, hypothesis, 
forecast spend, forecast CAC, one-line rationale]

### Portfolio Note
[2-3 sentences on why these together — or why fewer than expected — make 
sense given current state]
```

This way Marc spends real time on one campaign per morning. The others are scannable. If a sketched idea catches his attention, he can ask Hal to expand it.

### Implementation

```javascript
// /api/cron/daily-recommendations.ts

async function generateDailyRecommendations() {
  // Pull current state
  const cash = await airtable.getLatestSnapshot();
  const expenses = await airtable.getActiveExpenses();
  const patterns = await airtable.getActivePatterns();
  const recentCampaigns = await airtable.getRecentCompletedCampaigns(5);
  const activeCampaigns = await airtable.getActiveAndApprovedCampaigns();
  const recentRejections = await airtable.getRejectedCampaigns(14);
  const subStats = await stripe.getSubscriberStats();
  
  // Compute stress floor
  const monthlyBurn = sumMonthlyEquivalent(expenses);
  const stressFloor = Math.max(5000, 90 * monthlyBurn / 30);
  
  // Fill prompt
  const prompt = RECOMMENDATION_PROMPT_TEMPLATE
    .replace('{{current_cash}}', cash['Mercury Balance'])
    .replace('{{monthly_burn}}', monthlyBurn)
    .replace('{{stress_floor}}', stressFloor)
    .replace('{{available_budget}}', cash['Mercury Balance'] - stressFloor)
    .replace('{{subscriber_count}}', subStats.activeSubs)
    .replace('{{daily_recommendations_count}}', 4)
    .replace('{{recent_rejections}}', formatRejections(recentRejections))
    // ... etc
    ;
  
  // Call Claude
  const message = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  });
  
  const response = message.content[0].text;
  
  // Extract JSON block
  const jsonMatch = response.match(/```json\n([\s\S]+?)\n```/);
  if (!jsonMatch) {
    throw new Error('No JSON block found in response');
  }
  const data = JSON.parse(jsonMatch[1]);
  
  // Create records (could be 0-N)
  const created = [];
  for (const rec of data.recommendations) {
    const record = await airtable.createCampaign({
      'Campaign Name': rec.campaign_name,
      'Status': 'Recommended',
      'Hypothesis': rec.hypothesis,
      'Channel': rec.channel,
      'Sub-channel': rec.sub_channel,
      'Target Audience': rec.target_audience,
      'Research Notes': rec.creative_approach,
      'Forecast Spend': rec.forecast_spend,
      'Forecast Start Date': rec.forecast_start_date,
      'Forecast End Date': rec.forecast_end_date,
      'Forecast Impressions': rec.forecast_impressions,
      'Forecast Clicks': rec.forecast_clicks,
      'Forecast Landing Page Visits': rec.forecast_landing_visits,
      'Forecast Free Story Plays': rec.forecast_free_plays,
      'Forecast Trial Signups': rec.forecast_trial_signups,
      'Forecast Paid Subs': rec.forecast_paid_subs,
      'Forecast Annual Mix %': rec.forecast_annual_mix,
      'Forecast LTV': rec.forecast_ltv,
      'Recommended By': 'Claude'
    });
    created.push(record);
  }
  
  // Send to Hal for inclusion in morning briefing
  await sendToHal({
    type: 'campaign_recommendations',
    portfolio_rationale: data.portfolio_rationale,
    recommendations_created: created.length,
    response_text: response
  });
  
  return { created, rationale: data.portfolio_rationale };
}
```

---

## 15. INTEGRATION 9: ALERTS

Daily check at 7 AM ET (after the recommendations job). Conditions:

1. **Stale actuals:** Active campaigns with `Last Actuals Update` more than 3 days old
2. **Cash floor breach:** Latest snapshot has `Below Stress Threshold` = true
3. **Pending variance analyses:** Complete campaigns with empty Variance Analysis and completion >7 days ago
4. **Under-pacing campaign:** Active campaign where days remaining <25% of duration but Actual Spend <50% of Frozen Forecast
5. **Over-pacing campaign:** Active campaign where Pacing % > 1.5
6. **Anchoring detected:** Daily recommendations engine returned the same campaign name 3+ times in last 14 days (indicates broken anti-anchoring)

Email to Marc daily at 7 AM ET. Empty alert list = no email (don't train Marc to ignore).

---

## 16. SECURITY AND CREDENTIALS

### Credentials

- `MERCURY_API_KEY` — Mercury Bank API access (read-only if available)
- `MERCURY_ACCOUNT_ID` — operating account
- `AIRTABLE_API_KEY` — Airtable token, scoped to campaigns base only
- `AIRTABLE_BASE_ID` — campaigns base ID
- `STRIPE_SECRET_KEY` — Stripe access (already exists)
- `ANTHROPIC_API_KEY` — Claude API access
- `CRON_SECRET` — authenticate cron requests

Store in Vercel environment variables. Never commit to git.

---

## 17. DEPLOYMENT AND TESTING

For each integration:
1. Build and test locally with development Airtable base
2. Deploy to Vercel preview environment
3. Test with development data
4. Verify logs and behavior
5. Deploy to production
6. Run once manually
7. Enable scheduled execution

For the stress test specifically, write test cases for:
- Campaign that just barely passes the floor
- Campaign that just barely fails
- Multiple competing campaigns
- Campaign with revenue lag exceeding campaign duration
- Stress floor at $5,000 minimum (low burn case)
- Stress floor at 90 × burn (higher burn case)

---

## 18. WHAT NOT TO BUILD (YET)

- Multi-touch attribution (single-touch sufficient at this stage)
- Detailed cohort retention tracking (wait for catalog and subscriber base depth)
- Custom dashboards beyond Airtable views
- Machine learning on campaign optimization (no data to train on)
- Real-time campaign updates from ad platforms (daily sufficient)
- Mobile interface (use Airtable mobile)
- Other team member access (Marc + agents only)

---

## 19. SUCCESS CRITERIA

Implementation is successful when:

1. Marc opens Airtable any morning and sees an accurate Cash Snapshot for that day without manual work
2. Marc receives Hal's morning briefing with 0-4 fresh campaign recommendations and supporting rationale
3. Marc clicks "Approve" on a Recommended campaign and gets clear approval (frozen forecasts, tasks created) or clear rejection with specific reason
4. The 90-Day Forecast Floor is accurate to within 5% of reality
5. Within 7-10 days of campaign completion, Marc has variance analysis available without requesting it

---

## APPENDIX A — HAL MARKETING CAPABILITIES BUILDOUT

This appendix is for OpenClaw/Hal development. It defines the marketing-execution capabilities Hal needs in order to fulfill the task ownership assigned in the task templates. Until these capabilities ship, Marc executes manually.

### Capability priorities

In order of impact to the campaign management system:

#### Capability 1: Airtable read/write
Hal can read campaign and task records from Airtable, update task status as work completes, and update actual fields (impressions, clicks, etc.) on campaign records.

This is the foundational capability. Without it, every other capability still requires Marc to manually update tracking. With it, Hal becomes a real participant in the system.

#### Capability 2: Daily ad platform actuals pull
Hal can authenticate to Meta Ads Manager, TikTok Ads Manager, Reddit Ads, and pull daily spend and engagement metrics for active campaigns. Writes to Airtable.

#### Capability 3: Email send
Hal can send transactional or campaign emails via the Endless Tales email service (Resend, SendGrid, etc. — whatever you use). Includes UTM parameters in all links.

#### Capability 4: Social posting
Hal can post to TikTok, Instagram Reels, and Twitter/X with prepared video and copy. Schedules posts. Records post URLs to Airtable.

#### Capability 5: Ad platform campaign setup
Hal can create campaigns, ad sets, and ads in Meta Ads Manager (highest priority), TikTok Ads Manager, and Reddit Ads. Includes audience targeting, budget, schedule, and creative upload.

This is the most complex capability. It requires deep integration with each platform's API and the ability to handle the wide variety of ad formats and targeting options.

#### Capability 6: Landing page generation
Hal can generate campaign-specific landing pages on the Endless Tales site, with the right featured stories, the right messaging for the target audience, and the right UTM tracking. Pages are routed via Vercel.

#### Capability 7: Outreach (influencer, partnership)
Hal can send outreach emails to influencers and partners, track responses, and schedule follow-ups. This is mostly natural-language work where Hal already has competence; the gap is integration with email and CRM.

### Capabilities ordering rationale

Capability 1 (Airtable) ships first because it makes every other capability useful as it ships. Without Airtable integration, even a fully-capable Hal can't update the system.

Capability 2 (actuals pull) is second because it removes Marc's biggest manual burden — daily updates of Actual Spend, Impressions, Clicks across multiple ad platforms.

Capabilities 3-5 (execution) are next, in order of complexity. Email is simplest, social posting medium, ad platform setup most complex.

Capabilities 6-7 are later because they're either lower-volume (landing pages aren't generated for every campaign) or already partially covered by Hal's natural-language abilities (outreach).

### What Hal does NOT need to do

- Approve campaigns. Marc retains approval authority.
- Make spending decisions outside the recommendation engine.
- Modify the Airtable schema.
- Override the cash floor stress test.
- Generate variance analyses (handled by Claude API integration).

---

*Endless Tales · Campaign Management System · v1.2 · May 7, 2026*
*This document supersedes v1.1, v1.0, and any prior verbal or written specifications.*
