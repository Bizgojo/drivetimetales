# DTT LAUNCH PLAN
## Complete Roadmap to Public Launch
**Created:** January 26, 2026

---

## ALL PAGES INVENTORY

### PUBLIC PAGES (User-Facing)

| Page | Route | Status | Priority | Notes |
|------|-------|--------|----------|-------|
| Home | `/` | ❓ Needs Test | P1 | Main landing |
| Welcome | `/welcome` | ❓ Needs Test | P1 | Logged-out home |
| Welcome Library | `/welcome-library` | ❓ Needs Test | P2 | Preview library |
| Library | `/library` | ✅ Working | P1 | Main story browser |
| My Library | `/my-library` | ❓ Needs Test | P1 | Owned stories |
| Story Detail | `/story/[id]` | ❓ Needs Test | P1 | Story description |
| Player | `/player/[id]` | ✅ Working | P1 | Story player |
| Player Play | `/player/[id]/play` | ❓ Needs Test | P1 | Playback page |
| Player Preview | `/player/[id]/preview` | ✅ Working | P1 | Preview with FREE Today |
| Series | `/series/[id]` | ❓ Needs Test | P2 | Series detail |
| Search | `/search` | ❓ Needs Test | P2 | Story search |
| Wishlist | `/wishlist` | ❓ Needs Test | P2 | Saved stories |
| Pricing | `/pricing` | ✅ Working | P1 | Subscriptions + Packs |
| Subscribe | `/subscribe` | ❓ Needs Test | P2 | May be duplicate |
| Purchase Success | `/purchase-success` | ❓ Needs Test | P1 | Post-purchase |
| News | `/news/[category]` | ❓ Needs Test | P3 | News briefings |

### AUTH PAGES

| Page | Route | Status | Priority |
|------|-------|--------|----------|
| Sign In | `/signin` | ❓ Needs Test | P1 |
| Sign Up | `/signup` | ❓ Needs Test | P1 |
| Signed Out | `/signed-out` | ❓ Needs Test | P2 |
| Reset Password | `/reset-password` | ❓ Needs Test | P2 |
| Register Promo | `/register/promo` | ❓ Needs Test | P3 |

### ACCOUNT PAGES

| Page | Route | Status | Priority |
|------|-------|--------|----------|
| Account | `/account` | ❓ Needs Test | P2 |
| Account Billing | `/account/billing` | ❓ Needs Test | P2 |
| Account Downloads | `/account/downloads` | ❓ Needs Test | P2 |
| Account Help | `/account/help` | ❓ Needs Test | P3 |
| Account History | `/account/history` | ❓ Needs Test | P2 |
| Account Settings | `/account/settings` | ❓ Needs Test | P2 |
| Settings | `/settings` | ❓ Needs Test | P2 |

### REFERRAL PAGES

| Page | Route | Status | Priority |
|------|-------|--------|----------|
| Refer | `/refer` | ✅ Working | P2 |
| Refer Dashboard | `/refer/dashboard` | ✅ Working | P2 |
| Refer Leaderboard | `/refer/leaderboard` | ✅ Working | P2 |
| Referral (old?) | `/referral` | ❓ Check | P3 |

### ADMIN PAGES

| Page | Route | Status | Priority |
|------|-------|--------|----------|
| Admin Dashboard | `/admin` | ❓ Needs Test | P2 |
| Admin Stories | `/admin/stories` | ✅ Working (v4) | P1 |
| Admin Users | `/admin/users` | ❓ Needs Test | P2 |
| Admin Referrals | `/admin/referrals` | ✅ Working | P2 |
| Admin Analytics | `/admin/analytics` | ✅ New | P2 |
| Admin Marketing | `/admin/marketing` | ✅ New | P3 |
| Admin Finance | `/admin/finance` | ❓ Needs Test | P2 |
| Admin Subscriptions | `/admin/subscriptions` | ❌ Missing | P2 |

---

## PHASE 1: AUDIT & CRITICAL FIXES (Days 1-3)

### Day 1: Test Core User Journey
Test these pages in order (the main user flow):

```
1. /welcome → Can browse as guest?
2. /signin → Can sign in?
3. /signup → Can create account?
4. / (home) → Shows welcome, credits, continue listening?
5. /library → Can browse stories?
6. /story/[id] → Shows story details?
7. /player/[id]/preview → Can preview?
8. /player/[id]/play → Can play (with credits)?
9. /pricing → Can see plans?
10. /purchase-success → Shows after purchase?
```

**Document every issue found.**

### Day 2: Test Secondary Flows
```
1. /wishlist → Add/remove stories?
2. /my-library → Shows owned stories?
3. /search → Can search stories?
4. /series/[id] → Shows series episodes?
5. /account → All subpages work?
6. /settings → Can update preferences?
7. /refer → Social sharing works?
```

### Day 3: Fix Critical Bugs
- Fix any P1 issues found in Days 1-2
- Tag working versions

---

## PHASE 2: COMPLETE CORE PAGES (Days 4-7)

### Day 4: Home Page (`/`)
- [ ] Welcome message with user name
- [ ] Credit balance display
- [ ] Continue Listening section
- [ ] New Releases section
- [ ] Recommended For You
- [ ] Navigation to Library/Wishlist

### Day 5: Story Detail (`/story/[id]`)
- [ ] Full story description
- [ ] Cover image
- [ ] Duration, genre, author
- [ ] Credit cost
- [ ] Play/Preview buttons
- [ ] Add to Wishlist button
- [ ] Series info (if applicable)
- [ ] Related stories

### Day 6: My Library (`/my-library`)
- [ ] Shows owned/purchased stories
- [ ] Shows listening history
- [ ] Continue where left off
- [ ] Download button (for MP3)
- [ ] Filter/sort options

