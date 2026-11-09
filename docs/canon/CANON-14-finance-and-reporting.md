# CANON-14 — Finance & Reporting
Status: DRAFT for Marc's approval · Nov 9, 2026 · Owner: Marc
Covers: the Admin → Finance statement (revenue, expenses, plow back, cost per episode, LTV, Mercury reconciliation, profit suggestions, overview tiles); expense categories; Mercury cards; spending limits. Does not cover: ad approval, CAC test rules and ad creative (CANON-13 Marketing & Ads); agent roles and AI-credit alerts (CANON-15 Agents & Operations); story production (PIPELINE-CANON).

## Where Marc decides

Every rule in this document that needs Marc. **[MARC DECIDES]** = Marc approves, chooses or gives his OK. **[MARC DOES]** = something only Marc does himself (tests on his phone, listens, enters a key). The same tag marks each rule below.

- **Rule 52 [MARC DECIDES]:** Susan may use the marketing card only with Marc's approval.
- **Rule 59 [MARC DECIDES]:** No automatic profit transfers. Any transfer needs Marc's explicit word.
- **Decision 125 [MARC DECIDES]:** What Marc reinvests from Part B (money outside operations), and when, is his choice.
- **Still open:** nothing. Every conflict and question below is RESOLVED (CANON-99 Parts 1 and 2, Nov 9, 2026).

## Rules

### A. The statement page
1. The financial statement lives in Admin → Finance → Statement and follows Marc's own template (SS1). — **Agreed** (Nov 8, memory admin-finance-page.md)
2. It has a Cash flow / Accrual selector. Cash counts money on the day it moved in Mercury. Accrual spreads money over the time it pays for. — **Agreed** (Nov 8, memory admin-finance-page.md; lib/finance/statement.ts)
3. It has a period selector: 24 hours, 7 days, 30 days, custom, and actual monthly (one column per month of operation). — **Agreed** (Nov 8, memory admin-finance-page.md)
4. Monthly history starts April 2026, the first Mercury month. Mercury history is copied into the app database. — **Agreed** (Nov 8, memory admin-finance-page.md)
5. Every expense category has its own subtotal. — **Agreed** (Nov 8, memory admin-finance-page.md)
6. Expense sections are: Operating, Production, Ad Spend, Marketing Services, R & D, plus Uncategorized. — **Agreed** (Nov 8: Ad Spend separate from Marketing Services, memory admin-finance-page.md; lib/finance/statement.ts)
7. Ad Spend has a drop-down that shows each campaign's cost, dates, trials, subscriptions and CAC. — **Agreed** (Nov 8, memory admin-finance-page.md; code lib/finance/statement.ts campaigns)
8. Stories published are shown apart from stories in the pipeline. A story counts as published only when all its episodes are live; partly published stories are flagged. — **Agreed** (Nov 8, memory admin-finance-page.md; commit a0d297d)
9. Clicking "Stories published" lists the titles with their episode counts. Clicking "Production cost per episode" lists each AI or service and what Marc paid it. — **Agreed** (Nov 8, memory admin-finance-page.md)
10. Clickable numbers, links and buttons are dark navy #002266, in light and dark mode. No light blue anywhere. — **In force (code)** (app/admin/finance/statement/page.tsx; commits ff58e8c, 2da8d81)
11. A missing number shows "Unavailable", never $0. — **In force (code)** (app/admin/command-ui.tsx; CommandCenter banner "Unavailable never means zero")

