# Drive Time Tales - Page Status & Code Reference

**Last Updated:** January 24, 2026  
**Project Location:** ~/Projects/drivetimetales/

---

## DTT PAGES

### ✅ COMPLETED

#### Home (/)
- **File:** `app/page.tsx`
- **Components:** StickyLogo1, WelcomeCredits, NewsBriefings, ContinueListening, NewReleases, RecommendedForYou, BottomStickyButtons
- **Database:** users, stories, user_library, news_episodes

#### Welcome (/welcome)
- **File:** `app/welcome/page.tsx`
- **Components:** W1_WelcomeHeader
- **Database:** users

#### Welcome-Library (/welcome-library)
- **File:** `app/welcome-library/page.tsx`
- **Components:** WL01StickyLogo, LibraryFiltersV2, HorizontalStoryCard
- **Database:** stories

#### Library (/library)
- **File:** `app/library/page.tsx`
- **Components:** StickyLogo1, LibraryFiltersV2, HorizontalStoryCard
- **Database:** stories, users, user_library

---

### 🔄 IN PROGRESS

#### Library-Playlist (/library-playlist)
- **File:** `app/library-playlist/page.tsx`
- **Git Tag:** `working-library-playlist-v3-2026-01-24`
- **Components:** HorizontalStoryCard (inline header/filters)
- **Database:** stories, users

**Current Features:**
- ✅ Header: Back | Logo | Avatar
- ✅ 2-row filters (duration/type + genre)
- ✅ Stats bar (credits used, playlist time)
- ✅ Select stories → green border, moves to top
- ✅ Orange numbered circles (1, 2, 3...)
- ✅ Arrow reorder (▼ first, ▲ others)
- ✅ Red ✕ remove button
- ✅ Start Drive button
- ✅ Time format (hr min)

**TODO:**
- [ ] Subscriber-only popup
- [ ] Credits exceeded popup  
- [ ] Player page (/library-playlist-player)
- [ ] 10% credit deduction
- [ ] Audio announcements

**Restore:**
```bash
git checkout working-library-playlist-v3-2026-01-24 -- app/library-playlist/page.tsx
```

---

### ⬜ NOT STARTED

#### Wishlist (/wishlist)
- **File:** (not created)
- **Purpose:** Save stories for later

#### Player (/player/[id])
- **File:** `app/player/[id]/page.tsx`
- **Status:** Needs review

#### Library-Playlist-Player (/library-playlist-player)
- **File:** (not created)
- **Purpose:** Play playlist hands-free

---

## ADMIN PAGES

### ✅ COMPLETED

#### Admin Dashboard (/admin)
- **File:** `app/admin/page.tsx`
- **Sections:** Dashboard, Finance, Users, Stories
- **Placeholders:** Partners, Analytics, Sales

#### News Briefings
- **Components:** NewsBriefings (home page module)
- **Database:** news_episodes
- **Categories:** State, National, World, Business, Sports, Sci/Tech

---

## SHARED COMPONENTS

| Component | File | Used By |
|-----------|------|---------|
| HorizontalStoryCard | `components/HorizontalStoryCard.tsx` | library, welcome-library, library-playlist |
| StickyLogo1 | `components/StickyLogo1.tsx` | home, library |
| StickyLogo2 | `components/StickyLogo2.tsx` | various |
| LibraryFiltersV2 | `components/LibraryFiltersV2.tsx` | library, welcome-library |
| WL01StickyLogo | `components/WL01StickyLogo.tsx` | welcome-library |

---

## HORIZONTALSTORYCARD PROPS (Current)

```typescript
interface HorizontalStoryCardProps {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  credits?: number
  series_number?: number | null
  series_total?: number | null
  flag?: 'free' | 'editors-pick' | 'readers-choice' | 'trending' | null
}
```

---

## DATABASE QUICK REFERENCE

### users
```
id, email, first_name, display_name, credits, subscription_type, state
```
⚠️ NO: address, city, zip, subscription_status

### stories  
```
id, title, author, genre, duration_mins, credits, cover_url, audio_url, 
is_free, published_on, series_name, series_number, series_total
```
⚠️ NO: rating, created_at

### user_library (Continue Listening)
```
id, user_id, story_id, progress, last_played, completed
```

---

## GIT TAGS

```bash
# List all restore points
git tag -l "working-*"

# Restore a file
git checkout [tag] -- app/[page]/page.tsx

# Current tags:
working-library-playlist-v3-2026-01-24
```

---

## DESIGN RULES

- **Background:** slate-950 (#020617)
- **Cards:** slate-800 with cover glow
- **Accent:** orange-400/500 (#f97316)
- **Selected:** green border (#22c55e), green tint (#1e3a2f)
- **ALL TEXT:** White only (no gray!)
- **Layout CSS:** Use inline styles (not Tailwind) for position/width/height/flex
