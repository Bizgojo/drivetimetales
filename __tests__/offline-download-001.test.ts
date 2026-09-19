// OFFLINE-DL-001: offline license math + download orchestration.
import { computeOfflineLicense, canPlayOffline, checkDownloadCaps, OFFLINE_MAX_BYTES } from '@/lib/offline/license'

const DAY = 24 * 60 * 60 * 1000
const now = new Date('2026-09-19T12:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

describe('computeOfflineLicense', () => {
  it('entitled, renewal far out → verifiedAt + 14 days', () => {
    const l = computeOfflineLicense({ userId: 'u', entitled: true, subscriptionEndsAt: iso(now.getTime() + 60 * DAY), cancelledAt: null, now })
    expect(l.validUntil).toBe(iso(now.getTime() + 14 * DAY))
    expect(l.verifiedAt).toBe(now.toISOString())
  })
  it('active (not cancelled): capped at subscription_ends_at + 3-day grace', () => {
    const ends = now.getTime() + 5 * DAY
    const l = computeOfflineLicense({ userId: 'u', entitled: true, subscriptionEndsAt: iso(ends), cancelledAt: null, now })
    expect(l.validUntil).toBe(iso(ends + 3 * DAY))
    expect(l.cancelled).toBe(false)
  })
  it('cancelled: no grace — ends exactly at subscription_ends_at', () => {
    const ends = now.getTime() + 5 * DAY
    const l = computeOfflineLicense({ userId: 'u', entitled: true, subscriptionEndsAt: iso(ends), cancelledAt: iso(now.getTime() - DAY), now })
    expect(l.validUntil).toBe(iso(ends))
    expect(l.cancelled).toBe(true)
  })
  it('entitled with no end date → 14 days', () => {
    const l = computeOfflineLicense({ userId: 'u', entitled: true, subscriptionEndsAt: null, cancelledAt: null, now })
    expect(l.validUntil).toBe(iso(now.getTime() + 14 * DAY))
  })
  it('not entitled → no license', () => {
    const l = computeOfflineLicense({ userId: 'u', entitled: false, subscriptionEndsAt: iso(now.getTime() - DAY), cancelledAt: null, now })
    expect(l.validUntil).toBeNull()
  })
})

describe('canPlayOffline', () => {
  const valid = { validUntil: iso(now.getTime() + DAY) }
  const expired = { validUntil: iso(now.getTime() - 1000) }
  it('free stories always play', () => {
    expect(canPlayOffline({ isFree: true }, null, now)).toBe(true)
    expect(canPlayOffline({ isFree: true }, expired, now)).toBe(true)
  })
  it('paid stories only while the license is valid', () => {
    expect(canPlayOffline({ isFree: false }, valid, now)).toBe(true)
    expect(canPlayOffline({ isFree: false }, expired, now)).toBe(false)
    expect(canPlayOffline({ isFree: false }, null, now)).toBe(false)
    expect(canPlayOffline({ isFree: false }, { validUntil: null }, now)).toBe(false)
  })
})

describe('checkDownloadCaps', () => {
  it('enforces 10 episodes and 500 MB', () => {
    expect(checkDownloadCaps({ count: 9, bytes: 0 }, 1)).toEqual({ ok: true })
    expect(checkDownloadCaps({ count: 10, bytes: 0 }, 1)).toEqual({ ok: false, reason: 'max_episodes' })
    expect(checkDownloadCaps({ count: 1, bytes: OFFLINE_MAX_BYTES - 10 }, 11)).toEqual({ ok: false, reason: 'max_bytes' })
  })
})

// ── Download orchestration (store mocked in-memory; real IndexedDB is covered by the browser check) ──
const mem = { episodes: new Map<string, any>(), blobs: new Map<string, Blob>(), license: null as any, deleted: [] as string[] }
jest.mock('@/lib/offline/store', () => ({
  segmentKey: (id: string, i: number) => `${id}:seg:${i}`,
  coverKey: (id: string) => `${id}:cover`,
  listEpisodes: async () => [...mem.episodes.values()],
  usage: async () => ({ count: mem.episodes.size, bytes: [...mem.episodes.values()].reduce((s, e) => s + e.totalBytes, 0) }),
  putBlob: async (k: string, b: Blob) => { mem.blobs.set(k, b) },
  putEpisode: async (e: any) => { mem.episodes.set(e.storyId, e) },
  deleteEpisode: async (id: string) => {
    mem.deleted.push(id); mem.episodes.delete(id)
    for (const k of [...mem.blobs.keys()]) if (k.startsWith(`${id}:`)) mem.blobs.delete(k)
  },
  getLicense: async () => mem.license,
  putLicense: async (l: any) => { mem.license = l },
}))
import { downloadEpisode, refreshOfflineLicense, DownloadError } from '@/lib/offline/download'

const LICENSE = { userId: 'u1', entitled: true, verifiedAt: now.toISOString(), validUntil: iso(now.getTime() + 14 * DAY), subscriptionEndsAt: null, cancelled: false }
const STORY = { id: 's1', title: 'The Pattern', author: 'Silas', seriesId: 'ser', seriesName: 'What the Ground Keeps', episodeNumber: 2, durationMins: 16, coverUrl: 'https://cdn/cover.jpg', isFree: false }

function bytesResponse(n: number, type = 'audio/mpeg') {
  const body = new Uint8Array(n)
  return new Response(body, { status: 200, headers: { 'content-type': type, 'content-length': String(n) } })
}

function installFetch(routes: Record<string, () => Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  ;(globalThis as any).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const key = Object.keys(routes).find(k => url.startsWith(k))
    if (!key) throw new Error('unexpected fetch ' + url)
    return routes[key]()
  })
  return calls
}
const json = (body: any, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  mem.episodes.clear(); mem.blobs.clear(); mem.license = null; mem.deleted = []
  ;(globalThis as any).navigator = { storage: { persist: async () => true } }
})

