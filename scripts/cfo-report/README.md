# CFO Morning Report

Automated daily financial briefing delivered to Marc at **7:00 AM ET** via Telegram, with a live hosted dashboard at `/admin/cfo-report`.

## Files

```
scripts/cfo-report/
├── mercury.ts          # Mercury Banking: balance, cards, last-24h transactions
├── stripe.ts           # Stripe: MRR, paying subs, trials, 24h revenue
├── elevenlabs.ts       # ElevenLabs: character credits used/remaining/surplus
├── meta.ts             # Meta: ad spend month-to-date
├── hal-status.ts       # Supabase: active production pipeline
├── compile.ts          # Aggregates all sources, runs calculations, builds report
├── deliver.ts          # Sends Telegram + stores in Supabase
├── cron-config.json    # Cron job definitions (NOT yet registered)
└── README.md           # This file

app/admin/cfo-report/
└── page.tsx            # Dashboard UI — 8-section layout

app/api/admin/cfo-report/
└── route.ts            # GET (read report) + POST (trigger fresh compile)

supabase/migrations/
└── 20260917_cfo_reports.sql  # PROPOSED — run only with Marc's explicit OK
```

## Data Sources Status

| Source | Status | Credentials |
|--------|--------|-------------|
| Mercury (bank + cards) | ✅ Connected | `MERCURY_API_TOKEN`, `MERCURY_ACCOUNT_ID` |
| ElevenLabs credits | ✅ Connected | `ELEVENLABS_API_KEY` |
| Hal pipeline (Supabase) | ✅ Connected | `SUPABASE_SERVICE_ROLE_KEY` |
| Stripe MRR | ⛔ BLOCKED | `STRIPE_SECRET_KEY` not set |
| Meta ad spend | ⛔ BLOCKED | `META_ACCESS_TOKEN` empty, `META_AD_ACCOUNT_ID` empty |

## Localhost Test

```bash
cd /Users/williampostlewaite/Projects/drivetimetales
npx ts-node scripts/cfo-report/compile.ts --dry-run
```

Then start dev server and visit `localhost:3000/admin/cfo-report`.

## Registering Cron Jobs (after PR merge)

**Do not run until Marc approves.**

Use OpenClaw's cron management to register each job from `cron-config.json`:

```bash
# Example for each job — run once after PR merges and Marc gives the word
# The actual registration depends on OpenClaw's configured cron interface
```

Or, if using Vercel Cron:
1. Add to `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/cfo-deliver", "schedule": "0 11 * * *" }
  ]
}
```
(Note: Vercel cron times are UTC — 11:00 UTC = 7:00 AM ET)

2. Create `/api/cron/cfo-deliver/route.ts` that calls `deliverCfoReport()`
3. Protect with `CRON_SECRET` bearer token (already used in other cron routes)

## Supabase Migration

**Run only with Marc's explicit OK:**

```bash
supabase db push
# or manually run: supabase/migrations/20260917_cfo_reports.sql
```

## Enabling Telegram Rich Tables

The report currently uses plain-text ASCII formatting. To enable rich table formatting:

```bash
# Marc: run this in OpenClaw config
gateway config.patch channels.telegram.richMessages true
```

## Unblocking Stripe

Add to `.env.local` and Vercel environment variables:
```
STRIPE_SECRET_KEY=sk_live_...
```

The `stripe.ts` module will auto-activate on next compile.

## Unblocking Meta

Add to `.env.local` and Vercel:
```
META_ACCESS_TOKEN=EAAxxxxx...
META_AD_ACCOUNT_ID=act_xxxxxxxxx
```

The `meta.ts` module will auto-activate. Known spend cards: GVL-Meta (7468), GVL-TikTok (3966).

## Calculations Reference

All calculations performed in `compile.ts`:

```
totalAI = anthropicMtd + openAiMtd + elMtd
totalSpend = totalAI + infraMtd
netBurn = totalSpend - revenueMtd
dailyBurn = totalSpend / daysElapsedInMonth
runway = currentCash / dailyBurn (days)
breakEvenSubs = ceil(totalSpend / netRevPerSub)
  where netRevPerSub = 14.99 * 0.70 - 0.30 ≈ $10.19
elSurplus = elRemaining - 132000 (pipeline-needed)
```
