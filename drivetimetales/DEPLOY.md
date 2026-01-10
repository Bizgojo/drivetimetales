# 🚀 DriveTimeTales Deployment Instructions

## Quick Deploy (3 Steps)

### Step 1: Download & Run Script
```bash
# Download the package and extract it
cd ~/Desktop
unzip dtt-complete-v3.zip
cd drivetimetales

# Make script executable and run it
chmod +x deploy.sh
./deploy.sh
```

### Step 2: Configure Services

After the script runs, you need to set up 3 services:

#### A. Supabase (Database)
1. Go to [supabase.com](https://supabase.com) → New Project
2. Wait for project to initialize (~2 min)
3. Go to **SQL Editor** → paste contents of `supabase-schema.sql` → Run
4. Go to **Settings** → **API** → Copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`

#### B. Stripe (Payments)
1. Go to [dashboard.stripe.com](https://dashboard.stripe.com)
2. Make sure you're in **Test Mode** (toggle in sidebar)
3. Go to **Developers** → **API Keys** → Copy:
   - Secret key → `STRIPE_SECRET_KEY`
4. Create Products (see table below)
5. Copy each Price ID to your `.env.local`

**Products to Create:**

| Product | Price | Type | Env Variable |
|---------|-------|------|--------------|
| Test Driver Monthly | $2.99/mo | Recurring | `STRIPE_PRICE_TEST_DRIVER_MONTHLY` |
| Test Driver Annual | $29.99/yr | Recurring | `STRIPE_PRICE_TEST_DRIVER_ANNUAL` |
| Commuter Monthly | $7.99/mo | Recurring | `STRIPE_PRICE_COMMUTER_MONTHLY` |
| Commuter Annual | $79.99/yr | Recurring | `STRIPE_PRICE_COMMUTER_ANNUAL` |
| Road Warrior Monthly | $14.99/mo | Recurring | `STRIPE_PRICE_ROAD_WARRIOR_MONTHLY` |
| Road Warrior Annual | $149.99/yr | Recurring | `STRIPE_PRICE_ROAD_WARRIOR_ANNUAL` |
| Small Credit Pack | $4.99 | One-time | `STRIPE_PRICE_CREDITS_SMALL` |
| Medium Credit Pack | $9.99 | One-time | `STRIPE_PRICE_CREDITS_MEDIUM` |
| Large Credit Pack | $19.99 | One-time | `STRIPE_PRICE_CREDITS_LARGE` |

#### C. Vercel (Hosting)
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import `Bizgojo/drivetimetales` from GitHub
3. Add Environment Variables (copy from your `.env.local`)
4. Deploy!

### Step 3: Set Up Stripe Webhook

After Vercel deploys (you'll get a URL like `drivetimetales.vercel.app`):

1. Go to Stripe → **Developers** → **Webhooks**
2. Click **Add Endpoint**
3. Endpoint URL: `https://your-domain.vercel.app/api/webhooks/stripe`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
5. Click **Add Endpoint**
6. Copy **Signing Secret** → Add to Vercel as `STRIPE_WEBHOOK_SECRET`
7. Redeploy on Vercel

---

## 🎉 You're Live!

Your app should now be running at your Vercel URL.

### Test the Flow:
1. Visit your site
2. Click "Get Started" 
3. Sign up with email
4. You should have 2 free credits
5. Try listening to a free story
6. Go to Pricing → Subscribe (use Stripe test card: `4242 4242 4242 4242`)

### Stripe Test Cards:
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Requires Auth: `4000 0025 0000 3155`

Use any future date for expiry and any 3 digits for CVC.

---

## Troubleshooting

### "Invalid API Key" errors
- Check that environment variables are set correctly in Vercel
- Make sure there are no extra spaces in the values

### Auth not working
- Check Supabase URL and anon key are correct
- Go to Supabase → Authentication → URL Configuration
- Add your Vercel URL to "Redirect URLs"

### Webhooks not working
- Check the webhook secret is correct
- In Stripe Dashboard, check webhook logs for errors
- Make sure you selected all the required events

### Payments not processing
- Make sure you're using the correct Price IDs
- Check Stripe Dashboard → Logs for errors

---

## Going Live (Production)

When ready for real payments:

1. In Stripe, switch from Test to Live mode
2. Create the same products in Live mode
3. Copy new Live API keys and Price IDs
4. Update Vercel environment variables
5. Create new webhook endpoint for production
6. Redeploy

---

Need help? Check the README.md for more details.