describe('downloadEpisode', () => {
  it('freezes the personalized queue: every segment + cover stored, episode record written last', async () => {
    const calls = installFetch({
      '/api/offline/license': json({ allowed: true, license: LICENSE, story: STORY }),
      '/api/asc3/story-playlist': json({ useFinalMix: false, queue: [
        { url: 'https://cdn/opener.mp3', type: 'intro', label: 'Welcome' },
        { url: 'https://cdn/announce.mp3', type: 'intro', label: 'Story intro' },
        { url: 'https://cdn/body.mp3', type: 'story', label: 'The Pattern' },
      ] }),
      'https://cdn/opener.mp3': () => bytesResponse(1000),
      'https://cdn/announce.mp3': () => bytesResponse(2000),
      'https://cdn/body.mp3': () => bytesResponse(30000),
      'https://cdn/cover.jpg': () => bytesResponse(500, 'image/jpeg'),
    })
    const progress: any[] = []
    const ep = await downloadEpisode({ storyId: 's1', accessToken: 'tok', firstName: 'George', onProgress: p => progress.push(p) })
    expect(ep.segments.map(s => [s.label, s.bytes])).toEqual([['Welcome', 1000], ['Story intro', 2000], ['The Pattern', 30000]])
    expect(ep.totalBytes).toBe(33000)
    expect(ep).toMatchObject({ title: 'The Pattern', seriesName: 'What the Ground Keeps', episodeNumber: 2, durationMins: 16, isFree: false, userId: 'u1', coverKey: 's1:cover' })
    expect([...mem.blobs.keys()].sort()).toEqual(['s1:cover', 's1:seg:0', 's1:seg:1', 's1:seg:2'])
    expect(mem.license).toEqual(LICENSE)
    // Auth header on the gate, firstName passed to the playlist (same as the player)
    expect(calls[0].init?.headers).toMatchObject({ Authorization: 'Bearer tok' })
    expect(calls.find(c => c.url.startsWith('/api/asc3'))!.url).toContain('firstName=George')
    // Audio fetched with the download marker so sw.js doesn't store a second copy
    const audioCalls = calls.filter(c => c.url.includes('.mp3'))
    expect(audioCalls).toHaveLength(3)
    expect(audioCalls.every(c => c.url.endsWith('?et_offline_dl=1'))).toBe(true)
    expect(progress.at(-1).receivedBytes).toBe(33000)
  })

  it('single final mix → one segment', async () => {
    installFetch({
      '/api/offline/license': json({ allowed: true, license: LICENSE, story: { ...STORY, coverUrl: null } }),
      '/api/asc3/story-playlist': json({ useFinalMix: true, finalMixUrl: 'https://cdn/final_mix.mp3?v=1' }),
      'https://cdn/final_mix.mp3': () => bytesResponse(5000),
    })
    const ep = await downloadEpisode({ storyId: 's1', accessToken: 'tok' })
    expect(ep.segments).toHaveLength(1)
    expect(ep.coverKey).toBeNull()
  })

  it('not entitled (and not free) → refused, nothing stored', async () => {
    installFetch({ '/api/offline/license': json({ allowed: false, reason: 'not_entitled', license: { ...LICENSE, entitled: false, validUntil: null }, story: STORY }, 403) })
    await expect(downloadEpisode({ storyId: 's1', accessToken: 'tok' })).rejects.toMatchObject({ code: 'not_entitled' })
    expect(mem.episodes.size).toBe(0)
    expect(mem.blobs.size).toBe(0)
  })

  it('10-episode cap is checked before any network call', async () => {
    for (let i = 0; i < 10; i++) mem.episodes.set(`e${i}`, { storyId: `e${i}`, totalBytes: 1, isFree: false, userId: 'u1' })
    const calls = installFetch({})
    await expect(downloadEpisode({ storyId: 's1', accessToken: 'tok' })).rejects.toMatchObject({ code: 'max_episodes' })
    expect(calls).toHaveLength(0)
  })

  it('500 MB cap: aborts and cleans up partial blobs', async () => {
    mem.episodes.set('big', { storyId: 'big', totalBytes: OFFLINE_MAX_BYTES - 1500, isFree: false, userId: 'u1' })
    installFetch({
      '/api/offline/license': json({ allowed: true, license: LICENSE, story: STORY }),
      '/api/asc3/story-playlist': json({ queue: [{ url: 'https://cdn/a.mp3', type: 'intro', label: 'a' }, { url: 'https://cdn/b.mp3', type: 'story', label: 'b' }] }),
      'https://cdn/a.mp3': () => bytesResponse(1000),
      'https://cdn/b.mp3': () => bytesResponse(1000),
    })
    await expect(downloadEpisode({ storyId: 's1', accessToken: 'tok' })).rejects.toMatchObject({ code: 'max_bytes' })
    expect(mem.deleted).toContain('s1')
    expect([...mem.blobs.keys()].some(k => k.startsWith('s1:'))).toBe(false)
    expect(mem.episodes.has('s1')).toBe(false)
  })

  it('network failure mid-download → no episode record, partial blobs removed', async () => {
    installFetch({
      '/api/offline/license': json({ allowed: true, license: LICENSE, story: STORY }),
      '/api/asc3/story-playlist': json({ queue: [{ url: 'https://cdn/a.mp3', type: 'intro', label: 'a' }, { url: 'https://cdn/b.mp3', type: 'story', label: 'b' }] }),
      'https://cdn/a.mp3': () => bytesResponse(1000),
      'https://cdn/b.mp3': () => new Response('', { status: 503 }),
    })
    await expect(downloadEpisode({ storyId: 's1', accessToken: 'tok' })).rejects.toBeInstanceOf(DownloadError)
    expect(mem.episodes.has('s1')).toBe(false)
    expect(mem.blobs.size).toBe(0)
  })
})

