-- Path 2: local render worker routing
ALTER TABLE production_jobs ADD COLUMN IF NOT EXISTS render_path TEXT DEFAULT 'vercel';

-- 'vercel' = standard Vercel function (default, stories ≤12 min)
-- 'local'  = local Mac render worker via launchd (stories >12 min / 15-20 min episodes)

COMMENT ON COLUMN production_jobs.render_path IS 'Routing flag: vercel (default) or local (Mac render worker for long episodes)';
