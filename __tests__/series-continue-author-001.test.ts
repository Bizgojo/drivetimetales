import { buildNewEpisodeRows } from '@/lib/series/continue-plan'

test('SERIES-CONTINUE-AUTHOR-001: new episodes copy author_id and narrator voice from Episode 1', () => {
  const rows = buildNewEpisodeRows(
    { id: 's', title: 'Rerouted', description: null, author: 'Jack Malone' },
    { author: 'Jack Malone', author_id: 'a-1', author_style: null, genre: 'Thriller', narrative_voice: null, narrator_voice_name: 'Evelyn Bales', narrator_voice_id: 'v-1', duration_label: '12-15 minutes', duration_mins: 15 },
    { series_bible: 'b', episodes: [{ episode_number: 4, title: 'The Name', premise: 'p', setting: 's', description: 'd', continuity_notes: 'c', cliffhanger_or_resolution: 'x' }] as any },
    7,
  )
  expect(rows[0]).toMatchObject({ author_id: 'a-1', narrator_voice_id: 'v-1', narrator_voice_name: 'Evelyn Bales' })
})