### B. Revenue
12. All subscription money goes on two lines only: Annual subs and Monthly subs. There is no separate "Stripe payouts" revenue line. — **Agreed** (Nov 8, memory admin-finance-page.md)
13. Subscription revenue comes from the Stripe ledger: every charge, refund and fee. — **Agreed** (Nov 8 finance session; commit 51fd5a2; lib/finance/stripe-sync.ts)
14. Stripe payouts into Mercury are transfers, not revenue. They show below the statement only to reconcile. — **In force (code)** (lib/finance/statement.ts)
15. Marc's own test-account payments were real money, so they count as revenue. — **Agreed** (Nov 8, memory admin-finance-page.md)
16. Refunds and disputes are negative, on their own line. On accrual they spread like the charge they reverse. — **Agreed** (refunds net, memory admin-finance-page.md); spreading **In force (code)** (lib/finance/statement.ts)
17. Total revenue is net: subscriptions minus cancellations and refunds, plus interest income. — **Agreed** (Nov 8, memory admin-finance-page.md)
18. Interest income is Mercury bank interest only. — **Agreed** (Nov 8, memory admin-finance-page.md)
19. Card cashback rewards get their own revenue line. — **Agreed** (Nov 8 finance session; commit 51fd5a2, lib/finance/statement.ts CASHBACK_ITEM)
20. "Other (not yet categorized)" holds incoming money with no rule yet, so it can be spotted and classified. Incoming money is never assumed to be revenue. — **Agreed** (Nov 8, memory admin-finance-page.md; lib/finance/statement.ts)
21. On accrual, an annual charge spreads over 12 months and a monthly charge over 1 month. — **In force (code)** (lib/finance/statement.ts)
22. Owner deposits, loans, card payments and moves between Mercury accounts are not revenue or expense. — **In force (code)** (lib/finance/statement.ts notes; app/admin/CommandCenter.tsx)
23. Stripe fees are an Operating expense. — **In force (code)** (commit 51fd5a2)

### C. Plow back (money for ads)
24. Plow back = 75% of the previous calendar month's profit (positive cash flow). If that month lost money, plow back is $0. — **Agreed** (Nov 8, memory admin-finance-page.md; lib/finance/statement.ts "Marc, Nov 8 2026, revised")
25. Plow back is shown as a memo line, "Available for ads." It is never revenue and never added to totals. — **Agreed** (same source)
26. The current month shows the full plow back from day one (not spread by days). — **In force (code)** (lib/finance/statement.ts; commit 10e3e0c)
27. The other 25% of profit stays in the business. No money moves automatically. — **Proposed** (code shows "retained" = 25% but no rule says what it is for; profit transfers are locked in code)

### D. Production cost
28. Production cost per episode sits in the Volume & Productivity section. — **Agreed** (Nov 8, memory admin-finance-page.md)
29. Cost is per FINISHED episode: voiced, published or not. Finished but unreleased episodes carry their own cost. — **Agreed** (Nov 8, memory admin-finance-page.md; commit d5f1095)
30. ElevenLabs is a subscription, but each story's voice cost comes from the credits that story used × the plan price per credit. — **Agreed** (Nov 8, memory admin-finance-page.md)
31. The ElevenLabs plan price is entered by hand ($330 a month) and beats the "next invoice" amount. — **In force (code)** (lib/finance/elevenlabs-sync.ts, commit 1f63aeb); the $330 value comes from the coordinator brief and sits in the database, not the repo.
32. Sound Ideas ($1,500 a year) is charged as $125 a month ÷ that month's finished episodes. — **Agreed** (Nov 8, memory admin-finance-page.md)
33. Other yearly purchases also spread over their term in cost per episode, on both bases. — **In force (code)** (commit a0d297d)
34. Prepaid AI credits (Anthropic, OpenAI, DeepSeek, Google) count when bought, on both bases, until usage feeds exist. — **In force (code)** (lib/finance/statement.ts notes)

### E. LTV and other measures
35. LTV is a measure, not an expense. It stays blank ("Unavailable") until there is a real CAC and real churn. No assumed figures. — **Agreed** (Nov 8, memory admin-finance-page.md)
36. LTV = average monthly revenue per real subscriber ÷ monthly churn (real cancellations over the last 3 months). — **In force (code)** (lib/finance/statement.ts; commit 6dce632)
37. Test accounts never count in subscriber numbers, churn, LTV or CAC (they do count as revenue, rule 15). — **In force (code)** (lib/finance/statement.ts)
38. Admin overview tiles: LTV comes right after churn, and LTV : CAC sits beside it. Both show only when real. — **In force (code)** (commits caf35d7, 1c5d621)

