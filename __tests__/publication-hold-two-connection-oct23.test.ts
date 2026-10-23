/**
 * PUBLICATION-HOLD TWO-CONNECTION PROOF DRIVER — concurrency-proof-standard-1500
 * (Marc 2026-10-23). Branch feat/publication-hold-barrier-v2.
 *
 * The proof itself lives in scripts/acceptance/publication-hold-two-connection-proof.mjs
 * (self-contained: spins up its own throwaway PostgreSQL 16 scratch instance,
 * executes the EXACT branch migration verbatim, races two live pg Clients in
 * both orders + the hold-waits case, asserts P0001/57014/zero-visible live).
 * This test drives that script and fails unless it exits 0 with ALL CHECKS PASSED.
 *
 * Zero story-row writes anywhere outside the script's own scratch instance;
 * no prod/preview/shared database is ever touched (the script initdb's its own).
 */

import { spawnSync } from 'node:child_process'
import * as path from 'node:path'

const SCRIPT = path.join(
  __dirname,
  '..',
  'scripts',
  'acceptance',
  'publication-hold-two-connection-proof.mjs'
)

describe('publication-hold two-connection proof (live scratch PostgreSQL)', () => {
  test('hold barrier: both orderings + hold-waits + narrow firing, all green', () => {
    const run = spawnSync(process.execPath, [SCRIPT], {
      encoding: 'utf8',
      timeout: 170000,
      maxBuffer: 4 * 1024 * 1024,
    })
    const out = `${run.stdout || ''}\n${run.stderr || ''}`
    // Always surface the proof log on failure for reviewability.
    expect(`exit status ${run.status}\n${out}`).toMatch(/ALL CHECKS PASSED/)
    expect(run.status).toBe(0)
    expect(out).not.toMatch(/\bFAIL\b/)
    // The live (non-static) guarantees must all be present — guards against
    // a proof script that passes vacuously.
    for (const marker of [
      'T1 hold-first blocks publish',
      'T2 hold-during-pause blocks publish write',
      'T3 hold-set BLOCKS behind in-flight publish',
      'T3 next publish after hold is refused',
      'non-publishing update while held passes',
    ]) {
      expect(out).toContain(marker)
    }
  }, 180000)
})
