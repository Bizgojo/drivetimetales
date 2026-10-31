# Amendment 1 — Live Ad Preview & Testing: Build Spec

Status: APPROVED by Marc · Oct 29, 2026
Builder: Atlas (Orion subagent) · Verifier: separate fresh subagent · Creative match: Susan · Final approval: Marc

## What exists today (repo Bizgojo/drivetimetales, commit 0f85945)
- `/admin/marketing/dashboard` — tile page of links. No approval card yet.
- `/admin/marketing/campaign-plan` and `/campaign-intelligence` — read Airtable campaigns (views: Recommendation Queue, Approval Pipeline, Active Campaigns, Variance Watch) via `/api/admin/marketing/campaigns` (GET only).
- `/api/marketing/meta-insights` — read-only Meta insights (ads_read token).
- `users.is_test_account` already exists and is already excluded from funnel/signup/trial-paid analytics.
- **There is no Campaign Approval Card in the code.** This spec creates it.

## 1. New pages
1. `/admin/marketing/approvals` — list of campaigns in the Airtable "Approval Pipeline" view.
2. `/admin/marketing/approvals/[campaignId]` — the Campaign Approval Card.
3. Add a "Campaign Approvals" tile to `/admin/marketing/dashboard`.
4. Admin UI rule: light background, black text. Minimum 18px body text, 22px+ buttons (Marc has low vision).

## 2. Card layout (top to bottom)
1. Campaign name, version number, version hash (short).
2. Ad previews — one per placement, from Meta (see section 3).
3. Headline, primary text, CTA label — pulled from Meta, not retyped.
4. Destination URL — the exact URL from the Meta creative, with UTMs.
5. Financial forecast (spend ceiling, forecast CAC, trials, paid subs) from Airtable.
6. Test status panel (section 5).
7. Marc's buttons: **TEST THIS AD** · **APPROVE & AUTHORIZE** · **REQUEST CHANGES** · **REJECT**.
8. After approval: **LAUNCH** and **PAUSE** (section 10).

## 3. Preview source
1. Susan builds each ad in Meta as **PAUSED** drafts.
2. Card calls Meta's ad previews endpoint (`GET /{ad_id}/previews`) for: `MOBILE_FEED_STANDARD`, `INSTAGRAM_STANDARD`, `INSTAGRAM_STORY`, `INSTAGRAM_REELS`, `FACEBOOK_REELS_MOBILE`, `DESKTOP_FEED_STANDARD`.
3. Meta's preview iframes expire after 24 hours — fetch fresh on every page load; never cache.
4. Also show Meta's shareable preview link (if available on the ad) as "Open on my phone in Facebook/Instagram." Verify the field name and permission.
5. Video with sound: also play the source video file Meta holds for the creative in a native player, since preview iframes may not play audio reliably.
6. Meta's preview iframe may not let you tap the CTA through to the site. So directly under each preview: a **Tap the CTA** button that opens the exact destination URL from the creative.
7. If Meta preview is unavailable: show a banner "INTERNAL SIMULATION — NOT META'S PREVIEW" plus a list of differences. Approve button stays disabled until a real Meta preview loads (Marc may override in writing).

## 4. Version lock
1. Version hash = SHA-256 of: Meta ad IDs, creative IDs, video asset hash, headline, primary text, CTA type, full destination URL, claims list, budget ceiling.
2. New Supabase tables: `campaign_approvals` (campaign_id, version_hash, status, decided_by, decided_at, notes) and `campaign_test_runs` (run_id, campaign_id, version_hash, check results, screenshots, started_at, finished_at).
3. Any change to those fields produces a new hash. The card then shows "CHANGED SINCE APPROVAL — needs re-approval" and launch is blocked.
4. Approval applies only to the hash that was tested.

## 5. Test status panel
Six rows, each **Pass / Fail / Not Tested**, tied to the current hash:
1. Video/audio — video loads, has an audio stream, correct duration.
2. Destination URL — exact production URL returns 200 and renders the hero and play button above the fold.
3. Signup — magic-link signup completes (test inbox or admin-generated link).
4. Subscription checkout — shows $9.99/mo, $79.99/yr, 14-day trial, card required; Stripe **test mode** card 4242 completes.
5. Conversion tracking — test events land in Supabase flagged test, and in Meta Events Manager's Test Events tab via `test_event_code`. Nothing reaches production analytics.
6. Mobile experience — whole flow passes on iPhone profile and desktop.

## 6. TEST THIS AD (safe test environment)
1. Automated run (Playwright, iPhone + desktop Chrome profiles) runs before Susan can submit for approval, and again on demand.
2. Destination check runs on the **exact production URL** (read-only).
3. Signup + checkout run on the **Vercel preview deployment of the same commit**, wired to Stripe **test-mode** keys. The card labels this difference.
4. Every test user is created with `is_test_account = true`. Test sessions carry `et_test=<run_id>`; browser pixel is suppressed for these sessions and server events use `test_event_code`.
5. Marc's personal test: TEST THIS AD opens the same flow on his phone, starting from the Meta preview. A checkbox "Owner tested personally" records it.
6. No live Stripe charge is possible from a test run.

## 7. Buttons and launch gate
1. APPROVE & AUTHORIZE — disabled unless all six checks Pass on the current hash. Records approval + spend ceiling.
2. REQUEST CHANGES — opens a notes box; status goes back to Susan.
3. REJECT — closes the version.
4. Launch gate (server-side): the only path that switches an ad from PAUSED to ACTIVE is a gated API route. It recomputes the hash from live Meta data and refuses unless it matches an approved hash with all tests passing.
5. The Meta write token lives only in Vercel env. Susan never holds it directly; she calls the gated route.

## 8. Verification before launches are enabled (run by a fresh subagent, not the builder)
1. Break the destination URL on a test campaign → Destination check Fails → Approve stays disabled.
2. Change the headline after approval → card shows "needs re-approval" → launch refused.
3. Call the launch route with a mismatched hash → refused with a clear error.
4. Run a full test → confirm zero new rows in production analytics (is_test_account excluded) and no live Stripe subscription.
5. Marc completes one personal test on his iPhone.

## 9. Needed from Marc
1. ~~Approve this build~~ — APPROVED Oct 29, 2026.
2. A Meta token with `ads_management` for PAUSED drafts and previews, stored server-side only.
3. Stripe test-mode keys added to the Vercel **Preview** environment.

## 10. Launch and pause (added Oct 29, 2026)
1. After Marc approves, show a **LAUNCH** button on the card, visible to Susan and Orion only.
2. LAUNCH calls the gated launch route (section 7.4). It re-checks the version hash against live Meta data and refuses if anything changed.
3. Record who launched and when; show "LIVE" on the card.
4. Notify Susan and Orion when Marc approves or declines.
5. Add a **PAUSE** button for Marc, Susan, and Orion. Pausing needs no approval. Resuming needs a new LAUNCH on an approved, unchanged hash.
6. No one launches from Meta Ads Manager directly.

## 11. Meta conversion events
1. Server-side CompleteRegistration and StartTrial paths already exist. Verify and extend; do not rebuild.
2. Events must be deduplicated between pixel and server (shared event_id).
3. Ads will optimize for signup (CompleteRegistration). Confirm it fires once per real signup.
4. Report env var NAMES present in Vercel Production and Preview (pixel ID, CAPI token, test event code, ads_management token, Stripe test keys). Never print values. Marc supplies anything missing.
