'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useStories } from '@/hooks/useData'

const genres = ['All', 'Mystery', 'Drama', 'Sci-Fi', 'Horror', 'Comedy', 'Romance', 'Adventure', 'Trucker Stories', 'Thriller']

const genreColors: Record<string, string> = {
  'Mystery': 'from-purple-600 to-purple-900',
  'Drama': 'from-orange-600 to-orange-900',
  'Sci-Fi': 'from-cyan-600 to-cyan-900',
  'Horror': 'from-red-600 to-red-900',
  'Comedy': 'from-yellow-600 to-yellow-900',
  'Romance': 'from-pink-600 to-pink-900',
  'Adventure': 'from-green-600 to-green-900',
  'Trucker Stories': 'from-amber-600 to-amber-900',
  'Thriller': 'from-indigo-600 to-indigo-900',
}

export default function LibraryPage() {
  const { stories, loading, error } = useStories()
  const [genre, setGenre] = useState('All')
  const [search, setSearch] = useState('')

  const filtered = stories.filter((s: any) => {
    if (genre !== 'All' && s.genre !== genre) return false
    if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <div className="max-w-2xl mx-auto px-4 py-8 text-center">
          <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-slate-400">Loading stories...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <div className="max-w-2xl mx-auto px-4 py-8 text-center">
          <p className="text-red-400">Error: {error?.message || 'Failed to load stories'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-white mb-1">Library</h1>
        <p className="text-slate-400 text-sm mb-6">Browse our complete collection of audio stories</p>

        {/* Search and Filter */}
        <div className="flex gap-3 mb-6">
          <input
            type="text"
            placeholder="Search stories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm"
          />
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white cursor-pointer text-sm"
          >
            {genres.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Results count */}
        <p className="text-slate-500 text-sm mb-4">{filtered.length} {filtered.length === 1 ? 'story' : 'stories'} found</p>

        {/* Stories List - Horizontal Cards */}
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-5xl block mb-4">📚</span>
            <h2 className="text-xl font-bold text-white mb-2">No Stories Found</h2>
            <p className="text-slate-400">Try adjusting your search or filter</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((story: any) => {
              const creditsNeeded = Math.ceil(story.duration_mins / 15)
              return (
                <Link 
                  key={story.id} 
                  href={`/story/${story.id}`} 
                  className="block bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-all"
                >
                  {/* Horizontal Card Layout */}
                  <div className="flex">
                    {/* Cover - Left Half */}
                    <div className="w-1/2 aspect-square relative flex-shrink-0">
                      {story.cover_url ? (
                        <img 
                          src={story.cover_url} 
                          alt={story.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${genreColors[story.genre] || 'from-slate-600 to-slate-800'} flex items-center justify-center`}>
                          <span className="text-5xl opacity-50">🎧</span>
                        </div>
                      )}
                      
                      {/* Play overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/40 transition-all">
                          <div className="w-0 h-0 border-l-[18px] border-l-white border-y-[10px] border-y-transparent ml-1" />
                        </div>
                      </div>
                      
                      {/* NEW badge */}
                      {story.is_new && (
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-green-500 text-black text-xs font-semibold rounded">
                          NEW
                        </div>
                      )}
                    </div>

                    {/* Info - Right Half */}
                    <div className="w-1/2 p-4 flex flex-col justify-between">
                      <div>
                        <h3 className="font-bold text-white text-base mb-1 line-clamp-2">{story.title}</h3>
                        <p className="text-orange-400 text-sm mb-1">{story.genre}</p>
                        <p className="text-slate-400 text-sm mb-2">by {story.author}</p>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span>{story.duration_mins} min</span>
                          <span>•</span>
                          <span>{creditsNeeded} {creditsNeeded === 1 ? 'credit' : 'credits'}</span>
                        </div>
                      </div>
                      
                      {/* Play button */}
                      <div className="mt-3 w-full py-2 bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold rounded-lg transition-all text-center">
                        ▶ Play
                      </div>
                    </div>
                  </div>

                  {/* Description - Below the block */}
                  {story.description && (
                    <div className="px-4 pb-4 pt-2 border-t border-slate-800">
                      <p className="text-slate-400 text-sm line-clamp-2">{story.description}</p>
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
