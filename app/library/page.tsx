'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useStories } from '@/hooks/useData'

export default function LibraryPage() {
  const router = useRouter()
  const { stories, loading, error } = useStories()
  const [genre, setGenre] = useState('All')
  const [duration, setDuration] = useState('All')

  const genreOptions = [
    { name: 'All', icon: '📚' },
    { name: 'Mystery', icon: '🔍' },
    { name: 'Drama', icon: '🎭' },
    { name: 'Sci-Fi', icon: '🚀' },
    { name: 'Horror', icon: '👻' },
    { name: 'Comedy', icon: '😂' },
    { name: 'Romance', icon: '💕' },
    { name: 'Trucker Stories', icon: '🚛' },
    { name: 'Thriller', icon: '😱' },
  ]

  const durationOptions = [
    { name: 'All', label: 'All' },
    { name: '15 min', label: '~15 min' },
    { name: '30 min', label: '~30 min' },
    { name: '1 hr', label: '~1 hr' },
  ]

  // Filter stories by genre and duration
  const filtered = stories.filter((s: any) => {
    // Genre filter
    if (genre !== 'All' && s.genre !== genre) return false
    
    // Duration filter
    if (duration === '15 min' && (s.duration_mins < 10 || s.duration_mins > 20)) return false
    if (duration === '30 min' && (s.duration_mins < 20 || s.duration_mins > 45)) return false
    if (duration === '1 hr' && s.duration_mins < 45) return false
    
    return true
  })

  // Logo component
  const Logo = () => (
    <div className="flex items-center justify-center gap-2">
      <svg width="50" height="30" viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g>
          <rect x="45" y="24" width="30" height="14" rx="3" fill="#f97316"/>
          <path d="M52 24 L56 16 L68 16 L72 24" fill="#f97316"/>
          <path d="M54 23 L57 17 L67 17 L70 23" fill="#1e293b"/>
          <circle cx="54" cy="38" r="5" fill="#334155"/>
          <circle cx="54" cy="38" r="2.5" fill="#64748b"/>
          <circle cx="68" cy="38" r="5" fill="#334155"/>
          <circle cx="68" cy="38" r="2.5" fill="#64748b"/>
          <rect x="73" y="28" width="3" height="4" rx="1" fill="#fef08a"/>
        </g>
        <g>
          <rect x="2" y="20" width="18" height="18" rx="3" fill="#3b82f6"/>
          <path d="M5 20 L8 12 L17 12 L20 20" fill="#3b82f6"/>
          <path d="M7 19 L9 13 L16 13 L18 19" fill="#1e293b"/>
          <rect x="20" y="18" width="22" height="20" rx="2" fill="#60a5fa"/>
          <circle cx="10" cy="38" r="5" fill="#334155"/>
          <circle cx="10" cy="38" r="2.5" fill="#64748b"/>
          <circle cx="32" cy="38" r="5" fill="#334155"/>
          <circle cx="32" cy="38" r="2.5" fill="#64748b"/>
        </g>
      </svg>
      <div className="flex items-baseline">
        <span className="text-lg font-bold text-white">Drive Time </span>
        <span className="text-lg font-bold text-orange-500">Tales</span>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <div className="max-w-2xl mx-auto px-4 py-8 text-center">
          <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-white">Loading stories...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <div className="max-w-2xl mx-auto px-4 py-8 text-center">
          <p className="text-red-400">Error: {error?.message || 'Failed to load stories'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-4">
        
        {/* Header with Logo */}
        <div className="flex justify-center mb-4">
          <Logo />
        </div>

        {/* Page Title */}
        <div className="text-center mb-4">
          <h1 className="text-2xl font-bold text-white">Story Library</h1>
          <p className="text-white text-sm mt-1">Browse our complete collection</p>
        </div>

        {/* Genre Icons */}
        <div className="mb-3">
          <div className="flex flex-wrap justify-center gap-1">
            {genreOptions.map((g) => (
              <button
                key={g.name}
                onClick={() => setGenre(g.name)}
                className={`flex flex-col items-center px-2 py-1 rounded-lg transition-all ${
                  genre === g.name 
                    ? 'bg-orange-500 text-black' 
                    : 'bg-slate-800 text-white'
                }`}
              >
                <span className="text-sm">{g.icon}</span>
                <span className="text-[9px] mt-0.5">{g.name === 'Trucker Stories' ? 'Trucker' : g.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Duration Filter Buttons */}
        <div className="mb-4">
          <div className="flex justify-center gap-2">
            {durationOptions.map((d) => (
              <button
                key={d.name}
                onClick={() => setDuration(d.name)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  duration === d.name 
                    ? 'bg-orange-500 text-black' 
                    : 'bg-slate-800 text-white border border-slate-700'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        <p className="text-white text-xs mb-3">{filtered.length} {filtered.length === 1 ? 'story' : 'stories'} found</p>

        {/* Stories List */}
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-5xl block mb-4">📚</span>
            <h2 className="text-xl font-bold text-white mb-2">No Stories Found</h2>
            <p className="text-white">Try selecting a different genre or duration</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((story: any, index: number) => (
              <Link 
                key={story.id}
                href={`/story/${story.id}`}
                className={`block rounded-xl overflow-hidden ${index % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800'}`}
              >
                <div className="flex">
                  {/* Cover - Larger */}
                  <div className="w-32 h-32 flex-shrink-0 relative">
                    {story.cover_url ? (
                      <img 
                        src={story.cover_url}
                        alt={story.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                        <span className="text-3xl opacity-50">🎧</span>
                      </div>
                    )}
                    {/* Duration badge */}
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 text-white text-[10px] rounded">
                      {story.duration_mins} min
                    </div>
                  </div>
                  
                  {/* Spacer */}
                  <div className="w-3" />
                  
                  {/* Info */}
                  <div className="flex-1 py-3 pr-3 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-white text-sm leading-tight">{story.title}</h3>
                      <p className="text-white text-xs mt-1">{story.genre} • {story.credits} {story.credits === 1 ? 'credit' : 'credits'}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{story.author}</p>
                    </div>
                    
                    {/* Preview Story button - shorter, no tags */}
                    <div className="mt-2">
                      <span className="inline-block px-6 py-1.5 bg-orange-500 hover:bg-orange-400 rounded-lg transition-colors">
                        <span className="text-black text-xs font-semibold">Preview Story</span>
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
