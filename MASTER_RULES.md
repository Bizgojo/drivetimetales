# MASTER RULES - Drive Time Tales & Audio Drama Maker
**Owner:** Marc (Wonder Books Press / Drive Time Tales)
**Last Updated:** January 18, 2026

---

## 🚨 CRITICAL RULES - READ FIRST

### Working Code Library (WCL) Rules
1. **NEVER recreate protected modules from memory** - always use `cat` to copy exactly
2. **NEVER modify protected files without Marc's explicit permission**
3. **ALWAYS fetch from WCL instead of making up code**
4. **Show diff/changes before deploying** - get approval first
5. **Use inline styles for layout-critical CSS** (position, width, height, flex, grid) to prevent Tailwind purging
6. **Keep Tailwind for colors/hover/text** - these don't get purged
7. **One deployment = one purpose** - don't combine multiple fixes

### If a Deploy Fails
1. STOP making more edits
2. Restore from git: `git checkout [last-working-commit] -- [file]`
3. Verify restored: `sed -n '1,50p' [file]`
4. Start fresh with a proper plan

### File Management
- After creating DTT/ADM/Admin files, remind Marc to run: `~/DriveTimeFiles/sync-all.sh`
- Never leave files in Downloads, Documents, or Desktop
- All project files go to `~/DriveTimeFiles/` organized structure

---

## 📁 Master Filing System

```
~/DriveTimeFiles/
├── ADM/
│   ├── Current/           ← Latest audio_drama_maker.py ONLY
│   └── Archive/           ← All older versions
├── DTT/
│   ├── Current/           ← Symlink to ~/Projects/drivetimetales
│   ├── Archive/           ← Old mockups, prototypes
│   └── WorkingCodeLibrary/
├── Admin/
│   ├── Current/
│   └── Archive/
├── Assets/
│   ├── Music/
│   ├── SFX/
│   └── Voices/
├── Audio Dramas/          ← Symlink to ~/Desktop/Audio Dramas
├── Documentation/
├── Bible/                 ← Project documentation
└── Backups/
```

---

## 🌐 DTT (Drive Time Tales) - Website

### Tech Stack
- **Frontend:** Next.js with Tailwind CSS
- **Backend:** Supabase (PostgreSQL)
- **Hosting:** Vercel
- **GitHub:** https://github.com/Bizgojo/drivetimetales
- **Live Site:** https://drivetimetales.vercel.app

### Design System
- **Background:** slate-950 (dark theme)
- **Accent:** orange-400, orange-500
- **Cards:** slate-800 with cover-glow effect
- **Cover Glow:** `box-shadow: 0 0 15px rgba(255, 255, 255, 0.4)`
- **Text:** ALL text must be white (text-white). NO gray text (no text-slate-400, text-gray-400, etc.)

### Database Tables - CRITICAL

#### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key (matches auth.users.id) |
| email | text | |
| first_name | text | **This is the nickname from signup** |
| display_name | text | |
| credits | int | Current credit balance |
| state | text | Can be "SC" or "South Carolina" |
| subscription_type | text | 'road_warrior', 'commuter', etc. |
| subscription_ends_at | timestamp | |

**⚠️ users table does NOT have:** address, city, zip columns

#### `stories`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| title | text | |
| author | text | |
| genre | text | |
| duration_mins | int4 | |
| credits | int | Cost in credits |
| cover_url | text | |
| audio_url | text | |
| is_free | boolean | |
| published_on | timestamp | |

**⚠️ stories table does NOT have:** rating, created_at columns

#### `user_library` - USE THIS FOR CONTINUE LISTENING
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| user_id | uuid | FK to users |
| story_id | uuid | FK to stories |
| progress | int4 | Playback position in seconds |
| last_played | timestamp | |
| completed | boolean | |

**⚠️ DO NOT USE:** play_history or user_stories for Continue Listening

#### `news_episodes`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| category | text | state, national, international, business, sports, science |
| audio_url | text | |
| is_live | boolean | |

### Protected Modules (WCL)

#### Shared Components (00_SharedComponents/)
- **01_HorizontalStoryCard** - Universal template for story cards
- **02_StickyLogo1** - Home page header (logo centered, avatar right)
- **03_StickyLogo2** - Other pages header (back button, logo, avatar)

