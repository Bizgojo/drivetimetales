-- AUTHOR-STYLE-SHEET-001 / canon STYLE-001 (Marc 2026-11-01): every author's
-- style sheet is kept on the author record.
alter table public.authors add column if not exists style_sheet jsonb;
comment on column public.authors.style_sheet is 'STYLE-001: complete style sheet for the real author this pen name imitates (see Bible/style-sheets).';
