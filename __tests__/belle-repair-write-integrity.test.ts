/**
 * BELLE-REPAIR-WRITE-INTEGRITY-001 regression test.
 *
 * Creek package-stage Belle retry-validation rewrote Ep1 outro text and
 * PERSISTED it with NO audit entry, NO continuity-pin resync, and NO
 * invalidation of the affected outro audio. Separately, hasCompanionPresence
 * falsely rejected listener-addressing copy ("now you know why... Sit with
 * that for a moment").
 *
 * Exercises the REAL lib helpers wired into the run-next repair-persist path
 * with production-shaped fixtures.
 */
import {
  applyBelleRepairAudit,
  belleRepairAudioInvalidation,
  buildBelleRepairAuditEntry,
  hasCompanionPresence,
  resyncContinuityPinsAfterRepair,
} from '@/lib/belleValidation'
import { hashScript } from '@/lib/continuityPin'

// Exact repaired Ep2 outro copy (must PASS companion presence).
const REPAIRED_EP2_OUTRO =
  "Earl didn't want to open that door, and now you know why... " +
  'Sit with that for a moment. Episode 3...'

// Exact live Ep2 outro copy (must STILL FAIL: flat third-person recap,
// no listener address).
const LIVE_EP2_OUTRO =
  'Blythe has the photographs, Earl has the notebook, and someone has ' +
  "left a warning on her windshield. In the final episode, she'll have " +
  'to decide...'

describe('hasCompanionPresence (lib/belleValidation)', () => {
  test('repaired Ep2 listener-addressing text passes', () => {
    expect(hasCompanionPresence(REPAIRED_EP2_OUTRO)).toBe(true)
  })

  test('live Ep2 flat recap text still fails', () => {
    expect(hasCompanionPresence(LIVE_EP2_OUTRO)).toBe(false)
  })
})

describe('repair audit entry', () => {
  const beforeScript = 'BELLE B INTRO: hello\nBELLE B OUTRO: old outro text'
  const afterScript = 'BELLE B INTRO: hello\nBELLE B OUTRO: new outro text'

  test('entry carries required fields with canonical hashes', () => {
    const entry = buildBelleRepairAuditEntry({
      jobId: 'job-123',
      storyId: 'story-ep1',
      episodeNumber: 1,
      beforeScript,
      afterScript,
      repairedIntro: false,
      repairedOutro: true,
      at: '2026-10-22T15:00:00.000Z',
    })
    expect(entry.action).toMatch(/repair/)
    expect(entry.timestamp).toBe('2026-10-22T15:00:00.000Z')
    expect(entry.jobId).toBe('job-123')
    expect(entry.storyId).toBe('story-ep1')
    expect(entry.beforeHash).toBe(hashScript(beforeScript))
    expect(entry.afterHash).toBe(hashScript(afterScript))
    expect(entry.beforeHash).not.toBe(entry.afterHash)
    expect(entry.repairedOutro).toBe(true)
    expect(entry.repairedIntro).toBe(false)
  })

  test('audit merges under script_json.series_generation, preserving pins', () => {
    const scriptJson = {
      series_generation: {
        generated_title: 'Ep1',
        continuity_pins_used: { 'story-ep0': 'abc123' },
      },
    }
    const entry = buildBelleRepairAuditEntry({
      jobId: 'job-123',
      storyId: 'story-ep1',
      episodeNumber: 1,
      beforeScript,
      afterScript,
      repairedIntro: false,
      repairedOutro: true,
    })
    const next = applyBelleRepairAudit(scriptJson, entry)
    const seriesGen = next.series_generation
    expect(seriesGen.continuity_pins_used).toEqual({ 'story-ep0': 'abc123' })
    expect(Array.isArray(seriesGen.belle_repair_audit)).toBe(true)
    expect(seriesGen.belle_repair_audit).toHaveLength(1)
    expect(seriesGen.belle_repair_audit[0]).toMatchObject({
      action: entry.action,
      timestamp: entry.timestamp,
      jobId: 'job-123',
      beforeHash: entry.beforeHash,
      afterHash: entry.afterHash,
    })
    // Append-only across repeated repairs.
    const again = applyBelleRepairAudit(next, entry)
    expect(again.series_generation.belle_repair_audit).toHaveLength(2)
  })
})

describe('continuity pin resync', () => {
  const editedId = 'story-ep1'
  const newHash = hashScript('repaired ep1 script')

  function productionShapedEpisodes() {
    return [
      {
        id: 'story-ep1',
        episode_number: 1,
        script_json: { series_generation: { generated_title: 'Ep1' } },
      },
      {
        id: 'story-ep2',
        episode_number: 2,
        script_json: {
          series_generation: {
            continuity_pins_used: { [editedId]: 'stale-old-hash' },
          },
        },
      },
      {
        id: 'story-ep3',
        episode_number: 3,
        script_json: {
          series_generation: {
            continuity_pins_used: { [editedId]: 'stale-old-hash' },
          },
        },
      },
      {
        id: 'story-standalone',
        episode_number: null,
        script_json: {
          series_generation: {
            continuity_pins_used: { 'other-story': 'zzz' },
          },
        },
      },
    ]
  }

  test('resyncs dependents of the edited episode only', () => {
    const updates = resyncContinuityPinsAfterRepair(
      productionShapedEpisodes(),
      editedId,
      newHash
    )
    const ids = updates.map((u) => u.id).sort()
    expect(ids).toEqual(['story-ep2', 'story-ep3'])
    for (const u of updates) {
      expect(u.script_json.series_generation.continuity_pins_used[editedId]).toBe(
        newHash
      )
    }
  })

  test('already-current pins and non-dependents produce no update', () => {
    const episodes = productionShapedEpisodes()
    // Ep3 already resynced; standalone never pinned the edited ep.
    episodes[2].script_json.series_generation.continuity_pins_used = {
      [editedId]: newHash,
    }
    const updates = resyncContinuityPinsAfterRepair(episodes, editedId, newHash)
    expect(updates.map((u) => u.id)).toEqual(['story-ep2'])
  })
})

describe('audio invalidation scoping', () => {
  test('outro repair nulls ONLY outro_audio_url + outro_with_music_url', () => {
    expect(belleRepairAudioInvalidation(false, true)).toEqual({
      outro_audio_url: null,
      outro_with_music_url: null,
    })
  })

  test('intro repair touches only announcement_url; no-repair touches nothing', () => {
    expect(belleRepairAudioInvalidation(true, false)).toEqual({
      announcement_url: null,
    })
    expect(belleRepairAudioInvalidation(false, false)).toEqual({})
  })

  test('never nulls siblings/segments/music/mixes', () => {
    const cols = Object.keys(belleRepairAudioInvalidation(true, true))
    for (const forbidden of ['audio_url', 'story_audio_url']) {
      expect(cols).not.toContain(forbidden)
    }
  })
})
