-- Large-document compare-and-swap for stories rows (Orion 2026-10-22,
-- feature branch fix/cas-rpc-large-doc — FOR REVIEW ONLY)
--
-- Problem: whole-doc `script_json=eq.<doc>` URL filters return 400 Bad
-- Request at production doc sizes (Creek: 18–27KB docs, 25–36KB
-- URL-encoded; reproduced live 2026-10-22 on a read-only SELECT with the
-- identical filter shape). Every CAS-guarded script_json write in
-- lib/belleRepairPersist.ts is therefore inoperable on real rows.
--
-- Fix: move the equality check server-side. The expected snapshot travels
-- in the RPC POST body (no URL length limit); the comparison runs inside
-- ONE atomic UPDATE statement with an affected-row check via RETURNING.
-- jsonb `=` is order-insensitive semantic equality — strictly stronger
-- than the old text comparison. Full-update callers (persist step-1)
-- keep single-statement atomicity across all repaired columns. No guard
-- removed, no data moved or shrunk, payload/audit/recovery semantics
-- unchanged.
--
-- REVIEW STATUS: prepared for Codex review. NEVER applied to production
-- by this task. Production apply (Supabase SQL Editor, Marc/operator)
-- happens only after Codex review + Marc explicit approval. (Applied
-- locally to an ephemeral scratch cluster on 2026-10-22 SOLELY for the
-- real-PostgREST transport test — production untouched.)
--
-- Rollback: DROP FUNCTION public.cas_update_story(uuid,jsonb,jsonb).

CREATE OR REPLACE FUNCTION public.cas_update_story(
  p_story_id uuid,
  p_expected jsonb,
  p_updates jsonb
)
RETURNS TABLE (updated_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  -- CLOSED column whitelist: every key the Belle-repair persist path
  -- writes (route + recovery script). Unknown keys RAISE (loud) rather
  -- than silently dropping a repair column.
  allowed_keys text[] := ARRAY[
    'script', 'script_json',
    'announcement_text', 'outro_text',
    'announcement_url', 'outro_audio_url', 'outro_with_music_url'
  ];
  k text;
BEGIN
  FOR k IN SELECT jsonb_object_keys(p_updates) LOOP
    IF NOT (k = ANY (allowed_keys)) THEN
      RAISE EXCEPTION 'cas_update_story: column % not in whitelist', k;
    END IF;
  END LOOP;
  -- `?` tests key PRESENCE: an explicit JSON null writes SQL NULL (the
  -- audio-invalidation nulls), while an absent key leaves the column
  -- untouched. `->>` for text columns, `->` for the jsonb column.
  RETURN QUERY
  UPDATE public.stories SET
    script = CASE WHEN p_updates ? 'script' THEN p_updates ->> 'script' ELSE script END,
    script_json = CASE WHEN p_updates ? 'script_json' THEN p_updates -> 'script_json' ELSE script_json END,
    announcement_text = CASE WHEN p_updates ? 'announcement_text' THEN p_updates ->> 'announcement_text' ELSE announcement_text END,
    outro_text = CASE WHEN p_updates ? 'outro_text' THEN p_updates ->> 'outro_text' ELSE outro_text END,
    announcement_url = CASE WHEN p_updates ? 'announcement_url' THEN p_updates ->> 'announcement_url' ELSE announcement_url END,
    outro_audio_url = CASE WHEN p_updates ? 'outro_audio_url' THEN p_updates ->> 'outro_audio_url' ELSE outro_audio_url END,
    outro_with_music_url = CASE WHEN p_updates ? 'outro_with_music_url' THEN p_updates ->> 'outro_with_music_url' ELSE outro_with_music_url END
  WHERE id = p_story_id
    AND (
      script_json = p_expected
      -- Parity with the old `eq.null` (IS NULL) filter shape: an absent
      -- expected snapshot matches only a NULL doc, never a real one.
      OR (p_expected IS NULL AND script_json IS NULL)
    )
  RETURNING id;
END;
$$;

COMMENT ON FUNCTION public.cas_update_story(uuid, jsonb, jsonb) IS
  'Atomic compare-and-swap for stories rows on large docs. '
  'Empty result = conflict (row moved under us) — caller treats as '
  'concurrent-modification, row untouched. Unknown update keys raise.';

-- Least privilege: the server-side service role used by the app/routes.
-- (Anon/authenticated intentionally NOT granted — no client path calls this.)
GRANT EXECUTE ON FUNCTION public.cas_update_story(uuid, jsonb, jsonb) TO service_role;
