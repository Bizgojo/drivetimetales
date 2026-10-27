import { wifiRefillAllowed, queuedEpisodeIds, refillPlaylist } from '@/lib/offline/refill'
import { listEpisodes, usage } from '@/lib/offline/store'
import { downloadQueuedItemOffline } from '@/lib/offline/queueDownload'
import { OFFLINE_MAX_EPISODES, OFFLINE_MAX_BYTES } from '@/lib/offline/license'

jest.mock('@/lib/offline/store', () => ({ listEpisodes: jest.fn(), usage: jest.fn() }))
jest.mock('@/lib/offline/queueDownload', () => ({ downloadQueuedItemOffline: jest.fn() }))
const saved: any[] = []
let playlist: any
beforeEach(() => {
  jest.clearAllMocks(); saved.length = 0
  playlist = { items: [{ type: 'series', episodes: [{ id: 'a' }, { id: 'b' }] }, { type: 'single', id: 'c' }] }
  ;(globalThis as any).localStorage = { getItem: () => JSON.stringify(playlist) }
  ;(listEpisodes as jest.Mock).mockImplementation(async () => saved)
  ;(usage as jest.Mock).mockImplementation(async () => ({ count: saved.length, bytes: 0 }))
  ;(downloadQueuedItemOffline as jest.Mock).mockImplementation(async target => saved.push({ storyId: target.id, userId: 'u' }))
})
it('never assumes Wi-Fi for Safari, unknown, offline, cellular, or data saver', () => {
  expect(wifiRefillAllowed(true, { type: 'wifi' })).toBe(true)
  for (const connection of [undefined, {}, { type: 'cellular' }, { type: 'wifi', saveData: true }]) expect(wifiRefillAllowed(true, connection)).toBe(false)
  expect(wifiRefillAllowed(false, { type: 'wifi' })).toBe(false)
})
it('retains playlist order and eliminates duplicate episodes', () => {
  playlist.items.push({ type: 'single', id: 'a' })
  expect(queuedEpisodeIds(playlist)).toEqual(['a', 'b', 'c'])
})
it('downloads only missing episodes in playlist order', async () => {
  saved.push({ storyId: 'a', userId: 'u' })
  await refillPlaylist({ accessToken: 't', userId: 'u', allowed: () => true })
  expect((downloadQueuedItemOffline as jest.Mock).mock.calls.map(c => c[0].id)).toEqual(['b', 'c'])
})
it('re-reads the queue so a removed story is never refilled', async () => {
  ;(downloadQueuedItemOffline as jest.Mock).mockImplementation(async target => { saved.push({ storyId: target.id, userId: 'u' }); playlist.items = [] })
  await refillPlaylist({ accessToken: 't', userId: 'u', allowed: () => true })
  expect(downloadQueuedItemOffline).toHaveBeenCalledTimes(1)
})
it('stops at the episode or byte cap', async () => {
  for (const limits of [{ count: OFFLINE_MAX_EPISODES, bytes: 0 }, { count: 0, bytes: OFFLINE_MAX_BYTES }]) {
    ;(usage as jest.Mock).mockResolvedValue(limits)
    await refillPlaylist({ accessToken: 't', userId: 'u', allowed: () => true })
  }
  expect(downloadQueuedItemOffline).not.toHaveBeenCalled()
})
it('does not repeat a failed episode in the same pass or continue after Wi-Fi is lost', async () => {
  let allowed = true
  ;(downloadQueuedItemOffline as jest.Mock).mockImplementation(async () => { allowed = false })
  await refillPlaylist({ accessToken: 't', userId: 'u', allowed: () => allowed })
  expect(downloadQueuedItemOffline).toHaveBeenCalledTimes(1)
})
