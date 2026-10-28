/**
 * PERS-LIVE-001 — live story-specific listener-name greetings.
 *
 *  - Pure rules: rollout switch, name handling, template validation,
 *    fallback lines, prompt rules.
 *  - story-playlist: with LIVE_GREETINGS on, the first played episode of a
 *    series queues announcement → live greeting → story; the finale appends a
 *    live sign-off; other series plays and standalones keep the existing path.
 *    With LIVE_GREETINGS off nothing changes.
 *  - clip route: signed-in only, name from the account (never the request),
 *    302 to the ready clip, stock-opener fallback for the intro, 404 otherwise.
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

const startGreetingClip = jest.fn()
const waitForGreetingClip = jest.fn()
const loadGreetingStory = jest.fn()
jest.mock('@/lib/personalization/liveGreetingService', () => ({
  startGreetingClip: (...args: any[]) => startGreetingClip(...args),
  waitForGreetingClip: (...args: any[]) => waitForGreetingClip(...args),
  loadGreetingStory: (...args: any[]) => loadGreetingStory(...args),
}))

import { NextRequest } from 'next/server'
import { GET as playlistGET } from '@/app/api/asc3/story-playlist/route'
import { GET as clipGET } from '@/app/api/personal-greeting/clip/route'
import {
  NAME_SLOT,
  buildGreetingPrompt,
  cleanGreetingCandidate,
  fallbackGreetingTemplate,
  fillGreeting,
  greetingClipPath,
  liveGreetingClipRoute,
  liveGreetingEnabledFor,
  liveGreetingMode,
  nameSlug,
  spokenFirstName,
  validateGreetingTemplate,
} from '@/lib/personalization/liveGreeting'

const storyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const seriesId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

let signedIn = true
let story: any
let playCount: number | null
let firstName: string | null
let calls: Array<{ table: string; ops: Array<[string, any[]]> }>

const BASE_STORY = {
  id: storyId,
  title: 'Episode 1',
  primary_genre: 'Thriller',
  genre: 'Thriller',
  audio_url: 'https://cdn.example/final.mp3',
  announcement_url: 'https://cdn.example/announcement.mp3',
  story_audio_url: 'https://cdn.example/body.mp3',
  story_body_with_outro_url: 'https://cdn.example/body_with_outro.mp3',
  outro_with_music_url: 'https://cdn.example/outro.mp3',
  outro_audio_url: '',
  updated_at: '2026-10-28T00:00:00.000Z',
  series_id: seriesId,
  series_episode_number: 1,
  series_is_finale: false,
}

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
      if (table === 'stories') return finish({ data: story, error: null })
      if (table === 'users') return finish({ data: profile(), error: null })
      return finish({ data: null, error: null })
    }
    builder.maybeSingle = () => {
      if (table === 'users') return finish({ data: profile(), error: null })
      if (table === 'genre_tone_cluster') return finish({ data: { tone_cluster: 'warm' }, error: null })
      if (table === 'name_pools') return finish({ data: { status: 'ready' }, error: null })
      return finish({ data: null, error: null })
    }
    builder.insert = (row: any) => { ops.push(['insert', [row]]); return finish({ error: null }) }
    builder.then = (onF: any, onR?: any) => {
      if (table === 'stories') return finish({ data: [{ id: storyId }], error: null }).then(onF, onR)
      if (table === 'play_events') return finish({ data: null, count: playCount, error: null }).then(onF, onR)
      if (table === 'name_opener_clips') {
        return finish({ data: [{ opener_id: 'op-1', intro_audio_url: 'https://cdn.example/stock-opener.mp3', tone_cluster: 'warm' }], error: null }).then(onF, onR)
      }
      if (table === 'user_opener_history') return finish({ data: [], error: null }).then(onF, onR)
      return finish({ data: null, error: null }).then(onF, onR)
    }
    return builder
  },
}

function profile() {
  return { first_name: firstName, display_name: null, name_pronunciation_key: 'MRK', signup_source: '' }
}

const playlistRequest = () => new NextRequest(`https://app.example/api/asc3/story-playlist?storyId=${storyId}&firstName=Marc`)
const clipRequest = (kind: string, extra = '') => new NextRequest(`https://app.example/api/personal-greeting/clip?storyId=${storyId}&kind=${kind}${extra}`)

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  currentService = serviceClient
  signedIn = true
  story = { ...BASE_STORY }
  playCount = 0
  firstName = 'Marc'
  calls = []
  process.env.LIVE_GREETINGS = 'on'
  delete process.env.LIVE_GREETINGS_USER_IDS
  startGreetingClip.mockReset()
  waitForGreetingClip.mockReset()
  loadGreetingStory.mockReset()
  loadGreetingStory.mockImplementation(async () => ({ ...story }))
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
  process.env = { ...ORIGINAL_ENV }
})

// ─── Pure rules ──────────────────────────────────────────────────────────────

describe('rollout switch', () => {
  test('off by default, allowlist by user id, on for everyone', () => {
    expect(liveGreetingMode({})).toBe('off')
    expect(liveGreetingEnabledFor(userId, {})).toBe(false)
    expect(liveGreetingEnabledFor(userId, { LIVE_GREETINGS: 'allowlist', LIVE_GREETINGS_USER_IDS: `x, ${userId}` })).toBe(true)
    expect(liveGreetingEnabledFor('someone-else', { LIVE_GREETINGS: 'allowlist', LIVE_GREETINGS_USER_IDS: userId })).toBe(false)
    expect(liveGreetingEnabledFor(userId, { LIVE_GREETINGS: 'ON' })).toBe(true)
    expect(liveGreetingEnabledFor('', { LIVE_GREETINGS: 'on' })).toBe(false)
  })
})

describe('names and paths', () => {
  test('spoken first name is one capitalized word of letters', () => {
    expect(spokenFirstName('  marc postlewaite')).toBe('Marc')
    expect(spokenFirstName('MARY-JO')).toBe('Mary-jo')
    expect(spokenFirstName('<script>')).toBe('Script')
    expect(spokenFirstName('123')).toBe('')
  })
  test('name slug and storage paths are safe', () => {
    expect(nameSlug('José')).toBe('jose')
    expect(nameSlug("O'Neil")).toBe('o-neil')
    expect(greetingClipPath(seriesId, 'series_intro', 'marc')).toBe(`live-greetings/${seriesId}/series_intro/marc.mp3`)
    expect(greetingClipPath('../x', 'finale_signoff', 'marc')).toBe('live-greetings/x/finale_signoff/marc.mp3')
    expect(liveGreetingClipRoute(storyId, 'finale_signoff')).toBe(`/api/personal-greeting/clip?storyId=${storyId}&kind=finale_signoff`)
  })
  test('fillGreeting puts the name in the slot', () => {
    expect(fillGreeting(`${NAME_SLOT}, settle in.`, 'Marc')).toBe('Marc, settle in.')
  })
})

describe('template validation', () => {
  const goodIntro = '[NAME], you picked a good one. Chicago, a stubborn detective, and a city that wants its secrets kept. Settle in.'
  const goodSignoff = '[NAME], thank you for riding along all seven episodes. It meant a lot having you here. Come find me when you are ready for another.'

  test('accepts good lines', () => {
    expect(validateGreetingTemplate('series_intro', goodIntro)).toEqual([])
    expect(validateGreetingTemplate('finale_signoff', goodSignoff)).toEqual([])
  })
  test('rejects missing or repeated name, digits, wrong length, late name, spoilers', () => {
    expect(validateGreetingTemplate('series_intro', goodIntro.replace('[NAME]', 'Friend')).join()).toMatch(/exactly one/)
    expect(validateGreetingTemplate('series_intro', `${goodIntro} [NAME].`).join()).toMatch(/exactly one/)
    expect(validateGreetingTemplate('series_intro', goodIntro.replace('a good one', 'number 7')).join()).toMatch(/digits/)
    expect(validateGreetingTemplate('series_intro', '[NAME], settle in.').join()).toMatch(/word count/)
    expect(validateGreetingTemplate('series_intro', 'Tonight in Chicago a stubborn detective takes on the city, and you, [NAME], are riding along with him. Settle in.').join()).toMatch(/first six words/)
    expect(validateGreetingTemplate('series_intro', '[NAME], welcome to episode one of a story about Chicago and a stubborn detective who will not let it go.').join()).toMatch(/specific episode/)
    expect(validateGreetingTemplate('finale_signoff', `${goodSignoff.replace('.', ', and stay tuned for the next episode.')}`).join()).toMatch(/more episodes/)
    expect(validateGreetingTemplate('finale_signoff', 'Thanks so much [NAME], it meant a lot having you along for every single twist and turn of this one, see you soon')).toContain('does not end with punctuation')
  })
  test('clean strips a speaker label and quotes', () => {
    expect(cleanGreetingCandidate('BELLE B: "[NAME], settle in."')).toBe('[NAME], settle in.')
  })
  test('fallback lines are valid for a normal series', () => {
    const ctx = { seriesTitle: 'Wrong Side of the River', totalEpisodes: 7 }
    expect(validateGreetingTemplate('series_intro', fallbackGreetingTemplate('series_intro', ctx))).toEqual([])
    const signoff = fallbackGreetingTemplate('finale_signoff', ctx)
    expect(signoff).toContain('all seven episodes of Wrong Side of the River')
    expect(signoff.split(NAME_SLOT).length - 1).toBe(1)
  })
  test('prompts carry the rules and the series facts', () => {
    const intro = buildGreetingPrompt('series_intro', { seriesTitle: 'Wrong Side of the River', genre: 'Thriller', seriesDescription: 'A witness is dead.' })
    expect(intro).toContain('[NAME]')
    expect(intro).toContain('Wrong Side of the River')
    expect(intro).toMatch(/any episode/)
    const signoff = buildGreetingPrompt('finale_signoff', { seriesTitle: 'X', totalEpisodes: 7, finaleOutroText: 'That is the end of X.' })
    expect(signoff).toContain('seven episodes')
    expect(signoff).toContain('do not repeat it')
  })
})

// ─── story-playlist ──────────────────────────────────────────────────────────

describe('story-playlist with live greetings', () => {
  test('first played series episode: announcement → live greeting → story', async () => {
    const body = await (await playlistGET(playlistRequest())).json()
    expect(body.useFinalMix).toBe(false)
    expect(body.queue.map((q: any) => q.url)).toEqual([
      'https://cdn.example/announcement.mp3',
      liveGreetingClipRoute(storyId, 'series_intro'),
      'https://cdn.example/body_with_outro.mp3',
    ])
    expect(startGreetingClip).toHaveBeenCalledWith(expect.objectContaining({ id: storyId }), 'series_intro', 'Marc')
    expect(calls.map((c) => c.table)).not.toContain('name_opener_clips')
  })

  test('finale played first: greeting at the start and sign-off at the end', async () => {
    story = { ...BASE_STORY, series_episode_number: 7, series_is_finale: true }
    const body = await (await playlistGET(playlistRequest())).json()
    const urls = body.queue.map((q: any) => q.url)
    expect(urls[1]).toBe(liveGreetingClipRoute(storyId, 'series_intro'))
    expect(urls[urls.length - 1]).toBe(liveGreetingClipRoute(storyId, 'finale_signoff'))
    expect(body.queue[body.queue.length - 1].type).toBe('outro')
    expect(startGreetingClip).toHaveBeenCalledWith(expect.anything(), 'finale_signoff', 'Marc')
  })

  test('finale after earlier episodes: no greeting at the start, sign-off at the end', async () => {
    story = { ...BASE_STORY, series_episode_number: 7, series_is_finale: true }
    playCount = 6
    const body = await (await playlistGET(playlistRequest())).json()
    expect(body.queue.map((q: any) => q.url)).toEqual([
      'https://cdn.example/announcement.mp3',
      'https://cdn.example/body_with_outro.mp3',
      liveGreetingClipRoute(storyId, 'finale_signoff'),
    ])
    expect(startGreetingClip).toHaveBeenCalledTimes(1)
  })

  test('later non-finale series episode keeps the existing path (normal intro)', async () => {
    story = { ...BASE_STORY, series_episode_number: 3 }
    playCount = 2
    const body = await (await playlistGET(playlistRequest())).json()
    expect(body.useFinalMix).toBe(true)
    expect(startGreetingClip).not.toHaveBeenCalled()
  })

  test('older episodes without story_body_with_outro keep body + outro before the sign-off', async () => {
    story = { ...BASE_STORY, series_is_finale: true, story_body_with_outro_url: '' }
    playCount = 3
    const body = await (await playlistGET(playlistRequest())).json()
    expect(body.queue.map((q: any) => q.url)).toEqual([
      'https://cdn.example/announcement.mp3',
      'https://cdn.example/body.mp3',
      'https://cdn.example/outro.mp3',
      liveGreetingClipRoute(storyId, 'finale_signoff'),
    ])
  })

  test('standalone story is untouched (stock opener path)', async () => {
    story = { ...BASE_STORY, series_id: null }
    const body = await (await playlistGET(playlistRequest())).json()
    expect(startGreetingClip).not.toHaveBeenCalled()
    expect(body.queue[0].url).toBe('https://cdn.example/stock-opener.mp3')
  })

  test('LIVE_GREETINGS off: existing stock opener path, nothing generated', async () => {
    process.env.LIVE_GREETINGS = 'off'
    const body = await (await playlistGET(playlistRequest())).json()
    expect(startGreetingClip).not.toHaveBeenCalled()
    expect(body.queue[0].url).toBe('https://cdn.example/stock-opener.mp3')
  })

  test('allowlist excludes other listeners', async () => {
    process.env.LIVE_GREETINGS = 'allowlist'
    process.env.LIVE_GREETINGS_USER_IDS = 'someone-else'
    await playlistGET(playlistRequest())
    expect(startGreetingClip).not.toHaveBeenCalled()
  })

  test('a live-path error falls back to the existing path', async () => {
    loadGreetingStory.mockImplementation(async () => { throw new Error('db down') })
    const body = await (await playlistGET(playlistRequest())).json()
    expect(body.queue[0].url).toBe('https://cdn.example/stock-opener.mp3')
  })
})

// ─── clip route ──────────────────────────────────────────────────────────────

describe('personal-greeting clip route', () => {
  test('signed out → 401, nothing generated', async () => {
    signedIn = false
    const res = await clipGET(clipRequest('series_intro'))
    expect(res.status).toBe(401)
    expect(waitForGreetingClip).not.toHaveBeenCalled()
  })

  test('ready clip → 302 to storage, name comes from the account not the request', async () => {
    waitForGreetingClip.mockResolvedValue('https://cdn.example/live/marc.mp3')
    const res = await clipGET(clipRequest('series_intro', '&firstName=Eve&text=anything'))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://cdn.example/live/marc.mp3')
    expect(waitForGreetingClip).toHaveBeenCalledWith(expect.anything(), 'series_intro', 'Marc', expect.any(Number))
  })

  test('intro not ready → stock opener fallback', async () => {
    waitForGreetingClip.mockResolvedValue(null)
    const res = await clipGET(clipRequest('series_intro'))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://cdn.example/stock-opener.mp3')
  })

  test('sign-off not ready → 404 (player treats it as the end)', async () => {
    story = { ...BASE_STORY, series_is_finale: true }
    waitForGreetingClip.mockResolvedValue(null)
    const res = await clipGET(clipRequest('finale_signoff'))
    expect(res.status).toBe(404)
  })

  test('sign-off on a non-finale episode → 404 without generating', async () => {
    const res = await clipGET(clipRequest('finale_signoff'))
    expect(res.status).toBe(404)
    expect(waitForGreetingClip).not.toHaveBeenCalled()
  })

  test('disabled → 404 without generating; bad kind → 404', async () => {
    process.env.LIVE_GREETINGS = 'off'
    expect((await clipGET(clipRequest('series_intro'))).status).toBe(404)
    process.env.LIVE_GREETINGS = 'on'
    expect((await clipGET(clipRequest('anything'))).status).toBe(404)
    expect(waitForGreetingClip).not.toHaveBeenCalled()
  })

  test('no first name on the account → no generation', async () => {
    firstName = null
    story = { ...BASE_STORY, series_is_finale: true }
    const res = await clipGET(clipRequest('finale_signoff'))
    expect(res.status).toBe(404)
    expect(waitForGreetingClip).not.toHaveBeenCalled()
  })
})
