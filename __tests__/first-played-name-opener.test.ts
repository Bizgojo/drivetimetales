/**
 * FIRST-PLAYED-NAME-OPENER — series name-opener rule (app/player only).
 *
 * Rule under test (app/api/asc3/story-playlist/route.ts):
 *  - Series: personalized name opener ONLY on the listener's FIRST played
 *    episode of the series (any episode number); every later series play
 *    uses the normal Belle intro (baked final mix, countable reason
 *    'series_replay_normal_intro').
 *  - Standalone: unchanged (personalized opener whenever assets are ready).
 *  - Missing/failed opener: silent fallback to the normal intro (existing
 *    behavior, reason 'personalized_queue_error').
 *  - Series finale outro: NO per-user personalized-outro path exists (outro
 *    is always the baked story asset), so the outro is untouched — asserted
 *    here as a source-level guard so a future personalized outro can't slip
 *    in without updating this rule's tests.
 */

let currentService: any = null
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => new Proxy({}, {
    get: (_target, prop) => {
      if (!currentService) throw new Error('mock supabase not initialized')
      return currentService[prop]
    },
  })),
}))
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => ({
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: userId } : null } }) },
  })),
}))

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/asc3/story-playlist/route'
import { hasPriorSeriesPlay, seriesEpisodeIds } from '@/lib/personalization/firstPlayedOpener'

const storyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const seriesId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

let signedIn = true
let story: any
let episodeIds: Array<{ id: string }>
let playCount: number | null
let playError: { message: string } | null
let poolStatus = 'ready'
let clipError: { message: string } | null = null
let calls: Array<{ table: string; ops: Array<[string, any[]]> }>

const BASE_STORY = {
  id: storyId,
  title: 'Episode 1',
  primary_genre: 'Mystery',
  genre: 'Mystery',
  audio_url: 'https://cdn.example/final.mp3',
  announcement_url: 'https://cdn.example/announcement.mp3',
  story_audio_url: 'https://cdn.example/body.mp3',
  story_body_with_outro_url: '',
  outro_with_music_url: 'https://cdn.example/outro.mp3',
  outro_audio_url: '',
  updated_at: '2026-10-27T00:00:00.000Z',
  series_id: null,
  series_episode_number: null,
  series_is_finale: false,
}

const CLIPS = [
  { opener_id: 'op-1', intro_audio_url: 'https://cdn.example/opener-1.mp3', tone_cluster: 'warm' },
]

const serviceClient: any = {
  from(table: string) {
    const ops: Array<[string, any[]]> = []
    const builder: any = {}
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'ilike', 'gte', 'order', 'limit']) {
      builder[m] = (...args: any[]) => { ops.push([m, args]); return builder }
    }
    const finish = (response: any) => {
      calls.push({ table, ops: [...ops] })
      return Promise.resolve(response)
    }
    builder.single = () => {
      ops.push(['single', []])
      if (table === 'stories') return finish({ data: story, error: null })
      if (table === 'users') return finish({ data: profile(), error: null })
      return finish({ data: null, error: null })
    }
    builder.maybeSingle = () => {
      ops.push(['maybeSingle', []])
      if (table === 'users') return finish({ data: profile(), error: null })
      if (table === 'genre_tone_cluster') return finish({ data: { tone_cluster: 'warm' }, error: null })
      if (table === 'name_pools') return finish({ data: { status: poolStatus }, error: null })
      return finish({ data: null, error: null })
    }
    builder.insert = (row: any) => {
      ops.push(['insert', [row]])
      return finish({ error: null })
    }
    builder.then = (onF: any, onR?: any) => {
      ops.push(['await', []])
      if (table === 'stories') return finish({ data: episodeIds, error: null }).then(onF, onR)
      if (table === 'play_events') {
        return finish({ data: null, count: playCount, error: playError }).then(onF, onR)
      }
      if (table === 'name_opener_clips') {
        if (clipError) return finish({ data: null, error: clipError }).then(onF, onR)
        return finish({ data: CLIPS, error: null }).then(onF, onR)
      }
      if (table === 'user_opener_history') return finish({ data: [], error: null }).then(onF, onR)
      return finish({ data: null, error: null }).then(onF, onR)
    }
    return builder
  },
}

function profile() {
  return { first_name: 'Marc', display_name: null, name_pronunciation_key: 'MRK', signup_source: '' }
}

function request() {
  return new NextRequest(
    `https://app.example/api/asc3/story-playlist?storyId=${storyId}&firstName=Marc`
  )
}