### F. Matching the bank
39. The statement must match Mercury to the cent. The "Unexplained" line must be $0.00. — **Agreed** (Nov 8: reconcile with Mercury, memory admin-finance-page.md); $0.00 check **In force (code)** (lib/finance/statement.ts recon)
40. Reconciliation lists every Mercury dollar by kind (owner money, Stripe payouts, cashback, interest, uncategorized, refunds, expenses, owner withdrawals, internal moves) and the costs paid outside Mercury. — **In force (code)** (commit ad4a71c)
41. Bart reconciles the books each month and reports anything in "Other" or "Unexplained." — **Proposed** (Bart is the finance agent, memory agent-fleet.md, but no task is set)

### G. Profit suggestions
42. Claude suggests ways to raise profit without lowering story quality: never cheaper or fewer voices, a weaker script model, shorter episodes, fewer checks or less sound design. — **Agreed** (Nov 8, memory admin-finance-page.md; lib/finance/suggestions.ts)
43. Each month Claude gives 5–7 suggestions, each tied to numbers on the statement, with a dollar estimate or what to measure. — **In force (code)** (lib/finance/suggestions.ts)
44. Each suggestion has Up, Down and Delete buttons. These can reorder or remove, never add new text. — **In force (code)** (commit 709a1a8)

### H. Spending categories and cards
45. All spending falls in four groups: Story Production, Marketing, Operating Expenses, R&D. — **Agreed** (Nov 2, memory business-expenses.md, business-spending.md)
46. Story Production: pipeline AI (Anthropic API for story writing, OpenAI for covers, DeepSeek R1 and V3), ElevenLabs, Sound Ideas, Soundsnap, Kie.ai music and similar. — **Agreed** (Nov 2, memory business-expenses.md, business-spending.md)
47. Marketing: Susan, part of Strategos, Meta, later TikTok. Operating: subscriptions like Vercel and Supabase. R&D: Marc's own chats with Claude, ChatGPT and DeepSeek. — **Agreed** (same source; memory admin-finance-page.md)
48. Anthropic use for R&D and for story writing are kept apart. — **Agreed** (Nov 2, memory business-expenses.md)
49. Strategos (DeepSeek R1) is split between Marketing and Story Production. — **Agreed** (Nov 8, memory admin-finance-page.md)
50. Mercury has one virtual card per spending group (4 made Nov 2), replacing one card per service. — **Agreed** (Nov 2, memory business-spending.md, business-banking.md)
51. Marketing gets two cards: one for ad spend only, one for marketing services and tools. — **Agreed** (Nov 8, memory business-spending.md)
52. **[MARC DECIDES]** Susan may use the marketing card only with Marc's approval. — **Agreed** (Nov 2, memory business-expenses.md, endless-tales-finances.md)
53. The $4,000 Meta test money sits in its own Mercury marketing account with a Meta debit card. — **Agreed** (chat "Meta campaign testing plan", Oct 30)
54. Every vendor charge must be billed to the card of its spending group, so the statement can sort it by card. — **Proposed** (card switch still in progress, claude/mercury-card-switch-checklist.md)

### I. Spending limits
55. No new expenses (for example, a cloud server for Orion) until the Meta test proves a CAC of about $30 or less. — **Agreed** (Nov 7, memory business-spending.md)
56. Susan's Claude key for ad copy is capped at $25 a month. — **Agreed** (Nov 8, memory agent-fleet.md)
57. ElevenLabs extra-use (overage) cap is 200,000 credits. — **Agreed** (Nov 5, memory audio-pipeline.md, project copy)
58. No agent holds a tool that can send money. Bart's Mercury access is read-only. — **Agreed** for Bart read-only (memory /areas/endless-tales-platform.md); **Proposed** for all agents (Nov 5 Marc removed Mercury from Orion on Claude's advice)
59. **[MARC DECIDES]** No automatic profit transfers. Any transfer needs Marc's explicit word. — **In force (code)** (app/admin/CommandCenter.tsx: transfer buttons locked)

## Marc's decisions (Nov 9, 2026)

Marc answered CANON-99 on Nov 9, 2026. These decisions are **Agreed** and override any rule above that says otherwise. Each conflict or question below that they settle is marked RESOLVED.

