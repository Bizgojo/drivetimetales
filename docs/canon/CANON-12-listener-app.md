# CANON-12 — The Listener App
Status: **APPROVED** (Marc, Nov 9, 2026: "approve canon 01–15") · Owner: Marc · Changes only through CANON-99 (CANON-00 rules 10–16)
Covers: everything a listener sees outside the player: sign-up and sign-in, free trial, prices and plans, Stripe billing, cancel and refunds, the paywall, guests, Home, Library and story cards, the red Rate button, reviews, playlists, genres and search, account and settings, name personalization settings, referrals, story suggestions, ad landing pages, emails, accessibility, and privacy and legal pages. Does not cover: what happens inside the player (CANON-11 The Player); how stories are made and published (story pipeline canon); ad campaigns, budgets and CAC (marketing canon); revenue reports (finance canon).

## Where Marc decides

Every rule in this document that needs Marc. **[MARC DECIDES]** = Marc approves, chooses or gives his OK. **[MARC DOES]** = something only Marc does himself (tests on his phone, listens, enters a key). The same tag marks each rule below.

- **Rule 10 [MARC DECIDES]:** The Founding Member plan is retired. No page may offer it without a new pricing decision from Marc.
- **Rule 60 [MARC DECIDES]:** A new landing story serves only after Marc adds it to the live list.
- **Rule 68 [MARC DECIDES]:** Push notifications are off until Marc approves what they say and when.
- **Rule 73 [MARC DOES]:** Marc checks every listener-facing change on a real phone before it is accepted.
- **Decision 132 [MARC DOES]:** Marc or a blind tester runs the core path with VoiceOver on a real phone before any release or outreach to blind or low-vision listeners.
- **Still open:** nothing. Every conflict and question below is RESOLVED (CANON-99 Parts 1 and 2, Nov 9, 2026).

## Rules

