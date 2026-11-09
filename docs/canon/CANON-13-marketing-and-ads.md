# CANON-13 — Marketing & Ads
Status: DRAFT for Marc's approval · Nov 9, 2026 · Owner: Marc
Covers: who may build, approve, launch and pause ads; ad testing (Amendment 1); ad budgets and CAC test rules; hook-first ad creative; landing; tracking; TikTok, influencers and other channels; ad accounts. Does not cover: how plow back and ad spend are counted on the books (CANON-14 Finance & Reporting); agent roster, merges and deploys (CANON-15 Agents & Operations); how hook-series stories are written and published (PIPELINE-CANON / story production canon); the listener app and player (PLAYER-RULES).

## Where Marc decides

Every rule in this document that needs Marc. **[MARC DECIDES]** = Marc approves, chooses or gives his OK. **[MARC DOES]** = something only Marc does himself (tests on his phone, listens, enters a key). The same tag marks each rule below.

- **Rule 1 [MARC DECIDES]:** No ad spends money or goes live until Marc approves its creative and its budget.
- **Rule 5 [MARC DECIDES]:** Susan writes ad copy with Claude through her own key, capped at $25 a month. Marc approves the final copy.
- **Rule 8 [MARC DECIDES]:** Any new idea for an agent's role in ads (for example, Strategos sending his brief straight to Susan) needs Marc's word before it is used.
- **Rule 12 [MARC DECIDES]:** If Meta's preview won't load, the card says "INTERNAL SIMULATION — NOT META'S PREVIEW" and Approve stays off. Only Marc can override, in writing.
- **Rule 16 [MARC DOES]:** Marc tests every ad himself, on his phone, before it is uploaded or launched.
- **Rule 19 [MARC DECIDES]:** Approval covers only the exact version tested. Any change to video, headline, text, button, link, claims or spend ceiling makes a new version that…
- **Rule 22 [MARC DECIDES]:** LAUNCH appears only after Marc approves, and only for Susan and Orion. Each launch records who and when.
- **Rule 25 [MARC DOES]:** The Meta write key (ads_management) lives only on the server. Marc enters it himself. Susan never holds it; she calls the gated route.
- **Rule 34 [MARC DECIDES]:** Weekly spend never goes over the weekly plan without Marc's approval.
- **Rule 41 [MARC DECIDES]:** After the test, monthly ad spend may not go over that month's "Available for ads" amount (plow back, defined in CANON-14) without Marc's approval.
- **Rule 51 [MARC DECIDES]:** Low-cost video promo clips (one still image per scene, slow pan, story audio) are a future option only. No build until Marc approves a test, and…
- **Rule 61 [MARC DOES]:** TikTok ads use the same approval card, 6 checks, Marc's phone test and playbook read as Meta before any spend.
- **Still open:** 11 conflicts and 8 questions at the end of this document wait for Marc's decision (all listed in CANON-99).

## Rules

### A. Who decides
1. **[MARC DECIDES]** No ad spends money or goes live until Marc approves its creative and its budget. — **Agreed** (memory agent-fleet.md; chat "CAC for self-funding", summary claude/chat-summary-meta-poc-cac-goals-2026-11-02.md)
2. Strategos picks the audience and the message. Susan builds and places the ads against Strategos's pick. Neither can spend or publish for Marc. — **Agreed** (memory agent-fleet.md, bell-meta-marketing.md, Nov 2)
3. No campaign on any platform (Meta, TikTok or later) is built until both Strategos and Susan have read the full "Endless Tales — Susan Playbook (CANONICAL)" Drive folder. If the folder can't be read, the build stops until it can. — **Agreed** (Marc ruling Nov 1, 2026; chat "Audio story app CAC planning"; project doc claude/chat-summary-susan-strategos-playbook-gate-2026-11-02.md)
4. Orion sends no ad-build task unless it cites the playbook read and Strategos's audience pick. — **Agreed** (Nov 1, 2026, Marc said "Yes" to the structural gate; same chat)
5. **[MARC DECIDES]** Susan writes ad copy with Claude through her own key, capped at $25 a month. Marc approves the final copy. — **Agreed** (memory agent-fleet.md, Nov 8; chat "Apple App Store commission deals", Nov 5: Marc approved hook-ad copy)
6. Hal cuts the ad videos. — **Agreed** (Marc: "Confirm Hal", Nov 1, chat "Audio story app CAC planning")
7. Earlier failed tests (GVL-TEST-001, Bell Arm 2) are ignored. New campaigns start fresh, without their data. — **Agreed** (memory bell-meta-marketing.md; chat "Meta ad test plan for Endless Tales")
8. **[MARC DECIDES]** Any new idea for an agent's role in ads (for example, Strategos sending his brief straight to Susan) needs Marc's word before it is used. — **Proposed** (fills C6 below)

