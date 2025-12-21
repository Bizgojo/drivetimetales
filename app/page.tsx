'use client'

import Link from 'next/link'
import { useUser, categories } from './layout'
import { useStories, Story, createStoryLookup } from './hooks/useStories'

// Smart button component using new access logic
function SmartButton({ story }: { story: Story }) {
  const { user, checkAccess } = useUser()
  
  const access = checkAccess(story.durationMins, story.id)
  
  // Visitor or logged-in user with access
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
  
  // No access - show upgrade prompt
  return (
    <Link href="/pricing" className="inline-block px-3 py-1.5 bg-slate-700 text-slate-400 text-xs font-semibold rounded">
      🔒 {user?.isLoggedIn ? 'Upgrade' : 'Subscribe'}
    </Link>
  )
}

function StoryCard({ story }: { story: Story }) {
  const { user } = useUser()
  const isWishlisted = user?.wishlist?.includes(story.id)
  
  return (
    <div className="group">
      <Link href={`/story/${story.id}`}>
        <div className={`aspect-square rounded-lg relative overflow-hidden mb-2 group-hover:scale-105 transition-transform ${story.coverUrl ? '' : `bg-gradient-to-br ${story.color}`}`}>
          {story.coverUrl ? (
            <img src={story.coverUrl} alt={story.title} className="w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                <div className="w-0 h-0 border-l-[14px] border-l-white border-y-[8px] border-y-transparent ml-1" />
              </div>
            </div>
          )}
          {/* Badges */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {story.isNew && (
              <span className="px-1.5 py-0.5 bg-green-500 text-black text-xs font-bold rounded">NEW</span>
            )}
            {story.promo && !story.isNew && (
              <span className="px-1.5 py-0.5 bg-orange-500 text-black text-xs font-bold rounded">{story.promo}</span>
            )}
          </div>
          {/* Wishlist indicator */}
          {isWishlisted && (
            <div className="absolute top-2 right-2 text-yellow-400">💫</div>
          )}
          <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">{story.duration}</div>
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
}

// Continue Listening Card
function ContinueCard({ story, progress }: { story: Story, progress: number }) {
  return (
    <Link href={`/story/${story.id}`} className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-xl hover:border-orange-500/50 transition-colors">
      <div className={`w-16 h-16 rounded-lg flex-shrink-0 relative overflow-hidden ${story.coverUrl ? '' : `bg-gradient-to-br ${story.color}`}`}>
        {story.coverUrl ? (
          <img src={story.coverUrl} alt={story.title} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
              <div className="w-0 h-0 border-l-[8px] border-l-white border-y-[5px] border-y-transparent ml-0.5" />
            </div>
          </div>
        )}
        {/* Progress ring */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
          <div className="h-full bg-green-500" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-white text-sm font-semibold truncate">{story.title}</h4>
        <p className="text-xs text-slate-400">{story.author}</p>
        <p className="text-xs text-green-400">{Math.round(progress)}% complete</p>
      </div>
      <div className="text-green-500 text-lg">▶</div>
    </Link>
  )
}

function CategoryBar() {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      <Link
        href="/library"
        className="flex items-center gap-1.5 px-3 py-2 bg-orange-500/20 border border-orange-500/50 rounded-lg whitespace-nowrap text-sm"
      >
        <span>📖</span>
        <span className="text-orange-400 font-semibold">All</span>
      </Link>
      {categories.map(cat => (
        <Link
          key={cat.slug}
          href={`/library?genre=${cat.slug}`}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg hover:border-orange-500/50 whitespace-nowrap text-sm"
        >
          <span>{cat.icon}</span>
          <span className="text-white">{cat.name}</span>
        </Link>
      ))}
    </div>
  )
}

function VisitorHome({ stories, storyLookup }: { stories: Story[], storyLookup: Record<string, Story> }) {
  const { freeMinutesRemaining, listeningHistory } = useUser()
  
  // Get featured stories
  const featuredStories = stories.filter(s => s.isFeatured).slice(0, 6)
  
  // Get in-progress stories
  const inProgress = Object.entries(listeningHistory)
    .filter(([storyId, data]) => data.progress > 0 && data.progress < 100 && storyLookup[storyId])
    .sort((a, b) => b[1].lastPlayed - a[1].lastPlayed)
    .slice(0, 3)
  
  return (
    <>
      <section className="py-10 px-4 bg-gradient-to-b from-orange-950/30 to-slate-950">
        <div className="max-w-4xl mx-auto text-center">
          <span className="text-5xl block mb-4">🚛</span>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Turn Your Commute Into an <span className="text-orange-400">Adventure</span>
          </h1>
          <p className="text-slate-400">Audio stories perfectly timed for your drive</p>
        </div>
      </section>

      <section className="py-6 px-4">
        <div className="max-w-3xl mx-auto bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-3 text-center">👋 Welcome!</h2>
          <p className="text-slate-300 text-center mb-4">
            Browse our stories, sample as many as you want until you find one you like, 
            then click <span className="text-green-400 font-semibold">▶ Play Free</span> and start listening. 
            <span className="text-orange-400"> No sign-up needed.</span>
          </p>
          <div className="text-center p-3 bg-slate-900/50 rounded-lg">
            <p className="text-sm text-slate-400">
              🎁 <span className="text-green-400 font-semibold">Test Drive Free:</span> Get <span className="text-green-400 font-semibold">2 hours/month</span> to explore our library!
            </p>
            {freeMinutesRemaining < 120 && freeMinutesRemaining > 0 && (
              <p className="text-xs text-orange-400 mt-1">You have {freeMinutesRemaining} free minutes remaining this month</p>
            )}
            {freeMinutesRemaining === 0 && (
              <p className="text-xs text-slate-500 mt-1">You've used your free hours. <Link href="/pricing" className="text-orange-400">Upgrade to Commuter for unlimited →</Link></p>
            )}
          </div>
        </div>
      </section>

      {/* Continue Listening - if they have progress */}
      {inProgress.length > 0 && (
        <section className="py-6 px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-lg font-bold text-white mb-3">▶️ Continue Listening</h2>
            <div className="grid md:grid-cols-3 gap-3">
              {inProgress.map(([storyId, data]) => (
                <ContinueCard key={storyId} story={storyLookup[storyId]} progress={data.progress} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="py-6 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-lg font-bold text-white mb-3">Browse by Category</h2>
          <CategoryBar />
        </div>
      </section>

      <section className="py-6 px-4 bg-slate-900/50">
        <div className="max-w-5xl mx-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-white">Featured Stories</h2>
            <Link href="/library" className="text-orange-400 text-sm">View all →</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {featuredStories.map(story => <StoryCard key={story.id} story={story} />)}
          </div>
        </div>
      </section>
    </>
  )
}

function MemberHome({ stories, storyLookup }: { stories: Story[], storyLookup: Record<string, Story> }) {
  const { user, listeningHistory } = useUser()
  
  // Get featured stories
  const featuredStories = stories.filter(s => s.isFeatured).slice(0, 6)

  // Get in-progress stories
  const inProgress = Object.entries(listeningHistory)
    .filter(([storyId, data]) => data.progress > 0 && data.progress < 100 && storyLookup[storyId])
    .sort((a, b) => b[1].lastPlayed - a[1].lastPlayed)
    .slice(0, 3)

  return (
    <>
      <section className="py-10 px-4 bg-gradient-to-b from-orange-950/30 to-slate-950">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            Welcome Back, <span className="text-orange-400">{user?.name}</span>! 👋
          </h1>
          <p className="text-slate-400">
            {user?.subscriptionTier === 'road_warrior' ? (
              <span>🚛 <span className="text-purple-400 font-semibold">Road Warrior</span> — Unlimited streaming + downloads</span>
            ) : user?.subscriptionTier === 'commuter' ? (
              <span>🚙 <span className="text-orange-400 font-semibold">Commuter</span> — Unlimited streaming</span>
            ) : user?.creditBalance && user.creditBalance > 0 ? (
              <span>You have <span className="text-green-400 font-semibold">{user.creditBalance.toFixed(1)} credits</span></span>
            ) : (
              <span>🚗 <span className="text-slate-300">Test Driver</span> — {Math.floor((user?.freeSecondsRemaining || 7200) / 60)} free minutes this month</span>
            )}
          </p>
        </div>
      </section>

      {/* Continue Listening */}
      {inProgress.length > 0 && (
        <section className="py-6 px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-lg font-bold text-white mb-3">▶️ Continue Listening</h2>
            <div className="grid md:grid-cols-3 gap-3">
              {inProgress.map(([storyId, data]) => (
                <ContinueCard key={storyId} story={storyLookup[storyId]} progress={data.progress} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="py-6 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link href="/library" className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center hover:border-orange-500/50">
              <span className="text-2xl block mb-1">📚</span>
              <span className="text-white font-semibold text-sm">Browse DTT Library</span>
            </Link>
            <Link href="/my-library" className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center hover:border-orange-500/50">
              <span className="text-2xl block mb-1">🎧</span>
              <span className="text-white font-semibold text-sm">My Library</span>
            </Link>
            <Link href="/settings" className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center hover:border-orange-500/50">
              <span className="text-2xl block mb-1">⚙️</span>
              <span className="text-white font-semibold text-sm">Settings</span>
            </Link>
            <Link href="/my-library?tab=wishlist" className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center hover:border-orange-500/50">
              <span className="text-2xl block mb-1">💫</span>
              <span className="text-white font-semibold text-sm">My Wishlist</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-6 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-lg font-bold text-white mb-3">Browse by Category</h2>
          <CategoryBar />
        </div>
      </section>

      <section className="py-6 px-4 bg-slate-900/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-lg font-bold text-white mb-4">Recommended for You</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {featuredStories.map(story => <StoryCard key={story.id} story={story} />)}
          </div>
        </div>
      </section>
    </>
  )
}

function LoadingState() {
  return (
    <div className="py-12 text-center">
      <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-slate-400">Loading stories...</p>
    </div>
  )
}

export default function HomePage() {
  const { user } = useUser()
  const { stories, loading, error } = useStories()
  const storyLookup = createStoryLookup(stories)
  
  if (loading) return <LoadingState />
  if (error) return <div className="py-12 text-center text-red-400">Error: {error}</div>
  
  return user?.isLoggedIn 
    ? <MemberHome stories={stories} storyLookup={storyLookup} /> 
    : <VisitorHome stories={stories} storyLookup={storyLookup} />
}
