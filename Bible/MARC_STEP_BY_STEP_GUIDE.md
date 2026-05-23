# MARC'S STEP-BY-STEP GUIDE
## Endless Tales Campaign Management System

**Version:** 1.0
**Date:** May 5, 2026

This document has two parts:
- **PART A: SETUP** — what to do once, in order, to get the system running
- **PART B: DAILY USE** — what to do every day once it's running

Read Part A all the way through before starting. Don't skip steps. Don't do them out of order.

---

# PART A: SETUP (one-time, ~4-6 hours total spread over a few days)

## OVERVIEW

You will:
1. Connect Google Drive to Claude (2 min)
2. Save the design documents to Drive (5 min)
3. Build the Airtable schema (90 min - 2 hr)
4. Populate Recurring Expenses with real data (15 min)
5. Make Mercury and Stripe API keys ready (15 min)
6. Hand the spec to Codex for build (Codex does the work; you supervise)
7. Verify the first integration works (15 min)
8. Repeat for each integration

Steps 1-5 are yours. Step 6 is mostly Codex. Steps 7-8 are you checking Codex's work.

---

## STEP 1: Connect Google Drive to Claude

**Time:** 2 minutes

1. Open claude.ai in your browser (or the Claude desktop app)
2. Click your profile icon (bottom left in the desktop app, top right on web)
3. Click **Settings**
4. Find **Connectors** in the left sidebar
5. Find **Google Drive** in the list
6. Click **Connect**
7. Sign in with the Google account you want me to write files to
8. Approve the permissions requested

You should see Google Drive listed as connected.

**Verify it worked:** Come back to this chat and tell me "Drive is connected." I'll confirm I can see it.

---

## STEP 2: Save the design documents to Drive

**Time:** 5 minutes

Once Drive is connected, I'll save these three documents to a folder you choose:

- `CODEX_CAMPAIGN_SYSTEM_SPEC_v1.1.md` (the spec for Codex)
- `MARC_AIRTABLE_SCHEMA_BUILD_CHECKLIST.md` (your build guide)
- `STEP_BY_STEP_GUIDE.md` (this document)

**What you do:**

1. In Drive, decide where to put these. I suggest creating a new folder called **Endless Tales / Campaign System / Bible** — alongside your existing Bible documents.
2. Tell me in this chat: "Save the documents to [folder path]"
3. I'll save them and confirm.

**Why this folder structure:** Your existing Bible documents live in a similar structure. Keeping campaign-system docs adjacent makes it easy to give Codex everything it needs in one go.

---

## STEP 3: Build the Airtable schema

**Time:** 90 minutes to 2 hours

This is the longest step. Don't try to do it all in one sitting if you'd rather break it up — but do all of one table in one sitting (don't leave a half-built table).

### 3a: Sign up for Airtable (if you don't have it)

1. Go to airtable.com
2. Sign up with your Endless Tales email
3. Choose the **free** plan to start. You can upgrade later if you need Gantt views (Pro plan, $20/mo) or extension scripts (Plus or Pro).

**Important:** Some features in the spec require Airtable Pro. Specifically: Gantt views and the extension scripts that Codex will write. The free plan works for everything else. Recommendation: start free, upgrade to Pro ($20/mo) when Codex is ready to deploy automations.

### 3b: Create the base

1. In Airtable, click **+ Create a base**
2. Choose **Start from scratch**
3. Name it **Endless Tales — Campaigns**

### 3c: Build each table in order

Open `MARC_AIRTABLE_SCHEMA_BUILD_CHECKLIST.md` (the document I just saved to Drive). Work through it top to bottom.

The order is: Campaigns → Tasks → Recurring Expenses → Cash Snapshots → Patterns → Task Templates.

Build one table completely before moving to the next. Test each table's formulas before moving on (the checklist tells you how).

### 3d: Set up the views

The checklist has a "Views to Set Up" section near the end. Build those views once all tables are populated.

**When you finish:** Tell me in this chat. I'll have you do a quick verification before we move on.

---

## STEP 4: Populate Recurring Expenses with real data

**Time:** 15 minutes (already partially done if you followed the checklist)

The schema checklist had you populate Recurring Expenses with the seven subscriptions from your screenshot plus the variable API costs. Confirm:

1. Open the **Recurring Expenses** table in Airtable
2. Verify all your monthly costs are listed
3. Add any you're missing (anything you pay for monthly that I don't know about)
4. Note the sum of the **Monthly Equivalent** column. This is your **monthly burn**.
5. Tell me the monthly burn number when you're done.

