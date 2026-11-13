import { humanStoriesBlock, isSciFiGenre } from '@/lib/humanStories'
import { buildSeriesOutlinePrompt } from '@/lib/seriesOutline'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('HUMAN-STORIES-001 (canon item 150)', () => {
  test('sci-fi is exempt; every other genre gets the rule', () => {
    expect(isSciFiGenre('Sci-Fi')).toBe(true)
    expect(isSciFiGenre('science fiction')).toBe(true)
    expect(humanStoriesBlock('Sci-Fi')).toBe('')
    expect(humanStoriesBlock('Thriller')).toMatch(/No AI, robots, androids, algorithms, self-driving or "autonomous" vehicles/)
    expect(humanStoriesBlock('Romance')).toMatch(/people dealing with people/)
  })
  test('the planner and both writers get it', () => {
    const base = { title: 'T', premise: 'p', setting: 's', totalEpisodes: 7, requirements: '', maxMainCharacters: 5 }
    expect(buildSeriesOutlinePrompt({ ...base, genre: 'Thriller' })).toMatch(/No AI, robots/)
    expect(buildSeriesOutlinePrompt({ ...base, genre: 'Sci-Fi' })).not.toMatch(/No AI, robots/)
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src.match(/\$\{humanStoriesBlock\(/g)?.length).toBe(2)
  })
})
