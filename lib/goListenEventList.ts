/**
 * GO_LISTEN_EVENTS — canonical event list for go_listen_events.
 *
 * SINGLE SOURCE OF TRUTH for:
 *   1. The route's VALID_EVENTS whitelist (app/api/go-listen/route.ts)
 *   2. The post-migration smoke test (scripts/smoke-go-listen-migration.js)
 *
 * When adding a new event:
 *   a. Add it here.
 *   b. Write a migration that updates BOTH the CHECK constraint AND the
 *      RLS INSERT policy in the same file (see supabase/migrations/README.md).
 *   c. Run the smoke test after applying the migration.
 *
 * History:
 *   2026-07-18 — initial: play_start pct_25 pct_50 pct_75 complete cta_click
 *   2026-07-19 — INSTRUM-001: + sec_30
 *   2026-07-22 — CTA-INSTRUMENTATION-001: + cta_rendered
 *   2026-07-23 — PAGE-VIEW-001: + page_view, preview_started/completed/unmuted/to_play/skipped
 *   2026-07-24 — RLS-FIX-001: RLS policy synced with full list
 */
export const GO_LISTEN_EVENTS = [
  'play_start',
  'sec_30',
  'pct_25',
  'pct_50',
  'pct_75',
  'complete',
  'cta_click',
  'preview_started',
  'preview_completed',
  'preview_unmuted',
  'preview_to_play',
  'preview_skipped',
  'cta_rendered',
  'page_view',
] as const

export type GoListenEvent = (typeof GO_LISTEN_EVENTS)[number]