beforeEach(() => {
  currentService = serviceClient
  signedIn = true
  story = { ...BASE_STORY }
  episodeIds = []
  playCount = 0
  playError = null
  poolStatus = 'ready'
  clipError = null
  calls = []
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

const tablesQueried = () => calls.map((c) => c.table)

// ─── Rule 1: standalone unchanged ────────────────────────────────────────────

test('standalone (no series_id) keeps the personalized name opener and never checks series history', async () => {
  story = { ...BASE_STORY, series_id: null }
  const res = await GET(request())
  const body = await res.json()
  expect(body.useFinalMix).toBe(false)
  expect(body.queue[0]).toMatchObject({ type: 'intro', label: 'Welcome' })
  expect(body.queue[0].url).toBe('https://cdn.example/opener-1.mp3')
  expect(tablesQueried()).not.toContain('play_events')
})

// ─── Rule 2: series first-played (any episode number) gets the opener ───────

test('series EP1 first play gets the personalized opener', async () => {
  story = { ...BASE_STORY, series_id: seriesId, series_episode_number: 1, series_is_finale: false }
  episodeIds = [{ id: storyId }, { id: 'ep2' }]
  playCount = 0
  const res = await GET(request())
  const body = await res.json()
  expect(body.useFinalMix).toBe(false)
  expect(body.queue[0]).toMatchObject({ type: 'intro', label: 'Welcome' })
})

test('series non-EP1 first play (listener starts at EP3) still gets the opener', async () => {
  story = { ...BASE_STORY, series_id: seriesId, series_episode_number: 3, series_is_finale: false }
  episodeIds = [{ id: 'ep1' }, { id: 'ep2' }, { id: storyId }]
  playCount = 0
  const res = await GET(request())
  const body = await res.json()
  expect(body.useFinalMix).toBe(false)
  expect(body.queue[0]).toMatchObject({ type: 'intro', label: 'Welcome' })
})

// ─── Rule 3: series subsequent plays get the normal intro ───────────────────

test('series second play (prior play_events row in series) falls back to the normal Belle intro', async () => {
  story = { ...BASE_STORY, series_id: seriesId, series_episode_number: 2, series_is_finale: false }
  episodeIds = [{ id: 'ep1' }, { id: storyId }]
  playCount = 1
  const res = await GET(request())
  const body = await res.json()
  expect(body.useFinalMix).toBe(true)
  expect(body.finalMixUrl).toContain('https://cdn.example/final.mp3')
  expect(body.personalization.fallbackReason).toBe('series_replay_normal_intro')
  // Countable per PERS-FIX-002: a personalization_fallbacks row carries the reason
  const fallbackInserts = calls.filter((c) => c.table === 'personalization_fallbacks')
  expect(fallbackInserts).toHaveLength(1)
  expect(fallbackInserts[0].ops).toContainEqual(['insert', [{
    story_id: storyId,
    user_id: userId,
    pronunciation_key: 'MRK',
    reason: 'series_replay_normal_intro',
  }]])
  // No opener clip is consumed on a replay
  expect(tablesQueried()).not.toContain('name_opener_clips')
})

test('series history check scopes to series episodes (plays outside the series do not suppress the opener)', async () => {
  story = { ...BASE_STORY, series_id: seriesId, series_episode_number: 1, series_is_finale: false }
  episodeIds = [{ id: storyId }]
  playCount = 0
  const res = await GET(request())
  const body = await res.json()
  expect(body.useFinalMix).toBe(false)
  const seriesHistoryQuery = calls.find((c) => c.table === 'play_events')
  expect(seriesHistoryQuery?.ops).toContainEqual(['in', ['story_id', [storyId]]])
})

// ─── Rule 4: missing/failed opener falls back silently ──────────────────────

test('opener clip lookup failure falls back silently to the normal intro', async () => {
  story = { ...BASE_STORY, series_id: seriesId, series_episode_number: 1, series_is_finale: false }
  episodeIds = [{ id: storyId }]
  playCount = 0
  clipError = { message: 'name_opener_clips unavailable' }
  const res = await GET(request())
  const body = await res.json()
  expect(body.useFinalMix).toBe(true)
  expect(body.finalMixUrl).toContain('https://cdn.example/final.mp3')
  expect(body.personalization.fallbackReason).toBe('personalized_queue_error')
})

// ─── Safe failure mode: history lookup failure still plays the opener ───────

test('series history lookup failure defaults to first-play (opener plays)', async () => {
  story = { ...BASE_STORY, series_id: seriesId, series_episode_number: 2, series_is_finale: false }
  episodeIds = [{ id: 'ep1' }, { id: storyId }]
  playCount = null
  playError = { message: 'play_events unavailable' }
  const res = await GET(request())
  const body = await res.json()
  expect(body.useFinalMix).toBe(false)
  expect(body.queue[0]).toMatchObject({ type: 'intro', label: 'Welcome' })
})

// ─── Finale outro: no personalized-outro path exists — outro untouched ──────

test('finale outro has no per-user personalization path (baked asset only)', async () => {
  story = { ...BASE_STORY, series_id: seriesId, series_episode_number: 8, series_is_finale: true }
  episodeIds = [{ id: storyId }]
  playCount = 0
  const res = await GET(request())
  const body = await res.json()
  // First play of the finale series: opener + announcement + story + baked outro
  expect(body.useFinalMix).toBe(false)
  const outro = body.queue.find((seg: any) => seg.type === 'outro')
  expect(outro?.url).toBe('https://cdn.example/outro.mp3')
})

// ─── Unit: history helpers ───────────────────────────────────────────────────

describe('hasPriorSeriesPlay', () => {
  function historyClient(epIds: Array<{ id: string }>, count: number | null, error: any) {
    return {
      from(table: string) {
        const builder: any = {}
        for (const m of ['select', 'eq', 'in', 'limit']) builder[m] = () => builder
        builder.then = (onF: any) => {
          if (table === 'stories') return Promise.resolve({ data: epIds, error: null }).then(onF)
          return Promise.resolve({ data: null, count, error }).then(onF)
        }
        return builder
      },
    }
  }

  test('false when the series has no plays', async () => {
    await expect(hasPriorSeriesPlay(historyClient([{ id: 'a' }], 0, null), 'u', 's')).resolves.toBe(false)
  })

  test('true when any series episode was played', async () => {
    await expect(hasPriorSeriesPlay(historyClient([{ id: 'a' }, { id: 'b' }], 3, null), 'u', 's')).resolves.toBe(true)
  })

  test('false (opener plays) when the history lookup fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(
      hasPriorSeriesPlay(historyClient([{ id: 'a' }], null, { message: 'down' }), 'u', 's')
    ).resolves.toBe(false)
    warn.mockRestore()
  })

  test('seriesEpisodeIds returns the trimmed episode ids', async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'a' }, { id: 'b' }], error: null }) }),
      }),
    }
    await expect(seriesEpisodeIds(client, 's')).resolves.toEqual(['a', 'b'])
  })
})
