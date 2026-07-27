-- 2026-07-27: Add listen_arm to users for clean per-user arm attribution
-- Required for The Fourth Woman acquisition test variant tracking.
-- go_listen_events has no user_id; this column closes the gap.
ALTER TABLE users ADD COLUMN IF NOT EXISTS listen_arm SMALLINT;
COMMENT ON COLUMN users.listen_arm IS 'Acquisition funnel arm: 1=90s promo, 2=3min promo, 3=5min promo. Written at /listen signup.';
