import { routeIssuesToFixEpisode } from '@/lib/seriesPatch'
import { readFileSync } from 'fs'
import { join } from 'path'

const widow = [
  { episode: 3, problem: '[continuity] "NINA: The receipt is in that safe." — EP2 already took it.', fix: "In Episode 2, cut Nina's break-in and end the episode after the wire recording." },
  { episode: 3, problem: '[logic] EP3 restarts the break-in.', fix: 'End Episode 2 when Nina and Keller finish listening to the wire recording.' },
  { episode: 4, problem: 'x', fix: "Change 'sixty-eight years' to 'thirty-six years'." },
]
describe('FIX-EPISODE-ROUTE-001', () => {
  test('the Widow issues move to episode 2; a plain line fix stays put', () => {
    const r = routeIssuesToFixEpisode(widow, () => true)
    expect(r.map((i) => i.episode)).toEqual([2, 2, 4])
    expect(r[0].problem).toMatch(/moved from episode 3; the fix is in episode 2/)
  })
  test('never moves into a published (not editable) episode; number words work', () => {
    expect(routeIssuesToFixEpisode(widow, (n) => n !== 2).map((i) => i.episode)).toEqual([3, 3, 4])
    expect(routeIssuesToFixEpisode([{ episode: 5, problem: 'p', fix: 'In Episode four, add the setup line.' }], () => true)[0].episode).toBe(4)
  })
  test('run-next routes both series reads', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src.match(/routeIssuesToFixEpisode\(/g)?.length).toBe(2)
  })
})
