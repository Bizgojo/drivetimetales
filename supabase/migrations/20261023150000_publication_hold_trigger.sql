-- PUBLICATION-HOLD SERIALIZATION BARRIER (lake-marion-1445-atomic-bar +
-- concurrency-proof-standard-1500, Marc 2026-10-23). Supersedes the v1
-- trigger (plain SELECT re-read), which Marc 15:00 ruled insufficient:
-- a plain SELECT does not serialize hold-set vs publish — a hold landing
-- BETWEEN the trigger's read and the publishing transaction's commit still
-- loses, and two such reads can never be atomic with the write.
--
-- Shared serialization mechanism: the atlas_settings publication_hold ROW
-- LOCK. Both sides participate:
--   publish side — this trigger reads the envelope with SELECT ... FOR
--     UPDATE, holding the hold-row lock until the publishing transaction
--     commits or rolls back;
--   hold-set side — setPublicationHold() (lib/publicationHold.ts) upserts
--     the SAME key, so on conflict it UPDATEs the same row and takes the
--     same row lock (a concurrent hold-set blocks behind an in-flight
--     publish instead of slipping past it).
--
-- Defined semantics (both orderings safe, no silent publish-after-hold):
--   (a) hold committed first → any later becoming-visible UPDATE reads
--       HELD inside its own transaction and aborts (zero rows).
--   (b) publish transaction locks first → a concurrent hold-set BLOCKS
--       until the publish commits/rolls back, then lands. The in-flight
--       publish is NOT retroactively aborted; EVERY subsequent publish is
--       refused. Hold waits; it never loses silently.
--   (c) truly concurrent → exactly one side wins the row lock; the
--       outcome is either (a) or (b). Both are safe.
-- Lock ordering is acyclic (publish: story row → hold row; hold-set:
-- hold row only), so the barrier introduces no deadlock.
--
-- PRECONDITION: the hold row MUST exist, or there is no row to lock.
-- This migration seeds an OPEN envelope row (ON CONFLICT DO NOTHING so
-- re-apply is safe). Never delete the publication_hold row; if it is
-- ever missing, the trigger degrades to a read-committed re-read (still
-- blocks case (a), but case (b)/(c) lose serialization). Code-level
-- checks (fail-fast 409 + re-read before terminal write) stay as UX;
-- the trigger is the backstop, and its violation surfaces as a 500,
-- never a silent publish.
--
-- Firing condition (mirrors isBecomingListenerVisible() in
-- lib/publicationHold.ts — keep them in sync):
--   NEW is listener-visible (status='published' AND is_hidden=false) AND
--   OLD was not (row is BECOMING visible, not merely touched while visible).
--
-- Hold parsing (mirrors parsePublicationHold() for the values writers emit):
--   JSON envelope with "held":true or "state":"held" → HELD;
--   legacy plain 'held'/'true'/'1' → HELD; missing row → OPEN (hold is
--   exceptional, default open). A failed read aborts the transaction anyway,
--   which is the fail-closed direction (same as the code-level read-error
--   rule). A reason string that happens to contain a held marker also blocks
--   (fail-closed; writers never emit such reasons).
--
-- Scope: BEFORE UPDATE on public.stories ONLY. The workflow-state check
-- constraint and every other constraint/trigger are untouched (the unpublished_library
-- deferral stands). INSERT is out of scope: publication always flows through
-- updates of existing rows on every writer path.

CREATE OR REPLACE FUNCTION public.block_publication_while_hold_active()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  hold_value text;
  hold_nospace text;
  held boolean := false;
BEGIN
  -- Becoming-visible only: NEW visible AND OLD not visible.
  -- Serialization: FOR UPDATE locks the hold envelope row until THIS
  -- publishing transaction commits/rolls back, so a concurrent hold-set
  -- (which UPDATEs this same row) blocks behind an in-flight publish
  -- instead of slipping past it, and a hold committed first is always
  -- seen here (row lock waits for the concurrent updater, then re-reads
  -- the newest committed version). Plain SELECT could do neither.
  IF NEW.status = 'published'
     AND COALESCE(NEW.is_hidden, true) = false
     AND (OLD.status IS DISTINCT FROM 'published' OR COALESCE(OLD.is_hidden, true) = true) THEN
    SELECT value INTO hold_value FROM public.atlas_settings WHERE key = 'publication_hold' FOR UPDATE;
    IF FOUND AND hold_value IS NOT NULL THEN
      hold_nospace := replace(hold_value, ' ', '');
      held :=
        hold_nospace LIKE '%"held":true%'
        OR hold_nospace LIKE '%"state":"held"%'
        OR lower(trim(both from hold_value)) IN ('held', 'true', '1');
      IF held THEN
        RAISE EXCEPTION 'publication_hold: global publication hold is ACTIVE (story id=%). Becoming-visible update aborted with zero rows written.', NEW.id
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_publication_while_hold_active ON public.stories;

CREATE TRIGGER trg_block_publication_while_hold_active
  BEFORE UPDATE ON public.stories
  FOR EACH ROW
  EXECUTE FUNCTION public.block_publication_while_hold_active();

-- Serialization precondition: the hold row MUST exist, or FOR UPDATE
-- locks nothing. Seed an OPEN envelope (idempotent; never overwrites a
-- live hold — ON CONFLICT DO NOTHING). Never delete this row.
INSERT INTO public.atlas_settings (key, value, updated_by)
VALUES ('publication_hold', '{"held":false,"state":"released","by":"migration-seed","reason":"serialization-barrier precondition row","at":"2026-10-23T00:00:00.000Z"}', 'migration-seed')
ON CONFLICT (key) DO NOTHING;
