/**
 * DTT Working Code Library - 06_Database/a_TableSchemas.md
 * 
 * CURRENT VERSION: 2026-01-15 4:00pm
 * STATUS: DOCUMENTED ✓
 * 
 * VERSION HISTORY:
 * - 2026-01-15 4:00pm - Initial documentation from Supabase
 * 
 * CRITICAL: Always check this file before writing database queries!
 */

# DTT Database Table Schemas

## CRITICAL NOTES
- **user_stories table DOES NOT EXIST** - Use `user_library` for tracking playback
- **play_history table EXISTS but is EMPTY** - Not currently used
- **stories table does NOT have**: rating, created_at columns
- **users.first_name** = nickname field from signup
- **users.state** = user's state (can be abbreviation "SC" or full name "South Carolina")

---

## users
User profiles and account information.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (matches auth.users.id) |
| email | text | Email address |
| first_name | text | Nickname (from signup) |
| display_name | text | Full display name |
| credits | int | Current credit balance |
| state | text | User's state (abbrev or full name) |
| subscription_type | text | 'road_warrior', 'commuter', etc. |
| subscription_ends_at | timestamp | When subscription expires |
| created_at | timestamp | Account creation date |

**Query example:**
```typescript
.from('users')
.select('first_name, display_name, credits, state')
.eq('id', session.user.id)
.single()
```

---

## stories
Main stories catalog.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| title | text | Story title |
| author | text | Author name |
| genre | text | Genre category |
| description | text | Story description |
| duration_mins | int4 | Duration in minutes |
| duration_label | text | Human-readable duration |
| credits | int | Cost in credits |
| cover_url | text | Cover image URL |
| audio_url | text | Audio file URL |
| sample_url | text | Sample audio URL |
| is_new | boolean | New release flag |
| is_featured | boolean | Featured flag |
| is_free | boolean | Free story flag |
| series_id | uuid | FK to series table |
| episode_number | int | Episode number if in series |

**Query example:**
```typescript
.from('stories')
.select('id, title, description, genre, duration_mins, cover_url, audio_url, credits, author')
.order('created_at', { ascending: false })
.limit(12)
```

---

## user_library
Tracks user's purchased/owned stories and playback progress.
**USE THIS FOR CONTINUE LISTENING!**

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to users |
| story_id | uuid | FK to stories |
| progress | int4 | Playback position in seconds |
| last_played | timestamp | When last played |
| completed | boolean | Whether story was finished |

**Query example (Continue Listening):**
```typescript
.from('user_library')
.select(`
  story_id,
  progress,
  last_played,
  completed,
  stories (
    id, title, author, genre, duration_mins, cover_url
  )
`)
.eq('user_id', userId)
.eq('completed', false)
.gt('progress', 0)
.order('last_played', { ascending: false })
.limit(1)
.single()
```

---

## news_episodes
Generated news briefings.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| category | text | Category id (state, national, international, business, sports, science) |
| audio_url | text | Generated audio URL |
| is_live | boolean | Whether episode is currently active |

**Query example:**
```typescript
.from('news_episodes')
.select('id, category, audio_url, is_live')
.eq('is_live', true)
```

---

## play_history
Tracks detailed playback history (currently not used - user_library is used instead).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to users |
| story_id | uuid | FK to stories |
| device_id | text | Device identifier |
| source_id | uuid | Source reference |
| progress_percent | numeric | Percentage completed |
| current_time_seconds | int | Playback position in seconds |
| completed | boolean | Whether finished |
| play_type | text | Type of play |
| credits_used | int | Credits used |
| started_at | timestamp | When playback started |
| last_played_at | timestamp | Last activity |

---

## Other Tables (for reference)

| Table | Purpose |
|-------|---------|
| series | Story series/collections |
| news_settings | News generation config |
| news_delivery_queue | Scheduled news delivery |
| news_access | User news access permissions |
| profiles | Extended user profiles |
| user_preferences | User settings |
| downloads | Downloaded stories |
| wishlist | User wishlist |
| WishlistItem | Wishlist entries |
| promo_codes | Promotional codes |
| promo_messages | Promo messaging |
| referrals | Referral tracking |
| referral_rewards | Referral rewards |
| referral_tiers | Referral tiers |
| qr_sources | QR tracking |
| reviews | Story reviews |
| analytics_events | User analytics |
