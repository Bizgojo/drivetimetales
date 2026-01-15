/**
 * DTT Working Code Library - 02_HomePage/f_RecommendedForYou.tsx
 * 
 * CURRENT VERSION: 2026-01-15 4:00pm
 * STATUS: WORKING ✓
 * 
 * VERSION HISTORY:
 * - 2026-01-15 4:00pm - Documented and saved to library
 * 
 * DEPENDS ON: 
 *   - stories table
 *   - stories state array (uses slice 3-7)
 *   - loading state
 * 
 * DISPLAYS: 4 vertical blocks with cover on left, details on right
 * Details: Title, Genre, Author, Duration + Credits
 * All text is WHITE (no gray)
 */

// ============================================
// JSX COMPONENT - 4 Vertical Blocks
// ============================================
<section className="mb-8">
  <h2 className="text-lg font-bold mb-4">RECOMMENDED FOR YOU</h2>
  {loading ? (
    <div className="flex justify-center py-8">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  ) : stories.length === 0 ? (
    <p className="text-white text-sm">No recommendations yet.</p>
  ) : (
    <div className="space-y-3">
      {stories.slice(3, 7).map((story) => (
        <Link key={story.id} href={`/story/${story.id}`} className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition">
          <div className="w-24 h-24 flex-shrink-0">
            {story.cover_url ? (
              <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-slate-700 flex items-center justify-center text-2xl">📖</div>
            )}
          </div>
          <div className="flex-1 p-3 flex flex-col justify-center">
            <h3 className="text-sm font-bold text-white line-clamp-1">{story.title}</h3>
            <p className="text-white text-xs">{story.genre}</p>
            <p className="text-white text-xs">{story.author}</p>
            <p className="text-white text-xs">{story.duration_mins} min • {story.credits} credit{story.credits !== 1 ? 's' : ''}</p>
          </div>
        </Link>
      ))}
    </div>
  )}
</section>
