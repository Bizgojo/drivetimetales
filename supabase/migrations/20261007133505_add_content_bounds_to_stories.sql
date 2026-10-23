-- Audio/text sync: story-body boundaries within the final mixed audio file.
-- content_start_ms = where the story body begins (after Belle B sting/intro)
-- content_end_ms   = where the story body ends (before the outro)
-- Both nullable: only populated going forward by render-final-mix for newly
-- rendered episodes. Existing back-catalog rows stay null (no backfill).
alter table public.stories
  add column if not exists content_start_ms integer,
  add column if not exists content_end_ms integer;

comment on column public.stories.content_start_ms is 'Offset (ms) into the final mixed audio file where the story body (excluding Belle B intro/sting) begins. Null for episodes rendered before this field existed.';
comment on column public.stories.content_end_ms is 'Offset (ms) into the final mixed audio file where the story body ends (before outro). Null for episodes rendered before this field existed.';
