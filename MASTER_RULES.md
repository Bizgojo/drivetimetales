# MASTER RULES - Drive Time Tales & Audio Drama Maker
**Owner:** Marc (Wonder Books Press / Drive Time Tales)
**Last Updated:** January 24, 2026

---

## 🚨 RULE ZERO - READ FIRST

### Source of Truth
**Everything is in `~/Projects/drivetimetales/`** - Git is the only backup system.

### After ANY Working Deploy
```bash
git tag working-[page]-[date]
git push origin --tags
```

### To Restore a Page
```bash
git checkout working-[page]-[date] -- app/[page]/page.tsx
```

### Page Status Reference
**See `PAGE-STATUS.txt`** in project root for list of all pages, components, and git tags.

---

## 🚨 CRITICAL RULES

1. **Show diff/changes before deploying** - get approval first
2. **Use inline styles for layout-critical CSS** (position, width, height, flex, grid)
3. **Keep Tailwind for colors/hover/text only**
4. **One deployment = one purpose** - don't combine multiple fixes
5. **ALL text must be white** - no gray text ever

### If a Deploy Fails
1. STOP making more edits
2. Restore from git tag: `git checkout [tag] -- [file]`
3. Start fresh with a proper plan

---

## 🌐 DTT (Drive Time Tales) - Website

### Tech Stack
- **Frontend:** Next.js with Tailwind CSS
- **Backend:** Supabase (PostgreSQL)
- **Hosting:** Vercel
- **GitHub:** https://github.com/Bizgojo/drivetimetales
- **Live Site:** https://drivetimetales.vercel.app
- **Project Location:** ~/Projects/drivetimetales/

### Design System
- **Background:** slate-950 (#020617)
- **Accent:** orange-400, orange-500 (#f97316)
- **Cards:** slate-800 with cover-glow effect
- **Selected:** green border (#22c55e), green tint (#1e3a2f)
- **Cover Glow:** `box-shadow: 0 0 15px rgba(255, 255, 255, 0.4)`
- **Text:** ALL text must be white. NO gray text.

### Database Tables - CRITICAL

#### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| email | text | |
| first_name | text | Nickname from signup |
| display_name | text | |
| credits | int | Current credit balance |
| state | text | "SC" or "South Carolina" |
| subscription_type | text | 'road_warrior', 'commuter', etc. |

**⚠️ users table does NOT have:** address, city, zip, subscription_status

#### `stories`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| title | text | |
| author | text | |
| genre | text | |
| duration_mins | int4 | |
| cover_url | text | |
| audio_url | text | |
| is_free | boolean | |
| series_name | text | |
| series_number | int | |
| series_total | int | |

**⚠️ stories table does NOT have:** rating, created_at

#### `user_library` - USE THIS FOR CONTINUE LISTENING
| Column | Type | Notes |
|--------|------|-------|
| user_id | uuid | FK to users |
| story_id | uuid | FK to stories |
| progress | int4 | Playback position in seconds |
| last_played | timestamp | |
| completed | boolean | |

**⚠️ DO NOT USE:** play_history or user_stories

### Components (in /components/)

| Component | Purpose |
|-----------|---------|
| HorizontalStoryCard | Story cards with cover, title, duration |
| StickyLogo1 | Header: logo center, avatar right |
| StickyLogo2 | Header: back, logo, avatar |
| LibraryFiltersV2 | 2-row filter buttons |

### HorizontalStoryCard Props (CURRENT)
```typescript
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
```
**⚠️ Does NOT have:** play_status, rating

### News Briefings Colors (DO NOT CHANGE)
- State: Red (#dc2626)
- National: Orange (#f97316)
- World: Yellow (#eab308)
- Business: Green (#16a34a)
- Sports: Blue (#2563eb)
- Sci/Tech: Purple (#9333ea)

---

## 🎙️ ADM (Audio Drama Maker) - Desktop App

### Current Version
**v8.23.14** (January 9, 2026)

### Location
`~/DriveTimeFiles/ADM/Current/audio_drama_maker.py`

### Structure
- 10 tabs (0-9)
- Python/Tkinter application

### Audio Drama Files
```
~/Desktop/Audio Dramas/[Story Title]/
├── Script/
├── Audio/
├── SFX/
├── Music/
└── Export/
```

---

## 🔧 Common Commands

### Deploy
```bash
cd ~/Projects/drivetimetales && git add . && git commit -m "message" && git push
```

### Tag Working Version
```bash
git tag working-[page]-[date]
git push origin --tags
```

### Restore from Tag
```bash
git checkout [tag] -- app/[page]/page.tsx
```

### List All Tags
```bash
git tag -l "working-*"
```

---

## 📋 Quick Reference

### Credits Calculation
```typescript
credits = Math.max(1, Math.floor(duration_mins / 15))
```

### Time Format
```typescript
function formatTime(mins: number): string {
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  const remaining = mins % 60
  if (remaining === 0) return `${hours} hr`
  return `${hours} hr ${remaining} min`
}
```

---

## ⚠️ Things Claude Should Never Do

1. Use play_history or user_stories for Continue Listening
2. Assume stories table has rating or created_at
3. Assume HorizontalStoryCard has play_status prop
4. Use Tailwind for position/width/height/flex/grid
5. Deploy without showing changes first
6. Keep patching a broken file (restore from git first)
7. Use gray text - ALL text must be white

---

## ✅ Things Claude Should Always Do

1. Check PAGE-STATUS.txt for current page info
2. Show diff before deploying
3. Use inline styles for layout-critical properties
4. Check database schema before writing queries
5. Restore from git tag if a deploy fails
6. Tag working versions after successful deploy
7. Update PAGE-STATUS.txt when pages change

---

## Current Git Tags

```
working-library-playlist-v3-2026-01-24
```

---

*Give this file to Claude at the start of each new chat.*
