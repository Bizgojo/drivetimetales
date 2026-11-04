# SENDING-PROOF — Trial Emails Nov09 (branch-only, no merge without Marc)

Branch: `feat/atlas-trial-emails-nov09`
Script: `retention-nov09/send-trial-emails.mjs` (test-address-only, dry-run default)
Date: 2026-11-04

## Triggers (plain)
- hour1 (`hour1-welcome.html`, Trial + ~1h): Stripe webhook `checkout.session.completed`
  → Vercel `app/api/webhook/route.ts` (same path as existing trial-start email).
- day1 (`day1-install.html`, Trial + day 1): Vercel Cron daily
  → `app/api/cron/trial-emails/route.ts`, 24–48h created window, stamped once.
- day10 (`day10-billing-reminder.html`, Trial + day 10): Vercel Cron daily
  → `app/api/cron/trial-emails/route.ts` (new block, same pattern), trial_day=10.
  Live-before Nov 18. NOT the Stripe `trial_will_end` webhook (that path unchanged).

## Skips (cancel / convert)
- `cancelled_at` set → skip all three.
- Off-trial / converted to paid → skip day10.
- `email_opt_out` true → skip (REACH-REMINDERS-001 suppression).
- `is_test_account` in prod → skip.
- Already stamped (`*_sent_at`) → skip; one send ever.

## Test-address-only enforcement
- Default `--dry-run`: 0 network calls, $0, 0 prod writes.
- `--send-test` requires `--to=` ending `@example.com` or equal to `$TEST_EMAIL`;
  anything else exits 1 (verified: `not-a-real-user@gmail.com` → REFUSED, exit 1).
- Real delivery only with `RESEND_API_KEY` set; without it the script logs
  "would send, sent 0" (verified with `qa@example.com`, exit 0, $0).

## Proof log (2026-11-04, this branch)
```
[send-trial-emails] mode=dry-run
- hour1: hour1-welcome.html | 2941 bytes | unsub=ok | cta=ok | trigger=stripe-webhook
- day1:  day1-install.html  | 3741 bytes | unsub=ok | cta=ok | trigger=vercel-cron daily 24–48h
- day10: day10-billing-reminder.html | 3119 bytes | unsub=ok | cta=ok | trigger=vercel-cron daily day10
[send-trial-emails] DRY-RUN complete: 3/3 rendered, 0 network calls, $0 spend, 0 production writes.
```

## Wiring status
Templates + dry-run sender ship on THIS branch. Production wiring
(webhook block for hour1, cron block for day1/day10 in `drivetimetales/`)
is NOT enabled by this branch — reviewer verifies copy/safety; Marc alone
authorizes merge/deploy/enable. $0 spent.
