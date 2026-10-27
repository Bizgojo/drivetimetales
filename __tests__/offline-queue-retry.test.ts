import { downloadEpisode, DownloadError } from '@/lib/offline/download'
import { downloadQueuedItemOffline, downloadStatuses } from '@/lib/offline/queueDownload'
jest.mock('@/lib/offline/download', () => {
  class DownloadError extends Error { constructor(public code: string, message: string) { super(message) } }
  return { DownloadError, downloadEpisode: jest.fn() }
})
jest.mock('@/lib/offline/store', () => ({ offlineSupported: () => true, getEpisode: async () => null, deleteEpisode: async () => {} }))
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); downloadStatuses.clear() })
afterEach(() => jest.useRealTimers())
it('retries a temporary failure and finishes without a user click', async () => {
  ;(downloadEpisode as jest.Mock).mockRejectedValueOnce(new DownloadError('network', 'Interrupted')).mockResolvedValueOnce({})
  const completed = downloadQueuedItemOffline({ type: 'single', id: 'retry-auto' }, { accessToken: 't' })
  await jest.advanceTimersByTimeAsync(2100)
  await completed
  expect(downloadEpisode).toHaveBeenCalledTimes(2)
  expect(downloadStatuses.has('retry-auto')).toBe(false)
})
it('does not pretend to continue downloading when storage is full', async () => {
  ;(downloadEpisode as jest.Mock).mockRejectedValue(new DownloadError('max_bytes', 'Storage full'))
  await downloadQueuedItemOffline({ type: 'single', id: 'full-device' }, { accessToken: 't' })
  expect(downloadEpisode).toHaveBeenCalledTimes(1)
  expect(downloadStatuses.get('full-device')).toMatchObject({ state: 'error', code: 'max_bytes' })
})