### B. Testing and approving every ad (Amendment 1)
9. Every Meta campaign gets a Campaign Approval Card in Admin → Marketing → Approvals. — **Agreed** (docs/specs/amendment-1-ad-preview-and-testing-spec.md, approved Oct 29, 2026; AGENTS.md canon index)
10. The card shows Meta's real preview for each placement (Facebook and Instagram mobile, video with sound), the real headline, text and button, and the exact destination link. — **Agreed** (Amendment 1 §2–3)
11. Meta's preview frames expire in 24 hours. The card fetches them fresh every time and never stores them. — **Agreed** (Amendment 1 §3.3)
12. **[MARC DECIDES]** If Meta's preview won't load, the card says "INTERNAL SIMULATION — NOT META'S PREVIEW" and Approve stays off. Only Marc can override, in writing. — **Agreed** (Amendment 1 §3.7)
13. The card has 6 checks, each Pass / Fail / Not Tested: video and sound, destination link, signup, checkout, conversion tracking, phone. — **Agreed** (Amendment 1 §5)
14. Checkout must show $9.99 a month, $79.99 a year, 14-day free trial, card required. Tests use Stripe test mode only. No real charge is possible from a test. — **Agreed** (Amendment 1 §5.4, §6.6)
15. Test users are marked is_test_account. Test visits never reach real analytics or Meta's learning (pixel off, test event code on). — **Agreed** (Amendment 1 §6.4)
16. **[MARC DOES]** Marc tests every ad himself, on his phone, before it is uploaded or launched. — **Agreed** (Nov 4, 2026, project doc claude/hook-first-ads-2026-11-04.md; PIPELINE-CANON HOOK-SERIES RULE; memory profile)
17. The "Owner tested personally" box must be ticked before APPROVE works. — **Proposed** (rule 16 is not enforced by the card today)
18. APPROVE stays off until all 6 checks Pass on the current version. — **Agreed** (Amendment 1 §7.1)
19. **[MARC DECIDES]** Approval covers only the exact version tested. Any change to video, headline, text, button, link, claims or spend ceiling makes a new version that needs approval again. — **Agreed** (Amendment 1 §4; memory meta-campaign-approval.md)
20. Susan builds ads in Meta as PAUSED drafts only. — **Agreed** (Amendment 1 §3.1)
21. Only the card's LAUNCH button turns an ad on. It re-checks the version against live Meta data and refuses if anything changed. No one launches from Meta Ads Manager. — **Agreed** (Amendment 1 §7.4, §10.2, §10.6)
22. **[MARC DECIDES]** LAUNCH appears only after Marc approves, and only for Susan and Orion. Each launch records who and when. — **Agreed** (Amendment 1 §10.1, §10.3)
23. Marc, Susan or Orion may PAUSE at any time without approval. Resuming needs a new LAUNCH on an approved, unchanged version. — **Agreed** (Amendment 1 §10.5)
24. Susan and Orion are told when Marc approves or declines. — **Agreed** (Amendment 1 §10.4)
25. **[MARC DOES]** The Meta write key (ads_management) lives only on the server. Marc enters it himself. Susan never holds it; she calls the gated route. — **Agreed** (Amendment 1 §7.5; Marc's decision in chat "Meta campaign testing plan", Oct 30)
26. The Meta write key must be on the server that runs the app and Susan's tools (EC2), not only on Vercel. — **Proposed** (Nov 7 finding: the key was put in Vercel, so Susan could not use it; see C10)
27. The builder of the approval system never checks its own work. A separate fresh helper verifies. — **Agreed** (Marc's decision, chat "Meta campaign testing plan", Oct 29–30)
28. Claude builds the card into the Marketing dashboard. Orion verifies it before launches are turned on. Susan makes sure the card matches what is set up in Meta. — **Agreed** (memory meta-campaign-approval.md)
29. Approval pages use a light background, black text, body text 18px or larger, buttons 22px or larger. — **Agreed** (Amendment 1 §1.4)

### C. The first test: money and goals
30. No $15,000+ ad spend before a proof of concept. — **Agreed** (memory bell-meta-marketing.md)
31. The first Meta test is "6+2": $4,000 of ads over 6 weeks, then 2 weeks for trials to turn into paid. — **Agreed** (memory bell-meta-marketing.md; chat "Meta campaign testing plan")
32. The goal is a paid CAC (ad cost per paying subscriber) under $30 by week 8. — **Agreed** (chat "Meta campaign testing plan"; chat "Meta ad campaign for 6+2")
33. Weekly plan: $500, $500, $700, $700, $800, $800, then $0, $0. Forecast: 270 trials, 135 paid, $29.63 CAC. — **Agreed** (owner-identified final workbook Oct 29; docs/ADMIN-MARKETING-WORKBOOK.md; lib/admin-center/meta-test-plan.ts)
34. **[MARC DECIDES]** Weekly spend never goes over the weekly plan without Marc's approval. — **Proposed** (Strategos rule; still marked "awaiting approval", see Q1)
35. Stop rules: pause for revision if cost per trial is worse than $22.50 after $600 spent; stop if worse than $25.00; stop if blended CAC is worse than $45.00 once measurable. — **Proposed** (Strategos; lib/admin-center/meta-test-plan.ts; Marc had not approved as of Nov 7, chat "Sunset episode 8 artifact")
36. Per-ad early signs: cost per page load $1.17 or better (worse than $1.75 after $75 spent is bad); cost per signup $9.33 or better (worse than $15 after $75–150 is bad). — **Proposed** (same source)
37. Trial-to-paid is judged only after 30 trials are 14 days old. Under 35% means fix onboarding, not ads. — **Proposed** (same source; Claude's 30-trial advice, Oct 30)
38. No changes to an ad in its first 3 days unless it breaks a stop rule. — **Proposed** (same source)
39. The $400 reserve goes to the winning ad only after $600 spent, 10+ trials per ad set aged 14 days, cost per trial $15 or less, and early paid rate 40% or more. — **Proposed** (same source)
40. The Meta test sells subscriptions only. A pay-per-week pass is tested afterward. — **Agreed** (Nov 4, memory business-model.md)
41. **[MARC DECIDES]** After the test, monthly ad spend may not go over that month's "Available for ads" amount (plow back, defined in CANON-14) without Marc's approval. — **Proposed** (connects plow back to a spending cap; Marc decided the plow back amount, not the cap)

### D. Ad creative: hook-first
42. Write ad hooks first, pick the strongest, then build new stories around the winning hooks. Hooks are not clipped from old stories. — **Agreed** (Nov 4, memory bell-meta-marketing.md; project doc claude/hook-first-ads-2026-11-04.md)
43. The hook is the first spoken line of Episode 1. The ad is the first 20–25 seconds of Episode 1, with real AI story images and the end card "Hear what happens next. Free 14-day trial." — **Agreed** (PIPELINE-CANON HOOK-SERIES RULE, Nov 5; claude/hook-first-ads-2026-11-04.md)
44. Each ad lands on its exact story, never the app home page. — **Agreed** (PIPELINE-CANON HOOK-SERIES RULE)
45. Hook ads launch one series at a time, as each series is ready. — **Agreed** (Nov 6, memory hook-series.md)
46. An ad never sends people to a story with only one episode live. — **Agreed** (Nov 8, memory hook-series.md: no 1-episode stories live)
47. A winning hook is judged by cost per trial and by the share of trial users who reach Episode 3 or later. — **Agreed** (PIPELINE-CANON HOOK-SERIES RULE)
48. Ads are vertical 9:16 video with burned-in captions, because Meta plays feed video muted. — **Agreed** (governance/ACQUISITION-RETENTION-001.md E1; Susan handoff Marc sent Nov 2)
49. Placements favor Reels and Stories, where people watch with sound. — **Agreed** (Nov 5, chat "Apple App Store commission deals")
50. Skip hooks likely to draw Meta policy review (Marc skipped the visa-marriage hook). — **Proposed** (one past decision; no general rule yet)
51. **[MARC DECIDES]** Low-cost video promo clips (one still image per scene, slow pan, story audio) are a future option only. No build until Marc approves a test, and only if data shows other creative is weak. Never in the main app. — **Agreed** (memory bell-meta-marketing.md)

### E. Landing and tracking
52. The destination page must load with the story's hero image and its listen button above the fold on a phone. — **Agreed** (Amendment 1 §5.2)
53. The landing button invites the listener to "overhear" (not a media player). Pressing it starts the audio at the very first line. — **Agreed** (governance/ACQUISITION-RETENTION-001.md E2)
54. Signup and trial-start events go to Meta from both the page and the server, with one shared event ID so they count once. — **Agreed** (Amendment 1 §11.1–11.2)
55. utm_campaign must exactly match the campaign name, so paying subscribers trace back to their campaign. — **Agreed** (docs/CODEX_CAMPAIGN_SYSTEM_SPEC.md §3 "Confirmed decisions", May 7, 2026)
56. Real CAC per campaign = ad spend over the campaign's life ÷ real (non-test) paying subscribers with that utm_campaign. — **In force (code)** (lib/finance/statement.ts, campaigns section)
57. Dashboard numbers from Meta must use an exact date range and the exact ad set, never a "lifetime" preset. — **Proposed** (Aug 2026 fix in memory bell-meta-marketing.md is not in the current route; see enforcement)
58. Susan's data feed is read-only (Meta ads_read, TikTok Reporting). It strips personal data and cannot create, change or pay for ads. — **In force (code)** (docs/SUSAN-MARKETING-API.md; app/api/marketing/meta-insights, tiktok-insights)

### F. Older campaign system (Airtable)
59. Before a campaign is approved, a 90-day cash test must show cash stays above the floor: the larger of $5,000 or 90 days of spending. — **Agreed** (docs/CODEX_CAMPAIGN_SYSTEM_SPEC.md §3, May 7, 2026; shipped app/api/cron/stress-test)
60. No more than 3 campaigns run at once (soft limit). — **Agreed** (same spec §3)

### G. Other channels
61. **[MARC DOES]** TikTok ads use the same approval card, 6 checks, Marc's phone test and playbook read as Meta before any spend. — **Proposed** (TikTok is planned as "eventually"; no TikTok approval rule exists)
62. Influencer and PR outreach uses public, legal channels only (press databases, platform DMs, business emails). No scraping of private emails. Cold emails follow CAN-SPAM. — **Proposed** (chat "Reaching celebrities and influencers about AI"; purpose still undecided)
63. Mail-in QR test at local stores waits until after the Meta test. — **Proposed** (chat "QR code marketing system", Nov 3; idea only)

### H. Ad accounts
64. The Bizgojo and Foxfire Mountain Meta ad accounts are no longer used for Endless Tales. — **Agreed** (Nov 8, memory meta-ad-accounts.md)
65. Endless Tales ads run from one ad account named for Endless Tales, paid by the ad-spend card. — **Proposed** (no rule says which account runs ads; see Q3)

## Conflicts found
- C1. Price. Amendment 1 (Oct 29) and memory (Nov 2): $9.99/month, $79.99/year. governance/ACQUISITION-RETENTION-001.md A4 shows "$7.99/month" on the lock screen. docs/CODEX_CAMPAIGN_SYSTEM_SPEC.md (May) and memory /areas/endless-tales-platform.md (Aug) say $7.99/$59.99. DEPLOY.md lists old tiers and credit packs. Recommendation: $9.99/$79.99 wins (newest; also in code, lib/finance/statement.ts). Fix the old docs. Marc decides.
- C2. Trial. Nov 2 (CAC chat) and Amendment 1: 14-day trial, card required. ACQUISITION-RETENTION-001 A3–A4 and the Aug platform memory: 7-day free week, no card. Recommendation: 14 days, card required (newest). Marc decides.
- C3. Meta access. Aug–Oct standing rule: "Meta Ads Manager is Marc-only; no agent has access to Meta" (memory bell-meta-marketing.md; Oct 11 ways-of-working). Amendment 1 (Oct 29): Susan builds paused drafts through the API and Susan/Orion press LAUNCH. Recommendation: Amendment 1 wins: agents touch Meta only through the gated server routes, never by logging into Ads Manager. Marc decides.
- C4. What Meta optimizes for. Amendment 1 §11.3 and the Oct 29 plan: signup (CompleteRegistration). CAC chat (Nov 2) and Susan's Nov 7 paper plan: Trial Start. The question was reopened Nov 1 and never closed. Recommendation: Trial Start, because the CAC goal is built on cost per trial. Marc decides.
- C5. When a hook ad may run. Nov 6: launch as soon as that series' Episodes 2 and 3 are live. Nov 8 and PIPELINE-CANON HOOK-SERIES: all 7 Season 1 episodes publish together. Recommendation: Nov 8 wins: the ad waits until the whole Season 1 is live. Marc decides.
- C6. Brief approval. Oct 27 plan: Marc approves Strategos's brief before Susan starts. Nov 2 handoff: Strategos sends the brief straight to Susan; Marc's only gate is before launch. Recommendation: keep Marc's gate before launch only (rule 1), and add rule 8. Marc decides.
- C7. CAC lines. Nov 2 CAC chat: pass under $40, target $26–31, stop over $60. 6+2 plan: goal under $30, stop blended CAC over $45. Recommendation: the 6+2 numbers win (newer, and in the plan). Marc decides.
- C8. Plow back. Nov 2 pro forma: 75% of revenue goes to marketing; Admin Command Center "Marketing target %" (default 75) is applied to Stripe collections. Nov 8: 75% of the previous month's profit, $0 after a loss month. Recommendation: Nov 8 wins (see CANON-14). Marc decides.
- C9. Test market. ACQUISITION-RETENTION-001 Parts A, D, E: Greenville-local stories, 12 test cells, no Belle before signup. Nov 2026 plan: broad US, ages 30–65, hook series. Recommendation: mark Parts A, D and E of ACQUISITION-RETENTION-001 as history for marketing. Marc decides.
- C10. Where the Meta key lives. Amendment 1 §7.5 says Vercel. The app and agents run on EC2, so Susan could not use the key (Nov 7). Recommendation: update the spec to "server environment on EC2" (rule 26). Marc decides.
- C11. Ad Manager phone preview as approval. Nov 7, Claude offered a one-time Monday launch where Marc builds the Rerouted ad in Ads Manager and Meta's "Preview on phone" counts as approval. That breaks rules 9 and 21. No answer from Marc was found. Recommendation: allow only as a written, one-time override (rule 12). Marc decides.

## Open questions for Marc
- Q1. Do you approve Strategos's stop rules (rules 34–39)? They are still marked "awaiting approval." Suggested answer: approve as written.
- Q2. Should Meta optimize for Trial Start or signup? Suggested answer: Trial Start.
- Q3. Which Meta ad account runs Endless Tales ads (WonderBooks Press, your personal one, or a new Endless Tales account)? Suggested answer: a new or renamed Endless Tales account, paid by the ad-spend card.
- Q4. Is the Airtable campaign system (cash test, 3-campaign limit, daily recommendations) still in use, or replaced by Admin → Marketing? Suggested answer: retire Airtable; keep the cash-floor test as a check on the Approval Card.
- Q5. After the $4,000 test, who sets the monthly ad budget? Suggested answer: it equals "Available for ads" (plow back); more needs your approval.
- Q6. What is influencer/PR outreach for: press, partnerships or paid creators? Suggested answer: decide after the Meta test.
- Q7. Must "Owner tested personally" be ticked before APPROVE works? Suggested answer: yes.
- Q8. Can you override Amendment 1 in a chat message, or only on the card? Suggested answer: only in writing, saved on the card with the date.

## Enforcement status
- Rules 9–13, 18, 19, 21–23 → enforced in code: app/admin/marketing/approvals/[campaignId]/page.tsx; app/api/admin/marketing/approvals/[campaignId]/route.ts (approveEnabled = all 6 checks pass); app/api/admin/marketing/approvals/[campaignId]/launch/route.ts (hash re-check, 403/409 refusals); supabase/migrations/20261029_amendment1_campaign_approvals.sql.
- Rule 16 → partly: the card records "Owner tested personally" (lib/marketing/approvalsStore.ts) but does not require it.
- Rule 25–26 → not working as of Nov 7: key was in Vercel only.
- Rules 3–4 → enforced only in Orion's own AGENTS.md on the Mac and the Drive playbook, not in the repo. Not verified.
- Rules 33–39 → shown in Admin (lib/admin-center/meta-test-plan.ts) only. Nothing pauses an ad automatically.
- Rules 44–46 → not enforced in code; checked by hand.
- Rule 56 → enforced: lib/finance/statement.ts.
- Rule 57 → not enforced: app/api/marketing/meta-insights/route.ts still defaults to date_preset=last_7d.
- Rule 59 → enforced for Airtable campaigns only: app/api/cron/stress-test, stress-test-poller.
- Rules 61–63, 65 → not enforced.

## Sources reviewed
- Repo (/tmp/dtt): docs/specs/amendment-1-ad-preview-and-testing-spec.md; docs/ADMIN-MARKETING-WORKBOOK.md; docs/SUSAN-MARKETING-API.md; docs/CODEX_CAMPAIGN_SYSTEM_SPEC.md; governance/ACQUISITION-RETENTION-001.md; docs/PIPELINE-CANON.md (HOOK-SERIES); AGENTS.md; lib/admin-center/meta-test-plan.ts; lib/finance/statement.ts; lib/marketing/approvalsStore.ts; app/api/admin/marketing/approvals/*; app/api/marketing/meta-insights/route.ts; app/admin/CommandCenter.tsx; git log since Jun 2026.
- Memory: meta-campaign-approval.md, meta-ad-accounts.md, bell-meta-marketing.md, /areas/gvl-meta-campaign.md, hook-series.md, agent-fleet.md, business-model.md, business-spending.md, /areas/endless-tales-platform.md.
- Past chats: "Meta ad preview and testing"; "Meta campaign testing plan"; "Meta ad campaign for 6+2"; "Meta ad test plan for Endless Tales"; "CAC for self-funding"; "Meta ads CAC scenario forecast"; "Audio story app CAC planning"; "Gemini sound replacement loop" (Nov 4–5); "Apple App Store commission deals" (Nov 5); "Sunset episode 8 artifact" (Nov 7); "Reaching celebrities and influencers about AI"; "QR code marketing system"; "Combine chats for Endless Tales".
- Project docs (claude/*.md): NOT opened directly — the Projects tool was not available to this auditor. Their content was read through the chats that wrote them (chat-summary-amendment-1, -meta-campaign-launch-prep, -first-meta-campaign-handoffs, -meta-poc-cac-goals, -susan-strategos-playbook-gate, hook-first-ads-2026-11-04).

## Replaces (once approved)
- docs/specs/amendment-1-ad-preview-and-testing-spec.md (rules move here; the spec stays as the build reference).
- governance/ACQUISITION-RETENTION-001.md Parts A, D, E (marketing parts) — history.
- docs/CODEX_CAMPAIGN_SYSTEM_SPEC.md §3 prices, churn and LTV constants — history.
- docs/SUSAN-MARKETING-API.md "what you can do" section (rules move here).
- Project docs claude/chat-summary-*meta*, *facebook*, *video*, *influencer*, claude/hook-first-ads-2026-11-04.md — history.
- Memory bell-meta-marketing.md and gvl-meta-campaign.md standing rules — history.
