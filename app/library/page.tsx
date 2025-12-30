'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useStories } from '@/hooks/useData'
import { Header } from '@/components/ui/Header'

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
        <Header isLoggedIn />
        <div className="max-w-6xl mx-auto text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-slate-400">Loading stories...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <Header isLoggedIn />
        <div className="max-w-6xl mx-auto text-center py-12">
          <p className="text-red-400">Error: {error?.message || 'Failed to load stories'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header isLoggedIn />
      
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-2">Library</h1>
        <p className="text-slate-400 mb-8">Browse our complete collection of audio stories</p>

        {/* Search and Filter */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <input
            type="text"
            placeholder="Search stories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
          />
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white cursor-pointer"
          >
            {genres.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Results count */}
        <p className="text-slate-400 mb-6">{filtered.length} {filtered.length === 1 ? 'story' : 'stories'} found</p>

        {/* Stories Grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-5xl block mb-4">📚</span>
            <h2 className="text-xl font-bold text-white mb-2">No Stories Found</h2>
            <p className="text-slate-400">Try adjusting your search or filter</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {filtered.map((story: any) => (
              <Link key={story.id} href={`/story/${story.id}`} className="group">
                {/* Cover Image */}
                <div className="aspect-square rounded-xl relative overflow-hidden mb-3 group-hover:scale-105 transition-transform">
                  {story.cover_url ? (
                    <img 
                      src={story.cover_url} 
                      alt={story.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-br ${genreColors[story.genre] || 'from-slate-600 to-slate-800'} flex items-center justify-center`}>
                      <span className="text-4xl opacity-50">🎧</span>
                    </div>
                  )}
                  
                  {/* Play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-all">
                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/40 transition-all">
                      <div className="w-0 h-0 border-l-[14px] border-l-white border-y-[8px] border-y-transparent ml-1" />
                    </div>
                  </div>
                  
                  {/* NEW badge */}
                  {story.is_new && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-green-500 text-black text-xs font-semibold rounded">
                      NEW
                    </div>
                  )}
                  
                  {/* Duration badge */}
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
                    {story.duration_label || `${story.duration_mins} min`}
                  </div>
                </div>
                
                {/* Story Info */}
                <h3 className="font-semibold text-white text-sm group-hover:text-orange-400 line-clamp-2">{story.title}</h3>
                <p className="text-xs text-orange-400">{story.genre}</p>
                <p className="text-xs text-slate-400">{story.author}</p>
                
                {/* Play button */}
                <div className="mt-2 w-full py-2 bg-orange-500 hover:bg-orange-400 text-black text-xs font-semibold rounded-lg transition-all text-center">
                  ▶ Play
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
