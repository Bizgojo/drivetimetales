# DTT Working Code Library

**Location:** `~/Projects/drivetimetales/WorkingCodeLibrary/`  
**Mirror:** `~/DriveTimeFiles/DTT/WorkingCodeLibrary/`  
**Last Updated:** January 15, 2026

---

## Purpose

This library stores **working, tested code chunks** that can be assembled into pages.
- **NEVER modify these files without Marc's explicit permission**
- **ALWAYS fetch from here instead of making up code**
- **When code works, SAVE it here immediately**

---

## Directory Structure

```
WorkingCodeLibrary/
├── README.md (this file)
│
├── 00_SharedComponents/
│   ├── _versions/
│   ├── a_Header.tsx
│   ├── b_StickyBottom.tsx
│   ├── c_CreditsDisplay.tsx
│   └── d_SupabaseClient.tsx
│
├── 01_WelcomePage/
│   ├── _versions/
│   └── (chunks for welcome/landing page)
│
├── 02_HomePage/
│   ├── _versions/
│   ├── COMPLETE_HomePage.tsx      ← Full assembled page
│   ├── b_WelcomeBack.tsx
│   ├── c_NewsBriefings.tsx        ← PROTECTED
│   ├── d_ContinueListening.tsx
│   ├── e_NewReleases.tsx
│   └── f_RecommendedForYou.tsx
│
├── 03_Registration/
│   ├── _versions/
│   └── (auth chunks)
│
├── 04_StoryPlayer/
│   ├── _versions/
│   └── (player chunks)
│
├── 05_OtherPages/
│   ├── _versions/
│   └── (misc page chunks)
│
├── 06_Database/
│   ├── _versions/
│   └── a_TableSchemas.md          ← CRITICAL REFERENCE
│
└── 07_AdminPanel/
    ├── _versions/
    └── (admin chunks)
```

---

## File Header Format

Every file MUST have this header:

```typescript
/**
 * DTT Working Code Library - [FOLDER]/[FILENAME]
 * 
 * CURRENT VERSION: YYYY-MM-DD HH:MMam/pm
 * STATUS: WORKING ✓ | NEEDS TESTING | BROKEN
 * 
 * VERSION HISTORY:
 * - YYYY-MM-DD HH:MMam/pm - Description of changes
 * - YYYY-MM-DD HH:MMam/pm - Previous version notes
 * 
 * DEPENDS ON: 
 *   - List database tables used
 *   - List state variables needed
 *   - List other chunks required
 * 
 * PROTECTED: (if applicable) DO NOT MODIFY WITHOUT MARC'S PERMISSION
 */
```

---

## Version Control

1. **Main file** = Current working version
2. **_versions/ folder** = Dated backups for rollback

When saving a new version:
1. Copy current main file to `_versions/` with timestamp
2. Update main file with new code
3. Update header with new version info

Example:
```
d_ContinueListening.tsx              ← Current version
_versions/
├── d_ContinueListening_2026-01-04_1430.tsx
└── d_ContinueListening_2026-01-15_1600.tsx
```

---

## Sync Script

Run after saving to library to mirror to DriveTimeFiles:

```bash
~/Projects/drivetimetales/WorkingCodeLibrary/sync-to-drivefiles.sh
```

---

## Critical Notes

1. **user_library** table is for Continue Listening (NOT play_history)
2. **stories** table does NOT have rating or created_at columns
3. **users.first_name** = nickname from signup
4. **News Briefings are PROTECTED** - do not change order or colors without permission
