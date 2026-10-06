/**
 * FIX-1 SUPABASE ADAPTER — lib/storage/supabaseAdapter.ts
 *
 * StorageDriver + JournalDriver implementations backed by Supabase storage
 * (`audio` bucket) and the `storage_operations` journal table (migration
 * 20261003_fix1_storage_operations_journal.sql — NOT yet applied to prod,
 * so this adapter is CODE-ONLY in this pass; no live DB writes).
 *
 * Safety contract (matches ops.ts):
 *  - writeStaging: staging keys ONLY, upsert:true (idempotency-scoped, safe).
 *  - promoteToLive: ONLY live-key writer. Download staging → verify sha+size
 *    → check live: missing → move staging→live; identical → drop staging,
 *    return noop_identical; DIVERGENT → throw (never clobber).
 *    §10 last-write-wins does NOT apply here (playback-position only).
 *  - Journal: service-role client required (RLS: no public policies).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sha256Hex } from './ops'
import type { StorageDriver, JournalDriver, JournalEntry } from './ops'

const BUCKET = 'audio'

function rowToEntry(r: any): JournalEntry {
  return {
    idempotencyKey: r.idempotency_key,
    storyId: r.story_id,
    kind: r.kind,
    liveKey: r.live_key,
    stagingKey: r.staging_key,
    status: r.status,
    expectedSha256: r.expected_sha256,
    expectedBytes: Number(r.expected_bytes),
    actualSha256: r.actual_sha256,
    actualBytes: r.actual_bytes == null ? null : Number(r.actual_bytes),
    error: r.error,
  }
}

export function makeSupabaseJournal(sb: SupabaseClient): JournalDriver {
  return {
    async findByIdempotencyKey(key) {
      const { data, error } = await sb.from('storage_operations').select('*').eq('idempotency_key', key).maybeSingle()
      if (error) throw new Error(`FIX1_JOURNAL_READ_FAILED: ${error.message}`)
      return data ? rowToEntry(data) : null
    },
    async insertPending(entry) {
      const { data, error } = await sb
        .from('storage_operations')
        .insert({
          idempotency_key: entry.idempotencyKey,
          story_id: entry.storyId,
          kind: entry.kind,
          live_key: entry.liveKey,
          expected_sha256: entry.expectedSha256,
          expected_bytes: entry.expectedBytes,
        })
        .select('*')
        .single()
      if (error) throw new Error(`FIX1_JOURNAL_INSERT_FAILED: ${error.message}`)
      return rowToEntry(data)
    },
    async setStatus(key, status, patch) {
      const update: any = { status }
      if (patch?.stagingKey !== undefined) update.staging_key = patch.stagingKey
      if (patch?.actualSha256 !== undefined) update.actual_sha256 = patch.actualSha256
      if (patch?.actualBytes !== undefined) update.actual_bytes = patch.actualBytes
      if (patch?.error !== undefined) update.error = patch.error
      const { data, error } = await sb
        .from('storage_operations')
        .update(update)
        .eq('idempotency_key', key)
        .select('*')
        .single()
      if (error) throw new Error(`FIX1_JOURNAL_UPDATE_FAILED: ${error.message}`)
      return rowToEntry(data)
    },
  }
}

export function makeSupabaseStorage(sb: SupabaseClient): StorageDriver {
  return {
    async writeStaging(stagingKey, body, contentType) {
      const { error } = await sb.storage.from(BUCKET).upload(stagingKey, body, {
        contentType,
        upsert: true,
        cacheControl: '0',
      })
      if (error) throw new Error(`FIX1_STAGING_WRITE_FAILED ${stagingKey}: ${error.message}`)
    },
    async readStaging(stagingKey) {
      const { data, error } = await sb.storage.from(BUCKET).download(stagingKey)
      if (error) throw new Error(`FIX1_STAGING_READ_FAILED ${stagingKey}: ${error.message}`)
      const buf = Buffer.from(await data.arrayBuffer())
      return buf
    },
    async removeStaging(stagingKey) {
      const { error } = await sb.storage.from(BUCKET).remove([stagingKey])
      if (error) throw new Error(`FIX1_STAGING_REMOVE_FAILED ${stagingKey}: ${error.message}`)
    },
    async promoteToLive(stagingKey, liveKey, expectedSha256, expectedBytes) {
      // Verify staging bytes first.
      const { data: stagingData, error: stagingErr } = await sb.storage.from(BUCKET).download(stagingKey)
      if (stagingErr) throw new Error(`FIX1_PROMOTE_STAGING_MISSING ${stagingKey}: ${stagingErr.message}`)
      const stagingBuf = Buffer.from(await stagingData.arrayBuffer())
      if (stagingBuf.length !== expectedBytes || sha256Hex(stagingBuf) !== expectedSha256) {
        throw new Error(
          `FIX1_PROMOTE_VERIFY_FAILED ${stagingKey}→${liveKey}: size/sha mismatch (got ${stagingBuf.length}/${sha256Hex(stagingBuf).slice(0, 12)}…, want ${expectedBytes}/${expectedSha256.slice(0, 12)}…)`,
        )
      }
      // Check live key.
      const { data: liveData, error: liveErr } = await sb.storage.from(BUCKET).download(liveKey)
      if (liveErr) {
        // Assume missing → move staging into place. If the error was transient
        // (not a 404), move will fail loudly below — fail-closed.
        const { error: moveErr } = await sb.storage.from(BUCKET).move(stagingKey, liveKey)
        if (moveErr) throw new Error(`FIX1_PROMOTE_MOVE_FAILED ${stagingKey}→${liveKey}: ${moveErr.message}`)
        return 'promoted'
      }
      const liveBuf = Buffer.from(await liveData.arrayBuffer())
      if (liveBuf.length === expectedBytes && sha256Hex(liveBuf) === expectedSha256) {
        // Identical → idempotent noop; clean up staging copy.
        await sb.storage.from(BUCKET).remove([stagingKey]).catch(() => {})
        return 'noop_identical'
      }
      // Divergent live content → NEVER clobber (§10 last-write-wins is playback-only).
      throw new Error(
        `FIX1_PROMOTE_DIVERGENT ${liveKey}: live bytes differ from staged (live ${liveBuf.length}/${sha256Hex(liveBuf).slice(0, 12)}… vs staged ${expectedBytes}/${expectedSha256.slice(0, 12)}…) — refusing to clobber`,
      )
    },
  }
}
