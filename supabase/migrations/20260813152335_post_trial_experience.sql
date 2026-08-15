-- POST-TRIAL-BELLE-001: cache Belle's post-trial wall audio URL per user.
-- Two columns on the users table — one per wall variant.
-- URLs are written by /api/post-trial-belle after first render.
-- NULL means not yet generated; non-null is the public Supabase storage URL.
-- NOTE: Do NOT run until Marc confirms the 'audio' bucket allows
--   paths under post-trial-samples/.
-- DO NOT RUN — Marc runs migrations.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS post_trial_belle_standalone_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS post_trial_belle_series_url     TEXT NULL;

COMMENT ON COLUMN users.post_trial_belle_standalone_url IS
  'Cached ElevenLabs Belle B audio URL for post-trial standalone wall. Generated on first wall display, addressed to the user by name.';

COMMENT ON COLUMN users.post_trial_belle_series_url IS
  'Cached ElevenLabs Belle B audio URL for post-trial series wall. Generated on first wall display, addressed to the user by name.';
