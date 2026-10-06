/**
 * ATLAS-P3-REPAIR-002 — Lyra P3 repair plan acceptance tests.
 *
 *  1. Garble fail-closed: null/failed report never passes (failClosedVerdict),
 *     Whisper config is env-driven with no hardcoded Mac path.
 *  2. Sweeper: sweepStaleEtMixDirs removes only stale et-mix-* dirs.
 *  3. Fencing symmetry: circuit-breaker fence matches render-write fence shape.
 *  4. Fetch surfacing: timeout/killed/oom/connection distinction for run-next
 *     fetch errors + download/ffmpeg classifiers (mix/chunk timeouts).
 *
 * No DB writes, no network, no Whisper. All I/O is injected or temp-dir local.
 */

import { sweepStaleEtMixDirs, ET_MIX_PREFIX } from '@/lib/tmpSpace'
import {
  classifyRunNextFetchError,
  RUN_NEXT_FETCH_HEARTBEAT_MS,
} from '@/lib/pipeline-runner/runner'
import { classifyFailure } from '@/lib/pipeline-runner/classify'
import {
  classifyDownloadError,
  classifyFfmpegError,
  RENDER_CHUNK_TIMEOUT_MS,
  RENDER_MIX_TIMEOUT_MS,
} from '@/lib/renderFetch'
import { ownedJobFence } from '@/lib/jobLockGuard'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const gate = require('../garble-detection-gate.js')

// ---------------------------------------------------------------------------
// 1. Garble fail-closed
// ---------------------------------------------------------------------------

