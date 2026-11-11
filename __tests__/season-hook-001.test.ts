import { readFileSync } from 'fs'
import { join } from 'path'
import { seasonHookOf, seasonHookOfEpisodes, seasonHookValidatorNote, buildSeasonHookPromptBlock } from '@/lib/seasonHook'

// SEASON-HOOK-001 (canon decision 136, Marc Nov 11 2026): Second Rise EP7 job 38477b61.
describe('SEASON-HOOK-001', () => {
  const hook = 'the back of the recipe card shows a name, a Savannah address and "When she is ready."'
  it('reads the hook only when set', () => {
    expect(seasonHookOf({ season_hook: ` ${hook} ` })).toBe(hook)
    expect(seasonHookOf({})).toBe('')
    expect(seasonHookOf(null)).toBe('')
    expect(seasonHookOfEpisodes([{ brief_json: {} }, { brief_json: { season_hook: hook } }])).toBe(hook)
  })
  it('the reviewer note allows the hook but still fails a named next episode', () => {
    const note = seasonHookValidatorNote(hook)
    expect(note).toContain('canon decision 136')
    expect(note).toContain(hook)
    expect(note).toMatch(/names a next episode number/)
    expect(seasonHookValidatorNote('')).toBe('')
  })
  it('the writer block is for the finale only', () => {
    expect(buildSeasonHookPromptBlock(hook, { isFinale: true })).toContain('Season Two is coming')
    expect(buildSeasonHookPromptBlock(hook, { isFinale: false })).toBe('')
  })
  it('run-next wires the hook into the writer and all three reviewers', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toMatch(/\+ buildSeasonHookPromptBlock\(/)
    expect(src).toMatch(/seasonHookValidatorNote\(seasonHookOf\(episode\.brief_json\)\)/)
    expect(src).toMatch(/seasonHookValidatorNote\(seasonHookOfEpisodes\(episodes\)\)/)
    expect(src).toMatch(/seasonHookValidatorNote\(seasonHookOfEpisodes\(sortedEps\)\)/)
  })
})
