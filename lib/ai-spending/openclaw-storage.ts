import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseExport, usageSummary, type UsageEvent } from './openclaw'
const BUCKET = 'ai-spending-private'
export async function readImports(db: SupabaseClient) {
  try {
    const { data: bucket, error: bucketError } = await db.storage.getBucket(BUCKET)
    if (bucketError && String((bucketError as any).status ?? (bucketError as any).statusCode) === '404') return { status: 'not_connected', daily: [], anomalies: [], runs: 0, snapshots: 0 }
    if (bucketError || !bucket || bucket.public) throw new Error('Private storage unavailable')
    const { data: files, error } = await db.storage.from(BUCKET).list('imports', { limit: 51, sortBy: { column: 'name', order: 'asc' } })
    if (error || !files || files.length > 50) throw new Error('Import read limit or storage failure')
    const events = new Map<string, UsageEvent>(); const conflicts = new Set<string>(); let bytes = 0
    for (const file of files) {
      if (!/^[a-f0-9]{64}\.jsonl$/.test(file.name)) throw new Error('Unexpected storage object')
      const { data, error } = await db.storage.from(BUCKET).download(`imports/${file.name}`)
      if (error || !data) throw new Error('Snapshot unavailable')
      bytes += data.size; if (bytes > 100000000) throw new Error('Import size limit')
      for (const e of parseExport(await data.text())) {
        const prior = events.get(e.event_id)
        if (prior && JSON.stringify(prior) !== JSON.stringify(e)) conflicts.add(e.event_id)
        else events.set(e.event_id, e)
        if (events.size > 100000) throw new Error('Run limit')
      }
    }
    for (const id of conflicts) events.delete(id)
    return { status: conflicts.size ? 'partial' : files.length ? 'connected' : 'not_connected', ...usageSummary([...events.values()]), conflicts: conflicts.size, snapshots: files.length }
  } catch { return { status: 'unavailable', daily: [], anomalies: [], runs: 0, snapshots: 0, error: 'OpenClaw private imports could not be read. Check storage configuration and import limits.' } }
}
export async function saveImport(db: SupabaseClient, text: string) {
  const events = parseExport(text)
  const normalized = events.sort((a, b) => a.event_id.localeCompare(b.event_id)).map(e => JSON.stringify(e)).join('\n') + '\n'
  const digest = createHash('sha256').update(normalized).digest('hex')
  const found = await db.storage.getBucket(BUCKET)
  if (found.error) {
    if (String((found.error as any).status ?? (found.error as any).statusCode) !== '404') throw new Error('Private storage access failed.')
    const made = await db.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 4000000, allowedMimeTypes: ['application/x-ndjson'] })
    if (made.error) { const check = await db.storage.getBucket(BUCKET); if (check.error || !check.data || check.data.public) throw new Error('Private import storage could not be created.') }
  } else if (!found.data || found.data.public) throw new Error('Import bucket must be private.')
  const { data: files, error: listError } = await db.storage.from(BUCKET).list('imports', { limit: 51 })
  if (listError || !files) throw new Error('Import storage could not be checked.')
  if (files.some(f => f.name === `${digest}.jsonl`)) return { runs: events.length, repeated: true }
  if (files.length >= 50) throw new Error('Import storage has reached its 50-snapshot limit. Existing history is preserved.')
  const { error } = await db.storage.from(BUCKET).upload(`imports/${digest}.jsonl`, normalized, { contentType: 'application/x-ndjson', upsert: false })
  if (error && String((error as any).statusCode ?? (error as any).status) !== '409') throw new Error('Import could not be saved.')
  return { runs: events.length, repeated: !!error }
}
