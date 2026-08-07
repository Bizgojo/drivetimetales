-- Genre attributes production load — GENRE-ATTRIBUTES-SPEC v1.0
-- Applied directly 2026-07-23 (feature/genre-attributes-blp migration blocked by missing slug column in prod)
-- Uses ON CONFLICT(name) DO UPDATE to update existing genre records

ALTER TABLE genres ADD COLUMN IF NOT EXISTS listener_contract TEXT;
ALTER TABLE genres ADD COLUMN IF NOT EXISTS pacing_profile TEXT;
ALTER TABLE genres ADD COLUMN IF NOT EXISTS ending_contract TEXT;
ALTER TABLE genres ADD COLUMN IF NOT EXISTS ending_failure_modes TEXT;
ALTER TABLE genres ADD COLUMN IF NOT EXISTS sound_profile TEXT;
ALTER TABLE genres ADD COLUMN IF NOT EXISTS narrator_register TEXT;
ALTER TABLE genres ADD COLUMN IF NOT EXISTS cover_art_guidance TEXT;
ALTER TABLE genres ADD COLUMN IF NOT EXISTS adjacency_group TEXT;
ALTER TABLE genres ADD COLUMN IF NOT EXISTS hard_rules TEXT;
ALTER TABLE genres ADD COLUMN IF NOT EXISTS alias_of TEXT;

SELECT 'DDL complete: columns added' AS status;
