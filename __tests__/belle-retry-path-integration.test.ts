/**
 * BELLE-RETRY-PATH-INTEGRATION-001.
 *
 * End-to-end composition of the REAL lib helpers wired into the series Belle
 * retry path, in production order:
 *
 *   validate repaired text (hasCompanionPresence)
 *     -> build persist payload (buildBelleRepairAuditEntry + applyBelleRepairAudit
 *        + belleRepairAudioInvalidation, single stories.update() shape per
 *        run-next route.ts:11129-11147 on fix/belle-repair-write-integrity)
 *     -> pin resync + fail-closed reader semantics
 *        (resyncContinuityPinsAfterRepair + verifyContinuityPins; the route
 *        applies pin updates as separate per-dependent .update() calls AFTER
 *        the main-row write, throwing fail-closed on error at route.ts:11166)
 *     -> skip-filter rejects stale composite (isStandaloneOutroRecording,
 *        verbatim from fix/belle-outro-skip-composite)
 *     -> sibling assets untouched.
 *
 * Uses the EXACT Creek Ep2 texts: the repaired outro must PASS companion
 * presence; the live outro must FAIL.
 */
import {
  applyBelleRepairAudit,
  belleRepairAudioInvalidation,
  buildBelleRepairAuditEntry,
  hasCompanionPresence,
  resyncContinuityPinsAfterRepair,
} from '@/lib/belleValidation'
import { buildContinuityPins, hashScript, verifyContinuityPins } from '@/lib/continuityPin'
import { isStandaloneOutroRecording } from '@/lib/belleOutroRecording'

// Exact Creek Ep2 repaired outro (must PASS).
const REPAIRED_EP2_OUTRO =
  "Earl didn't want to open that door, and now you know why. " +
  "Blythe is holding photographs she wasn't supposed to find, and someone " +
  'made sure she knows it. That warning on her windshield changes ' +
  'everything \u2014 because it means someone is still watching. ' +
  'Sit with that for a moment. Episode 3, \u201cWhat the Creek Knew,\u201d ' +
  'is where it all comes due.'

// Exact Creek Ep2 live outro (must STILL FAIL: flat third-person recap,
// no listener address).
const LIVE_EP2_OUTRO =
  'Blythe has the photographs, Earl has the notebook, and someone has ' +
  "left a warning on her windshield. In the final episode, she'll have " +
  "to decide how far she's willing to go \u2014 and whether Graham's " +
  'death was really an accident.'

// Canon COMPANION PRESENCE BAD examples (lib/belleGenerator.ts).
const CANON_BAD_NEXT_EPISODE = 'The next episode will reveal the conspiracy.'
const CANON_BAD_TUNE_IN = 'Tune in next time for more updates.'

// origin/main marker set (route.ts:1156, pre-extension reference): the P5
// extension added ONLY `you know` and `sit with that`.
const ORIGIN_MAIN_MARKERS =
  /\b(i'?m belle|belle here|you won't|you will|you can't|alongside|join|discover|tune in|listen|next episode|stay tuned|coming back|keep listening|return|we'll|we're|we've|we|our)\b/i

const EP2_ID = 'story-creek-ep2'
const EP3_ID = 'story-creek-ep3'
const STANDALONE_ID = 'story-standalone'

const BEFORE_SCRIPT = `BELLE B OUTRO: ${LIVE_EP2_OUTRO}`
const AFTER_SCRIPT = `BELLE B OUTRO: ${REPAIRED_EP2_OUTRO}`

describe('validate repaired text (exact Creek Ep2 copy)', () => {
  test('repaired outro passes companion presence', () => {
    expect(hasCompanionPresence(REPAIRED_EP2_OUTRO)).toBe(true)
  })

  test('live outro still fails companion presence', () => {
    expect(hasCompanionPresence(LIVE_EP2_OUTRO)).toBe(false)
  })
})

