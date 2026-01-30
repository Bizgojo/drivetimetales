# Drive Time Tales - Flag Rules v1.0

**Last Updated:** January 30, 2026

---

## Overview

- **Maximum 3 flags per card**
- Flags display flush right on rows 2, 3, 4 of the HorizontalStoryCard
- Priority system determines which flags show when more than 3 apply

---

## Flag Types & Colors

| Flag | Background | Text | Set By |
|------|------------|------|--------|
| Continue | Blue (#3b82f6) | White | System (user has progress > 0, not completed) |
| Reserved | Yellow (#eab308) | Black | System (user reserved story) |
| Owned | Orange (#f97316) | White | System (user owns story) |
| Series #N | Red (#dc2626) | White | Story data (series_number) |
| Trending | Blue-Green (#14b8a6) | White | System (top 10 played in last 5 days) |
| NEW | Red-Orange (#ea580c) | White | System (added in last 25 days) |
| FREE | Green (#22c55e) | White | Admin (is_free = true) |
| Editor's Pick | Purple (#9333ea) | White | Admin |
| Listener's Pick | Purple (#9333ea) | White | Admin |

---

## Priority Order

When more than 3 flags apply, show only the top 3 by priority:

1. **Continue** (highest)
2. **Reserved**
3. **Owned**
4. **Series #N**
5. **Trending**
6. **NEW**
7. **FREE**
8. **Editor's Pick / Listener's Pick** (lowest)

---

## Mutual Exclusions

Apply these rules BEFORE priority sorting:

| If this... | Hide these... | Reason |
|------------|---------------|--------|
| Continue | Owned | Continue implies Owned |
| Continue | FREE, NEW, Trending | User already has story |
| Owned | Reserved | Can't be both |
| Owned | FREE, NEW, Trending | User already has story |
| Reserved | Owned | Can't be both |
| Reserved | FREE, NEW, Trending | User already has story |
| Reserved | NEW | Reserved cannot also show NEW |
| Editor's Pick | Listener's Pick | Only one editorial flag |

---

## Additional Display Conditions

| Flag | Condition |
|------|-----------|
| Continue | Only if progress > 0 AND not completed |
| FREE | Do not show if story is Owned |
| NEW | Do not show if story is Owned or Reserved |
| Series #N | Display includes part number (e.g., "Series #2") |
| Trending | Top 10 most played stories in last 5 days |
| NEW | Stories added within last 25 days |

---

## Card Layout

```
┌─────────────────────────────────────────────────┐
│ [COVER]  Title                                  │
│          Genre ..................... [Flag 1]   │
│          by Author ................. [Flag 2]   │
│          Duration • Credits ........ [Flag 3]   │
└─────────────────────────────────────────────────┘
```

Flags are flush right on rows 2, 3, 4. Empty flag slots show nothing (text stays left-aligned).

---

## Implementation Logic

```typescript
function getDisplayFlags(story, user, userLibrary): string[] {
  let flags: string[] = [];
  
  // Determine user's relationship to story
  const libraryEntry = userLibrary.find(s => s.story_id === story.id);
  const isOwned = !!libraryEntry;
  const isReserved = libraryEntry?.reserved === true;
  const isContinue = libraryEntry?.progress > 0 && !libraryEntry?.completed;
  
  // User status flags (mutually exclusive)
  if (isContinue) {
    flags.push('continue');
  } else if (isReserved) {
    flags.push('reserved');
  } else if (isOwned) {
    flags.push('owned');
  }
  
  const userHasStory = isContinue || isOwned || isReserved;
  
  // Series flag
  if (story.series_number) {
    flags.push('series');
  }
  
  // Content flags (only if user doesn't have story)
  if (!userHasStory) {
    if (story.is_trending) {
      flags.push('trending');
    }
    if (story.is_new && !isReserved) {
      flags.push('new');
    }
    if (story.is_free) {
      flags.push('free');
    }
  }
  
  // Editorial flags (mutually exclusive)
  if (story.flag === 'editors-pick') {
    flags.push('editors-pick');
  } else if (story.flag === 'listeners-pick') {
    flags.push('listeners-pick');
  }
  
  // Sort by priority and return top 3
  const priorityOrder = [
    'continue', 'reserved', 'owned', 'series', 
    'trending', 'new', 'free', 'editors-pick', 'listeners-pick'
  ];
  
  flags.sort((a, b) => priorityOrder.indexOf(a) - priorityOrder.indexOf(b));
  
  return flags.slice(0, 3);
}
```

---

## Practical Scenarios

### User has story (Continue/Owned/Reserved)
FREE, NEW, Trending hidden automatically.

| Scenario | Flags Shown |
|----------|-------------|
| Continuing a series with Editor's Pick | Continue, Series #2, Editor's Pick |
| Reserved a series | Reserved, Series #2 |
| Owns a standalone story | Owned |

### User browsing (doesn't own)

| Scenario | Flags Shown |
|----------|-------------|
| Hot new free story | Trending, NEW, FREE |
| New series entry | Series #3, NEW |
| Free Editor's Pick | FREE, Editor's Pick |
| Plain story | (no flags) |

### Edge case: 4+ flags apply
Priority determines top 3:
- Available: NEW, FREE, Trending, Editor's Pick
- Shows: **Trending, NEW, FREE** (Editor's Pick dropped)

---

## Database Requirements

### stories table
- `is_free` (boolean) - Admin sets this
- `flag` (text) - 'editors-pick' or 'listeners-pick' or null
- `series_number` (int) - Part number in series
- `created_at` (timestamp) - For calculating NEW (< 25 days old)

### user_library table
- `reserved` (boolean) - User reserved this story
- `progress` (int) - Playback position in seconds
- `completed` (boolean) - User finished the story

### Calculated fields (may need additional tracking)
- `is_trending` - Top 10 played in last 5 days
- `is_new` - created_at within last 25 days

---

*End of Flag Rules v1.0*