- **Decision 57:** **Plow back.** Marc's decision: the plow-back percentage is a setting that starts at 75%; only Marc changes it, each change is recorded with its date and applies from the next month on. Plow back = that percentage of the previous month's profit ($0 after a loss month), shown as one number ("Available for ads"). The Command Center reads the same setting. The rest stays as reserve. Minimum cash reserve: $5,000 or 90 days of spending, whichever is larger. (13 C8, 14 C3, C4, Q1, Q3) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 58:** **Revenue details.** Decided: Test-account payments count as revenue but not in subscriber counts, churn, LTV or CAC. Sound Ideas cost is 1/12 of what was paid for the current year. Refunds count on the day they leave Mercury. (14 C1, C7, Q6) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 111:** Retire the old LTV numbers and the old $59.99 price everywhere. (14 C2, C6) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 112:** Five spending sections on the statement: Operations, Story Production, Ad Spend, Marketing Services, R&D. **Replaced by decision 125** (Marc, Nov 9, 2026) for how the statement is laid out. (14 C5) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 113:** In a month with no finished episodes, the $125 Sound Ideas charge shows as unassigned production cost. (14 Q2) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 114:** Bart closes each month (reconcile, clear "Other", report) by the 5th of the next month. (14 Q4) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 115:** Show AI agent costs per agent once usage logging exists. (14 Q5) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 125:** **Statement layout.** Part A, profit: (1) Revenue is sales only: monthly and annual subscriptions and one-time purchases, less refunds = net revenue. (2) Cost of revenue: story production (voices, the Claude story pipeline, Gemini screening, OpenAI voice checks and covers, music, sound effects), delivering audio to listeners (the AWS server and Supabase database and storage), and payment fees (Stripe, later Apple and Google). (3) Gross profit and gross margin %. (4) Operating expenses: Ad Spend, Marketing Services, R&D, Operations. (5) Operating profit. Plow back is the plow-back percentage of the previous month's **operating profit**. Part B, money outside operations, never profit and never in plow back: money put in by the owner or investors (one line per person with a running total), owner withdrawals, card cashback, Mercury interest, and money in with no category yet; total = "yours to keep or reinvest". **[MARC DECIDES]** What Marc reinvests from Part B, and when, is his choice. Replaces decision 112's five spending sections and rules 45–47 for how the statement is laid out; the Mercury cards stay as they are. (CANON-99 item 125) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 3)