describe('extension neutrality + generality (phrase justification)', () => {
  test('added markers match nothing in the canon BAD or live texts', () => {
    for (const text of [CANON_BAD_NEXT_EPISODE, CANON_BAD_TUNE_IN, LIVE_EP2_OUTRO]) {
      expect(/\byou know\b/i.test(text)).toBe(false)
      expect(/\bsit with that\b/i.test(text)).toBe(false)
    }
  })

  test('BAD/live outcomes identical under origin/main markers (extension changed nothing for them)', () => {
    expect(ORIGIN_MAIN_MARKERS.test(CANON_BAD_NEXT_EPISODE)).toBe(
      hasCompanionPresence(CANON_BAD_NEXT_EPISODE)
    )
    expect(ORIGIN_MAIN_MARKERS.test(CANON_BAD_TUNE_IN)).toBe(
      hasCompanionPresence(CANON_BAD_TUNE_IN)
    )
    expect(ORIGIN_MAIN_MARKERS.test(LIVE_EP2_OUTRO)).toBe(
      hasCompanionPresence(LIVE_EP2_OUTRO)
    )
  })

  test('repaired text flips false->true exactly because of the extension', () => {
    expect(ORIGIN_MAIN_MARKERS.test(REPAIRED_EP2_OUTRO)).toBe(false)
    expect(hasCompanionPresence(REPAIRED_EP2_OUTRO)).toBe(true)
  })

  test('added markers generalize beyond Creek nouns', () => {
    // No Creek characters/places; direct second-person listener address.
    expect(hasCompanionPresence('You know that feeling when the lights go out.')).toBe(true)
    expect(hasCompanionPresence('Sit with that for a while.')).toBe(true)
  })
})

describe('persist payload (single-update shape)', () => {
  test('audit entry carries canonical before/after hashes; payload is one update with scoped invalidation', () => {
    const entry = buildBelleRepairAuditEntry({
      jobId: 'job-creek-ep2',
      storyId: EP2_ID,
      episodeNumber: 2,
      beforeScript: BEFORE_SCRIPT,
      afterScript: AFTER_SCRIPT,
      repairedIntro: false,
      repairedOutro: true,
      at: '2026-10-22T16:00:00.000Z',
    })
    expect(entry.beforeHash).toBe(hashScript(BEFORE_SCRIPT))
    expect(entry.afterHash).toBe(hashScript(AFTER_SCRIPT))
    expect(entry.beforeHash).not.toBe(entry.afterHash)

    const scriptJson = applyBelleRepairAudit(
      {
        series_generation: {
          generated_title: 'Creek Ep2',
          continuity_pins_used: { 'story-creek-ep1': 'abc123' },
        },
      },
      entry
    )
    // Audit merged; pre-existing pins preserved.
    expect(scriptJson.series_generation.continuity_pins_used).toEqual({
      'story-creek-ep1': 'abc123',
    })
    expect(scriptJson.series_generation.belle_repair_audit).toHaveLength(1)

    // Same expression shape as run-next route.ts storyUpdates (outro-only repair).
    const storyUpdates: Record<string, unknown> = {
      script: AFTER_SCRIPT,
      script_json: scriptJson,
      ...belleRepairAudioInvalidation(false, true),
      outro_text: REPAIRED_EP2_OUTRO,
    }
    expect(Object.keys(storyUpdates).sort()).toEqual(
      ['outro_audio_url', 'outro_text', 'outro_with_music_url', 'script', 'script_json'].sort()
    )
    // Mix-level columns never part of the single update.
    expect('audio_url' in storyUpdates).toBe(false)
    expect('story_audio_url' in storyUpdates).toBe(false)
    expect('announcement_url' in storyUpdates).toBe(false)
  })
})

