'use client'

import Link from 'next/link'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useUser, categories } from '../layout'
import { useStories, Story } from '../hooks/useStories'

const durations = [
  { label: 'All Lengths', value: 'all' },
  { label: '15 min', value: '15', exact: 15 },
  { label: '30 min', value: '30', exact: 30 },
  { label: '45 min', value: '45', exact: 45 },
  { label: '1 hr', value: '60', exact: 60 },
  { label: '1+ hr', value: 'long', min: 61 },
]

const sortOptions = [
  { label: 'Popular', value: 'popular' },
  { label: 'Newest', value: 'newest' },
  { label: 'A-Z', value: 'alpha' },
  { label: 'Shortest', value: 'shortest' },
  { label: 'Longest', value: 'longest' },
]

const slugToGenre: Record<string, string> = {
  'mystery': 'Mystery',
  'drama': 'Drama',
  'sci-fi': 'Sci-Fi',
  'horror': 'Horror',
  'comedy': 'Comedy',
  'romance': 'Romance',
  'trucker': 'Trucker Stories',
}

function SmartButton({ story }: { story: Story }) {
  const { user, checkAccess } = useUser()
  
  const access = checkAccess(story.durationMins, story.id)
  
  if (access.canPlay) {
    const label = access.accessType === 'owned' ? '▶ Play (Owned)'
      : access.accessType === 'subscription' ? '▶ Play'
      : access.accessType === 'credits' ? '▶ Play'
      : '▶ Play Free'
    
    return (
      <Link href={`/story/${story.id}?play=${access.accessType}`} className="inline-block px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded transition-colors">
        {label}
      </Link>
    )
  }
  
  return (
    <Link href="/pricing" className="inline-block px-3 py-1.5 bg-slate-700 text-slate-400 text-xs font-semibold rounded">
      🔒 {user?.isLoggedIn ? 'Upgrade' : 'Subscribe'}
    </Link>
  )
}

function LibraryContent() {
  const params = useSearchParams()
  const genreParam = params.get('genre')
  const [search, setSearch] = useState('')
  const [selectedGenre, setSelectedGenre] = useState(genreParam || 'all')
  const [selectedDuration, setSelectedDuration] = useState('all')
  const [sortBy, setSortBy] = useState('popular')
  const { user } = useUser()
  const { stories, loading, error } = useStories()

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-400">Loading stories...</p>
      </div>
    )
  }

  if (error) {
    return <div className="py-12 text-center text-red-400">Error: {error}</div>
  }

  let filtered = stories.filter(s => {
    if (selectedGenre !== 'all') {
      const genreName = slugToGenre[selectedGenre]
      if (s.genre !== genreName) return false
    }
    if (selectedDuration !== 'all') {
      const dur = durations.find(d => d.value === selectedDuration)
      if (dur) {
        if (dur.exact && s.durationMins !== dur.exact) return false
        if (dur.min && s.durationMins < dur.min) return false
      }
    }
    if (search && !s.title.toLowerCase().includes(search.toLowerCase()) && !s.author.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Sort
  filtered = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'popular': return b.plays - a.plays
      case 'newest': return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0)
      case 'alpha': return a.title.localeCompare(b.title)
      case 'shortest': return a.durationMins - b.durationMins
      case 'longest': return b.durationMins - a.durationMins
      default: return 0
    }
  })

  return (
    <>
      {/* Search & Sort Row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input 
          type="text" 
          placeholder="Search by title or author..." 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
          className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500" 
        />
        <select 
          value={sortBy} 
          onChange={e => setSortBy(e.target.value)}
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500"
        >
          {sortOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Category Filter */}
      <div className="mb-4">
        <label className="text-xs text-slate-400 mb-1 block">Category</label>
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button onClick={() => setSelectedGenre('all')} className={`px-3 py-2 rounded-lg text-sm whitespace-nowrap ${selectedGenre === 'all' ? 'bg-orange-500 text-black font-semibold' : 'bg-slate-800/50 border border-slate-700 text-white hover:border-orange-500/50'}`}>
            📖 All
          </button>
          {categories.map(cat => (
            <button key={cat.slug} onClick={() => setSelectedGenre(cat.slug)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap ${selectedGenre === cat.slug ? 'bg-orange-500 text-black font-semibold' : 'bg-slate-800/50 border border-slate-700 text-white hover:border-orange-500/50'}`}>
              <span>{cat.icon}</span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Duration Filter */}
      <div className="mb-6">
        <label className="text-xs text-slate-400 mb-1 block">Duration</label>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {durations.map(dur => (
            <button key={dur.value} onClick={() => setSelectedDuration(dur.value)} className={`px-3 py-2 rounded-lg text-sm whitespace-nowrap ${selectedDuration === dur.value ? 'bg-orange-500 text-black font-semibold' : 'bg-slate-800/50 border border-slate-700 text-white hover:border-orange-500/50'}`}>
              {dur.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-slate-400 text-sm mb-4">{filtered.length} stories found</p>

      {/* Stories Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filtered.map(story => {
          const isWishlisted = user?.wishlist?.includes(story.id)
          return (
            <div key={story.id} className="group">
              <Link href={`/story/${story.id}`}>
                <div className={`aspect-square rounded-lg relative overflow-hidden mb-2 group-hover:scale-105 transition-transform ${story.coverUrl ? '' : `bg-gradient-to-br ${story.color}`}`}>
                  {story.coverUrl ? (
                    <img src={story.coverUrl} alt={story.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                        <div className="w-0 h-0 border-l-[12px] border-l-white border-y-[7px] border-y-transparent ml-0.5" />
                      </div>
                    </div>
                  )}
                  {/* Badges */}
                  <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
                    {story.isNew && (
                      <span className="px-1.5 py-0.5 bg-green-500 text-black text-xs font-bold rounded">NEW</span>
                    )}
                    {story.promo && !story.isNew && (
                      <span className="px-1.5 py-0.5 bg-orange-500 text-black text-xs font-bold rounded">{story.promo}</span>
                    )}
                  </div>
                  {isWishlisted && (
                    <div className="absolute top-1.5 right-1.5 text-yellow-400">💫</div>
                  )}
                  <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/60 text-white text-xs rounded">{story.duration}</div>
                </div>
              </Link>
              <Link href={`/story/${story.id}`}>
                <h3 className="font-semibold text-white text-sm group-hover:text-orange-400 leading-tight">{story.title}</h3>
              </Link>
              <p className="text-xs text-orange-400">{story.genre}</p>
              <p className="text-xs text-slate-400">{story.author}</p>
              <p className="text-xs text-slate-500 mb-2">{story.duration}</p>
              <SmartButton story={story} />
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-400">No stories match your filters</p>
          <button onClick={() => { setSelectedGenre('all'); setSelectedDuration('all'); setSearch(''); }} className="text-orange-400 text-sm mt-2">Clear all filters</button>
        </div>
      )}
    </>
  )
}

export default function LibraryPage() {
  return (
    <div className="py-6 px-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-4">DTT Library</h1>
        <Suspense fallback={<div className="text-slate-400">Loading...</div>}>
          <LibraryContent />
        </Suspense>
      </div>
    </div>
  )
}
