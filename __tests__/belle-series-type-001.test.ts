import { readFileSync } from 'fs'
import { join } from 'path'
import { belleStoryKind, belleStoryTypeInstruction, belleOutroNeedsNarratorCredit } from '@/lib/belleStoryType'

// Don't Go Home EP1 as stored (series episode produced by a single-story job).
const dghEp1 = { story_type: 'series_episode', series_id: 'd9afbf36', series_name: 'Don’t Go Home', episode_number: 1, series_total_episodes: 7, series_is_finale: false }

describe('BELLE-SERIES-TYPE-001', () => {
  it('a series episode is never standalone, even in a single-story job', () => {
    expect(belleStoryKind(dghEp1)).toBe('series_non_finale')
  })

  it('finale by flag or by last episode number', () => {
    expect(belleStoryKind({ ...dghEp1, series_is_finale: true })).toBe('series_finale')
    expect(belleStoryKind({ ...dghEp1, episode_number: 7 })).toBe('series_finale')
  })

  it('a story with no series is standalone', () => {
    expect(belleStoryKind({ story_type: 'standalone' })).toBe('standalone')
    expect(belleStoryKind({})).toBe('standalone')
  })

  it('non-finale instruction names the Nov 8 rule and turns off the standalone rules', () => {
    const text = belleStoryTypeInstruction(dghEp1)
    expect(text).toMatch(/SERIES NON-FINALE EPISODE \(episode 1 of 7 of "Don’t Go Home"\)/)
    expect(text).toMatch(/BELLE-OUTRO-FORWARD-001/)
    expect(text).toMatch(/no reflection, companion-presence/)
  })

  it('narrator credit only in standalone and finale outros', () => {
    expect(belleOutroNeedsNarratorCredit(dghEp1)).toBe(false)
    expect(belleOutroNeedsNarratorCredit({ ...dghEp1, series_is_finale: true })).toBe(true)
    expect(belleOutroNeedsNarratorCredit({})).toBe(true)
  })

  it('standalone repair no longer hard-codes standalone:true and the judge gets the story type', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).not.toMatch(/validateBelleText\('(intro|outro)', repaired(Intro|Outro), \{ standalone: true/)
    expect(src).toMatch(/\$\{BELLE_QUALITY_VALIDATOR_PROMPT\}\n\n\$\{belleStoryTypeInstruction\(story\)\}/)
    expect(src).toMatch(/narratorForRepair && repairNeedsNarrator \? `Outro must include narrator name/)
  })
})
