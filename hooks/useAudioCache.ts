import { useState, useEffect, useCallback } from 'react'
import { isAudioCached, getCachedAudioUrl, cacheAudio, isCacheSupported } from '@/lib/AudioCache'

export function useAudioCache(audioUrl: string | undefined) {
  const [audioSrc, setAudioSrc] = useState<string | null>(null)
  const [isCached, setIsCached] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [isSupported] = useState(() => typeof window !== 'undefined' && isCacheSupported())

  useEffect(() => {
    if (!audioUrl) { setAudioSrc(null); return }
    let blobUrl: string | null = null
    async function initAudio() {
      const cached = await isAudioCached(audioUrl)
      setIsCached(cached)
      if (cached) {
        blobUrl = await getCachedAudioUrl(audioUrl)
        setAudioSrc(blobUrl)
        setDownloadProgress(100)
      } else {
        setAudioSrc(audioUrl)
        if (isSupported) {
          setIsDownloading(true)
          await cacheAudio(audioUrl, (progress) => setDownloadProgress(progress))
          setIsDownloading(false)
          setIsCached(true)
        }
      }
    }
    initAudio()
    return () => { if (blobUrl?.startsWith('blob:')) URL.revokeObjectURL(blobUrl) }
  }, [audioUrl, isSupported])

  const triggerDownload = useCallback(async () => {
    if (!audioUrl || isDownloading || isCached) return
    setIsDownloading(true)
    await cacheAudio(audioUrl, (progress) => setDownloadProgress(progress))
    setIsDownloading(false)
    setIsCached(true)
  }, [audioUrl, isDownloading, isCached])

  return { audioSrc, isCached, isDownloading, downloadProgress, isSupported, triggerDownload }
}
