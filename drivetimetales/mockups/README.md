# DTT Mockups

## Folder Structure

```
mockups/
├── README.md           (this file)
├── home/
│   ├── standard-v1.html    ← Home page, normal credits
│   └── low-credits-v1.html ← Home page, credits ≤ 3
├── library/
│   ├── standard-v1.html    ← Library page, normal credits
│   └── low-credits-v1.html ← Library page, credits ≤ 3
└── archive/
    └── (old revisions)
```

## Naming Convention

`{page}/{state}-v{revision}.html`

- **page**: home, library, player, pricing, etc.
- **state**: standard, low-credits, preview, etc.
- **revision**: v1, v2, v3...

## Current Active Mockups

| Page | State | File | Last Updated |
|------|-------|------|--------------|
| Home | Standard | home/standard-v1.html | 2026-01-04 |
| Home | Low Credits | home/low-credits-v1.html | 2026-01-04 |
| Library | Standard | library/standard-v1.html | 2026-01-04 |
| Library | Low Credits | library/low-credits-v1.html | 2026-01-04 |

## Reference Document

Always refer to `/MASTER-UI-BIBLE.md` for authoritative UI specifications.

## Notes

- Both pages (Home & Library) are in the same HTML file side-by-side
- When creating new revisions, increment version number
- Move superseded versions to archive/