## Conflicts found
- C1. **[RESOLVED by decision 58, Marc Nov 9, 2026]** Test-account payments. Commit 10e3e0c (Nov 8) put them on a memo line, not revenue. Commit 51fd5a2 (Nov 8, later) and memory say they count. Recommendation: they count as revenue (newer, Marc's words). They stay out of subscriber counts, churn, LTV and CAC. Marc decides.
- C2. **[RESOLVED by decision 111, Marc Nov 9, 2026]** LTV. docs/CODEX_CAMPAIGN_SYSTEM_SPEC.md (May): 7% churn, 6 months, LTV ~$47.94. CAC chat (Nov 2): 10% churn, LTV ~$92. Nov 8: no assumed LTV. Recommendation: Nov 8 wins; retire the old constants. Marc decides.
- C3. **[RESOLVED by decision 57, Marc Nov 9, 2026]** Plow back base. Nov 2 pro forma and Admin Command Center "Marketing target %" (default 75) apply 75% to revenue/Stripe collections (app/admin/CommandCenter.tsx allocation()). Nov 8: 75% of the previous month's profit, $0 after a loss. Recommendation: Nov 8 wins; change the Command Center. Marc decides.
- C4. **[RESOLVED by decision 57, Marc Nov 9, 2026]** Two "plow back" numbers in code. lib/finance/statement.ts shows "Available for ads" from the previous month, but totals.plowBack is 75% of the same column's result. Recommendation: show only "Available for ads". Marc decides.
- C5. **[RESOLVED by decision 112, Marc Nov 9, 2026]** Category count. Nov 2: four groups (memory; Admin evidence ledger uses Operations, Story Production, Marketing, R&D). Nov 8: Marketing split into Ad Spend and Marketing Services, two marketing cards. Recommendation: five statement sections and five cards; the Admin ledger adds the split. Marc decides.
- C6. **[RESOLVED by decision 111, Marc Nov 9, 2026]** Prices in code and docs. lib/finance/statement.ts uses $79.99/year; CODEX spec and Aug memory use $59.99. Recommendation: $79.99 (see CANON-13 C1). Marc decides.
- C7. **[RESOLVED by decision 58, Marc Nov 9, 2026]** Sound Ideas price. Bought for $1,500; it likely renews at $3,000 (todo list, Nov 5). Rule 32 is fixed at $125/month. Recommendation: charge 1/12 of whatever was paid for the current year. Marc decides.

## Open questions for Marc
- Q1. **[RESOLVED by decision 57, Marc Nov 9, 2026]** What happens to the 25% of profit not plowed back? Suggested answer: it stays as cash reserve until you move it by hand.
- Q2. **[RESOLVED by decision 113, Marc Nov 9, 2026]** In a month with no finished episodes, where does the $125 Sound Ideas charge go? Suggested answer: show it as unassigned production cost that month.
- Q3. **[RESOLVED by decision 57, Marc Nov 9, 2026]** Is there a minimum cash reserve? The old Airtable rule was the larger of $5,000 or 90 days of spending. Suggested answer: keep it and show it on the statement.
- Q4. **[RESOLVED by decision 114, Marc Nov 9, 2026]** Should Bart close each month (reconcile, clear "Other", report)? Suggested answer: yes, by the 5th of the next month.
- Q5. **[RESOLVED by decision 115, Marc Nov 9, 2026]** Should the AI agents' DeepSeek, Claude and ChatGPT costs show per agent? Suggested answer: yes, once usage logging exists (todo item 10d).
- Q6. **[RESOLVED by decision 58, Marc Nov 9, 2026]** When does a refund count on cash basis: the day issued or the day it left Mercury? Suggested answer: the day it left Mercury.

## Enforcement status
- Rules 2–9, 12–26, 28–40, 42–44 → enforced in code: lib/finance/statement.ts, lib/finance/load-statement.ts, lib/finance/stripe-sync.ts, lib/finance/mercury-sync.ts, lib/finance/elevenlabs-sync.ts, lib/finance/suggestions.ts, app/admin/finance/statement/page.tsx, app/api/admin/finance/*.
- Rule 10–11 → enforced in UI code.
- Rule 27, 41, 54 → not enforced.
- Rules 45–53, 55–58 → not in code; bank and vendor settings by hand. The Admin evidence ledger still uses four groups (C5).
- Rule 59 → enforced (buttons locked).

## Sources reviewed
- Repo: lib/finance/statement.ts, load-statement.ts, stripe-sync.ts, mercury-sync.ts, elevenlabs-sync.ts, suggestions.ts; app/admin/finance/*; app/admin/CommandCenter.tsx; app/admin/command-ui.tsx; docs/CODEX_CAMPAIGN_SYSTEM_SPEC.md; git log Nov 8 (#526–#539).
- Memory: admin-finance-page.md, business-expenses.md, business-spending.md, endless-tales-finances.md, business-banking.md, business-operations.md, agent-fleet.md, audio-pipeline.md (project copy), /areas/endless-tales-platform.md.
- Past chats: "Meta ads CAC scenario forecast"; "CAC for self-funding"; "Meta campaign testing plan"; "Apple App Store commission deals" (todo list, Nov 5); "Sunset episode 8 artifact" (Nov 7). The Nov 7–8 finance design chat was not found in claude.ai chat search; it appears to be this Claude Code session, so its decisions were taken from memory and commit messages.
- Project docs: not opened directly (Projects tool not available to this auditor).

## Replaces (once approved)
- Memory business-expenses.md, business-spending.md, endless-tales-finances.md, business-banking.md, business-operations.md (five overlapping copies of the same category/card rules) — history.
- docs/CODEX_CAMPAIGN_SYSTEM_SPEC.md §3 and §6 money constants (prices, churn, LTV) — history.
- Project doc claude/mercury-card-switch-checklist.md (once done) — history.
- Admin Command Center "Marketing target %" allocation — replaced by rule 24.
