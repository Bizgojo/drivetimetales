# Trial Emails — Nov 9 Launch (Atlas branch)

Commission: campaign-6plus2-nov09-20261104 = marc-7point-nov09-launch (Marc, 2026-11-04)
Branch: `feat/atlas-trial-emails-nov09` — NO MERGE without Marc explicit merge word.

## Files (3 emails)
| Send time | File | Purpose | Live-before |
|---|---|---|---|
| Trial + ~1h | `hour1-welcome.html` | Welcome, press play, trial includes | Nov 9 launch |
| Trial + day 1 | `day1-install.html` | Home-screen install + re-engage | Nov 9 launch |
| Trial + day 10 | `day10-billing-reminder.html` | Trial ending, $7.99/mo continues, cancel-anytime | Nov 18 |

Style matches existing `retention-001/` templates (dark card, orange CTA, install block).
Placeholders: `{{unsubscribe_url}}` must be wired by whoever enables sending. No hardcoded names.

## Reviewer
Fresh reviewer required (not Atlas/self). Reviewer report: see `REVIEW-REQUEST.md`.
Status: **AWAITING FRESH REVIEW — NOT MERGED.**

## Gates
- Zero production writes, $0 spend. This branch adds static HTML only.
- hour1 + day1 must be live before Nov 9 launch; day10 by Nov 18.
