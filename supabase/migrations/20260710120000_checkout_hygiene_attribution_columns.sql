-- ATL-CHECKOUT-HYGIENE-001 (defect 3): signup attribution UPDATE fails
-- wholesale because public.users is missing columns the signup page writes.
-- One missing column makes PostgREST reject the ENTIRE update, so
-- utm_source/utm_medium/utm_campaign/utm_captured_at/signup_promo_code/
-- heard_about_us all stayed NULL for every signup (proof: Marc's rehearsal
-- row 6887949e-732c-4396-bb1c-db0cdcc80f95, all-null utm).
--
-- Live-DB column check 2026-07-10 (project vmyhlfeouzslixtkmddy):
--   utm_source, utm_medium, utm_campaign, utm_captured_at  → EXIST
--   signup_promo_code, heard_about_us                      → MISSING
-- (Migration 20260706001_gvl_test_attribution.sql contains identical ALTERs
-- but was evidently only partially applied to the live DB.)
--
-- All statements are idempotent; the two missing columns are the real change.
-- No data migration / backfill: new-signups-only fix per task scope.

ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_promo_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS heard_about_us TEXT;

-- Defensive no-ops on live DB (verified existing 2026-07-10); kept so any
-- fresh/local environment converges to the same schema:
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_captured_at TIMESTAMPTZ;
