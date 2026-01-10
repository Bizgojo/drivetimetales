'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const CATEGORY_INFO: Record<string, { name: string; icon: string; color: string; bgClass: string }> = {
  national: { name: 'National News', icon: '🇺🇸', color: 'blue', bgClass: 'from-blue-600 to-blue-900' },
  international: { name: 'International News', icon: '🌍', color: 'green', bgClass: 'from-green-600 to-green-900' },
  business: { name: 'Business & Finance', icon: '💼', color: 'yellow', bgClass: 'from-yellow-600 to-yellow-900' },
  sports: { name: 'Sports', icon: '⚽', color: 'red', bgClass: 'from-red-600 to-red-900' },
  science: { name: 'Science & Technology', icon: '🔬', color: 'purple', bgClass: 'from-purple-600 to-purple-900' },
}

interface NewsEpisode {
  id: string
  title: string
  category: string
  edition: string
  script_text: string | null
  audio_url: string | null
  is_live: boolean
  created_at: string
  published_at: string | null
}

export default function NewsCategoryPage() {
  const params = useParams()
  const category = params.category as string
  const categoryInfo = CATEGORY_INFO[category] || { name: 'News', icon: '📰', color: 'orange', bgClass: 'from-orange-600 to-orange-900' }

  const [episode, setEpisode] = useState<NewsEpisode | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    loadLiveEpisode()
  }, [category])

  async function loadLiveEpisode() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('news_episodes')
        .select('*')
        .eq('category', category)
        .eq('is_live', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (data) {
        setEpisode(data)
      }
    } catch (error) {
      console.error('Error loading episode:', error)
    } finally {
      setLoading(false)
    }
  }

  function togglePlayPause() {
    if (!audioRef.current) return
    
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  function handleTimeUpdate() {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  function handleLoadedMetadata() {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const time = parseFloat(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function getTimeAgo(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    
    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours}h ago`
    return `${Math.floor(diffHours / 24)}d ago`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <Link href="/home" className="text-slate-400 hover:text-white transition flex items-center gap-2">
          ← Back
        </Link>
        <span className="text-xl">{categoryInfo.icon}</span>
      </header>

      {/* Hero */}
      <div className={`bg-gradient-to-br ${categoryInfo.bgClass} p-6`}>
        <div className="text-center">
          <span className="text-5xl mb-3 block">{categoryInfo.icon}</span>
          <h1 className="text-2xl font-bold">{categoryInfo.name}</h1>
          <p className="text-white/70 text-sm mt-1">Daily Briefing</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        {episode ? (
          <div className="space-y-4">
            {/* Episode Info */}
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h2 className="font-bold text-lg">{episode.title}</h2>
                  <p className="text-slate-400 text-sm">
                    {episode.edition} Edition • {getTimeAgo(episode.created_at)}
                  </p>
                </div>
                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold animate-pulse">
                  LIVE
                </span>
              </div>
            </div>

            {/* Audio Player */}
            {episode.audio_url ? (
              <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
                <audio
                  ref={audioRef}
                  src={episode.audio_url}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={() => setIsPlaying(false)}
                />

                {/* Progress Bar */}
                <div className="mb-4">
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-orange-500 [&::-webkit-slider-thumb]:rounded-full"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => {
                      if (audioRef.current) audioRef.current.currentTime -= 15
                    }}
                    className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center hover:bg-slate-700 transition"
                  >
                    <span className="text-xs font-bold">-15</span>
                  </button>

                  <button
                    onClick={togglePlayPause}
                    className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center hover:bg-orange-400 transition"
                  >
                    <span className="text-2xl text-black">
                      {isPlaying ? '⏸' : '▶'}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      if (audioRef.current) audioRef.current.currentTime += 15
                    }}
                    className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center hover:bg-slate-700 transition"
                  >
                    <span className="text-xs font-bold">+15</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 text-center">
                <p className="text-slate-400">Audio not yet available</p>
                <p className="text-slate-500 text-sm mt-1">Check back soon!</p>
              </div>
            )}

            {/* Script Preview */}
            {episode.script_text && (
              <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
                <h3 className="font-bold mb-2 text-sm uppercase text-slate-400">Transcript</h3>
                <div className="text-slate-300 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {episode.script_text}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-900 rounded-xl p-8 border border-slate-800 text-center">
            <span className="text-4xl mb-3 block">📰</span>
            <h2 className="text-xl font-bold mb-2">No Briefing Available</h2>
            <p className="text-slate-400">
              The {categoryInfo.name.toLowerCase()} briefing hasn&apos;t been generated yet.
            </p>
            <p className="text-slate-500 text-sm mt-2">
              Check back at 6am or 6pm for the latest updates!
            </p>
          </div>
        )}
      </div>

      {/* Other Categories */}
      <div className="p-4 border-t border-slate-800">
        <p className="text-xs text-slate-500 mb-2 uppercase">Other Briefings</p>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {Object.entries(CATEGORY_INFO)
            .filter(([key]) => key !== category)
            .map(([key, info]) => (
              <Link
                key={key}
                href={`/news/${key}`}
                className="flex-shrink-0 bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-2 flex items-center gap-2 transition"
              >
                <span>{info.icon}</span>
                <span className="text-sm">{info.name.split(' ')[0]}</span>
              </Link>
            ))}
        </div>
      </div>
    </div>
  )
}
