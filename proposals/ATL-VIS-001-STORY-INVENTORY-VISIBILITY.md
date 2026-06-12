# ATL-VIS-001: Story Inventory Visibility
**Status:** Proposed  
**Owner:** Atlas  
**Requires Marc approval:** No — UI visibility change only, no workflow logic changes  
**Scope:** Content Approval page + Production Console page  
**Pages touched:** `app/admin/production/approval/page.tsx`, `app/api/admin/content-approval/route.ts`, `app/admin/production/console/page.tsx`, `app/api/admin/production-console/route.ts`

---

## Problem

Marc currently sees two different numbers for the same workflow state depending on where he looks:

- The UI shows **4 Ready For Review**. The database has **47**.
- The UI shows **3 Repair Queue items**. The database has **5 stories**.
- The UI shows **45 Cold Storage items**. The database has **89 stories**.

None of these are bugs — but Marc has no way to know that. He cannot distinguish between "there is nothing to act on" and "there is a backlog that is blocked."

---

## Proposed Change: Dual-Count Display

Each workflow section gets a two-line count:

```
READY FOR REVIEW
4 ready now  ·  47 total
```

No new API calls required. The data already exists. This is a display change only.

---

## Section-by-Section Spec

---

### Ready For Review

This is the most important section. Three numbers are needed.

#### Header display (existing section header):
```
Ready For Review
4 ready now  ·  43 blocked  ·  47 total
```

#### Blocked panel (collapsed by default, expandable):

A "▸ 43 stories blocked — see why" link below the section header.  
When expanded, shows a compact reason summary:

```
┌─ Why are 43 stories not ready? ─────────────────────────────────┐
│  22  Wrong production status (not audio_ready)                  │
│  21  Published date is set (should be null)                     │
│  19  Missing narrator voice metadata                            │
│  19  Missing prose text                                         │
│  17  Missing author assignment                                   │
│  12  Missing cover art                                          │
│  11  Audio file missing or wrong format                         │
│   9  Series incomplete (waiting for other episodes)             │
└─────────────────────────────────────────────────────────────────┘
Note: one story can have multiple blocking reasons.
```

#### Implementation:
- The content-approval API `?tab=ready_for_review` already returns `counts.items` (actionable) and `counts.blockedSeries` (series-blocked).
- Add a new field to the API response: `blockedStoriesCount` (total RFR stories minus actionable) and `blockingReasonSummary` (tally of reasons).
- The `episodeBlockingReasons()` function already computes these per story. Aggregate them server-side.
- No new DB queries required. The 47 stories are already fetched.

---

### Ready To Publish

```
Ready To Publish
2 ready now  ·  3 total
```

Note: The gap (3 vs 2) is currently a separate defect (ATL-F-RTP-001). Once fixed, these numbers should match. But the dual display makes any future gap immediately visible.

#### Implementation:
- `approved_ready` count is already available: just query `stories.count` where `workflow_state = 'approved_ready'` alongside the existing approval check.

---

### Published

```
Published
6 in this view  ·  14 in catalog
```

The distinction is: "in this view" = series-collapsed items shown in the approval UI. "in catalog" = actual count of stories live for listeners.

#### Implementation:
- API: add `publishedStoriesCount` to the response (raw `stories` count with `workflow_state = 'published'`).
- The approval page already fetches all stories. Just count them.

---

### Repair Queue

**Production Console:**
```
Repair Queue
3 cases  ·  5 stories
```

"Cases" = series-collapsed items (1 Lost Signal series + 2 standalones). "Stories" = individual story rows.

#### Implementation:
- `buildRepairItems()` in the production-console API already knows the individual stories. Count before series-grouping (5) and after (3 items). Pass both to the response.
- The `repairItems` array already contains this data — just add `repairStoriesCount: repairStories.length` alongside `repairItems`.

---

### Cold Storage

**Production Console:**
```
Cold Storage
45 cases  ·  89 stories
```

#### Implementation:
- Same pattern: `coldStorageStoriesCount: storageStories.length` alongside `coldStorageItems`.

---

## UI Component Changes

### Existing section header pattern (Production Console):
```tsx
<SectionShell icon="🔧" title="Repair Queue" color="#f97316" count={items.length}>
```

**Change to:**
```tsx
<SectionShell icon="🔧" title="Repair Queue" color="#f97316" count={items.length} storiesCount={payload.repairStoriesCount}>
```

`SectionShell` renders the dual count when `storiesCount !== undefined && storiesCount !== count`:
```tsx
{storiesCount !== undefined && storiesCount !== count ? (
  <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>
    ({storiesCount} stories)
  </span>
) : null}
```

No visual change when counts match. Only shows when they differ.

---

## What This Does NOT Change

- No workflow logic changes
- No new gates
- No new workflow states
- No changes to what appears in the actionable lists
- No changes to how stories move through the pipeline
- No schema changes

---

## Out of Scope (separate tickets)

- **ATL-F-RTP-001**: Fix The Manifest missing from Ready To Publish (defect)
- **ATL-VIS-002** (future): Per-story blocking reason detail view (click through to see exactly why a specific story is blocked)
- **F-001**: Ready For Review section in Production Console (separate decision pending Marc)

---

## Acceptance Criteria

1. Ready For Review section shows "X ready now · Y blocked · Z total" in the section header
2. A collapsed/expandable blocking reasons panel shows the top reasons with counts
3. Ready To Publish shows actual story count vs. displayed count
4. Published shows "X in this view · Y in catalog"
5. Repair Queue shows "X cases · Y stories" when they differ
6. Cold Storage shows "X cases · Y stories" when they differ
7. All counts are live (fetched fresh on each page load)
8. `tsc --noEmit` clean, `npm run build` clean
9. No new npm packages

---

## Estimated Effort

- API changes: ~2 hours (add aggregate counts to 2 route responses)
- UI changes: ~2 hours (update SectionShell, add blocked panel to RFR)
- Total: S-M (half day)
