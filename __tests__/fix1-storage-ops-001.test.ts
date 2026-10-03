/**
 * FIX-1 STORAGE IDEMPOTENCY (Fix 1a) — unit tests for lib/storage/ops.
 *
 * Pure functions + in-memory fake drivers only. ZERO live Supabase/R2 writes.
 * Run: npx jest __tests__/fix1-storage-ops-001.test.ts
 */
import {
  deriveIdempotencyKey,
  sha256Hex,
  buildStagingKey,
  verifyBufferMatches,
  decideReplay,
  putObject,
  promoteObject,
  moveObject,
  JournalEntry,
  JournalDriver,
  StorageDriver,
} from '@/lib/storage/ops'

// ─── In-memory fakes (no I/O) ───────────────────────────────────────────────

function makeJournal(): JournalDriver & { rows: Map<string, JournalEntry> } {
  const rows = new Map<string, JournalEntry>()
  return {
    rows,
    async findByIdempotencyKey(key) { return rows.get(key) ?? null },
    async insertPending(entry) {
      const full: JournalEntry = { ...entry, status: 'pending', stagingKey: null, actualSha256: null, actualBytes: null, error: null }
      rows.set(entry.idempotencyKey, full)
      return full
    },
    async setStatus(key, status, patch = {}) {
      const cur = rows.get(key)
      if (!cur) throw new Error('missing journal row: ' + key)
      const next = { ...cur, status, ...patch }
      rows.set(key, next)
      return next
    },
  }
}

function makeStorage(): StorageDriver & { files: Map<string, Buffer>; liveWrites: string[]; stagingWrites: string[] } {
  const files = new Map<string, Buffer>()
  const liveWrites: string[] = []
  const stagingWrites: string[] = []
  return {
    files, liveWrites, stagingWrites,
    async writeStaging(k, body) { stagingWrites.push(k); files.set(k, Buffer.from(body)) },
    async readStaging(k) {
      const b = files.get(k)
      if (!b) throw new Error('staging miss: ' + k)
      return b
    },
    async removeStaging(k) { files.delete(k) },
    async promoteToLive(stagingKey, liveKey, expectedSha256, expectedBytes) {
      const body = files.get(stagingKey)
      if (!body) throw new Error('promote miss: ' + stagingKey)
      const existing = files.get('live:' + liveKey)
      if (existing) {
        // Never clobber: identical → noop, divergent → throw.
        if (sha256Hex(existing) === expectedSha256 && existing.length === expectedBytes) return 'noop_identical'
        throw new Error('FIX1_DIVERGENT_LIVE_KEY: refusing to overwrite ' + liveKey)
      }
      liveWrites.push(liveKey)
      files.set('live:' + liveKey, Buffer.from(body))
      return 'promoted'
    },
  }
}

