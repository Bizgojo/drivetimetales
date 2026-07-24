# go_listen_events migration rules

**RULE: Any migration that touches the `event` CHECK constraint MUST update the RLS INSERT policy in the same file.**

Three migrations in a row (Jul 19, Jul 22, Jul 23) updated the CHECK constraint and left the RLS policy behind. Each time, newly added events were silently dropped (42501 → 202) until the next audit. The Jul 23 gap cost a full day of page_view data.

## Pattern (copy this for every go_listen_events event change)

```sql
-- 1) CHECK constraint — new event list
ALTER TABLE go_listen_events
  DROP CONSTRAINT IF EXISTS go_listen_events_event_check;
ALTER TABLE go_listen_events
  ADD CONSTRAINT go_listen_events_event_check
  CHECK (event IN (
    'play_start', 'sec_30', 'pct_25', 'pct_50', 'pct_75',
    'complete', 'cta_click', 'cta_rendered', 'page_view',
    'preview_started', 'preview_completed', 'preview_unmuted',
    'preview_to_play', 'preview_skipped',
    'your_new_event'   -- ← add here
  ));

-- 2) RLS INSERT policy — MUST MATCH (drop + recreate, same event list)
DROP POLICY IF EXISTS go_listen_events_insert_anon ON public.go_listen_events;
CREATE POLICY go_listen_events_insert_anon ON public.go_listen_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    variant IN ('a', 'b', 'bare')
    AND event IN (
      'play_start', 'sec_30', 'pct_25', 'pct_50', 'pct_75',
      'complete', 'cta_click', 'cta_rendered', 'page_view',
      'preview_started', 'preview_completed', 'preview_unmuted',
      'preview_to_play', 'preview_skipped',
      'your_new_event'   -- ← add here too
    )
    AND position_seconds BETWEEN 0 AND 21600
    AND (utm_source IS NULL OR char_length(utm_source) <= 120)
    AND (utm_campaign IS NULL OR char_length(utm_campaign) <= 120)
    AND created_at BETWEEN now() - interval '1 minute' AND now() + interval '5 minutes'
  );
```

Also update `lib/goListenEventList.ts` — that's the canonical list the route and smoke test both read.

## After applying any migration

```bash
node scripts/smoke-go-listen-migration.js
```

All events must insert via anon key. Any 42501 = CHECK/RLS still out of sync.
