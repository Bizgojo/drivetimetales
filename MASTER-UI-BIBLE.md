# Drive Time Tales - Master UI Bible
## Version 1.0 - January 4, 2026

This document defines the authoritative UI specifications for Drive Time Tales.
All page designs MUST follow these specifications exactly.

---

## COLOR SCHEME

### Backgrounds
- **Page background**: `slate-950` (very dark)
- **Story blocks**: `slate-700` (lighter gray for contrast)
- **Headers/sections**: `slate-800` or `slate-900/50`

### Text
- **All text**: WHITE only (no gray text on dark backgrounds)
- **Credits display**: `orange-400` 
- **Logo "Tales"**: `orange-400`

### Buttons
- **Primary action**: `orange-500` with black text
- **Wishlist button**: `pink-500` with white text
- **Secondary**: `slate-700` with white text

---

## LOGO FORMAT

```
🚛 🚗 Drive Time Tales
```
- Space between truck and car emojis
- "Drive Time" in white
- "Tales" in orange-400
- Three separate words: Drive | Time | Tales

---

## STAR RATING FORMAT

Format: `4.7 ★★★★½ (15)`

- Number rating in `orange-400`
- Filled stars in `yellow-400`
- Half stars in `yellow-400/50`
- Empty stars in `slate-500`
- Review count in white parentheses

---

## FLAG TYPES

All flags appear on the SAME LINE as star ratings, to the right.

| Flag | Background | Text Color | Icon |
|------|------------|------------|------|
| OWNED | green-500 | black | none |
| ❤️ WISHLIST | pink-500 | white | ❤️ |
| NEW | yellow-500 | black | none |
| FREE | green-500 | black | none |
| 👎 PASS | slate-500 | white | 👎 |
| ⭐ DTT PICK | orange-500 | black | ⭐ |
| 🔥 BEST SELLER | blue-500 | white | 🔥 |

---

## HOME PAGE SPECIFICATION

### Header
- Logo (left): 🚛 🚗 Drive Time Tales
- Avatar (right): Orange circle with user initial

### Welcome Section
- "Welcome back, [Name]!"
- "You have X credits" (credits in orange)

### Continue Listening Section
(Only shows if user has unfinished story)
- Story cover thumbnail (small)
- Story title
- Progress: "45% • 6:30 remaining"
- Progress bar
- Play button (orange circle)

### New Releases Section
- 3 stories in equal-width grid (grid-cols-3)
- NO "NEW" flags (section title implies it)
- Each shows:
  - Square cover image
  - Title (truncated)
  - Duration
  - Star rating: `4.7 ★★★★½ (15)`

### Recommended For You Section
- Story blocks (same as Library blocks)
- Excludes: wishlist, owned, and PASS stories
- Shows appropriate flags (FREE, NEW, DTT PICK, etc.)

### Sticky Bottom Buttons
- [📚 Story Library] - orange-500, black text
- [❤️ My Wishlist] - pink-500, white text

---

## LIBRARY PAGE SPECIFICATION

### Header
- Back button (left): "← Back"
- Center: Logo + credits display
  - 🚛 🚗 Drive Time Tales
  - "X credits" below in orange
- Avatar (right): Orange circle with user initial

### Genre Filter
Icon + text buttons, wrapped:
```
📚 All | 🔍 Mystery | 🎭 Drama | 🚀 Sci-Fi | 👻 Horror | 
😱 Thriller | 📖 Non-Fic | 👶 Children | 😂 Comedy | 💕 Romance
```
- Active: `orange-500` background, black text
- Inactive: `slate-700` background, white text

### Duration Filter
Pill buttons in a row:
```
[All] [~15 min] [~30 min] [~1 hr]
```
- Active: `orange-500` background, black text
- Inactive: `slate-700` background, white text, slate-600 border

### Story Blocks
Each story is a horizontal card with:
- Cover image (w-20 h-20) with duration badge bottom-right
- Title (bold, truncated)
- Genre • X credit(s)
- by Author Name
- Star rating + Flag on same line

Example:
```
┌─────────────────────────────────────┐
│ ┌──────┐  The Fourteenth Year       │
│ │ IMG  │  Mystery/Thriller • 2 cr   │
│ │ 37m  │  by Davis Goldburg         │
│ └──────┘  4.1 ★★★★☆ (8)  [NEW]     │
└─────────────────────────────────────┘
```

---

## LOW CREDITS STATE

When user has 3 or fewer credits, show:

### Home Page
- Orange warning banner below welcome:
  "Running low on credits! [Buy More →]"

### Library Page  
- Same orange warning banner below header

### Both Pages
- Clicking "Buy More" or tapping banner → /pricing page
- Quick purchase modal for returning customers (no Stripe redirect)

---

## STORY BLOCK - CREDITS LINE

Always show credits, even for FREE stories:
- Regular: `Mystery/Thriller • 2 credits`
- Free: `Mystery/Thriller • 1 credit` + FREE flag

This shows users the value they're getting for free.

---

## GENRES LIST

```javascript
const genreOptions = [
  { name: 'All', icon: '📚' },
  { name: 'Mystery', icon: '🔍' },
  { name: 'Drama', icon: '🎭' },
  { name: 'Sci-Fi', icon: '🚀' },
  { name: 'Horror', icon: '👻' },
  { name: 'Thriller', icon: '😱' },
  { name: 'Non-Fiction', icon: '📖' },
  { name: 'Children', icon: '👶' },
  { name: 'Comedy', icon: '😂' },
  { name: 'Romance', icon: '💕' },
  { name: 'Trucker Stories', icon: '🚛' },
]
```

---

## DURATION OPTIONS

```javascript
const durationOptions = [
  { name: 'All', label: 'All' },
  { name: '15', label: '~15 min' },
  { name: '30', label: '~30 min' },
  { name: '60', label: '~1 hr' },
]
```

---

## REFERENCE MOCKUP

The authoritative visual reference is:
`/mockups/pages-mockup-v6.html`

Always refer to this file when implementing UI changes.

---

## CHANGELOG

- v1.0 (2026-01-04): Initial specification
