# 🚛🚗 DriveTimeTales - Complete Integration Package v3

Full-featured audio story platform for drivers with payments, series support, reviews, and offline downloads.

## ✨ What's Included

### Frontend
- **7 UI Components**: Logo, Header, StoryCard, Modal, DurationFilter, CreditStatus, Reviews
- **17 Pages**: Landing, Library, Browse, Search, Pricing, About, Collection, Wishlist, Account, Billing, Settings, Downloads, Series Detail, Player, Login, Signup

### Backend
- **Supabase Integration**: Full database with typed queries
- **Stripe Payments**: Subscriptions + Credit Packs + Webhooks
- **Authentication**: Complete auth flow with Supabase Auth
- **Real Audio Player**: Progress tracking, speed control, sample previews
- **Reviews System**: User ratings and reviews
- **Wishlist API**: Save stories for later
- **Series Support**: Multi-episode series with progress tracking
- **Downloads**: Offline story management

## 📦 Package Structure

```
drivetimetales/
├── app/
│   ├── page.tsx              # Landing page
│   ├── library/              # Story library
│   ├── browse/               # Browse categories
│   ├── search/               # Search page
│   ├── pricing/              # Pricing with Stripe
│   ├── about/                # About + FAQ
│   ├── collection/           # User's stories
│   ├── wishlist/             # Saved stories
│   ├── series/[id]/          # Series detail
│   ├── player/[id]/          # Audio player
│   ├── auth/                 # Login & Signup
│   ├── account/
│   │   ├── page.tsx          # Account dashboard
│   │   ├── billing/          # Credits & subscription
│   │   ├── settings/         # User preferences
│   │   └── downloads/        # Offline stories
│   └── api/
│       ├── checkout/         # Stripe checkout
│       ├── webhooks/stripe/  # Payment webhooks
│       ├── stories/          # Stories API
│       ├── reviews/          # Reviews CRUD
│       ├── wishlist/         # Wishlist CRUD
│       └── user/             # User & purchase APIs
├── components/ui/            # Reusable components
├── contexts/                 # Auth context
├── hooks/                    # Custom hooks
├── lib/                      # Supabase & Stripe clients
└── supabase-schema-v3.sql    # Database schema
```

## 🚀 Quick Setup

### 1. Environment Variables
```bash
cp .env.example .env.local
# Fill in Supabase, Stripe, and R2 credentials
```

### 2. Database
Run `supabase-schema-v3.sql` in Supabase SQL Editor

### 3. Stripe Products
Create in Stripe Dashboard:
- **Subscriptions**: Test Driver ($2.99), Commuter ($7.99), Road Warrior ($14.99)
- **Credit Packs**: Small (10/$4.99), Medium (25/$9.99), Large (60/$19.99)

### 4. Deploy
```bash
npm install @supabase/supabase-js stripe
npm run dev  # Test locally
git push     # Deploy to Vercel
```

## 🎨 Design System

| Element | Value |
|---------|-------|
| Primary | Orange-500 (#f97316) |
| Background | Gray-950 (#030712) |
| Cards | Gray-900 (#111827) |
| Min Width | 375px |

## 📱 Features

### 💳 Payments
- Stripe Checkout for subscriptions & one-time purchases
- Automatic credit allocation on payment
- Subscription management (upgrade/cancel)
- Purchase history

### 🎧 Audio Player
- Sample mode for non-owners
- Progress auto-save every 10 seconds
- Speed control (0.5x - 2x)
- Skip forward/backward
- Buffer indicator

### 📺 Series
- Multi-episode series support
- Episode progress tracking
- Automatic episode numbering
- Series completion status

### ⭐ Reviews
- 5-star ratings
- Written reviews
- Average rating calculation
- Review management

### 📥 Downloads
- Offline story storage
- Storage usage tracking
- Download management

### ♡ Wishlist
- Save stories for later
- Quick add/remove
- Sync across devices

## 🔧 API Routes

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/stories` | GET | List stories |
| `/api/checkout` | POST | Create Stripe session |
| `/api/webhooks/stripe` | POST | Handle payments |
| `/api/user` | GET, PATCH | User profile |
| `/api/user/purchase` | POST | Buy story |
| `/api/user/cancel-subscription` | POST | Cancel sub |
| `/api/reviews` | GET, POST, DELETE | Reviews |
| `/api/wishlist` | GET, POST, DELETE | Wishlist |

## 📋 Deployment Checklist

- [ ] Set environment variables in Vercel
- [ ] Run database schema in Supabase
- [ ] Create Stripe products & webhooks
- [ ] Test checkout flow (test mode)
- [ ] Switch to live Stripe keys
- [ ] Configure R2 for audio storage
- [ ] Set up Stripe webhook endpoint

---

Built with ❤️ for truckers and commuters everywhere.
