-- ATL-BELLE-CACHE-001: Belle variant cache.
-- Adds script_hash (sha256 of prompt + model + template version) to
-- story_belle_variants so retries can detect that stored variants were
-- generated from identical inputs and skip the haiku LLM calls.
--
-- Existing rows keep script_hash = NULL, which the cache treats as a miss:
-- they regenerate exactly once on the next run and are cached thereafter.
-- No data is deleted by this migration.

ALTER TABLE story_belle_variants
  ADD COLUMN IF NOT EXISTS script_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_story_belle_variants_script_hash
  ON story_belle_variants(story_id, script_hash);
