/**
 * FIX-1 STORAGE IDEMPOTENCY — lib/storage/ops.ts
 *
 * Journal-first, content-addressed storage operations.
 *
 * SCOPE (Fix 1a, non-blocked parts only):
 *  - Deterministic idempotency-key derivation: sha256(storyId:inputsHash:kind)
 *  - Journal-first lifecycle: pending → staging → verifying → committed | rolled_back
 *  - sha256 + byte-size verification on EVERY write before promote
 *  - NO upsert:true against live keys — live keys are only ever written via
 *    promoteObject (staging → live move). Staging writes use upsert:true
 *    keyed by the idempotency key, so replays are safe noops.
 *
 * OUT OF SCOPE (blocked on §10 business-rule answers — DO NOT ADD HERE):
 *  - device tables, story_objects table, canonical pointer (depend on Q2/Q5)
 *  - playback-position policy, retention/GC grace windows, cache-eviction
 *    authority, cross-device sharing, correction-artifact canonical status,
 *    story_body_with_outro fatal-vs-warn (all blocked on Marc)
 *
 * Design: storage + journal clients are INJECTED so the pure decision logic
 * is unit-testable with zero live Supabase/R2 writes.
 */

import { createHash } from 'crypto'

// ─── Types ──────────────────────────────────────────────────────────────────

export type OperationKind = 'put' | 'move' | 'promote'

export type OperationStatus =
  | 'pending'      // journal row written, no bytes yet
  | 'staging'      // bytes written to staging key, unverified
  | 'verifying'    // sha256+size check in progress
  | 'committed'    // verified AND promoted to live key — terminal success
  | 'rolled_back'  // verification failed, staging bytes removed — terminal failure

export const TERMINAL_STATUSES: readonly OperationStatus[] = ['committed', 'rolled_back']

export interface JournalEntry {
  idempotencyKey: string
  storyId: string
  kind: OperationKind
  liveKey: string
  stagingKey: string | null
  status: OperationStatus
  expectedSha256: string
  expectedBytes: number
  actualSha256: string | null
  actualBytes: number | null
  error: string | null
}

/** Minimal storage surface — implemented by a Supabase-storage adapter in a later fix. */
export interface StorageDriver {
  /** Write to a STAGING key only. Must pass upsert:true (staging keys are idempotency-scoped). */
  writeStaging(stagingKey: string, body: Buffer, contentType: string): Promise<void>
  /** Read back bytes from a staging key for verification. */
  readStaging(stagingKey: string): Promise<Buffer>
  /** Remove a staging key (rollback path). Non-fatal if missing. */
  removeStaging(stagingKey: string): Promise<void>
  /**
   * Promote staging → live. ONLY method allowed to touch a live key,
   * and it must NEVER use upsert/overwrite: if the live key already exists
   * with identical sha256+size it is a noop; if it exists with DIFFERENT
   * content it must throw (never silently clobber).
   */
  promoteToLive(stagingKey: string, liveKey: string, expectedSha256: string, expectedBytes: number): Promise<'promoted' | 'noop_identical'>
}

/** Minimal journal surface — backed by the storage_operations table. */
export interface JournalDriver {
  findByIdempotencyKey(key: string): Promise<JournalEntry | null>
  insertPending(entry: Omit<JournalEntry, 'status' | 'stagingKey' | 'actualSha256' | 'actualBytes' | 'error'>): Promise<JournalEntry>
  setStatus(key: string, status: OperationStatus, patch?: Partial<Pick<JournalEntry, 'stagingKey' | 'actualSha256' | 'actualBytes' | 'error'>>): Promise<JournalEntry>
}

// ─── Pure functions (unit-tested, zero I/O) ─────────────────────────────────

/**
 * Deterministic idempotency key: sha256(`${storyId}:${inputsHash}:${kind}`), hex.
 * Same (story, inputs, kind) → same key, always. Different inputs → different key.
 */
export function deriveIdempotencyKey(storyId: string, inputsHash: string, kind: OperationKind): string {
  return createHash('sha256').update(`${storyId}:${inputsHash}:${kind}`, 'utf8').digest('hex')
}

/** sha256 hex of a buffer. */
export function sha256Hex(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex')
}

/**
 * Staging key for an operation. Staging keys are idempotency-scoped, so
 * upsert:true against them is always safe — a replay writes identical bytes
 * to the identical key.
 */
export function buildStagingKey(liveKey: string, idempotencyKey: string): string {
  return `${liveKey}.staging.${idempotencyKey.slice(0, 16)}`
}

export interface VerificationResult {
  ok: boolean
  reason?: string
}

