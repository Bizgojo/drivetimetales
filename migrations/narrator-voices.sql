CREATE TABLE IF NOT EXISTS narrator_voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  voice_id TEXT NOT NULL UNIQUE,
  gender TEXT NOT NULL,
  tone TEXT NOT NULL,
  accent TEXT NOT NULL,
  description TEXT NOT NULL,
  best_genres TEXT[] NOT NULL,
  sample_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO narrator_voices (name, voice_id, gender, tone, accent, description, best_genres) VALUES
  ('James','JBFqnCBsd6RMkjVDRZzb','male','warm','british','Warm captivating storyteller with gravitas',ARRAY['Mystery','Drama','Literary','Historical']),
  ('Cole','nPczCjzI2devNBz1zQrb','male','dark','american','Deep resonant voice with quiet menace',ARRAY['Horror','Thriller','Mystery','Suspense']),
  ('Marcus','onwK4e9ZLuTAKqWW03F9','male','crisp','british','Authoritative broadcaster precise and trustworthy',ARRAY['Science Fiction','Historical','Drama']),
  ('Finn','IKne3meq5aSn9XLyUdCD','male','warm','australian','Energetic confident with adventurous edge',ARRAY['Adventure','Western','Action','Thriller']),
  ('Elliott','pqHfZKP75CvOlQylNhV4','male','intimate','american','Wise unhurried like a grandfather by firelight',ARRAY['Literary','Drama','Romance','Historical']),
  ('Ray','CwhRBWXzGAHq8TQ4Fs17','male','dark','american','World-weary Southern grit seen too much',ARRAY['Horror','Western','Mystery','Noir']),
  ('Clara','Xb7hH8MSUJpSbSDYk0k2','female','crisp','british','Clear intelligent precise',ARRAY['Mystery','Thriller','Science Fiction','Drama']),
  ('Nora','XrExE9yKIg1WjnnlVkGX','female','warm','american','Knowledgeable and grounded in authority',ARRAY['Literary','Drama','Historical','Romance']),
  ('June','pFZP5JQG7iQjIQuC4Bku','female','intimate','british','Velvety actress voice draws you close',ARRAY['Horror','Romance','Literary','Thriller']),
  ('Sage','cgSgspJ2msm6clMCkdW9','female','warm','american','Playful yet grounded bright warmth in dark places',ARRAY['Mystery','Adventure','Drama','Comedy']),
  ('Morgan','SAz9YHcvj6GT2YYXdXww','neutral','intimate','american','Relaxed unhurried deeply immersive',ARRAY['Science Fiction','Literary','Drama','Horror']),
  ('Quinn','FGY2WhTYpPnrIDTdsKH5','female','warm','american','Enthusiastic quirky unexpected warmth',ARRAY['Comedy','Adventure','Romance','Mystery'])
ON CONFLICT (voice_id) DO NOTHING;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS narrator_voice_id TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS narrator_voice_name TEXT;
ALTER TABLE narrator_voices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "narrator_voices_read" ON narrator_voices FOR SELECT USING (true);
