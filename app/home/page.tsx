'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { getStories, Story, supabase } from '@/lib/supabase'

interface LibraryItem {
  story_id: string;
  progress_seconds: number;
  last_played_at: string;
  story?: Story;
}

export default function HomePage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [recentlyAdded, setRecentlyAdded] = useState<Story[]>([])
  const [continueListening, setContinueListening] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      console.log('[DTT Debug] Home page loadData() started')
      console.log('[DTT Debug] Auth loading:', authLoading, 'User:', user?.email)
      
      // Wait for auth to finish
      if (authLoading) {
        console.log('[DTT Debug] Still loading auth...')
        return
      }
      
      // Redirect if not logged in
      if (!user) {
        console.log('[DTT Debug] No user, redirecting to signin')
        router.push('/signin')
        return
      }

      console.log('[DTT Debug] User found:', user.email, 'Credits:', user.credits)

      // Get recently added stories
      try {
        const stories = await getStories({ limit: 6 })
        console.log('[DTT Debug] Got stories:', stories.length)
        setRecentlyAdded(stories as Story[])
      } catch (err) {
        console.error('[DTT Debug] Error getting stories:', err)
      }
      
      // Get user's library (stories in progress)
      try {
        const { data: libraryItems } = await supabase
          .from('user_library')
          .select('story_id, progress, last_played')
          .eq('user_id', user.id)
          .order('last_played', { ascending: false })
          .limit(6)
        
        if (libraryItems && libraryItems.length > 0) {
          // Fetch story details for each library item
          const storyIds = libraryItems.map(item => item.story_id)
          const { data: stories } = await supabase
            .from('stories')
            .select('*')
            .in('id', storyIds)
          
          // Combine library items with story data
          const itemsWithStories = libraryItems.map(item => ({
            ...item,
            progress_seconds: item.progress, // Map to expected name
            story: stories?.find(s => s.id === item.story_id)
          }))
          
          setContinueListening(itemsWithStories)
        }
      } catch (err) {
        console.error('[DTT Debug] Error getting library:', err)
      }
      
      setLoading(false)
    }
    
    loadData()
  }, [user, authLoading, router])

  // Show loading while checking auth
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">🎧</div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  // Get user's first name
  const firstName = user?.display_name?.split(' ')[0] || 'there'
  const credits = user?.credits ?? 0
  const creditsDisplay = credits === -1 ? 'Unlimited' : credits

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-24">
      <div className="max-w-2xl mx-auto px-4 py-4">
        
        {/* Header - Logo + Avatar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🚛</span>
            <span className="text-2xl">🚗</span>
            <span className="text-xl font-bold">
              Drive Time<span className="text-orange-500">Tales</span>
            </span>
          </div>
          <Link href="/account" className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold">
            {firstName.charAt(0).toUpperCase()}
          </Link>
        </div>

        {/* Welcome + Credits */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl">
            Welcome back, <span className="font-bold">{firstName}</span> 👋
          </h1>
          <Link href="/account/billing" className="px-3 py-1 bg-gray-800 rounded-full text-sm">
            <span className="text-orange-400 font-medium">{creditsDisplay}</span> credits
          </Link>
        </div>

        {/* Continue Listening */}
        {continueListening.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span>▶️</span> Continue Listening
            </h2>
            
            <div className="space-y-3">
              {continueListening.map((item) => {
                if (!item.story) return null
                const progressPercent = item.story.duration_mins 
                  ? Math.round((item.progress_seconds / (item.story.duration_mins * 60)) * 100)
                  : 0
                
                return (
                  <Link 
                    href={`/player/${item.story_id}/play?resume=true&autoplay=true`} 
                    key={item.story_id}
                    className="flex items-center gap-3 p-3 bg-slate-900 rounded-xl border border-slate-800 hover:border-orange-500 transition-colors"
                  >
                    <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                      <img 
                        src={item.story.cover_url || '/placeholder-cover.jpg'} 
                        alt={item.story.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{item.story.title}</p>
                      <p className="text-slate-400 text-sm">{item.story.author}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-orange-500 rounded-full"
                            style={{ width: `${Math.min(progressPercent, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">{progressPercent}%</span>
                      </div>
                    </div>
                    <div className="text-2xl">▶️</div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Recently Added */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>✨</span> Recently Added
          </h2>
          
          {recentlyAdded.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {recentlyAdded.map((story) => (
                <Link href={`/story/${story.id}`} key={story.id} className="group">
                  <div className="relative aspect-[3/4] rounded-xl overflow-hidden mb-2">
                    <img 
                      src={story.cover_url || '/placeholder-cover.jpg'} 
                      alt={story.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    {story.is_new && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 bg-green-500 text-white text-xs font-bold rounded">
                        NEW
                      </span>
                    )}
                    <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/70 text-white text-xs rounded">
                      {story.duration_mins}m
                    </span>
                  </div>
                  <h3 className="font-medium text-sm truncate">{story.title}</h3>
                  <p className="text-gray-400 text-xs truncate">{story.author}</p>
                  <div className="flex items-center gap-1 text-yellow-400 text-xs">
                    {'★'.repeat(Math.floor(story.rating || 4))}
                    <span className="text-gray-500">{story.rating?.toFixed(1) || '4.0'}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <p>No stories yet. Check back soon!</p>
            </div>
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-950">
          <div className="max-w-2xl mx-auto flex gap-3">
            <Link href="/welcome" className="flex-1 py-4 bg-orange-500 text-white font-bold rounded-xl text-center flex items-center justify-center gap-2">
              <span>🔍</span> Browse All
            </Link>
            <Link href="/wishlist" className="flex-1 py-4 bg-blue-500 text-white font-bold rounded-xl text-center flex items-center justify-center gap-2">
              <span>❤️</span> My Wishlist
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}
