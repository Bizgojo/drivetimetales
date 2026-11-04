# Review Request — Trial Emails Nov09 (Atlas → fresh reviewer)

Branch: `feat/atlas-trial-emails-nov09` (based on origin/main, static HTML only)
Commission: campaign-6plus2-nov09-20261104

## What to review
1. `retention-nov09/hour1-welcome.html` — hour-1 in-trial welcome
2. `retention-nov09/day1-install.html` — day-1 install + re-engagement
3. `retention-nov09/day10-billing-reminder.html` — day-10 billing reminder ($7.99/mo, cancel-anytime)
4. `retention-nov09/README.md` — manifest

## Review checklist
- [ ] Copy correct: no typos, pricing $7.99/mo consistent, cancel-anytime stated
- [ ] All CTAs point to https://app.endless-tales.com/home
- [ ] `{{unsubscribe_url}}` placeholder present in all 3 footers
- [ ] No hardcoded personal names, no credentials, no tracking pixels beyond existing patterns
- [ ] HTML renders (open in browser); mobile viewport meta present
- [ ] Diff scoped to `retention-nov09/` only — no other files touched

## Reviewer signoff (fill in)
- Reviewer: ______________ (must not be Atlas/branch author)
- Verdict: APPROVE / APPROVE-WITH-NOTES / REJECT
- Notes:
- Date:

## Authority
Reviewer may APPROVE the branch. Reviewer may NOT merge or deploy.
Merge requires Marc explicit merge word only. DO NOT MERGE on approval alone.