describe('P3-1: garble fail-closed', () => {
  test('null report fails closed', () => {
    expect(gate.failClosedVerdict(null).passed).toBe(false)
    expect(gate.failClosedVerdict(undefined).passed).toBe(false)
    expect(gate.failClosedVerdict('garbage').passed).toBe(false)
  })

  test('report with hard fails does not pass', () => {
    const v = gate.failClosedVerdict({
      results: [{ segName: 'segment_0001', status: 'fail', wer: null }],
    })
    expect(v.passed).toBe(false)
  })

  test('null-WER ok/warn verdicts are unverifiable — fail closed', () => {
    const v = gate.failClosedVerdict({
      results: [{ segName: 'segment_0002', status: 'warn', wer: null }],
    })
    expect(v.passed).toBe(false)
  })

  test('clean report with real WER values passes', () => {
    const v = gate.failClosedVerdict({
      results: [
        { segName: 'segment_0000', status: 'ok', wer: 0.02 },
        { segName: 'segment_0001', status: 'warn', wer: 0.25 },
        { segName: 'segment_0002', status: 'skipped', wer: null },
        { segName: 'segment_0003', status: 'missing', wer: null },
      ],
    })
    expect(v.passed).toBe(true)
  })

  test('Whisper config is env-driven, no hardcoded Mac path', () => {
    expect(String(gate.WHISPER_BIN)).not.toContain('/opt/homebrew')
    expect(String(gate.WHISPER_BIN)).not.toContain('/Users/')
    expect(typeof gate.WHISPER_MODEL).toBe('string')
    expect(gate.WHISPER_MODEL.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 2. Stale et-mix sweeper
// ---------------------------------------------------------------------------

describe('P3-2: sweepStaleEtMixDirs', () => {
  const NOW = 1_800_000_000_000
  const STALE_MS = 30 * 60 * 1000

  function memFs(files: Record<string, number>, failRm: string[] = []) {
    const removed: string[] = []
    return {
      removed,
      fs: {
        readdir: () => Object.keys(files),
        statMtimeMs: (p: string) => {
          const name = p.split('/').pop() as string
          if (!(name in files)) throw new Error('ENOENT')
          return files[name]
        },
        rmRecursive: (p: string) => {
          const name = p.split('/').pop() as string
          if (failRm.includes(name)) throw new Error('EPERM')
          removed.push(name)
        },
      },
    }
  }

  test('removes only stale et-mix dirs, never other tmp entries', async () => {
    const { removed, fs } = memFs({
      [`${ET_MIX_PREFIX}old-render-abc`]: NOW - STALE_MS - 1,
      [`${ET_MIX_PREFIX}fresh-render-xyz`]: NOW - 1000,
      'not-a-mix-dir': NOW - STALE_MS - 999_999,
      'whisper-out': NOW - STALE_MS - 999_999,
    })
    const res = await sweepStaleEtMixDirs(STALE_MS, { dir: '/tmp', nowMs: NOW, fs })
    expect(res.scanned).toBe(2)
    expect(removed).toEqual([`${ET_MIX_PREFIX}old-render-abc`])
    expect(res.removed).toBe(1)
    expect(res.errors).toEqual([])
  })

  test('per-dir failures are collected, sweep never throws', async () => {
    const { fs } = memFs(
      { [`${ET_MIX_PREFIX}locked-dir`]: NOW - STALE_MS - 1 },
      [`${ET_MIX_PREFIX}locked-dir`],
    )
    const res = await sweepStaleEtMixDirs(STALE_MS, { dir: '/tmp', nowMs: NOW, fs })
    expect(res.removed).toBe(0)
    expect(res.errors.length).toBe(1)
  })

  test('readdir failure returns errors, does not throw', async () => {
    const res = await sweepStaleEtMixDirs(STALE_MS, {
      dir: '/tmp',
      nowMs: NOW,
      fs: {
        readdir: () => { throw new Error('EACCES') },
        statMtimeMs: () => 0,
        rmRecursive: () => {},
      },
    })
    expect(res.scanned).toBe(0)
    expect(res.errors.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 3. Fencing symmetry (circuit breaker vs render writes)
// ---------------------------------------------------------------------------

describe('P3-3: circuit-breaker fence mirrors render-write fence', () => {
  test('ownedJobFence pins id + holder + instant + running for breaker rows', () => {
    const fence = ownedJobFence(
      { id: 'job-123', locked_by: 'worker-a', locked_at: '2026-10-06T12:00:00.000Z' },
      'worker-a',
    )
    expect(fence).toEqual({
      id: 'job-123',
      locked_by: 'worker-a',
      status: 'running',
      locked_at: '2026-10-06T12:00:00.000Z',
    })
  })

  test('unresolvable holder matches nothing (stale breaker must not land)', () => {
    const fence = ownedJobFence({ id: 'job-123' })
    expect(fence.locked_by).toBe('__no_lock_holder__')
  })
})

// ---------------------------------------------------------------------------
// 4. Fetch error surfacing + mix/chunk timeouts
// ---------------------------------------------------------------------------

describe('P3-4: run-next fetch error distinction', () => {
  test('abort/timeout budget errors classify as timeout with step + budget', () => {
    const timeoutErr = new Error('The operation was aborted due to timeout')
    timeoutErr.name = 'TimeoutError'
    const c = classifyRunNextFetchError(timeoutErr, 'render_final_mix', 600_000)
    expect(c.kind).toBe('timeout')
    expect(c.message).toContain('render_final_mix')
    expect(c.message).toContain('600000')

    const abortErr = new Error('This operation was aborted')
    abortErr.name = 'AbortError'
    expect(classifyRunNextFetchError(abortErr, 'generate_voices', 90_000).kind).toBe('timeout')
  })

  test('OOM signatures classify as oom, kills as killed', () => {
    expect(classifyRunNextFetchError(new Error('heap out of memory'), 's', 1).kind).toBe('oom')
    expect(classifyRunNextFetchError(new Error('write ENOMEM'), 's', 1).kind).toBe('oom')
    expect(classifyRunNextFetchError(new Error('process killed (SIGKILL)'), 's', 1).kind).toBe('killed')
  })

  test('network failures classify as connection', () => {
    expect(
      classifyRunNextFetchError(new Error('TypeError: fetch failed'), 's', 1).kind,
    ).toBe('connection')
    expect(
      classifyRunNextFetchError(new Error('Error: socket hang up'), 's', 1).kind,
    ).toBe('connection')
  })

  test('pinned fetch kinds route to transient (never Marc) in classifyFailure', () => {
    const job = { current_step: 'render_final_mix' }
    for (const kind of ['timeout', 'killed', 'oom', 'connection']) {
      const c = classifyFailure(
        { fetchErrorKind: kind, fetchTimeoutMs: 600_000, currentStep: 'render_final_mix' },
        job,
      )
      expect(c.kind).toBe('transient')
      expect(c.retryable).toBe(true)
      expect(c.needsMarc).toBe(false)
    }
  })

  test('in-flight heartbeat cadence is well under the zombie threshold', () => {
    expect(RUN_NEXT_FETCH_HEARTBEAT_MS).toBeLessThan(15 * 60 * 1000)
  })
})

describe('P3-4: download + ffmpeg classifiers', () => {
  test('chunk timeout / http / fetch surface distinctly', () => {
    const abort = new Error('The operation was aborted')
    abort.name = 'AbortError'
    const t = classifyDownloadError(abort, 'https://x/seg.mp3', 120_000, 3)
    expect(t.kind).toBe('timeout')
    expect(t.error.message).toMatch(/^DOWNLOAD_TIMEOUT after 120000ms \(attempt 3\)/)

    const h = classifyDownloadError(new Error('Download failed 404: https://x/seg.mp3'), 'https://x/seg.mp3', 120_000, 1)
    expect(h.kind).toBe('http')
    expect(h.error.message).toContain('DOWNLOAD_HTTP_404')

    const f = classifyDownloadError(new Error('TypeError: fetch failed'), 'https://x/seg.mp3', 120_000, 2)
    expect(f.kind).toBe('fetch')
    expect(f.error.message).toContain('DOWNLOAD_FETCH_ERROR')
  })

  test('ffmpeg timeout vs kill vs oom vs plain failure', () => {
    const timedOut = { killed: true, signal: 'SIGTERM', message: 'cmd timeout' }
    const t = classifyFfmpegError(timedOut, 'final mix', 600_000, 600_500)
    expect(t.kind).toBe('timeout')
    expect(t.error.message).toMatch(/^MIX_TIMEOUT/)

    const killed = { killed: true, signal: 'SIGKILL', message: 'killed' }
    const k = classifyFfmpegError(killed, 'final mix', 600_000, 12_000)
    expect(k.kind).toBe('killed')
    expect(k.error.message).toMatch(/^MIX_KILLED/)

    const oom = { code: 'ENOMEM', message: 'spawn ENOMEM' }
    expect(classifyFfmpegError(oom, 'final mix', 600_000, 1000).kind).toBe('oom')

    const plain = { code: 1, stderr: 'Invalid data found', message: 'Command failed' }
    const p = classifyFfmpegError(plain, 'final mix', 600_000, 3000)
    expect(p.kind).toBe('failed')
    expect(p.error.message).toMatch(/^MIX_FAILED/)
  })

  test('timeout budgets have sane defaults', () => {
    expect(RENDER_CHUNK_TIMEOUT_MS).toBe(120_000)
    expect(RENDER_MIX_TIMEOUT_MS).toBe(600_000)
  })
})
