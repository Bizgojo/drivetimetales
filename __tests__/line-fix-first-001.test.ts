import { isLineLevelIssue, planSfxDeletions, deleteSfxLines, planSeriesPatch, MAX_PATCHES_PER_EPISODE } from '@/lib/seriesPatch'
import { planSeriesEpisodeRewrite } from '@/lib/seriesRewrite'
import { readFileSync } from 'fs'
import { join } from 'path'

const widowEp2 = 'NARRATOR: I count the hymnals.\n\n[SFX: Room tone, quiet house]\n\nNARRATOR: Nobody turns.\n\n[SFX: Door, wood, closes]\n\nJULIAN: Nina?'
const sfxIssue = (ep: number, text: string) => ({ episode: ep, problem: text, fix: '' })

describe('SFX-DELETE-001', () => {
  test('a decorative cue (Widow EP2, Nov 13) is deleted with its blank line, nothing else changes', () => {
    const plan = planSfxDeletions([sfxIssue(2, 'Decorative SFX cue violates the SFX rule. The cue `[SFX: Room tone, quiet house]` appears during a moment of complete stillness. Remove this cue.')], new Map([[2, widowEp2]]))
    expect(plan?.get(2)).toEqual(['[SFX: Room tone, quiet house]'])
    expect(deleteSfxLines(widowEp2, plan!.get(2)!)).toBe('NARRATOR: I count the hymnals.\n\nNARRATOR: Nobody turns.\n\n[SFX: Door, wood, closes]\n\nJULIAN: Nina?')
  })
  test('a suggested replacement cue is ignored; only the cue in the script is deleted (Second Rise EP5)', () => {
    const script = 'TESS: Fine.\n\n[SFX: Cell phone, vibrating on a table]\n\nTESS: Deleted.'
    const plan = planSfxDeletions([sfxIssue(5, 'SFX mismatch — `[SFX: Cell phone, vibrating on a table]`: no phone vibrates. Replace with a cue that matches (e.g., `[SFX: Phone, screen taps]`) or remove the cue.')], new Map([[5, script]]))
    expect(plan?.get(5)).toEqual(['[SFX: Cell phone, vibrating on a table]'])
  })
  test('no AI-free delete when any issue is not a cue, the cue repeats, or the episode is published', () => {
    const scripts = new Map([[2, widowEp2]])
    expect(planSfxDeletions([sfxIssue(2, 'SFX `[SFX: Room tone, quiet house]` decorative.'), sfxIssue(2, 'The ending is settled, not a cliffhanger.')], scripts)).toBeNull()
    expect(planSfxDeletions([sfxIssue(2, 'SFX `[SFX: Room tone, quiet house]`')], new Map([[2, widowEp2 + '\n[SFX: Room tone, quiet house]']]))).toBeNull()
    expect(planSfxDeletions([sfxIssue(2, 'SFX `[SFX: Room tone, quiet house]`')], scripts, new Set([2]))).toBeNull()
  })
})

describe('LINE-FIX-FIRST-001', () => {
  test('quoted-text problems are line-level; general ones are not', () => {
    expect(isLineLevelIssue(sfxIssue(4, '"CONNOR: Six weeks after I took over" contradicts episode 1'))).toBe(true)
    expect(isLineLevelIssue(sfxIssue(4, 'The cue `[SFX: River, water against a dock]` does not match'))).toBe(true)
    expect(isLineLevelIssue(sfxIssue(4, 'The ending is settled, not a cliffhanger.'))).toBe(false)
  })
  test('the per-episode patch count does not stop a line-level fix; it still stops a general one', () => {
    const base = { patchRuns: 3, frozenEpisodes: new Set<number>(), episodesWithScript: new Set([4]), patchCounts: { '4': MAX_PATCHES_PER_EPISODE } }
    expect(planSeriesPatch({ ...base, issues: [sfxIssue(4, '"CONNOR: You stayed late on a Tuesday" conflicts with episode 2')] }).action).toBe('patch')
    expect(planSeriesPatch({ ...base, issues: [sfxIssue(4, 'The ending is settled.')] }).action).toBe('skip')
    expect(planSeriesPatch({ ...base, patchRuns: 8, issues: [sfxIssue(4, '"x y z a b c d e f" wrong')] }).action).toBe('skip')
  })
  test('a one-line-only rewrite clears only the failed episode', () => {
    const eps = [1, 2, 3, 4, 5].map((n) => ({ id: `s${n}`, episodeNumber: n, hasScript: true }))
    const p: any = planSeriesEpisodeRewrite({ failedEpisodeNumber: 3, episodes: eps, rewriteCounts: {}, onlyFailedEpisode: true })
    expect(p.clearStoryIds).toEqual(['s3'])
    expect((planSeriesEpisodeRewrite({ failedEpisodeNumber: 3, episodes: eps, rewriteCounts: {} }) as any).clearStoryIds).toEqual(['s3', 's4', 's5'])
  })
  test('run-next deletes cues before the AI patcher and passes onlyFailedEpisode', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src.indexOf('planSfxDeletions(readIssues')).toBeGreaterThan(0)
    expect(src.indexOf('planSfxDeletions(readIssues')).toBeLessThan(src.indexOf('const patchPlan = planSeriesPatch({'))
    expect(src).toContain('onlyFailedEpisode: !seriesIssues.length && episodeIssues.length > 0 && episodeIssues.every(isLineLevelIssue),')
  })
})