/** Verify downloaded bytes match the expected sha256 AND byte size. Both must match. */
export function verifyBufferMatches(actual: Buffer, expectedSha256: string, expectedBytes: number): VerificationResult {
  if (actual.length !== expectedBytes) {
    return { ok: false, reason: `size mismatch: got ${actual.length}, want ${expectedBytes}` }
  }
  const actualHash = sha256Hex(actual)
  if (actualHash !== expectedSha256) {
    return { ok: false, reason: `sha256 mismatch: got ${actualHash}, want ${expectedSha256}` }
  }
  return { ok: true }
}

export type ReplayDecision =
  | { action: 'noop'; reason: 'already_committed' }   // committed → return existing result, write nothing
  | { action: 'throw'; reason: 'previously_rolled_back' } // rolled_back → do NOT silently retry; caller decides
  | { action: 'resume'; fromStatus: OperationStatus } // pending|staging|verifying → resume lifecycle
  | { action: 'start' }                               // no journal row → fresh operation

/**
 * Pure replay decision. The idempotency guarantee lives here:
 * a committed key NEVER triggers another byte write.
 */
export function decideReplay(existing: JournalEntry | null): ReplayDecision {
  if (!existing) return { action: 'start' }
  switch (existing.status) {
    case 'committed':
      return { action: 'noop', reason: 'already_committed' }
    case 'rolled_back':
      return { action: 'throw', reason: 'previously_rolled_back' }
    default:
      return { action: 'resume', fromStatus: existing.status }
  }
}

// ─── Operation skeletons (journal-first lifecycle) ──────────────────────────

export interface PutObjectParams {
  storyId: string
  inputsHash: string
  liveKey: string
  body: Buffer
  contentType?: string
}

export interface PutObjectResult {
  idempotencyKey: string
  liveKey: string
  replayed: boolean
  sha256: string
  bytes: number
}

/**
 * putObject — journal-first write with verification + safe promote.
 *
 *  1. Derive idempotency key → check journal (replay check FIRST, before any bytes move).
 *  2. committed → noop return. rolled_back → throw. Otherwise resume/start.
 *  3. Insert/update journal row to pending (journal-first: intent recorded before bytes).
 *  4. Write bytes to STAGING key only (upsert:true — safe, idempotency-scoped key).
 *  5. Read back staging bytes → verify sha256+size. Mismatch → rolled_back + remove staging + throw.
 *  6. promoteToLive (the ONLY live-key write; never upsert:true — noop if identical, throw if divergent).
 *  7. Journal → committed.
 *
 * NEVER calls storage with upsert:true against a live key.
 */
export async function putObject(
  deps: { storage: StorageDriver; journal: JournalDriver },
  params: PutObjectParams,
): Promise<PutObjectResult> {
  const { storyId, inputsHash, liveKey, body } = params
  const contentType = params.contentType ?? 'audio/mpeg'
  const kind: OperationKind = 'put'

  const idempotencyKey = deriveIdempotencyKey(storyId, inputsHash, kind)
  const expectedSha256 = sha256Hex(body)
  const expectedBytes = body.length
  const stagingKey = buildStagingKey(liveKey, idempotencyKey)

  // 1–2. Replay check before any bytes move.
  const decision = decideReplay(await deps.journal.findByIdempotencyKey(idempotencyKey))
  if (decision.action === 'noop') {
    return { idempotencyKey, liveKey, replayed: true, sha256: expectedSha256, bytes: expectedBytes }
  }
  if (decision.action === 'throw') {
    throw new Error(`FIX1_REPLAY_BLOCKED: idempotency key ${idempotencyKey} previously rolled back — refusing silent retry (story ${storyId}, key ${liveKey})`)
  }

  // 3. Journal-first: record intent before bytes.
  if (decision.action === 'start') {
    await deps.journal.insertPending({ idempotencyKey, storyId, kind, liveKey, expectedSha256, expectedBytes })
  }
  await deps.journal.setStatus(idempotencyKey, 'staging', { stagingKey })

  // 4. Bytes go to STAGING only.
  await deps.storage.writeStaging(stagingKey, body, contentType)

  // 5. Read back + verify sha256 AND size.
  await deps.journal.setStatus(idempotencyKey, 'verifying')
  const readBack = await deps.storage.readStaging(stagingKey)
  const check = verifyBufferMatches(readBack, expectedSha256, expectedBytes)
  if (!check.ok) {
    await deps.storage.removeStaging(stagingKey).catch(() => {})
    await deps.journal.setStatus(idempotencyKey, 'rolled_back', {
      actualSha256: sha256Hex(readBack),
      actualBytes: readBack.length,
      error: check.reason ?? 'verification failed',
    })
    throw new Error(`FIX1_VERIFY_FAILED: ${check.reason} (story ${storyId}, key ${liveKey})`)
  }
  await deps.journal.setStatus(idempotencyKey, 'verifying', {
    actualSha256: expectedSha256,
    actualBytes: expectedBytes,
  })

  // 6–7. Promote (only live-key write; safe: noop-if-identical, throw-if-divergent) then commit.
  await deps.storage.promoteToLive(stagingKey, liveKey, expectedSha256, expectedBytes)
  await deps.journal.setStatus(idempotencyKey, 'committed')

  return { idempotencyKey, liveKey, replayed: decision.action === 'resume', sha256: expectedSha256, bytes: expectedBytes }
}