describe('refreshOfflineLicense', () => {
  const seed = () => {
    mem.episodes.set('paid', { storyId: 'paid', isFree: false, userId: 'u1', totalBytes: 1 })
    mem.episodes.set('free', { storyId: 'free', isFree: true, userId: 'u1', totalBytes: 1 })
    mem.license = LICENSE
  }
  it('entitled → extends the license, keeps downloads', async () => {
    seed()
    const fresh = { ...LICENSE, verifiedAt: 'later', validUntil: iso(now.getTime() + 20 * DAY) }
    installFetch({ '/api/offline/license': json({ license: fresh }) })
    const r = await refreshOfflineLicense('tok')
    expect(r.purged).toBe(0)
    expect(mem.license).toEqual(fresh)
    expect(mem.episodes.size).toBe(2)
  })
  it('lapsed → deletes every paid download, keeps free ones', async () => {
    seed()
    installFetch({ '/api/offline/license': json({ license: { ...LICENSE, entitled: false, validUntil: null } }) })
    const r = await refreshOfflineLicense('tok')
    expect(r.purged).toBe(1)
    expect([...mem.episodes.keys()]).toEqual(['free'])
    expect(mem.license.validUntil).toBeNull()
  })
  it('different user signed in on this device → their downloads are removed', async () => {
    seed()
    installFetch({ '/api/offline/license': json({ license: { ...LICENSE, userId: 'u2' } }) })
    const r = await refreshOfflineLicense('tok')
    expect(r.purged).toBe(2)
  })
  it('server/transient failure → keeps the current license and downloads', async () => {
    seed()
    installFetch({ '/api/offline/license': json({ error: 'lookup_failed' }, 503) })
    const r = await refreshOfflineLicense('tok')
    expect(r.purged).toBe(0)
    expect(mem.license).toEqual(LICENSE)
  })
})

describe('service worker contract', () => {
  const fs = require('fs')
  const sw = fs.readFileSync(require('path').join(__dirname, '../public/sw.js'), 'utf8')
  const { DOWNLOAD_MARKER } = require('@/lib/offline/download')
  it('sw.js skips download-marked audio (no second copy in et-audio-v1)', () => {
    expect(sw).toContain(`!url.includes('${DOWNLOAD_MARKER}')`)
  })
  it('sw.js precaches the offline player and routes offline navigations to it', () => {
    expect(sw).toContain("const OFFLINE_PLAYER_URL = '/offline-player.html'")
    expect(sw).toContain("cache.addAll(['/offline.html', OFFLINE_PLAYER_URL])")
    expect(sw).toContain('await caches.match(OFFLINE_PLAYER_URL)')
  })
  it('offline-player.html reads the same IndexedDB schema as lib/offline/store.ts', () => {
    const html = fs.readFileSync(require('path').join(__dirname, '../public/offline-player.html'), 'utf8')
    const { OFFLINE_DB_NAME, OFFLINE_DB_VERSION } = jest.requireActual('@/lib/offline/store')
    expect(html).toContain(`var DB_NAME = '${OFFLINE_DB_NAME}', DB_VERSION = ${OFFLINE_DB_VERSION}`)
    expect(html).toContain("'et_player_progress:'") // lib/playerProgress.ts key prefix
  })
})
