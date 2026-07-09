/**
 * Queue title-deduplication logic (PIPE-AUDIT-001 item 3).
 *
 * DEFECT FIXED HERE: the original dispatch-queue auto-dedup grouped every
 * stories_in_queue row by lowercased title GLOBALLY, so unrelated series
 * episodes that legitimately share a generic title ("The Pattern",
 * "The Response", "The Pulse", …) were treated as duplicates and one of them
 * was silently moved to cold_storage (and its active jobs cancelled), with the
 * audit actor falsified as 'orion'.
 *
 * New rules:
 *  1. Series-scoped matching — a title only collides with the SAME series
 *     (same series_id) or, for standalones, with other standalone titles.
 *     Cross-series title matches are never duplicates.
 *  2. Detection only — callers must flag needs_attention for human
 *     confirmation. NOTHING is auto-moved to cold_storage and no jobs are
 *     cancelled without a human decision.
 */

export type QueueDedupRow = {
  id: string
  title: string | null
  series_id?: string | null
  story_type?: string | null
  production_priority?: number | null
  created_at?: string | null
}

export type DuplicateGroup = {
  /** Scoped dedup key (series or standalone scope + normalized title). */
  key: string
  /** Row preferred to keep (highest production_priority, then earliest created_at). */
  keeperId: string
  /** Rows flagged as likely duplicates of the keeper. */
  duplicateIds: string[]
}

export function dedupKey(row: QueueDedupRow): string | null {
  const title = String(row.title || '').trim().toLowerCase()
  if (!title) return null
  const scope = row.series_id
    ? `series:${row.series_id}`
    : 'standalone'
  return `${scope}::${title}`
}

function keeperSortValue(row: QueueDedupRow): [number, number] {
  const priority = Number(row.production_priority ?? 0)
  const created = Date.parse(row.created_at || '') || Number.MAX_SAFE_INTEGER
  return [Number.isFinite(priority) ? priority : 0, created]
}

/**
 * Find likely duplicate queue entries using series-scoped title matching.
 * Rows may be passed in any order; keeper selection is deterministic
 * (highest production_priority, then earliest created_at, then id).
 */
export function findQueueDuplicates(rows: QueueDedupRow[]): DuplicateGroup[] {
  const byKey = new Map<string, QueueDedupRow[]>()
  for (const row of rows) {
    const key = dedupKey(row)
    if (!key) continue
    const bucket = byKey.get(key)
    if (bucket) bucket.push(row)
    else byKey.set(key, [row])
  }

  const groups: DuplicateGroup[] = []
  for (const [key, bucket] of Array.from(byKey.entries())) {
    if (bucket.length < 2) continue
    const sorted = [...bucket].sort((a, b) => {
      const [pa, ca] = keeperSortValue(a)
      const [pb, cb] = keeperSortValue(b)
      if (pa !== pb) return pb - pa           // higher priority first
      if (ca !== cb) return ca - cb           // earlier created first
      return String(a.id).localeCompare(String(b.id))
    })
    groups.push({
      key,
      keeperId: sorted[0].id,
      duplicateIds: sorted.slice(1).map((row) => row.id),
    })
  }
  return groups
}