### A. Sign-up and sign-in
1. Magic-link sign-in finishes on the client at /auth/confirm so it works in the iPhone Home Screen app. All sign-in cookies use sameSite "none" and secure. Never revert this. — **Agreed** (memory /areas/endless-tales-platform.md)
2. A new listener's name comes only from the first and last name they registered with, never from an email address or a card name. — **In force (code)** (lib/signupName.ts)
3. After sign-up, the listener goes back into the exact story they were sampling, at the spot they stopped. — **Agreed** (Marc's iPhone test Nov 6, chat "Cover story map pattern": "It should have started where I left off in the story I listened to"; POST-SIGNUP-RETURN-001, lib/landing.ts)
4. Right after sign-up, Belle greets the listener by first name in a short welcome. If the clip isn't ready, the app continues without it. — **Agreed** (BELLE-WELCOME-001 Marc Aug 11; BELL-ONBOARD-001 Marc Aug 23; app/api/go/invite-signup/route.ts)
5. For a signed-in listener, tapping the logo goes straight to Home. — **Agreed** (WALK-BUG-0713 #8, Marc Jul 13, components/AppHeader.tsx)

### B. Prices, plans and the free trial
6. Prices: $9.99 per month or $79.99 per year. — **Agreed** (Marc, Oct 2026: chats "CAC for self-funding", "Meta ad test plan", "Pocket FM… pricing"; memory bell-meta-marketing.md; lib/pricing.ts)
7. Free trial: 14 days on every sign-up path. — **Agreed** (same sources; PRICING-TRIAL-001, lib/pricing.ts)
8. A card is required to start the trial. — **Agreed** (chat "CAC for self-funding" Oct 2026: "Card-required, 14-day trial" approved for the Meta test; memory meta-campaign plan). See Conflict C2.
9. lib/pricing.ts is the one place the app gets prices and trial length. It must match Stripe. — **In force (code)** (lib/pricing.ts)
10. **[MARC DECIDES]** The Founding Member plan is retired. No page may offer it without a new pricing decision from Marc. — **Agreed** (ATL-FM-RETIRE-001, Marc Jul 10, app/api/checkout/route.ts)
11. The trial length is decided by the server, never by the web page. Allowed values: 7, 14, 21 or 30 days. — **In force (code)** (app/api/checkout/route.ts)
12. Customer-facing pages never show a raw promo code. They say "Special offer applied". — **Agreed** (ORION-GO-OFFER-COPY-001, Marc Jul 12)
13. The Meta test sells subscriptions only. Pay-per-story or a week pass is tested later, as its own test. — **Agreed** (memory business-model.md, Nov 4)
14. A $4.99 one-week pass (no auto-renew, credited toward the annual plan within a month). — **Proposed** (Marc was weighing it Nov 4; not decided)

### C. Billing, cancel and refunds
15. A listener cancels in Account → Billing. Cancelling stops the next charge. Access continues to the end of the paid period. — **In force (code)** (app/api/user/cancel-subscription, cancel_at_period_end; app/terms/page.tsx)
16. Fees are not refunded except where the law requires or an offer says so. Billing questions go to hello@endless-tales.com. — **In force (code)** (app/terms/page.tsx). Needs Marc's OK (Q4).
17. A failed renewal does not cut access right away. Access stays while Stripe retries. Only a final failure ends access. — **Agreed** (CARD-ON-FILE-001, "Marc GO" Oct 5, app/api/webhook/route.ts)
18. A listener has access only when their plan is active and its end date is in the future. — **In force (code)** (lib/subscription.ts)

### D. Paywall and guests
19. A signed-in listener who never had a trial and opens a paid story goes to the Subscribe page. — **In force (code)** (CanonicalPlayer.tsx paywall)
20. After a trial ends without paying: a standalone story plays 60 seconds, then a Belle "subscribe" wall; a series plays all of Episode 1, then the wall; Episode 2 and later are blocked at once. — **In force (code)** (POST-TRIAL-BELLE-001, CanonicalPlayer.tsx). Older memory says "free Episode 1 forever after the trial" — **Agreed** (memory /areas/endless-tales-platform.md); code matches for series only.
21. Never cut audio mid-drive. A paywall shows at the start of the next story, not in the middle of one. — **Proposed** (rule 20's 60-second wall stops a standalone mid-play; see Q5)
22. A no-card trial listener who arrived from an ad sees a card-capture screen at the end of Episode 2. — **Agreed** (GO-REROUTE-V2, Marc Oct 5, CanonicalPlayer.tsx). See Conflict C2.
23. Guests (not signed in) can play only stories marked free. After 2 stories or 30 minutes, they see a sign-up prompt. — **In force (code)** (app/guest/page.tsx)

### E. Home page
24. The Continue card heading reads "Continue your last story here". — **Agreed** (HOME-POLISH-001, Marc Nov 6, components/player/PersistentPlayer.tsx)
25. Continue card layout: line 1 the series title in bold (or story title), up to 2 lines; line 2 "Episode N · episode title"; line 3 time played and time left; cover 56 pixels; "Remove ×" top right; Continue bottom right. — **Agreed** (Marc Nov 5, PR #493, chat "Apple App Store commission deals")
26. The Continue card is one shade lighter than story cards, the same as My Playlist. — **Agreed** (CARD-SHADE-001, Marc Nov 6)
27. The Continue card shows on Home and Library only. — **In force (code)** (PersistentPlayer.tsx)
28. No news features. Never add news briefings. — **Agreed** (memory /areas/endless-tales-platform.md)

### F. Library and story cards
29. One story card everywhere (components/LibraryStoryCard.tsx). Every page that shows a story uses it. — **Agreed** (WALK-BUG-0713 #7, Marc Jul 13)
30. The card shows an "N Episode(s)" pill, author and genre, stars with a count, and a short description. — **Agreed** (Marc Oct 4, LibraryStoryCard.tsx)
31. The description fills two lines on the card and never spills to a third. — **Agreed** (memory story-pipeline.md, Nov 5). See Conflict C6.
32. Every card has three buttons. Left: Listen (orange), Continue Listening (green), or Play Again. Center: Add to Playlist (blue), or On Playlist (lighter blue). Right: Read (amber), or Continue Reading (green). All three are the same size. — **Agreed** (Marc Oct 4, 7 and 8, LibraryStoryCard.tsx)
33. When a story or a whole series is finished and not yet reviewed, the center button turns red "Rate this story/series" until the listener reviews it. — **Agreed** (docs/PLAYER-RULES.md; Marc Nov 8)
34. Tapping the cover opens the story's info page. — **Agreed** (Marc Oct 7, LibraryStoryCard.tsx)
35. Only live stories appear: published, not hidden, and for a series, all episodes live. No 1-episode series is ever shown. — **Agreed** (docs/PLAYER-RULES.md "What listeners can see"; memory story-pipeline.md and hook-series.md, Nov 8)
36. A story marked "Not for me" stays out of the listener's Home recommendations. — **In force (code)** (user_library.not_for_me)
37. When an author has 2 or more stories, the author page shows "Show all stories by {author name}". — **Agreed** (Marc Nov 5 request; project to-do G26). Not built yet.

### G. Ratings and reviews
38. A review is 1 to 5 stars with optional text. One review per listener per story or series. — **In force (code)** (app/api/reviews/submit/route.ts)
39. Reviews never pay credits. Endless Tales has no credits. — **Proposed** (the review route still awards "review credits", a leftover from the old credit model; see Conflict C4)
40. A series is rated once, as a whole, from its card or after its last episode. — **Proposed** (fills the gap behind rule 33)

### H. Playlists
41. A playlist is the listener's own list, built with "Add to Playlist". It can hold standalone stories and whole series. It plays in order. — **In force (code)** (lib/playlistState.ts). Open in PLAYER-RULES; see Q1.
42. Adding a story to the playlist also saves it for offline listening (every episode of a series). Removing it deletes the offline copy. A failed download never blocks the add. — **Agreed** (QUEUE-OFFLINE-001, Marc Oct 4, app/library/page.tsx)
43. The My Playlist bar shows "Play" until the listener starts it, then "Continue". — **Agreed** (QUEUE-OFFLINE-001, Marc Oct 4)
44. On the Library, My Playlist is a slim one-row bar so more cards fit. — **Agreed** (CARD-COMPACT-001, Marc Nov 6)
45. The playlist is saved to the listener's account and follows them to any device. — **Proposed** (today it lives only in that phone's browser storage; PLAYER-RULES says progress follows the listener, the playlist should too)

### I. Genres, browse and search
46. Genres follow GENRE-ATTRIBUTES-SPEC (locked). The old genre lists (Children, Non-Fiction, Trucker Stories, credits) are retired. — **Agreed** (memory /areas/endless-tales-platform.md: "GENRE-ATTRIBUTES-SPEC v1.0 … locked")
47. Search finds stories by title, series name and author, and shows only live stories. — **Proposed** (no current rule)

### J. Account, settings and name personalization
48. Account shows name, email, member-since date, billing, history, downloads, help and the Travel Insights choice (Always / Never / Only while using). Travel Insights is off until the listener turns it on. — **In force (code)** (app/account/page.tsx)
49. Every control on the Settings page must work. Controls that save nothing are removed until they are built. — **Proposed** (app/account/settings/page.tsx shows speed, autoplay, skip silence, sleep timer, download and notification controls that do nothing)
50. A listener can correct the first name Belle uses and hear a sample before saving. — **Proposed** (no setting exists; a wrong name in every intro is a fast way to lose a subscriber)
51. A listener can delete their account from Account. — **In force (code)** (app/api/user/delete). Confirm it is reachable on the page.

### K. Referrals and story suggestions
52. A referral link (?ref=CODE) is saved on any page and survives sign-in. The newest link wins. — **In force (code)** (lib/referral.ts, REFERRAL-SIGNUP-001)
53. Referral reward is free days for both people (default 14 each). The friend gets theirs after their first successful payment; the referrer gets theirs only after the friend's first payment. Each side is paid once. — **In force (code)** (lib/referralPayout.ts)
54. A referral trial never starts a second trial at checkout. — **In force (code)** (lib/referralInvitation.ts)
55. Story suggestions are sent from Account → Suggest a Story. The Terms explain the license the listener grants. — **In force (code)** (app/account/suggest-story, app/terms/page.tsx)
56. Custom (paid, one-time) stories are not offered yet. — **Proposed** (finance code has a "Custom stories" revenue line; no listener page exists; see Q6)

### L. Ad landing pages
57. Each Meta ad lands on its own story: /go?v=widow, rise, miami, rerouted or home. The page plays that story's real Episode 1, so the spot carries into the app after sign-up. — **Agreed** (HOOK-LANDING-001 and AD-LINKS-001, Nov 6, chat "Cover story map pattern"; lib/landing.ts)
58. Ad links are copied only from the official list, never typed. Before approval, someone opens each ad's link on a phone and confirms the story title matches the ad. — **Agreed** (AD-LINKS-001, Nov 6)
59. A landing link with an unknown code shows a clear error, never a different story. — **Proposed** (today it silently plays The Grave He Dug Himself; this caused 2 wrong ad links on Nov 6)
60. **[MARC DECIDES]** A new landing story serves only after Marc adds it to the live list. — **Agreed** (approval gate, lib/landing.ts GO_LIVE_VARIANTS)
61. The trial button is hidden at first and slides up after 45 seconds of real listening (each story can set its own time). — **Agreed** (SUS/ATL-LANDING-002 rev C, "Marc final spec"; Falls Park ~100 seconds, Marc)
62. Trial button copy: "Card required — you won't be charged before your N-day free trial ends. Then just $X/month. Cancel anytime." Days and price come from lib/pricing.ts. — **Agreed** (Marc verbatim, msg 3015, Jul 19, lib/landing.ts)
63. Footnote under the button: "After you sign up, we'll pick up right where you left off." — **Agreed** (GO-FOOTNOTE-001, Marc Nov 6)
64. The Subscribe page has no app header for ad arrivals; organic visitors keep the header. — **Agreed** (ORION-SUB-CHROME-001, Marc Jul 12)

### M. Emails and notifications
65. Emails during a trial: welcome at trial start; a day-1 "add to Home Screen" email; reminders on days 2, 12 and 13 (no-card trials only); and Stripe's billing reminder before a card trial is charged. — **Agreed** (Marc approved the card-trial email fix, chat "Gemini sound replacement loop", Nov 5; app/api/cron/trial-emails, app/api/webhook)
66. A card-trial listener never gets copy that says "no card", "nothing to cancel" or "nothing will be charged". — **Agreed** (same, Nov 5; enforced by stripe_subscription_id filter)
67. Every marketing or reminder email has a one-click unsubscribe. — **In force (code)** (lib/emails/unsubscribe.ts)
68. **[MARC DECIDES]** Push notifications are off until Marc approves what they say and when. — **Proposed** (Settings shows notification toggles that do nothing)

### N. Accessibility and look
69. Dark background, white text only. Never grey text on dark. Orange for emphasis. — **Agreed** (memory /areas/endless-tales-platform.md "DTT website = dark background + WHITE text only"; MASTER_RULES.md; docs/PLAYER-RULES.md)
70. Every button a listener taps is at least 44 pixels tall. — **Proposed** for the whole app (Agreed for the player only, docs/PLAYER-RULES.md). See Conflict C5.
71. Body text is at least 16 pixels; small labels at least 14 pixels. — **Proposed** (large readable text; many labels today are 11–12 pixels)
72. Nothing spills sideways on phones, tablets or computers. — **Proposed** for the whole app (Agreed for the player)
73. **[MARC DOES]** Marc checks every listener-facing change on a real phone before it is accepted. — **Agreed** (memory profile: tests every step on his phone; docs/PLAYER-RULES.md)

### O. Privacy and legal
74. The app has Terms, Privacy and Content License pages. Prices in them come from lib/pricing.ts. — **In force (code)** (app/terms, app/privacy, app/license)
75. Listeners must be 13 or older. — **In force (code)** (app/terms, app/privacy)
76. Offline downloads are temporary licensed copies, not purchases. — **In force (code)** (app/terms)
77. The legal pages name the company that runs Endless Tales. — **Proposed** wording: Endless Tales, LLC (see Conflict C7)

## Marc's decisions (Nov 9, 2026)

Marc answered CANON-99 on Nov 9, 2026. These decisions are **Agreed** and override any rule above that says otherwise. Each conflict or question below that they settle is marked RESOLVED.

- **Decision 8:** **Story card description.** Decided: fills two lines, never a third (about 100 characters), checked in one place. The old 24-word and 70-character limits go. (03 C4, 12 C6) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 50:** **What a playlist is.** Decided: the listener's own "Add to Playlist" list, saved to their account; finished stories drop off. (12 Q1, Q2) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 51:** **Paywall.** Decided: the paywall never cuts audio mid-story; after a trial, Episode 1 of every series stays free. (11 Q5, 12 Q3, Q5) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 52:** **Prices and trial.** Decided: $9.99/month, $79.99/year; 14-day trial with a card required for ad traffic; refund once within 7 days of the first charge. Fix the old $7.99 numbers everywhere. (12 C1–C3, Q4, 13 C1, C2) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 53:** **Old models.** Decided: retire credits and Founding Member everywhere. (12 C4, C8) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 54:** **Readability and legal name.** Decided: 44-pixel buttons app-wide; legal pages name Endless Tales, LLC. (12 C5, C7) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 55:** **Settings page.** Decided: remove the controls that don't work; no speed control or sleep timer for now. (11 Q2, 12 Q7) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 99:** An unknown ad link shows a clear error, never a different story. (12 C9) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 100:** No custom stories until after the Meta test. (12 Q6) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 101:** Offer the annual plan at the end of the trial. (12 Q8) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 102:** Keep the free guest stories (2 stories / 30 minutes). (12 Q9) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 132:** **Screen-reader access, web and native.** Decided: every listener screen on the web and in the future iPhone, Android, CarPlay and Android Auto apps works with VoiceOver and TalkBack: every button, link and field has a spoken name; reading order follows the screen; text grows with the phone's text-size setting; text contrast is at least 4.5:1 (3:1 for large text); tap targets are at least 44 pixels. Buttons keep white text (rule 69) on darker shades (orange #c2410c, green #15803d). The native apps build this in from the first screen and are not released until they pass. **[MARC DOES]** Marc or a blind tester runs the core path (sign up, trial, pay, browse, pick, play, pause, skip, next episode) with VoiceOver on a real phone before any release or outreach to blind or low-vision listeners. — **Agreed** (Marc, Nov 10, 2026, CANON-99 item 132)

## Conflicts found
- C1. **[RESOLVED by decision 52, Marc Nov 9, 2026]** Prices. Code and Oct–Nov chats: $9.99/month, $79.99/year (lib/pricing.ts, Sep 19). Older: $7.99/$59.99 "confirmed by Marc 2026-06-05" (app/api/admin/org-status/route.ts) and memory /areas/endless-tales-platform.md; app/api/admin/launch-report/route.ts still computes revenue at $7.99/$59.99. Recommendation: $9.99/$79.99 wins (newer); fix the report. Marc decides.
- C2. **[RESOLVED by decision 52, Marc Nov 9, 2026]** Card at trial start. Oct 2026: card required (chat "CAC for self-funding"; /go copy says "Card required"). Code still runs no-card trials (/listen and /go invitation sign-ups, app/api/listen/signup, app/api/go/invite-signup) and the Oct 5 "card wall after Episode 2" for them. All 49 trials to Nov 5 were no-card. Recommendation: card required for all ad traffic; keep no-card only for referral invitations, or retire it. Marc decides.
- C3. **[RESOLVED by decision 52, Marc Nov 9, 2026]** Trial length. Memory (older): "7-day no-card free trial". Code and Oct–Nov: 14 days everywhere. Recommendation: 14 days wins. Marc decides.
- C4. **[RESOLVED by decision 53, Marc Nov 9, 2026]** Credits. The review route still awards "review credits", and mockups/MASTER-UI-BIBLE.md, FLAG_RULES.md and DTT-LAUNCH-PLAN.md describe a credits/"Owned" model. The app is subscription-only. Recommendation: retire credits everywhere. Marc decides.
- C5. **[RESOLVED by decision 54, Marc Nov 9, 2026]** Button size. Card buttons were set to 38 pixels (CARD-COMPACT-001, Marc Nov 6). The 44-pixel rule (PLAYER-RULES, Nov 9) covers the player only. Recommendation: 44 pixels app-wide (newer, and Marc's own readability need). Marc decides.
- C6. **[RESOLVED by decision 8, Marc Nov 9, 2026]** Card description. Marc Nov 5: fills two lines, never a third. Code: cut at 70 characters (LibraryStoryCard.tsx). Recommendation: Marc's two-line rule wins. Marc decides.
- C7. **[RESOLVED by decision 54, Marc Nov 9, 2026]** Company name. Terms, Privacy and License say "operated by Wonder Books Press". The subscriber company is Endless Tales, LLC (D-U-N-S legal name, Nov 5). Recommendation: Endless Tales, LLC; confirm with legal. Marc decides.
- C8. **[RESOLVED by decision 53, Marc Nov 9, 2026]** Founding Member retired (Marc Jul 10) but app/api/webhook/route.ts still labels "$29.99/year" Founding Member, and Admin org-status still lists it. Recommendation: remove. Marc decides.
- C9. **[RESOLVED by decision 99, Marc Nov 9, 2026]** Landing fallback. Rule 57 says each ad lands on its own story. lib/landing.ts silently serves the default story for any unknown code. Recommendation: show an error instead (rule 59). Marc decides.

## Open questions for Marc
- Q1. **[RESOLVED by decision 50, Marc Nov 9, 2026]** What is a playlist? Suggested answer: the listener's own "Add to Playlist" list (as built), saved to their account so it follows them; no genre queue for now.
- Q2. **[RESOLVED by decision 50, Marc Nov 9, 2026]** Should each listener keep their playlist after it finishes, or does it empty as it plays (today finished items drop off)? Suggested answer: drop finished items, as now.
- Q3. **[RESOLVED by decision 51, Marc Nov 9, 2026]** After a trial ends, what may a non-paying listener still hear? Suggested answer: Episode 1 of every series, free forever (your earlier rule), and 60 seconds of a standalone.
- Q4. **[RESOLVED by decision 52, Marc Nov 9, 2026]** Refunds: keep "no refunds except where law requires", or allow a refund within 7 days of the first charge? Suggested answer: one refund within 7 days of the first charge, to limit card disputes.
- Q5. **[RESOLVED by decision 51, Marc Nov 9, 2026]** Can the paywall ever stop audio mid-story? Suggested answer: no; the wall shows when the next story starts.
- Q6. **[RESOLVED by decision 100, Marc Nov 9, 2026]** Custom stories (a listener orders a story made for them): offer it, and at what price? Suggested answer: not until after the Meta test.
- Q7. **[RESOLVED by decision 55, Marc Nov 9, 2026]** What should the Settings page keep? Suggested answer: only working items (account, Travel Insights, eBook text size); remove the rest until built.
- Q8. **[RESOLVED by decision 101, Marc Nov 9, 2026]** Annual plan push: offer annual at the end of the trial? Suggested answer: yes, it is the main money lever (Bart, Nov 3).
- Q9. **[RESOLVED by decision 102, Marc Nov 9, 2026]** Should guests get any free story without signing up, now that ads land on /go samples? Suggested answer: keep the free guest stories, same 2-story / 30-minute limit.

## Enforcement status
- Rules 1, 2, 4, 5, 9–12, 15, 17–20, 22–24, 27, 29, 30, 32, 34, 36, 38, 41–44, 48, 52–55, 57, 60–67, 74–76: enforced in code.
- Rule 3: enforced (POST-SIGNUP-RETURN-001); re-check on phone.
- Rule 6: enforced in checkout; NOT in Admin launch report ($7.99/$59.99).
- Rule 8: not enforced (no-card trial paths still live; see C2).
- Rule 25: built in PR #493; confirm merged and checked on phone.
- Rule 31: not enforced (70-character cut).
- Rule 33: enforced for standalone stories; NOT for series (app/library/page.tsx getCardState never marks a series completed or reviewed).
- Rule 35: enforced by publish gates; check the Library query also hides partial series.
- Rule 37: not built.
- Rule 39: not enforced (review route awards credits).
- Rules 45, 47, 49, 50, 56, 59, 68, 70–72, 77: not built (Proposed).
- Rule 69: often broken: grey text in app/account/page.tsx (text-gray-400), Settings, card and playlist labels (#cbd5e1), offline player (#94a3b8).

## Sources reviewed
- /tmp/dtt/lib/pricing.ts, lib/landing.ts, lib/subscription.ts, lib/promo.ts, lib/referral*.ts, lib/playlistState.ts, lib/offline/*, lib/signupName.ts, lib/emails/unsubscribe.ts
- /tmp/dtt/app/: checkout, webhook, user/cancel-subscription, reviews/submit, cron/trial-emails, go/*, guest, subscribe, signup, account/*, library, series, terms, privacy, admin/org-status (pricing history), admin/launch-report
- /tmp/dtt/components/LibraryStoryCard.tsx, PersistentPlayer.tsx, AppHeader.tsx, AppShell.tsx, CanonicalPlayer.tsx (paywall)
- /tmp/dtt/DTT-LAUNCH-PLAN.md, DTT-COMPLETION-PLAN.md (placeholder only), mockups/MASTER-UI-BIBLE.md, docs/ADMIN-COMMAND-CENTER-SPEC.md, MASTER_RULES.md, FLAG_RULES.md, AGENTS.md, docs/specs/amendment-1-ad-preview-and-testing-spec.md
- Memory: /areas/endless-tales-platform.md, /profile.md; /projects/01a177ad-…/areas/endless-tales-platform.md, business-model.md, bell-meta-marketing.md, story-pipeline.md, hook-series.md, meta-campaign-approval.md; /home/claude/todo-list.md
- Chats: "CAC for self-funding", "Meta ad test plan", "Pocket FM, Pine Dramas, Drama Box pricing", "Cover story map pattern" (Nov 6–8), "Gemini sound replacement loop" (Nov 5), "Apple App Store commission deals" (Nov 5), "Meta campaign testing plan"
- Not accessible: Claude project docs via Projects tool (not available in this session).

## Replaces (once approved)
- mockups/MASTER-UI-BIBLE.md (Jan 2026, credit-era "Drive Time Tales" UI)
- FLAG_RULES.md (Jan 2026; "Owned"/"Reserved" flags from the credit model)
- DTT-LAUNCH-PLAN.md and DTT-COMPLETION-PLAN.md (Jan 2026 page plans)
- Listener-app parts of MASTER_RULES.md (design system section)
- Old pricing notes: $7.99/$59.99, Founding Member $2.99/$29.99, 7-day trial