describe('pin resync + fail-closed reader semantics', () => {
  function productionShapedRows() {
    // Pins captured at generation time via the real builder.
    const pinsAtGeneration = buildContinuityPins([{ id: EP2_ID, script: BEFORE_SCRIPT }])
    return [
      {
        id: EP2_ID,
        episode_number: 2,
        script: AFTER_SCRIPT,
        script_json: applyBelleRepairAudit(
          { series_generation: { generated_title: 'Creek Ep2' } },
          buildBelleRepairAuditEntry({
            jobId: 'job-creek-ep2',
            storyId: EP2_ID,
            episodeNumber: 2,
            beforeScript: BEFORE_SCRIPT,
            afterScript: AFTER_SCRIPT,
            repairedIntro: false,
            repairedOutro: true,
          })
        ),
      },
      {
        id: EP3_ID,
        episode_number: 3,
        script: 'BELLE B OUTRO: ep3 placeholder',
        script_json: { series_generation: { continuity_pins_used: pinsAtGeneration } },
      },
      {
        id: STANDALONE_ID,
        episode_number: null,
        script: 'standalone script',
        script_json: { series_generation: { continuity_pins_used: { 'other-story': 'zzz' } } },
      },
    ]
  }

  test('failed pin write is LOUD: next reader sees a mismatch, not silent success', () => {
    const rows = productionShapedRows()
    const afterHash = hashScript(AFTER_SCRIPT)
    const pending = resyncContinuityPinsAfterRepair(rows, EP2_ID, afterHash)
    // Only the dependent; payload targets script_json alone (route .update shape).
    expect(pending.map((u) => u.id)).toEqual([EP3_ID])
    for (const u of pending) expect(Object.keys(u).sort()).toEqual(['id', 'script_json'])

    // Simulate: main-row write landed, dependent pin write FAILED (route
    // throws at 11166 before marking complete). Next reader must fail closed.
    const readerResult = verifyContinuityPins(rows)
    expect(readerResult.ok).toBe(false)
    expect(readerResult.mismatches.map((m) => m.priorStoryId)).toContain(EP2_ID)

    // Recovery is idempotent: recompute yields the identical pending update;
    // applying it makes the next reader pass.
    const recomputed = resyncContinuityPinsAfterRepair(rows, EP2_ID, afterHash)
    expect(recomputed).toEqual(pending)
    const recovered = rows.map((row) => {
      const update = recomputed.find((u) => u.id === String((row as any).id))
      return update ? { ...row, script_json: update.script_json } : row
    })
    const afterRecovery = verifyContinuityPins(recovered)
    expect(afterRecovery.ok).toBe(true)
    expect(afterRecovery.mismatches).toEqual([])
  })
})

describe('skip-filter rejects stale composite', () => {
  test('lone outro_with_music.mp3 matches nothing (Creek Ep1 storage state)', () => {
    expect(isStandaloneOutroRecording('outro_with_music.mp3')).toBe(false)
    const files = [{ name: 'outro_with_music.mp3' }]
    expect(files.find((f) => isStandaloneOutroRecording(f.name))).toBeUndefined()
  })

  test('composite alongside genuine recording resolves the genuine file', () => {
    const files = [{ name: 'outro_with_music.mp3' }, { name: 'outro_0066.mp3' }]
    const match = files.find((f) => isStandaloneOutroRecording(f.name))
    expect(match && match.name).toBe('outro_0066.mp3')
  })
})

describe('sibling assets untouched', () => {
  test('no invalidation shape nulls mix-level columns', () => {
    for (const shape of [
      belleRepairAudioInvalidation(false, true),
      belleRepairAudioInvalidation(true, false),
      belleRepairAudioInvalidation(true, true),
    ]) {
      expect('audio_url' in shape).toBe(false)
      expect('story_audio_url' in shape).toBe(false)
    }
  })

  test('pin resync never touches non-dependents', () => {
    const rows = [
      { id: EP2_ID, script_json: { series_generation: {} } },
      {
        id: STANDALONE_ID,
        script_json: { series_generation: { continuity_pins_used: { 'other-story': 'zzz' } } },
      },
    ]
    expect(resyncContinuityPinsAfterRepair(rows, EP2_ID, hashScript(AFTER_SCRIPT))).toEqual([])
  })
})
