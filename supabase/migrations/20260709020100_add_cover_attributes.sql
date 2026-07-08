-- C6 Cover Performance Tracking: cover attribute tags on stories.
-- Shape: { palette: 'bright'|'dark', dominant_subject: 'face'|'figure'|'object'|'landscape',
--          face_visible: boolean, temperature: 'warm'|'cool', source: 'prompt'|'vision',
--          model?: string, tagged_at: ISO timestamp }
alter table public.stories
  add column if not exists cover_attributes jsonb;
