/**
 * BELLE-GATE-COLUMNS-001 (2026-10-23) — the BELLE gate's story fetch must
 * never select a column that was never migrated to production.
 * `is_funnel_entry` in the select list hard-failed EVERY preflight with
 * BELLE-001 ("column stories.is_funnel_entry does not exist"), blocking the
 * Harbor Light direct-publish behind a schema defect instead of real gates.
 */
import {
  BELLE_GATE_STORY_COLUMNS,
  runBelleStructureGate,
} from '@/lib/belleStructureGate'

describe('belle gate story columns', () => {
  test('select list excludes the never-migrated is_funnel_entry column', () => {
    expect(BELLE_GATE_STORY_COLUMNS).not.toMatch(/is_funnel_entry/)
    for (const col of [
      'script',
      'title',
      'author',
      'series_episode_number',
      'series_is_finale',
      'series_total_episodes',
      'status',
    ]) {
      expect(BELLE_GATE_STORY_COLUMNS.split(',').map((c) => c.trim())).toContain(col)
    }
  })

  test('gate logic passes a well-formed episode via storyOverride (no DB fetch)', async () => {
    const script = [
      'BELLE B INTRO',
      'BELLE B: Tonight the foghorn sounds twice over the bay.',
      '',
      'MARA: The tide brought in a brass key.',
      '',
      'BELLE B OUTRO',
      'BELLE B: That was the story, an Endless Tales original.',
    ].join('\n')
    const outcome = await runBelleStructureGate('00000000-0000-0000-0000-000000000000', {
      storyOverride: {
        script,
        title: 'Test',
        series_episode_number: 1,
        series_is_finale: false,
        series_total_episodes: 3,
        status: 'audio_ready',
      },
    })
    const b1 = outcome.checks.find((c) => c.rule === 'BELLE-001')
    expect(b1?.passed).toBe(true)
  })
})
