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
| **ADM** | `ADM/Current/` | Latest `audio_drama_maker.py` ONLY |
| **ADM** | `ADM/Archive/` | All older ADM versions |
| **DTT** | `DTT/Current/` | Symlink to `~/Projects/drivetimetales` |
| **DTT** | `DTT/Archive/` | Old mockups, prototypes, deprecated files |
| **Admin** | `Admin/Current/` | Latest admin scripts/components |
| **Admin** | `Admin/Archive/` | Older admin versions |

---

## 📂 Full Folder Structure

```
DriveTimeFiles/
├── ADM/
│   ├── Current/
│   │   └── audio_drama_maker.py    ← ONE file only (latest)
│   └── Archive/
│       └── (all older versions)
│
├── DTT/
│   ├── Current/
│   │   └── drivetimetales/         ← symlink to ~/Projects/drivetimetales
│   └── Archive/
│       └── (old mockups, prototypes)
│
├── Admin/
│   ├── Current/
│   └── Archive/
│
├── Assets/
│   ├── Music/
│   │   ├── Current/
│   │   └── Archive/
│   ├── SFX/
│   │   ├── Current/
│   │   └── Archive/
│   └── Voices/
│       ├── Current/
│       └── Archive/
│
├── Audio Dramas/
│   └── (symlink to ~/Desktop/Audio Dramas)
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

---

## 🔄 Version Control Rules

### ADM (Audio Drama Maker)
- **Current/** contains ONLY the latest working version
- Filename in Current: `audio_drama_maker.py` (no version number)
- **Archive/** contains all older versions with version numbers
- Versions sorted: v8.28 > v8.27 > v8.26... 

### DTT (Drive Time Tales Website)
- **Current/** symlinks to the live project in `~/Projects/drivetimetales`
- Git handles version control for the website
- **Archive/** is for deprecated mockups/prototypes not in git

### Admin
- Same Current/Archive pattern as ADM
- Admin panels, dashboards, and related tools

---

## 🛠️ Helper Scripts

### Organize Files
```bash
python3 ~/Downloads/organize_dtf_v2.py
```

### Open DriveTimeFiles in Finder
```bash
~/DriveTimeFiles/open_dtf.sh
```

---

## 📋 Filing Checklist

When Claude creates a new file:

- [ ] Is it ADM-related? → `DriveTimeFiles/ADM/`
- [ ] Is it DTT-related? → `DriveTimeFiles/DTT/` or commit to git
- [ ] Is it Admin-related? → `DriveTimeFiles/Admin/`
- [ ] Is it documentation? → `DriveTimeFiles/Documentation/`
- [ ] Is it an asset? → `DriveTimeFiles/Assets/[type]/`

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

*This bible should be kept in `~/DriveTimeFiles/DTF-PROJECT-BIBLE.md`*
