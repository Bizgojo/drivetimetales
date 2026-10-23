-- PUBLICATION-HOLD ATOMIC BARRIER (lake-marion-1445-atomic-bar, Marc 2026-10-23).
--
-- Ground truth: every publication writer checks the atlas_settings
-- publication_hold envelope in code (fail-fast + re-read before the terminal
-- write), but two reads can never be atomic with the write that follows —
-- a hold landing BETWEEN the final re-read and the UPDATE's commit still
-- loses. This trigger closes that window: it runs INSIDE the writing
-- transaction, reads the committed hold envelope at write time, and aborts
-- a becoming-visible update with zero rows written.
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
  IF NEW.status = 'published'
     AND COALESCE(NEW.is_hidden, true) = false
     AND (OLD.status IS DISTINCT FROM 'published' OR COALESCE(OLD.is_hidden, true) = true) THEN
    SELECT value INTO hold_value FROM public.atlas_settings WHERE key = 'publication_hold';
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
