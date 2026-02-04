# DriveTimeFiles (DTF) - Project Bible

## 📁 Master Location
```
~/DriveTimeFiles/
```

---

## 🚨 CRITICAL RULE: FILE EVERYTHING HERE

**ALL files related to DTT, Admin, or ADM MUST be filed in DriveTimeFiles.**

| Project | Location | What Goes Here |
|---------|----------|----------------|
| **ADM** | `ADM/Current/` | Latest version with version+date: `audio_drama_maker_v8_28_0_2026-01-11.py` |
| **ADM** | `ADM/Archive/` | All older ADM versions |
| **DTT** | `DTT/Current/` | Symlink to `~/Projects/drivetimetales` |
| **DTT** | `DTT/Archive/` | Old mockups, prototypes, deprecated files |
| **Audio Dramas** | `Audio Dramas/` | Story projects (the finished product) |
| **Assets** | `Assets/[type]/` | Music, SFX, Voices, Covers (ingredients) |

---

## 📂 Full Folder Structure

```
DriveTimeFiles/
├── ADM/
│   ├── Current/
│   │   └── audio_drama_maker_v8_28_0_2026-01-11.py  ← Version + date
│   └── Archive/
│       └── (all older versions)
│
├── DTT/
│   ├── Current/
│   │   └── drivetimetales/         ← symlink to ~/Projects/drivetimetales
│   └── Archive/
│       └── (old mockups, prototypes)
│
├── Audio Dramas/                   ← THE PRODUCT (story projects)
│   └── (symlink to ~/Desktop/Audio Dramas)
│
├── Assets/                         ← THE INGREDIENTS (reusable)
│   ├── Music/
│   │   ├── Current/
│   │   └── Archive/
│   ├── SFX/
│   │   ├── Current/
│   │   └── Archive/
│   ├── Voices/
│   │   ├── Current/
│   │   └── Archive/
│   └── Covers/                     ← Story cover art
│       ├── Current/
│       └── Archive/
│
├── Documentation/
│   ├── Current/
│   └── Archive/
│
├── Exports/
│   ├── Current/
│   └── Archive/
│
└── Backups/
    ├── Current/
    └── Archive/
```

### Audio Dramas vs Assets

| Folder | Contains | Example |
|--------|----------|---------|
| **Audio Dramas/** | Story projects - the finished product | "Jack Tales", "The Lady or The Tiger" |
| **Assets/** | Reusable ingredients used IN stories | Background music, SFX, voice samples, cover art |

---

## 🔄 Version Control Rules

### ADM (Audio Drama Maker)
- **Current/** contains ONE file: the latest working version WITH version + date
- Naming format: `audio_drama_maker_v[X]_[Y]_[Z]_[YYYY-MM-DD].py`
- Example: `audio_drama_maker_v8_28_0_2026-01-11.py`
- **Archive/** contains all older versions (keep original filenames)
- When updating: move old Current to Archive, put new version in Current 

### DTT (Drive Time Tales Website)
- **Current/** symlinks to the live project in `~/Projects/drivetimetales`
- Git handles version control for the website
- **Archive/** is for deprecated mockups/prototypes not in git

### Admin
- Same Current/Archive pattern as ADM
- Admin panels, dashboards, and related tools

---

## 🛠️ Helper Scripts

Located in `~/DriveTimeFiles/` root:

| Script | Purpose |
|--------|---------|
| `open_dtf.sh` | Opens DriveTimeFiles in Finder + prints key locations |
| `organize_dtf_v2.py` | Scans Downloads/Documents/Desktop and organizes files |

### Usage
```bash
# Open DriveTimeFiles in Finder
~/DriveTimeFiles/open_dtf.sh

# Re-organize scattered files
python3 ~/Downloads/organize_dtf_v2.py
```

---

## 📝 Documentation Rules

- **ALL documentation lives in `Documentation/Current/` or `Documentation/Archive/`**
- **No loose README.md files in root** - delete any you find
- When updating docs: move old version to Archive with date, put new in Current

---

## 📋 Filing Checklist

When Claude creates a new file:

- [ ] Is it ADM-related? → `DriveTimeFiles/ADM/`
- [ ] Is it DTT website-related? → `DriveTimeFiles/DTT/` or commit to git
- [ ] Is it a story project? → `DriveTimeFiles/Audio Dramas/`
- [ ] Is it a reusable asset (music/SFX/voice/cover)? → `DriveTimeFiles/Assets/[type]/`
- [ ] Is it documentation? → `DriveTimeFiles/Documentation/`

**NEVER leave files scattered in Downloads, Documents, or Desktop!**

---

## 🔗 Quick Links

- **DTT Website**: https://drivetimetales.vercel.app
- **DTT GitHub**: https://github.com/Bizgojo/drivetimetales
- **Supabase Dashboard**: (your project URL)
- **Vercel Dashboard**: (your project URL)

---

## 📅 Last Updated
January 11, 2026

---

*This bible lives in `~/DriveTimeFiles/Documentation/Current/DTF-PROJECT-BIBLE.md`*
*Previous versions are archived in `~/DriveTimeFiles/Documentation/Archive/`*
