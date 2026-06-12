# ATL-F-RTP-001: The Manifest Missing from Ready To Publish
**Status:** Open  
**Owner:** Atlas  
**Priority:** High — M-1 path (The Manifest is one of 3 stories Marc must publish before M-1 continues)  
**Reported:** 2026-06-11  

---

## Symptom

The Ready To Publish tab in the Content Approval page shows **2 stories**. The database has **3 stories** in `approved_ready` state:
- The Last Crossing (`1fe2a919`) — ✅ visible
- The Woman at Keenan Notch (`2d4b1207`) — ✅ visible
- **The Manifest** (`3808e2e5`) — ❌ not visible

---

## Story State (verified from DB, 2026-06-11)

The Manifest (`3808e2e5-2931-45d1-a5d2-6a4a567bdd9d`) has all required fields:

| Field | Value | Required |
|---|---|---|
| `workflow_state` | `approved_ready` | ✅ |
| `status` | `audio_ready` | ✅ |
| `is_hidden` | `true` | ✅ |
| `review_status` | `approved` | ✅ |
| `series_id` | `null` (standalone) | ✅ |
| `published_on` | `null` | ✅ |
| `audio_url` | present, `/final_mix.mp3` | ✅ |
| `story_audio_url` | present | ✅ |
| `cover_url` | present | ✅ |
| `prose_text` | present | ✅ |
| `author_id` | present | ✅ |
| `narrator_voice_id` | present | ✅ |
| `narrator_voice_name` | `Cole Hargrove` | ✅ |
| `author` | `Declan Marsh` | ✅ |
| `genre` | `Mystery` | ✅ |
| `description` | present | ✅ |
| `duration_mins` | `12` | ✅ |

**All 13 approvalReady gate checks pass.** The story should appear.

---

## Code Flow to Investigate

The Content Approval page (`app/admin/production/approval/page.tsx`) fetches data from two API calls in `fetchStories()`:

```typescript
const [readyRes, allRes] = await Promise.all([
  fetch('/api/admin/content-approval?tab=ready_for_review&includeBlocked=false'),
  fetch('/api/admin/content-approval?tab=all&includeBlocked=true'),
])
```

The Ready To Publish tab should render from `allRes` items where `workflowState === 'approved_ready'`.

### Check 1: Does the API return The Manifest?

In `app/api/admin/content-approval/route.ts`, `effectiveWorkflowState(story)` for The Manifest:
- `story.workflow_state === 'approved_ready'` → hits the `if (story.workflow_state) return story.workflow_state` branch → returns `'approved_ready'` ✅

In `includeItem(item, 'all', true)`: returns `true` for everything ✅

**Expected:** The Manifest IS in the `allRes.items` array as `{ type: 'story', episode: { workflowState: 'approved_ready', storyId: '3808e2e5...' } }`.

**Debug step:** Add `console.log` in the API or intercept the API response in the browser DevTools Network tab. Confirm `items` array includes The Manifest.

### Check 2: Is The Manifest in `eligibleIds`?

```typescript
const eligibleIds = Array.from(new Set(items.flatMap((item) =>
  item.type === 'series'
    ? item.episodes.map((episode) => episode.storyId)
    : [item.episode.storyId]
).filter(Boolean)))
```

For a standalone story item: `[item.episode.storyId]` = `['3808e2e5...']` ✅

**Debug step:** `console.log('eligibleIds includes Manifest:', eligibleIds.includes('3808e2e5-2931-45d1-a5d2-6a4a567bdd9d'))`

### Check 3: Is it in `stories` after the Supabase fetch?

```typescript
let storyRowsResult = await supabase
  .from('stories')
  .select(detailColumns)
  .in('id', eligibleIds)
```

If The Manifest is in `eligibleIds`, it's in `stories`. `workflow_state = 'approved_ready'` in the raw row.

**Debug step:** `console.log('Manifest in stories:', stories.some(s => s.id === '3808e2e5...'))`

### Check 4: Does `storyMatchesWorkflowLane(story, 'approved_ready')` return true?

In the frontend `effectiveWorkflowState` (approval page ~line 251):
```typescript
if (story.workflow_state && ['ready_for_review', 'approved_ready', ...].includes(story.workflow_state)) 
  return story.workflow_state as WorkflowTab
```
`'approved_ready'` is in that array → returns `'approved_ready'` ✅

**Debug step:** Add `console.log('Manifest lane:', storyMatchesWorkflowLane(manifestStory, 'approved_ready'))`

### Check 5: How does the "Ready To Publish" tab count its items?

The tab badge count may come from `approvalItems` (API response) rather than `stories`. If the tab renders `approvalItems.filter(item => /* workflowLane === 'approved_ready' */)`, check whether that filter uses `item.episode.workflowState` or some other field.

Find the `approvalItems` filter for the "approved_ready" tab and trace whether The Manifest's item is included.

---

## Most Likely Root Cause

One of three scenarios:
1. **Tab count uses `approvalItems` filter with a subtle mismatch** — the item's `workflowState` is mapped differently for standalone stories vs. series episodes, causing The Manifest to be categorized incorrectly.
2. **Browser cache** — Marc's browser has a stale version from before `workflow_state` was set to `approved_ready`. A hard refresh (Cmd+Shift+R) would resolve it if this is the cause.
3. **Series gate edge case** — The Manifest (`series_id=null`) is somehow hitting the series-completeness gate despite being standalone.

---

## Acceptance Criteria

1. The Manifest appears in the Ready To Publish tab alongside The Last Crossing and The Woman at Keenan Notch
2. Ready To Publish count shows 3 (not 2)
3. No other stories disappear from the tab as a result of the fix
4. Fix is confirmed by loading the approval page fresh (not relying on cache)
5. `tsc --noEmit` clean, `npm run build` clean

---

## Notes

- The Manifest has a separate editorial issue: it failed `validate_story_resolution` (protagonist passive, Difficult Solution Rule violated, confidence 0.92). That is an editorial issue (Hal's domain) and does not affect whether it should be visible in the UI. Fix the visibility bug independently.
- This ticket is separate from ATL-VIS-001 (dual-count display). Fix the missing story first, then improve visibility.