**Why this matters:** The cash floor stress test uses this number. Get it as accurate as you can. Round up rather than down.

---

## STEP 5: Get your API keys ready (don't share them with me)

**Time:** 15 minutes

Codex will need API keys to build the integrations. Get them ready now so Codex doesn't have to wait.

### 5a: Mercury API key

1. Log in to Mercury (mercury.com)
2. Go to **Settings** → **API**
3. Click **Generate API token**
4. Give it a descriptive name like "Endless Tales Campaign System"
5. **Choose read-only access** if Mercury offers it (the system never moves money)
6. Copy the key and save it somewhere secure (like 1Password or your Mac's keychain)
7. Also note your **Account ID** for the Endless Tales operating account

**DO NOT paste the API key into this chat.** Store it locally only. Codex will help you put it into Vercel environment variables when it's time.

### 5b: Stripe key

You probably already have this since Endless Tales is using Stripe. Confirm:

1. Log in to Stripe (dashboard.stripe.com)
2. Go to **Developers** → **API keys**
3. Note that you have a **Secret key** (starts with `sk_live_` for production)
4. Same as Mercury: do NOT paste it here. Codex will use it via env vars.

### 5c: Airtable API key

1. In Airtable, click your profile icon → **Builder hub**
2. Or go to airtable.com/create/tokens
3. Click **Create new token**
4. Name it "Endless Tales Campaign System"
5. Scopes needed: `data.records:read`, `data.records:write`, `schema.bases:read`
6. Access: select the **Endless Tales — Campaigns** base only
7. Copy the token and save securely (do NOT share with me)

### 5d: Anthropic API key

1. Go to console.anthropic.com
2. Sign in (use the same email as your Claude.ai account if possible)
3. Go to **API Keys**
4. Click **Create Key**
5. Name it "Endless Tales Hal/System"
6. Copy the key and save securely

**You'll need to add credit to your Anthropic account** if you haven't — go to **Plans & billing** and add at least $20 to start. The variance analysis and recommendation calls will use a few cents each.

### Confirmation step

Tell me when you have all four keys safely stored (NOT in this chat). I'll know you're ready for Step 6.

---

## STEP 6: Hand the spec to Codex

**Time:** Codex does the work; you supervise. Probably 1-2 weeks elapsed time, with you spending maybe 30 min/day reviewing.

### 6a: Open Codex (or Claude Code, whichever you use)

Open your terminal or whichever interface you use for Codex.

### 6b: Give Codex the context

Paste this prompt (or something like it):

```
I'm building a campaign management system for Endless Tales. The full 
specification is in CODEX_CAMPAIGN_SYSTEM_SPEC_v1.1.md (in my Drive at 
[path], or attached). 

Read the spec completely before starting any work.

Start with Priority 1 (Mercury daily balance pull). Stop after Priority 4 
(Task template auto-population) and report back to me. Do not proceed to 
Priorities 5+ without my explicit approval.

The Airtable schema is already built. Recurring Expenses is populated. 
I have API keys for Mercury, Stripe, Airtable, and Anthropic ready to 
provide securely via Vercel environment variables — do not ask me to 
paste them in chat.

Before writing any code, confirm:
1. You've read the entire spec
2. You understand the priority ordering
3. You have any clarifying questions
```

### 6c: What Codex will do

Codex will work through Priorities 1-4 in order. For each one, Codex should:

1. Tell you what it's about to build
2. Confirm any decisions you need to make
3. Write the code
4. Show you the code before deploying
5. Help you set up environment variables in Vercel
6. Deploy
7. Test
8. Confirm it works
9. Move to the next priority

### 6d: Your job during this phase

Don't write code. Codex does that. Your job is to:

- Answer Codex's clarifying questions
- Approve deployments (you click the deploy buttons; Codex doesn't)
- Verify each integration works after Codex thinks it's done
- Stop Codex if something seems wrong

**Specifically:** Don't let Codex skip ahead. If Codex finishes Priority 1 and wants to dive into Priority 5, say no. Stay disciplined about the priority order.

---

## STEP 7: Verify Priority 1 works (Mercury daily pull)

**Time:** 15 minutes

After Codex says Priority 1 is done:

1. Open Airtable → Cash Snapshots table
2. Wait until the next morning (after 6 AM ET)
3. Check that a new Cash Snapshots row has been created for today
4. Confirm the Mercury Balance field has today's balance
5. Cross-reference with what you see in Mercury directly

**If correct:** Priority 1 works. Tell Codex to proceed to Priority 2.

**If not:** Tell Codex what's wrong. Don't proceed until it's fixed.

---

## STEP 8: Verify each subsequent priority

After Codex completes each priority, do a similar check:

**Priority 2 (Snapshot calculation):** Verify that today's Cash Snapshot now has Total Committed Campaign Spend, Total Recurring Monthly, and 90-Day Forecast Floor populated. Verify the floor calculation looks right (should be close to 90 × monthly burn / 30, but not below $5,000).

**Priority 3 (Cash floor stress test):** Create a test campaign in Airtable with Status = Recommended. Set Forecast Spend to a small amount (say $500). Change status to Approved. Within a few seconds, the Frozen Forecast fields should populate. Then create another test campaign with Forecast Spend = $50,000. Try to approve it. The system should revert it to Recommended with a rejection reason. Delete both test campaigns when done.

**Priority 4 (Task template auto-population):** Create a test campaign with Channel = Meta and approve it. Within a few seconds, 14 Tasks records should appear in the Tasks table linked to that campaign, with the right dates. Delete when done.

**After Priority 4 verifies:** Stop Codex. The foundation is in place. Use the system for 2-3 weeks (see Part B) before continuing to Priorities 5+.

---

## SETUP CHECKLIST SUMMARY

Track your progress:

- [ ] Step 1: Drive connected to Claude
- [ ] Step 2: Documents saved to Drive
- [ ] Step 3: Airtable schema built (all 6 tables)
- [ ] Step 4: Recurring Expenses populated; monthly burn calculated
- [ ] Step 5: API keys gathered (Mercury, Stripe, Airtable, Anthropic)
- [ ] Step 6: Spec handed to Codex
- [ ] Step 7: Priority 1 verified
- [ ] Step 8: Priorities 2, 3, 4 verified
- [ ] System ready for daily use

---

# PART B: DAILY USE (ongoing, ~15-30 min/day)

## OVERVIEW OF YOUR DAILY ROUTINE

Once the system is running, here's what your morning looks like:

1. Hal sends you the morning briefing (5 min to read)
2. You review new campaign recommendations (5-15 min)
3. You approve or reject each one (1-2 min each)
4. You update actuals on active campaigns (5-10 min until Hal does this automatically)
5. You check the cash dashboard (1 min)
6. You handle any tasks assigned to you (varies)

**Total daily time: 15-30 minutes.** More on launch days, less on quiet days.

---

## YOUR MORNING ROUTINE (Monday-Friday, ~20 min)

### Morning Step 1: Read Hal's briefing (5 min)

Hal will send you a daily briefing each morning around 6:30 AM ET. The briefing includes:

- Today's cash position (Mercury balance, 90-day floor, runway)
- Status of active campaigns (any concerns, any overspending)
- Campaigns nearing end date or needing attention
- New campaign recommendations (0 to 4 per day)
- Anything that needs your decision

Read it in whatever format Hal delivers (email, Slack, Telegram — depends on your Hal setup).

### Morning Step 2: Open Airtable (1 min)

Open your **Endless Tales — Campaigns** base. Go to the **Recommendation Queue** view in the Campaigns table.

This view shows everything Hal recommended overnight. There should be 0-4 new rows.

### Morning Step 3: Review each recommendation (3-5 min each)

For each recommendation:

1. Click the row to expand it
2. Read the Hypothesis — does this experiment make sense to test?
3. Read the Research Notes — does the reasoning hold up?
4. Look at Forecast Spend, Forecast CAC, Forecast LTV-to-CAC — are the numbers plausible?
5. Look at Forecast Start Date and End Date — does the timing work for you?

**Decide: approve, reject, or modify.**

#### To approve:
- Change Status from "Recommended" to "Approved"
- The cash floor stress test runs automatically
- If it passes: Frozen Forecast fields populate, tasks appear in Tasks table
- If it fails: status reverts to "Recommended" with a rejection reason

#### To reject:
- Type a brief reason in **Rejection Reason** (e.g., "Channel mismatch — we tried this in [campaign] and it didn't work")
- Change Status to "Rejected"
- Done. Hal will see this and avoid proposing similar ideas for 14 days.

#### To modify before approving:
- Edit the Forecast fields you want to change (Spend, dates, audience targeting)
- Then approve as above

**Don't be shy about rejecting.** Most days you should reject more than you approve. The system depends on you being a discerning filter.

### Morning Step 4: Check active campaigns (3-5 min)

Go to the **Active Campaigns** view in the Campaigns table.

For each active campaign:

1. Look at **Pacing %** — should be between 0.8 and 1.2
   - If above 1.5: campaign is overspending. Investigate.
   - If below 0.5: campaign is underspending. Why?
2. Look at **Variance Flag** — green is fine, yellow needs watching, red needs action
3. Look at **Last Actuals Update** — should be today or yesterday. If older, you need to update actuals.

### Morning Step 5: Update actuals (5-10 min, until Hal automates this)

Until Hal's marketing capabilities are built (Appendix A in the spec), you'll manually update actuals each morning.

For each Active campaign:

1. Open the ad platform (Meta Ads Manager, TikTok Ads Manager, Reddit Ads, etc.)
2. Get yesterday's spend, impressions, clicks
3. Update the Airtable record:
   - Actual Spend
   - Actual Impressions
   - Actual Clicks
   - Actual Landing Page Visits (from Vercel analytics or your analytics tool)
   - Actual Free Story Plays (from your Endless Tales database)
   - Actual Trial Signups (from Stripe — count of subscriptions in `trialing` status that originated from this campaign's UTM)

The first time you do this, it'll take 15+ minutes. After a week, you'll have it down to 5-10.

**Important:** Once Stripe attribution (Priority 5) is built, the trial signups and paid subs fields will populate automatically. You'll only need to manually update spend and impressions until ad platform integrations (Priority 6+) are built.

### Morning Step 6: Check the cash dashboard (1 min)

Go to the **Cash Dashboard** view in the Cash Snapshots table.

The top row is today's snapshot. Look at:

1. **Mercury Balance** — does this match what you see in Mercury?
2. **90-Day Forecast Floor** — is it above $5,000?
3. **Below Stress Threshold** — should say "✅ OK"

If the floor is below $5,000 (showing "🚨 BELOW FLOOR"), STOP. Do not approve any new campaigns until cash recovers or you adjust active campaigns.

---

## TASK MANAGEMENT (throughout the day)

### Check your assigned tasks

Go to the **My Tasks Today** view in the Tasks table. This shows everything assigned to "Marc" that's due today or earlier.

For each task:

1. Read the task name
2. Note which campaign it belongs to
3. Do the task
4. When done, change Status from "Not Started" or "In Progress" to "Complete"

If a task is blocked, change Status to "Blocked" and add a note in **Blocker Description**. Hal will see this in the next briefing.

### What about Hal's tasks?

Until Hal's marketing capabilities are built, tasks assigned to "Hal" effectively fall to you. Look at the **All Active Tasks** view filtered to Owner = Hal. These need your attention too.

This is a transition state. Once OpenClaw extends Hal (Appendix A in the spec), Hal will start handling these automatically.

---

## END-OF-CAMPAIGN ROUTINE (when a campaign reaches its End Date)

When a campaign hits its Forecast End Date:

### Step 1: Final actuals (within 1-2 days of end)

Make sure all Actual fields are fully updated. This is your last chance to capture data.

### Step 2: Move status to Complete

1. Open the campaign
2. Change Status from "Active" to "Complete"
3. Set Actual End Date to today

### Step 3: Wait 7 days

The variance analysis (when Codex builds Priority 7) runs 7 days after status change to Complete. This gives time for late-attributing subscribers to be counted.

During those 7 days, the system also runs the 30-day net-active check on subscribers from this campaign.

### Step 4: Read the variance analysis

When the analysis appears in the **Variance Analysis** field, read it carefully. It tells you:

1. The headline diagnosis
2. Where the funnel broke or worked
3. What this teaches us
4. What the next campaign should do

### Step 5: Decide what to do with the lessons

Look at the analysis recommendations. If the analysis suggests a clear pattern, consider creating a Pattern record:

1. Open the **Patterns** table
2. Create a new record
3. Name the pattern (e.g., "Reddit r/audiodrama converts 2x better than r/podcasts")
4. Set Confidence based on how many campaigns support it (Low if just this one)
5. Link the Evidence Campaigns
6. Set First Observed and Last Validated to today

Future recommendations will draw on this pattern.

### Step 6: Archive the campaign

1. Change Status from "Complete" to "Archived"
2. Set Archive Date to today
3. Fill in Lessons Learned (a brief paragraph in your own words — what you'll remember about this campaign)

The campaign now stays in the database for historical reference but no longer affects cash flow forecasts.

---

## WEEKLY ROUTINE (Sunday or Monday morning, ~30 min)

Once a week:

### Weekly Step 1: Review patterns (5 min)

Open the **Pattern Library** view. Are any patterns marked Low Confidence that have been validated by enough campaigns to promote to Medium or High? Update Confidence as appropriate.

Are any patterns active that have been contradicted by recent campaigns? Mark them Inactive (don't delete — keep the history).

### Weekly Step 2: Review rejected recommendations (5 min)

Open the Campaigns table, filter to Status = Rejected, sort by date descending. Look at the last week of rejections. Are you seeing the same idea proposed repeatedly? If so, the anti-anchoring rule may not be working — flag this to Codex.

### Weekly Step 3: Cash flow review (10 min)

Open the **Cash Dashboard** view. Look at the trend over the past 7 days:

- Is Mercury Balance trending up or down?
- Is 90-Day Forecast Floor improving or worsening?
- Any days where Below Stress Threshold flagged?

If trending down faster than expected, time to revisit campaign cadence or pause new approvals.

### Weekly Step 4: Plan next week (10 min)

Look at upcoming campaigns:

- What's launching this week?
- What tasks are due to you?
- Any campaigns ending and needing variance analysis attention?

This is also a good time to think about whether the system itself needs adjustment. Are the views useful? Are the formulas right? Anything you wish was different?

If yes, send a note to Codex (or me) about what to change.

---

## MONTHLY ROUTINE (first of the month, ~30 min)

### Monthly Step 1: Update Recurring Expenses (5 min)

Did any subscription costs change? Did you start or stop any? Update the Recurring Expenses table.

If your monthly burn changed significantly, the stress floor changes too. The system should pick this up automatically, but verify by checking the Cash Dashboard.

### Monthly Step 2: Review monthly performance (15 min)

Open the **Variance Watch** view. Look at all completed campaigns from the past month.

- How many came in green?
- How many yellow?
- How many red?
- Was there a pattern in the misses?

Write a brief monthly summary somewhere (a note in Drive, or in a "Monthly Reviews" table you add later). Capture: what worked, what didn't, what to do differently next month.

### Monthly Step 3: Update assumptions (10 min)

Once you have 60+ days of real data, the default assumptions in the spec should be updated:

- ASSUMED_MONTHLY_CHURN: replace 7% with your actual rate
- ASSUMED_RETENTION_MONTHS: replace 6 with your actual retention
- ANNUAL_RENEWAL_PROBABILITY: replace 0.55 with your actual rate (only relevant after annual subs have hit their renewal window)
- REVENUE_DISCOUNT: if your forecasts have been hitting target, you can lower from 0.5 to 0.6 or 0.7

These update in the Config table or env vars. Tell Codex when you want to change them.

---

## TROUBLESHOOTING COMMON SITUATIONS

**"Hal proposed the same idea three times this week."** Anti-anchoring isn't working. Send the spec back to Codex and reference the recommendation prompt's anti-anchoring rule.

**"A campaign got approved but no tasks appeared."** Task template auto-population (Priority 4) isn't running. Check Airtable automation logs. Check that the campaign's channel matches a template in Task Templates with Active = checked.

**"The cash floor seems wrong."** Verify Recurring Expenses is up to date. Verify Mercury Balance is being pulled correctly. Manually compute the expected floor and compare.

**"I want to approve a campaign that the system blocks."** Either reduce the campaign's Forecast Spend, delay its Start Date, or wait for cash to accumulate. Don't override the floor — that defeats the safety mechanism.

**"I'm spending too much time on actuals updates."** This goes away when Hal's capabilities are built (Appendix A). In the meantime, batch the updates — do all campaigns at once at 8 AM, not throughout the day.

**"The system feels overwhelming."** That's normal at first. After 2-3 weeks of use, the routine becomes automatic. Stick with it. If after 3 weeks it still feels overwhelming, something in the design is wrong — tell me what's not working.

---

## WHAT TO ASK ME WHEN YOU NEED HELP

I'm here for:

- **Strategy questions:** "Should I try this campaign?" or "What does this variance mean?"
- **Variance analysis:** I write the analysis when campaigns complete (until that's automated)
- **Recommendation generation:** I draft new campaign proposals (until that's automated via Hal)
- **Pattern interpretation:** "I see this pattern emerging. Is it real?"
- **System adjustments:** "I want to change how X works."

I'm not here for:

- Writing code (that's Codex/Claude Code)
- Story production (that's Hal — your existing Hal pipeline)
- Approving campaigns (that's you)

When you need me, just start a chat in this project and reference what you need. I have access to the Bible documents and our conversation history, so I can pick up where we left off.

---

## QUICK REFERENCE CARD

**Daily (15-30 min):**
1. Read Hal's briefing
2. Review and approve/reject recommendations
3. Update actuals on active campaigns
4. Check cash dashboard
5. Handle assigned tasks

**Weekly (30 min):**
1. Review patterns
2. Review rejections
3. Cash flow trend
4. Plan next week

**Monthly (30 min):**
1. Update Recurring Expenses
2. Monthly performance review
3. Update assumptions

**Per campaign end:**
1. Final actuals
2. Move to Complete
3. Wait 7 days
4. Read variance analysis
5. Extract patterns
6. Archive

---

*Endless Tales · Step-by-Step Guide · v1.0 · May 5, 2026*
*Companion to CODEX_CAMPAIGN_SYSTEM_SPEC_v1.1.md and MARC_AIRTABLE_SCHEMA_BUILD_CHECKLIST.md*
