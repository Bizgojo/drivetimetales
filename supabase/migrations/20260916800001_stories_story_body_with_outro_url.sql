ALTER TABLE stories ADD COLUMN IF NOT EXISTS story_body_with_outro_url text;
COMMENT ON COLUMN stories.story_body_with_outro_url IS 'Personalized queue segment: story_body.mp3 + outro_with_music.mp3 concatenated as one file. When set, the ASC3 personalized queue uses this as a single segment 3, eliminating the outro network-fetch gap on iOS.';
