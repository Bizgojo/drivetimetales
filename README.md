# Drive Time Tales v3.3 - Cloud Integration Setup

## Overview

This version connects Drive Time Tales to:
- **Supabase** - Database for stories, users, analytics
- **Cloudflare R2** - Audio file storage
- **Audio Drama Maker** - Automatic publishing

## Quick Setup

### Step 1: Run Database Schema

1. Go to your Supabase project: https://supabase.com/dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the contents of `supabase-schema.sql` and paste it
5. Click **Run** (or Cmd/Ctrl + Enter)

This creates:
- `stories` table (with 12 sample stories)
- `users` table
- `qr_sources` table (for marketing tracking)
- `play_history` table
- `analytics_events` table
- `promo_messages` table

### Step 2: Enable R2 Public Access

1. Go to Cloudflare Dashboard → R2 → drivetimetales-audio
2. Click **Settings** tab
3. Under **Public Access**, click **Allow Access**
4. Copy the public URL (like `https://pub-xxx.r2.dev`)
5. Update `R2_PUBLIC_URL` in `.env.local`

### Step 3: Install & Run

```bash
cd drivetimetales
npm install
npm run dev
```

Visit http://localhost:3000

## File Structure

```
drivetimetales/
├── .env.local              # Your API keys (don't share!)
├── supabase-schema.sql     # Database setup
├── dtt_publisher.py        # Audio Drama Maker integration
├── lib/
│   ├── supabase.ts         # Supabase client
│   └── r2.ts               # R2 storage utilities
├── app/
│   ├── api/
│   │   ├── stories/        # Stories CRUD API
│   │   ├── upload/         # File upload API
│   │   └── publish/        # Audio Drama Maker publish endpoint
│   └── ...
└── ...
```

## Publishing from Audio Drama Maker

### Option 1: Python Integration

```python
from dtt_publisher import publish_to_dtt

result = publish_to_dtt(
    audio_path="output/my-story.mp3",
    title="The Dark Highway",
    author="Your Name",
    genre="Horror",
    duration_mins=30,
    description="A trucker encounters something strange...",
    sample_path="output/my-story-sample.mp3"
)

if result["success"]:
    print(f"Published! Story ID: {result['story']['id']}")
```

### Option 2: Command Line

```bash
python dtt_publisher.py output/my-story.mp3 \
    --title "The Dark Highway" \
    --author "Your Name" \
    --genre "Horror" \
    --duration 30 \
    --description "A trucker encounters something strange..." \
    --create-sample
```

### Option 3: Direct API Call

```bash
curl -X POST http://localhost:3000/api/publish \
  -F "metadata={\"title\":\"Test Story\",\"author\":\"Test\",\"genre\":\"Horror\",\"duration_mins\":15}" \
  -F "audio=@output/story.mp3"
```

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx

# Cloudflare R2
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=drivetimetales-audio
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://pub-xxx.r2.dev
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stories` | GET | List all stories |
| `/api/stories` | POST | Create a story (JSON) |
| `/api/upload` | POST | Get presigned upload URL |
| `/api/upload` | PUT | Direct file upload |
| `/api/publish` | POST | Publish from Audio Drama Maker |

## Database Tables

### stories
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| title | TEXT | Story title |
| author | TEXT | Author name |
| genre | TEXT | Genre category |
| duration_mins | INT | Duration in minutes |
| credits | INT | Credit cost |
| audio_url | TEXT | R2 key for full audio |
| sample_url | TEXT | R2 key for sample |
| play_count | INT | Number of plays |
| is_new | BOOL | Show NEW badge |
| is_featured | BOOL | Show on homepage |

### qr_sources
For tracking marketing campaigns with QR codes.

| Column | Type | Description |
|--------|------|-------------|
| code | TEXT | URL parameter (e.g., "flyingj-dec2024") |
| name | TEXT | Human readable name |
| promo_message | TEXT | Custom welcome message |
| scan_count | INT | Number of scans |

## Genres

- Mystery
- Drama
- Sci-Fi
- Horror
- Comedy
- Romance
- Trucker Stories

## Troubleshooting

### "Failed to fetch stories"
- Check Supabase is running and schema is installed
- Verify environment variables are correct

### "Failed to upload file"
- Check R2 credentials
- Ensure bucket exists and token has write permission

### Audio not playing
- Enable public access on R2 bucket
- Update R2_PUBLIC_URL in .env.local

## Next Steps

1. **Deploy to Vercel** - Add environment variables in Vercel dashboard
2. **Custom domain** - Connect drivetimetales.com
3. **Stripe integration** - Enable real payments
4. **QR code generator** - Create marketing materials
