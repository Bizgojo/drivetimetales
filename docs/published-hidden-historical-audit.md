# Published-but-hidden historical audit (read only)

This is an **offline audit**, not a publication fixer. It never connects to Supabase, makes HTTP calls, submits publication requests, queues production, or writes any database rows. It does not automatically correct workflow labels.

## Export

From an authorized, read-only database session, export a JSON array of story rows (full series siblings, not just the affected records). Keep the export **outside Git** and do not share credentials.

Suggested read-only SQL:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT json_agg(s ORDER BY s.id)
FROM public.stories s
WHERE s.series_id IN (
  SELECT DISTINCT series_id FROM public.stories
  WHERE workflow_state='published' AND is_hidden=true AND series_id IS NOT NULL
)
OR (s.workflow_state='published' AND s.is_hidden=true AND s.series_id IS NULL);
COMMIT;
```

Save the returned JSON array as `/tmp/et-story-snapshot.json`. The export must be complete enough to inspect sibling order; never interpret a partial series as complete.

```bash
python3 scripts/audit_published_hidden.py /tmp/et-story-snapshot.json > /tmp/et-audit.json
python3 -m unittest discover -s tests -p 'test_published_hidden_audit.py'
```

## Corrective operations not implemented

No output row is marked publishable. The `after` and `rollback` are **identical** to `before`; `write_plan` is always empty. An independent implementation and explicit operator approval are required before any repair can be performed. In particular:

1. Audit full episode series completeness, valid artifacts and production jobs, approval decisions, publication holds, Belle copy and freshness, personalization, and exact current server gates. A URL alone is not evidence of a valid completed mix.
2. Investigate provenance of anomalous `workflow_state` edits; compare the baseline against latest state.
3. Re-read each candidate and reject changed rows using the recorded fingerprint, `version`, and timestamps; obtain an atomic conditional-write mechanism in the separate approved repair implementation.
4. Backup immutable before-images, record approved changes and operation IDs, and verify postcondition; provide a real rollback workflow.
5. Preserve good existing audio. **Never** trigger paid jobs, change publication visibility, or bypass gates as a data-cleanup shortcut.

This audit intentionally makes no decision that a legacy record should become listener-visible.