function entry(over: Partial<JournalEntry> = {}): JournalEntry {
  return {
    idempotencyKey: 'k', storyId: 's', kind: 'put', liveKey: 'lk',
    stagingKey: null, status: 'pending',
    expectedSha256: 'h', expectedBytes: 1,
    actualSha256: null, actualBytes: null, error: null,
    ...over,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('deriveIdempotencyKey', () => {
  test('deterministic: same inputs → same key', () => {
    const a = deriveIdempotencyKey('story-1', 'abc123', 'put')
    const b = deriveIdempotencyKey('story-1', 'abc123', 'put')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  test('distinct across story / inputsHash / kind', () => {
    const base = deriveIdempotencyKey('story-1', 'abc123', 'put')
    expect(deriveIdempotencyKey('story-2', 'abc123', 'put')).not.toBe(base)
    expect(deriveIdempotencyKey('story-1', 'def456', 'put')).not.toBe(base)
    expect(deriveIdempotencyKey('story-1', 'abc123', 'move')).not.toBe(base)
    expect(deriveIdempotencyKey('story-1', 'abc123', 'promote')).not.toBe(base)
  })
})

describe('buildStagingKey', () => {
  test('deterministic and idempotency-scoped, never equal to live key', () => {
    const k = deriveIdempotencyKey('s', 'h', 'put')
    const s1 = buildStagingKey('asc3/s/final_mix.mp3', k)
    const s2 = buildStagingKey('asc3/s/final_mix.mp3', k)
    expect(s1).toBe(s2)
    expect(s1).not.toBe('asc3/s/final_mix.mp3')
    expect(s1).toContain('asc3/s/final_mix.mp3')
    expect(s1).toContain(k.slice(0, 16))
  })
})

describe('verifyBufferMatches', () => {
  test('ok when sha256+size both match', () => {
    const body = Buffer.from('audio-bytes')
    expect(verifyBufferMatches(body, sha256Hex(body), body.length)).toEqual({ ok: true })
  })

  test('fails on size mismatch', () => {
    const body = Buffer.from('audio-bytes')
    const r = verifyBufferMatches(body, sha256Hex(body), body.length + 1)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/size mismatch/)
  })

  test('fails on sha256 mismatch', () => {
    const body = Buffer.from('audio-bytes')
    const r = verifyBufferMatches(body, '0'.repeat(64), body.length)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/sha256 mismatch/)
  })
})

describe('decideReplay', () => {
  test('null → start', () => {
    expect(decideReplay(null)).toEqual({ action: 'start' })
  })

  test('committed → noop (replay writes NOTHING)', () => {
    expect(decideReplay(entry({ status: 'committed' }))).toEqual({ action: 'noop', reason: 'already_committed' })
  })

  test('rolled_back → throw (no silent retry)', () => {
    expect(decideReplay(entry({ status: 'rolled_back' }))).toEqual({ action: 'throw', reason: 'previously_rolled_back' })
  })

  test.each(['pending', 'staging', 'verifying'] as const)('%s → resume', (status) => {
    expect(decideReplay(entry({ status }))).toEqual({ action: 'resume', fromStatus: status })
  })
})

describe('putObject lifecycle (fake drivers, no live writes)', () => {
  test('fresh put: pending→…→committed, exactly one live write', async () => {
    const journal = makeJournal()
    const storage = makeStorage()
    const body = Buffer.from('final-mix-bytes')
    const res = await putObject({ storage, journal }, {
      storyId: 'story-1', inputsHash: 'in1', liveKey: 'asc3/story-1/final_mix.mp3', body,
    })
    expect(res.replayed).toBe(false)
    expect(res.sha256).toBe(sha256Hex(body))
    expect(res.bytes).toBe(body.length)
    expect(storage.liveWrites).toEqual(['asc3/story-1/final_mix.mp3'])
    expect(journal.rows.get(res.idempotencyKey)?.status).toBe('committed')
  })

  test('replay of committed key is a noop: zero additional writes', async () => {
    const journal = makeJournal()
    const storage = makeStorage()
    const params = { storyId: 'story-1', inputsHash: 'in1', liveKey: 'asc3/story-1/final_mix.mp3', body: Buffer.from('final-mix-bytes') }
    const first = await putObject({ storage, journal }, params)
    const stagingWritesAfterFirst = storage.stagingWrites.length
    const second = await putObject({ storage, journal }, params)
    expect(second.replayed).toBe(true)
    expect(second.idempotencyKey).toBe(first.idempotencyKey)
    expect(storage.liveWrites.length).toBe(1) // no second live write
    expect(storage.stagingWrites.length).toBe(stagingWritesAfterFirst) // no second staging write either
  })

  test('verification failure → rolled_back + staging removed + throw', async () => {
    const journal = makeJournal()
    const storage = makeStorage()
    // Corrupt the read-back path: staging returns different bytes than written.
    const origRead = storage.readStaging.bind(storage)
    storage.readStaging = async (k: string) => Buffer.from(await origRead(k)).fill(0x41)
    await expect(putObject({ storage, journal }, {
      storyId: 'story-9', inputsHash: 'in9', liveKey: 'asc3/story-9/final_mix.mp3', body: Buffer.from('good-bytes'),
    })).rejects.toThrow(/FIX1_VERIFY_FAILED/)
    const rows = [...journal.rows.values()]
    expect(rows[0].status).toBe('rolled_back')
    expect(storage.liveWrites.length).toBe(0) // live key NEVER touched on failure
  })

  test('rolled_back key replays throw (no silent retry)', async () => {
    const journal = makeJournal()
    const storage = makeStorage()
    const key = deriveIdempotencyKey('story-9', 'in9', 'put')
    // Seed a rolled_back row directly.
    await journal.insertPending({ idempotencyKey: key, storyId: 'story-9', kind: 'put', liveKey: 'lk', expectedSha256: 'h', expectedBytes: 1 })
    await journal.setStatus(key, 'rolled_back', { error: 'prior failure' })
    await expect(putObject({ storage, journal }, {
      storyId: 'story-9', inputsHash: 'in9', liveKey: 'lk', body: Buffer.from('x'),
    })).rejects.toThrow(/FIX1_REPLAY_BLOCKED/)
    expect(storage.liveWrites.length).toBe(0)
    expect(storage.stagingWrites.length).toBe(0)
  })

  test('divergent live key → promote throws, never clobbers', async () => {
    const journal = makeJournal()
    const storage = makeStorage()
    // Pre-existing DIFFERENT content at the live key.
    storage.files.set('live:asc3/s/final_mix.mp3', Buffer.from('someone-elses-bytes'))
    await expect(putObject({ storage, journal }, {
      storyId: 's', inputsHash: 'new-inputs', liveKey: 'asc3/s/final_mix.mp3', body: Buffer.from('my-bytes'),
    })).rejects.toThrow(/FIX1_DIVERGENT_LIVE_KEY/)
  })
})

describe('promoteObject + moveObject replay-noop', () => {
  test('promote: committed replay returns noop_identical without writes', async () => {
    const journal = makeJournal()
    const storage = makeStorage()
    const body = Buffer.from('staged-bytes')
    const stagingKey = 'asc3/s/final_mix.mp3.staging.abc123'
    storage.files.set(stagingKey, Buffer.from(body))
    const params = {
      storyId: 's', inputsHash: 'h1', stagingKey,
      liveKey: 'asc3/s/final_mix.mp3',
      expectedSha256: sha256Hex(body), expectedBytes: body.length,
    }
    const first = await promoteObject({ storage, journal }, params)
    expect(first.promoteResult).toBe('promoted')
    expect(first.replayed).toBe(false)
    const liveWrites = storage.liveWrites.length
    const second = await promoteObject({ storage, journal }, params)
    expect(second).toEqual({ idempotencyKey: first.idempotencyKey, replayed: true, promoteResult: 'noop_identical' })
    expect(storage.liveWrites.length).toBe(liveWrites)
  })

  test('move: committed replay is a noop, mover called exactly once', async () => {
    const journal = makeJournal()
    let calls = 0
    const mover = async () => { calls++ }
    const params = { storyId: 's', inputsHash: 'h2', fromKey: 'a.mp3', toLiveKey: 'b.mp3' }
    const first = await moveObject({ journal, mover }, params)
    expect(first).toEqual({ idempotencyKey: expect.any(String), replayed: false })
    const second = await moveObject({ journal, mover }, params)
    expect(second.replayed).toBe(true)
    expect(second.idempotencyKey).toBe(first.idempotencyKey)
    expect(calls).toBe(1)
  })
})
