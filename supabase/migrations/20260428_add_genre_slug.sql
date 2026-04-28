ALTER TABLE genres
ADD COLUMN IF NOT EXISTS slug TEXT;

UPDATE genres
SET slug = lower(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL OR slug = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_genres_slug_unique
ON genres(slug)
WHERE slug IS NOT NULL;