#### Home Page (02_HomePage/)
- **04_WelcomeCredits** - Welcome message + credits display
- **05_NewsBriefings** - 6 categories, color wheel colors
- **06_ContinueListening** - Most recent uncompleted story
- **07_NewReleases** - 2 stories, 2-column grid
- **08_RecommendedForYou** - 3 stories, horizontal cards
- **09_BottomStickyButtons** - Library + Recommend buttons

#### Welcome Page (01_WelcomePage/)
- **W1_WelcomeHeader** - Animated vehicles, 3 credit states, secret code

### News Briefings Colors (DO NOT CHANGE)
Color wheel order (60° apart):
- State: Red (#dc2626 to #991b1b)
- National: Orange (#f97316 to #c2410c)
- World: Yellow (#eab308 to #a16207)
- Business: Green (#16a34a to #166534)
- Sports: Blue (#2563eb to #1e40af)
- Sci/Tech: Purple (#9333ea to #6b21a8)

### Webhook Rules
- Check BOTH `user_id` AND `userId` (legacy support)

### Admin Panel
- Location: /admin
- Sections: Dashboard, Finance, Users, Stories
- Partners/Analytics/Sales are placeholders

---

## 🎙️ ADM (Audio Drama Maker) - Desktop App

### Current Version
**v8.23.14** (January 9, 2026)

### Structure
- 10 tabs (0-9)
- Python/Tkinter application
- Location: `~/DriveTimeFiles/ADM/Current/audio_drama_maker.py`

### Known Issues (v8.23.14)
1. Tab 6 default voice not selecting Belle
2. Preview has no sound
3. Wrong voice in mix
4. Story audio too loud vs announcer

### Voice Lookup
- Uses `_tab6_voice_map` priority for voice selection

### Master Filing System for Audio Dramas
```
~/Desktop/Audio Dramas/[Story Title]/
├── Script/
├── Audio/
├── SFX/
├── Music/
└── Export/
```

### Announcer Script Format
- Two-column layout
- Placeholders supported
- Promo script included

---

## 📝 Audio Drama Script Rules

### Formatting
- **Narrator announces every speaker** for audio clarity
- **No asterisks** - use ALL CAPS for emphasis
- Target length: ~15 minutes (~2,200 words)

### Structure
- Clear scene breaks
- Sound effects in brackets [SFX: door creaks]
- Music cues in brackets [MUSIC: tension builds]

---

## 🔧 Common Commands

### DTT Deployment
```bash
cd ~/Projects/drivetimetales && git add . && git commit -m "message" && git push
```

### Restore from Git
```bash
git checkout [commit] -- [file]
```

### View File Section
```bash
sed -n 'START,ENDp' [file]
```

### Find Pattern
```bash
grep -n "pattern" [file]
```

### Sync Files
```bash
~/DriveTimeFiles/sync-all.sh
```

---

## 📋 Quick Reference

### Credits Calculation
```typescript
credits = Math.max(1, Math.floor(duration_mins / 15))
```

### State Abbreviation
- Store as 2-letter code OR full name
- Convert with STATE_ABBREVIATIONS lookup

### Continue Listening Query
```typescript
supabase
  .from('user_library')
  .select(`story_id, progress, last_played, completed, stories(...)`)
  .eq('user_id', userId)
  .eq('completed', false)
  .gt('progress', 0)
  .order('last_played', { ascending: false })
  .limit(1)
  .single()
```

---

## ⚠️ Things Claude Should Never Do

1. Recreate protected modules from memory
2. Use play_history or user_stories for Continue Listening
3. Assume stories table has rating or created_at
4. Use Tailwind classes for position/width/height/flex/grid (use inline styles)
5. Deploy without showing changes first
6. Keep patching a broken file (restore from git first)
7. Leave files in Downloads/Documents/Desktop
8. Use gray text (text-slate-400, text-gray-400) - ALL text must be white

---

## ✅ Things Claude Should Always Do

1. Read SKILL.md files before creating documents
2. Use `cat` to copy protected modules exactly
3. Show diff before deploying
4. Remind Marc to run sync-all.sh after creating files
5. Use inline styles for layout-critical properties
6. Check database schema before writing queries
7. Restore from git if a deploy fails

---

*Give this file to Claude at the start of each new chat for consistent behavior.*
