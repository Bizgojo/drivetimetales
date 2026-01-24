'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'

type Story = {
  id: string
  title: string
  author: string
  genre: string
  description: string
  duration_mins: number
  duration_label: string
  price_cents: number
  audio_url: string
  cover_url: string
  is_new: boolean
  created_at: string
}

const SUPABASE_URL = 'https://vmyhlfeouzslixtkmddy.supabase.co'
const SUPABASE_KEY = 'sb_publishable_WQc18u_qDrwCe_g0DGFvkQ_1qIus5kK'

const genres = ['All', 'Mystery', 'Drama', 'Sci-Fi', 'Horror', 'Comedy', 'Romance', 'Adventure', 'Trucker Stories', 'mystery/thriller']

const genreColors: Record<string, string> = {
  'Mystery': 'from-purple-600 to-purple-900',
  'Drama': 'from-orange-600 to-orange-900',
  'Sci-Fi': 'from-cyan-600 to-cyan-900',
  'Horror': 'from-red-600 to-red-900',
  'Comedy': 'from-yellow-600 to-yellow-900',
  'Romance': 'from-pink-600 to-pink-900',
  'Adventure': 'from-green-600 to-green-900',
  'Trucker Stories': 'from-amber-600 to-amber-900',
  'mystery/thriller': 'from-indigo-600 to-indigo-900',
}

export default function LibraryPage() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [genre, setGenre] = useState('All')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchStories()
  }, [])

  const fetchStories = async () => {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/stories?select=*&order=created_at.desc`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        }
      })
      const data = await response.json()
      setStories(data)
    } catch (error) {
      console.error('Error fetching stories:', error)
    } finally {
      setLoading(false)
    }
  }

  const filtered = stories.filter(s => {
    if (genre !== 'All' && s.genre !== genre) return false
    if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 py-8 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-white">Loading stories...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">DTT Library</h1>
        <p className="text-slate-400 mb-8">Browse our complete collection of audio stories</p>

        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <input
            type="text"
            placeholder="Search stories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-orange-500"
          />
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white"
          >
            {genres.map(g => <option key={g}>{g}</option>)}
          </select>
        </div>

        <p className="text-slate-400 mb-6">{filtered.length} stories found</p>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {filtered.map((story) => (
            <Link key={story.id} href={`/story/${story.id}`} className="group">
              <div className="aspect-square rounded-xl relative overflow-hidden mb-3 group-hover:scale-105 transition-transform">
                {story.cover_url ? (
                  <img 
                    src={story.cover_url} 
                    alt={story.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className={`w-full h-full bg-gradient-to-br ${genreColors[story.genre] || 'from-slate-600 to-slate-800'}`} />
                )}
                
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-all">
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/40 transition-all">
                    <div className="w-0 h-0 border-l-[14px] border-l-white border-y-[8px] border-y-transparent ml-1" />
                  </div>
                </div>
                
                {story.is_new && (
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-green-500 text-black text-xs font-semibold rounded">
                    NEW
                  </div>
                )}
                <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/50 text-white text-xs rounded">
                  {story.duration_label || `${story.duration_mins} min`}
                </div>
              </div>
              <h3 className="font-semibold text-white text-sm group-hover:text-orange-400 line-clamp-2">{story.title}</h3>
              <p className="text-xs text-orange-400">{story.genre}</p>
              <p className="text-xs text-slate-400">{story.author}</p>
              <p className="text-xs text-slate-500">{story.duration_label || `${story.duration_mins} min`}</p>
              
              <div className="mt-2 w-full py-2 bg-orange-500 hover:bg-orange-400 text-black text-xs font-semibold rounded-lg transition-all text-center">
                ▶ Play Free
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