export interface MoveObjectParams {
  storyId: string
  inputsHash: string
  fromKey: string
  toLiveKey: string
}

/**
 * moveObject — idempotent logical move between keys.
 * Derives its own idempotency key (kind 'move'), journal-first; the actual
 * byte relocation is performed by the driver. Replay of a committed move
 * is a noop. Skeleton: driver mechanics land with the Supabase adapter
 * (later fix); the replay/journal contract is final here.
 */
export async function moveObject(
  deps: { journal: JournalDriver; mover: (fromKey: string, toLiveKey: string) => Promise<void> },
  params: MoveObjectParams,
): Promise<{ idempotencyKey: string; replayed: boolean }> {
  const kind: OperationKind = 'move'
  const idempotencyKey = deriveIdempotencyKey(params.storyId, params.inputsHash, kind)

  const decision = decideReplay(await deps.journal.findByIdempotencyKey(idempotencyKey))
  if (decision.action === 'noop') return { idempotencyKey, replayed: true }
  if (decision.action === 'throw') {
    throw new Error(`FIX1_REPLAY_BLOCKED: move ${idempotencyKey} previously rolled back — refusing silent retry`)
  }
  if (decision.action === 'start') {
    await deps.journal.insertPending({
      idempotencyKey,
      storyId: params.storyId,
      kind,
      liveKey: params.toLiveKey,
      expectedSha256: params.inputsHash, // move reuses inputsHash as content fingerprint placeholder
      expectedBytes: 0,
    })
  }
  await deps.journal.setStatus(idempotencyKey, 'staging')
  try {
    await deps.mover(params.fromKey, params.toLiveKey)
  } catch (err) {
    await deps.journal.setStatus(idempotencyKey, 'rolled_back', { error: (err as Error).message })
    throw err
  }
  await deps.journal.setStatus(idempotencyKey, 'committed')
  return { idempotencyKey, replayed: decision.action === 'resume' }
}

export interface PromoteObjectParams {
  storyId: string
  inputsHash: string
  stagingKey: string
  liveKey: string
  expectedSha256: string
  expectedBytes: number
}

/**
 * promoteObject — standalone promote for callers that staged bytes themselves.
 * Same contract: replay-noop on committed, journal-first, verify-before-promote,
 * never upsert:true against the live key.
 */
export async function promoteObject(
  deps: { storage: StorageDriver; journal: JournalDriver },
  params: PromoteObjectParams,
): Promise<{ idempotencyKey: string; replayed: boolean; promoteResult: 'promoted' | 'noop_identical' }> {
  const kind: OperationKind = 'promote'
  const idempotencyKey = deriveIdempotencyKey(params.storyId, params.inputsHash, kind)

  const decision = decideReplay(await deps.journal.findByIdempotencyKey(idempotencyKey))
  if (decision.action === 'noop') {
    return { idempotencyKey, replayed: true, promoteResult: 'noop_identical' }
  }
  if (decision.action === 'throw') {
    throw new Error(`FIX1_REPLAY_BLOCKED: promote ${idempotencyKey} previously rolled back — refusing silent retry`)
  }
  if (decision.action === 'start') {
    await deps.journal.insertPending({
      idempotencyKey,
      storyId: params.storyId,
      kind,
      liveKey: params.liveKey,
      expectedSha256: params.expectedSha256,
      expectedBytes: params.expectedBytes,
    })
  }
  await deps.journal.setStatus(idempotencyKey, 'verifying', { stagingKey: params.stagingKey })
  const readBack = await deps.storage.readStaging(params.stagingKey)
  const check = verifyBufferMatches(readBack, params.expectedSha256, params.expectedBytes)
  if (!check.ok) {
    await deps.journal.setStatus(idempotencyKey, 'rolled_back', {
      actualSha256: sha256Hex(readBack),
      actualBytes: readBack.length,
      error: check.reason ?? 'verification failed',
    })
    throw new Error(`FIX1_VERIFY_FAILED: ${check.reason} (promote ${params.stagingKey} → ${params.liveKey})`)
  }
  const promoteResult = await deps.storage.promoteToLive(params.stagingKey, params.liveKey, params.expectedSha256, params.expectedBytes)
  await deps.journal.setStatus(idempotencyKey, 'committed')
  return { idempotencyKey, replayed: decision.action === 'resume', promoteResult }
}
