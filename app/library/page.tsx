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
  const [showSearchMenu, setShowSearchMenu] = useState(false)
  const [searchType, setSearchType] = useState<'title' | 'author' | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const genreOptions = [
    { name: 'All', icon: '📚' },
    { name: 'Mystery', icon: '🔍' },
    { name: 'Drama', icon: '🎭' },
    { name: 'Sci-Fi', icon: '🚀' },
    { name: 'Horror', icon: '👻' },
    { name: 'Comedy', icon: '😂' },
    { name: 'Romance', icon: '💕' },
    { name: 'Trucker', icon: '🚛' },
    { name: 'Thriller', icon: '😱' },
  ]

  const durationOptions = [
    { name: 'All', label: 'All' },
    { name: '15', label: '~15 min' },
    { name: '30', label: '~30 min' },
    { name: '60', label: '~1 hr' },
  ]

  // Star rating component - with proper half stars
  const StarRating = ({ rating }: { rating: number }) => {
    return (
      <div className="flex items-center gap-1">
        <div className="flex text-sm">
          {[1, 2, 3, 4, 5].map((star) => {
            const filled = rating >= star
            const halfFilled = !filled && rating >= star - 0.5
            return (
              <span key={star} className="relative">
                <span className="text-slate-600">☆</span>
                {filled && (
                  <span className="absolute left-0 top-0 text-yellow-400 overflow-hidden w-full">★</span>
                )}
                {halfFilled && (
                  <span className="absolute left-0 top-0 text-yellow-400 overflow-hidden" style={{ width: '50%' }}>★</span>
                )}
              </span>
            )
          })}
        </div>
        <span className="text-slate-400 text-xs">{rating?.toFixed(1) || '0.0'}</span>
      </div>
    )
  }

  // Filter stories
  const filtered = stories.filter((s: any) => {
    // Search filter
    if (searchType === 'title' && searchQuery) {
      if (!s.title?.toLowerCase().includes(searchQuery.toLowerCase())) return false
    }
    if (searchType === 'author' && searchQuery) {
      if (!s.author?.toLowerCase().includes(searchQuery.toLowerCase())) return false
    }
    
    // Genre filter
    if (genre !== 'All' && s.genre !== genre) return false
    
    // Duration filter
    if (duration === '15' && (s.duration_mins < 10 || s.duration_mins > 20)) return false
    if (duration === '30' && (s.duration_mins < 20 || s.duration_mins > 45)) return false
    if (duration === '60' && s.duration_mins < 45) return false
    
    return true
  })

  const handleSearchSelect = (type: 'title' | 'author') => {
    setSearchType(type)
    setShowSearchMenu(false)
    setSearchQuery('')
  }

  const clearSearch = () => {
    setSearchType(null)
    setSearchQuery('')
  }

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
    <div className="min-h-screen bg-slate-950 text-white pb-8">
      <div className="max-w-2xl mx-auto px-4 py-4">
        
        {/* Header - Logo left, Back button right */}
        <div className="flex items-center justify-between mb-4">
          {/* Logo */}
          <Link href="/welcome" className="flex items-center gap-1">
            <span className="text-2xl">🚛</span>
            <span className="text-2xl">🚗</span>
            <div className="flex items-baseline ml-1">
              <span className="text-base font-bold text-white">Drive Time </span>
              <span className="text-base font-bold text-orange-500">Tales</span>
            </div>
          </Link>
          
          {/* Back button */}
          <button 
            onClick={() => router.back()}
            className="text-slate-400 hover:text-white text-sm flex items-center gap-1"
          >
            <span>Back</span>
            <span>→</span>
          </button>
        </div>

        {/* Page Title - LARGER */}
        <div className="text-center mb-5">
          <h1 className="text-3xl font-bold text-white">Story Library</h1>
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
                <span className="text-[9px] mt-0.5">{g.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Duration Filter */}
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

        {/* Results count + Search */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-slate-400 text-sm">{filtered.length} stories found</p>
          
          {/* Search dropdown */}
          <div className="relative">
            {searchType ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search by ${searchType}...`}
                  className="w-40 px-3 py-1.5 bg-slate-800 text-white text-sm rounded-lg border border-slate-700 focus:outline-none focus:border-orange-500"
                  autoFocus
                />
                <button
                  onClick={clearSearch}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowSearchMenu(!showSearchMenu)}
                  className="flex items-center gap-1 text-slate-400 hover:text-white text-sm px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700"
                >
                  <span>🔍</span>
                  <span>Search</span>
                </button>
                
                {showSearchMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg overflow-hidden z-10 shadow-lg">
                    <button 
                      className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-slate-700"
                      onClick={() => handleSearchSelect('title')}
                    >
                      Search by Title
                    </button>
                    <button 
                      className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-slate-700"
                      onClick={() => handleSearchSelect('author')}
                    >
                      Search by Author
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Stories List */}
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-5xl block mb-4">📚</span>
            <h2 className="text-xl font-bold text-white mb-2">No Stories Found</h2>
            <p className="text-white">Try selecting a different genre or duration</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((story: any) => (
              <div 
                key={story.id}
                onClick={() => router.push(`/player/${story.id}`)}
                className="bg-slate-800 rounded-xl overflow-hidden cursor-pointer hover:bg-slate-700 transition-colors"
              >
                <div className="flex">
                  {/* Cover */}
                  <div className="w-32 h-32 flex-shrink-0 relative bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                    {story.cover_url ? (
                      <img 
                        src={story.cover_url}
                        alt={story.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-4xl opacity-40">🎧</span>
                    )}
                    <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/70 text-white text-xs rounded">
                      {story.duration_mins} min
                    </div>
                  </div>
                  
                  {/* Info */}
                  <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                    <div>
                      <h3 className="font-bold text-white text-base">{story.title}</h3>
                      <p className="text-white text-sm">{story.genre} • {story.credits || 1} credit{(story.credits || 1) !== 1 ? 's' : ''}</p>
                      <p className="text-white text-sm">{story.author}</p>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <StarRating rating={story.rating || 0} />
                      {story.is_new && (
                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-medium rounded border border-blue-500/30">
                          New Release
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