### Day 7: Wishlist (`/wishlist`)
- [ ] Shows saved stories
- [ ] Remove from wishlist
- [ ] Play/purchase from wishlist
- [ ] Sort by date added

---

## PHASE 3: SERIES & SEARCH (Days 8-9)

### Day 8: Series Page (`/series/[id]`)
- [ ] Series title and description
- [ ] All episodes in order
- [ ] Progress tracking per episode
- [ ] "Next Episode" button
- [ ] Binge mode option

### Day 9: Search (`/search`)
- [ ] Search by title
- [ ] Search by author
- [ ] Filter by genre
- [ ] Filter by duration
- [ ] Sort results

---

## PHASE 4: ACCOUNT & SETTINGS (Days 10-11)

### Day 10: Account Pages
- [ ] `/account` - Overview
- [ ] `/account/billing` - Subscription management
- [ ] `/account/history` - Listening history
- [ ] `/account/downloads` - Downloaded stories

### Day 11: Settings
- [ ] `/settings` or `/account/settings`
- [ ] Avatar upload
- [ ] Display name change
- [ ] Email preferences
- [ ] Notification settings
- [ ] Delete account option

---

## PHASE 5: ADMIN COMPLETION (Days 12-13)

### Day 12: Admin Subscriptions
- [ ] Create `/admin/subscriptions` page
- [ ] Subscription stats by tier
- [ ] Freedom Pack sales
- [ ] A/B testing (from subscription_offers table)
- [ ] Revenue charts

### Day 13: Admin Polish
- [ ] Test all admin pages
- [ ] `/admin/users` - User management
- [ ] `/admin/finance` - Revenue reports
- [ ] Export functionality

---

## PHASE 6: MP3 DOWNLOADS (Days 14-16)

### Day 14: Database & API
- [ ] Create `user_downloads` table
- [ ] API route: `/api/download/[storyId]`
- [ ] Generate secure download tokens
- [ ] Track download history

### Day 15: UI Implementation
- [ ] Download button on owned stories
- [ ] Download progress indicator
- [ ] `/account/downloads` page
- [ ] Re-download option

### Day 16: Testing
- [ ] Test download flow
- [ ] Test on mobile
- [ ] Test large files
- [ ] Error handling

---

## PHASE 7: POLISH & LAUNCH (Days 17-20)

### Day 17: Mobile Responsiveness
- [ ] Test all pages on mobile
- [ ] Fix any layout issues
- [ ] Test touch interactions
- [ ] Test player controls on mobile

### Day 18: Error Handling
- [ ] 404 page
- [ ] Error boundaries
- [ ] Loading states
- [ ] Empty states (no stories, etc.)

### Day 19: Performance
- [ ] Image optimization
- [ ] Lazy loading
- [ ] Bundle size check
- [ ] Core Web Vitals

### Day 20: Final QA & Launch Prep
- [ ] Full user journey test
- [ ] Payment flow test (real card)
- [ ] Email notifications test
- [ ] Create launch checklist
- [ ] Tag all working versions
- [ ] Backup database

---

## LAUNCH CHECKLIST

### Technical
- [ ] All pages tested and working
- [ ] Stripe in production mode
- [ ] Supabase in production mode
- [ ] Custom domain configured
- [ ] SSL certificate active
- [ ] Error tracking enabled
- [ ] Analytics enabled

### Content
- [ ] Minimum 20 stories uploaded
- [ ] All cover images uploaded
- [ ] Story descriptions written
- [ ] Pricing finalized
- [ ] Terms of Service page
- [ ] Privacy Policy page
- [ ] About page complete

### Marketing
- [ ] Social media accounts created
- [ ] Buffer connected
- [ ] Launch posts scheduled
- [ ] Email list ready
- [ ] Press release drafted

### Operations
- [ ] Support email configured
- [ ] FAQ written
- [ ] Admin team trained
- [ ] Backup schedule set
- [ ] Monitoring alerts configured

---

## PAGES TO POTENTIALLY REMOVE/CONSOLIDATE

| Page | Issue | Action |
|------|-------|--------|
| `/subscribe` | Duplicate of `/pricing`? | Check and consolidate |
| `/referral` | Old version of `/refer`? | Check and remove |
| `/welcome-library` | Different from `/library`? | Check purpose |
| `/settings` vs `/account/settings` | Duplicate? | Consolidate |

---

## GIT TAGS TO CREATE

After each phase:
```
working-phase1-audit-2026-01-XX
working-phase2-core-pages-2026-01-XX
working-phase3-series-search-2026-01-XX
working-phase4-account-2026-01-XX
working-phase5-admin-2026-01-XX
working-phase6-downloads-2026-01-XX
working-phase7-launch-ready-2026-01-XX
```

---

## ESTIMATED TIMELINE

| Phase | Days | Focus |
|-------|------|-------|
| 1 | 1-3 | Audit & Critical Fixes |
| 2 | 4-7 | Core Pages |
| 3 | 8-9 | Series & Search |
| 4 | 10-11 | Account & Settings |
| 5 | 12-13 | Admin Completion |
| 6 | 14-16 | MP3 Downloads |
| 7 | 17-20 | Polish & Launch |

**Total: 20 working days (~4 weeks)**

---

## QUICK START: BEGIN AUDIT

To start Phase 1, test each page:

```bash
# Open in browser and test
open https://drivetimetales.vercel.app/welcome
open https://drivetimetales.vercel.app/signin
open https://drivetimetales.vercel.app/signup
open https://drivetimetales.vercel.app/
open https://drivetimetales.vercel.app/library
```

Document issues in a new file:
```bash
touch ~/Projects/drivetimetales/AUDIT-ISSUES.md
```

---

*Last Updated: January 26, 2026*
