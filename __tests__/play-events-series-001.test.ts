import { seriesFieldsFromStory, lookupPlaySeriesFields } from '@/lib/playEventSeries'
import { readFileSync } from 'fs'
import { join } from 'path'

function db(result: { data: any; error?: any } | Error) {
  return {
    from: (_t: string) => ({
      select: (_c: string) => ({
        eq: (_col: string, _v: string) => ({
          maybeSingle: async () => { if (result instanceof Error) throw result; return result },
        }),
      }),
    }),
  }
}

describe('PLAY-EVENTS-SERIES-001', () => {
  test('a series episode records its series and itself as the episode', () => {
    expect(seriesFieldsFromStory('ep-1', { series_id: 'ser-9' })).toEqual({ series_id: 'ser-9', episode_id: 'ep-1' })
  })
  test('a standalone story records nulls', () => {
    expect(seriesFieldsFromStory('st-1', { series_id: null })).toEqual({ series_id: null, episode_id: null })
    expect(seriesFieldsFromStory('st-1', null)).toEqual({ series_id: null, episode_id: null })
  })
  test('a lookup error or throw never blocks the play', async () => {
    await expect(lookupPlaySeriesFields(db({ data: null, error: { message: 'boom' } }), 'x')).resolves.toEqual({ series_id: null, episode_id: null })
    await expect(lookupPlaySeriesFields(db(new Error('down')), 'x')).resolves.toEqual({ series_id: null, episode_id: null })
    await expect(lookupPlaySeriesFields(db({ data: { series_id: 's' } }), 'e')).resolves.toEqual({ series_id: 's', episode_id: 'e' })
  })
  test('both insert paths in the route save the series fields', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/analytics/play-event/route.ts'), 'utf8')
    expect(src.match(/lookupPlaySeriesFields\(supabase as any, storyId\)/g)?.length).toBe(2)
    expect(src).toContain('...seriesFields,')
    expect(src).toContain('...endSeriesFields,')
  })
})
