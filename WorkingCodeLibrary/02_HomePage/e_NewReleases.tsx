/**
 * DTT Working Code Library - 02_HomePage/e_NewReleases.tsx
 * 
 * CURRENT VERSION: 2026-01-15 4:00pm
 * STATUS: WORKING ✓
 * 
 * VERSION HISTORY:
 * - 2026-01-15 4:00pm - Documented and saved to library
 * 
 * DEPENDS ON: 
 *   - stories table
 *   - stories state array
 *   - loading state
 * 
 * DISPLAYS: 3 horizontal cards with Title, Genre, Duration + Credits
 * All text is WHITE (no gray)
 */

// ============================================
// STATE (add to component)
// ============================================
const [stories, setStories] = useState<Story[]>([])
const [loading, setLoading] = useState(true)

// ============================================
// FETCH FUNCTION (useEffect)
// ============================================
useEffect(() => {
  async function loadStories() {
    try {
      const { data, error } = await supabase
        .from('stories')
        .select('id, title, description, genre, duration_mins, cover_url, audio_url, credits, author')
        .order('created_at', { ascending: false })
        .limit(12)
      
      if (data && !error) {
        setStories(data)
      }
    } catch (err) {
      console.error('[Home] Stories error:', err)
    } finally {
      setLoading(false)
    }
  }
  loadStories()
}, [])

// ============================================
// JSX COMPONENT - 3 Horizontal Cards
// ============================================
<section className="mb-8">
  <h2 className="text-lg font-bold mb-4">NEW RELEASES</h2>
  {loading ? (
    <div className="flex justify-center py-8">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  ) : stories.length === 0 ? (
    <p className="text-white text-sm">No stories available yet.</p>
  ) : (
    <div className="grid grid-cols-3 gap-4">
      {stories.slice(0, 3).map((story) => (
        <Link key={story.id} href={`/story/${story.id}`} className="block">
          <div className="rounded-xl overflow-hidden" style={{ boxShadow: '0 0 20px rgba(255, 255, 255, 0.3)' }}>
            {story.cover_url ? (
              <img src={story.cover_url} alt={story.title} className="w-full aspect-square object-cover" />
            ) : (
              <div className="w-full aspect-square bg-slate-700 flex items-center justify-center text-4xl">📖</div>
            )}
          </div>
          <h3 className="mt-2 text-sm font-bold text-white line-clamp-1">{story.title}</h3>
          <p className="text-white text-xs">{story.genre}</p>
          <p className="text-white text-xs">{story.duration_mins} min • {story.credits} credit{story.credits !== 1 ? 's' : ''}</p>
        </Link>
      ))}
    </div>
  )}
</section>
