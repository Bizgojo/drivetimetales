/**
 * DTT Working Code Library - 02_HomePage/d_ContinueListening.tsx
 * 
 * CURRENT VERSION: 2026-01-15 4:00pm
 * STATUS: WORKING ✓
 * 
 * VERSION HISTORY:
 * - 2026-01-15 4:00pm - Fixed to use user_library table with Supabase join
 * - 2026-01-04 2:30pm - Original working version
 * 
 * DEPENDS ON: 
 *   - Database table: user_library (columns: user_id, story_id, progress, last_played, completed)
 *   - Database table: stories (columns: id, title, author, genre, duration_mins, cover_url)
 *   - Auth: user object with user.id OR session.user.id
 *   - Supabase client
 * 
 * CRITICAL: Uses user_library table, NOT play_history!
 */

// ============================================
// INTERFACE
// ============================================
interface ContinueListeningItem {
  story_id: string
  progress: number  // seconds played
  last_played: string
  completed: boolean
  stories: {
    id: string
    title: string
    author: string
    genre: string
    duration_mins: number
    cover_url: string | null
  }
}

// ============================================
// STATE (add to component)
// ============================================
const [continueListening, setContinueListening] = useState<ContinueListeningItem | null>(null)

// ============================================
// FETCH FUNCTION
// ============================================
async function loadContinueListening(userId: string) {
  try {
    const { data, error } = await supabase
      .from('user_library')
      .select(`
        story_id,
        progress,
        last_played,
        completed,
        stories (
          id,
          title,
          author,
          genre,
          duration_mins,
          cover_url
        )
      `)
      .eq('user_id', userId)
      .eq('completed', false)
      .gt('progress', 0)
      .order('last_played', { ascending: false })
      .limit(1)
      .single()

    if (data && !error) {
      setContinueListening(data as ContinueListeningItem)
      console.log('[Home] Continue listening loaded:', data)
    }
  } catch (err) {
    // No uncompleted stories is not an error
    console.log('[Home] No continue listening story found')
  }
}

// ============================================
// CALL FROM useEffect (after auth check)
// ============================================
// Inside your init() or auth useEffect:
// await loadContinueListening(session.user.id)

// ============================================
// JSX COMPONENT - Simple Version
// ============================================
{continueListening && continueListening.stories && (
  <section className="mb-8">
    <h2 className="text-lg font-bold mb-4">CONTINUE LISTENING</h2>
    <Link
      href={`/story/${continueListening.story_id}`}
      className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition"
    >
      <div className="w-24 h-24 flex-shrink-0">
        {continueListening.stories.cover_url ? (
          <img 
            src={continueListening.stories.cover_url} 
            alt={continueListening.stories.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-slate-700 flex items-center justify-center text-2xl">📖</div>
        )}
      </div>
      <div className="flex-1 p-3 flex flex-col justify-center">
        <h3 className="text-sm font-bold text-white line-clamp-1">{continueListening.stories.title}</h3>
        <p className="text-white text-xs">{continueListening.stories.genre} • {continueListening.stories.author}</p>
        <p className="text-orange-400 text-xs font-medium">▶ Resume where you left off</p>
      </div>
    </Link>
  </section>
)}

// ============================================
// JSX COMPONENT - With Progress Bar
// ============================================
{continueListening && continueListening.stories && (
  <section className="mb-8">
    <h2 className="text-lg font-bold mb-4">CONTINUE LISTENING</h2>
    <Link
      href={`/story/${continueListening.story_id}`}
      className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition h-28"
    >
      <div className="p-2 flex-shrink-0 w-24">
        <div className="rounded-lg overflow-hidden h-full w-full" style={{ boxShadow: '0 0 12px rgba(255, 255, 255, 0.4)' }}>
          {continueListening.stories.cover_url ? (
            <img 
              src={continueListening.stories.cover_url} 
              alt={continueListening.stories.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-slate-700 flex items-center justify-center text-2xl">📖</div>
          )}
        </div>
      </div>
      <div className="flex-1 p-3 flex flex-col justify-center">
        <h3 className="font-bold text-white text-sm mb-0.5 line-clamp-1">{continueListening.stories.title}</h3>
        <p className="text-white text-xs mb-0.5">{continueListening.stories.genre} • {continueListening.stories.author}</p>
        <p className="text-white text-xs mb-2">{continueListening.stories.duration_mins} min</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-600 rounded-full">
            <div 
              className="h-1.5 bg-orange-500 rounded-full" 
              style={{ width: `${Math.min(100, Math.round((continueListening.progress / (continueListening.stories.duration_mins * 60)) * 100))}%` }}
            ></div>
          </div>
          <span className="text-white text-xs">
            {Math.round((continueListening.progress / (continueListening.stories.duration_mins * 60)) * 100)}%
          </span>
        </div>
      </div>
      <div className="p-3 flex items-center">
        <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-black ml-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
        </div>
      </div>
    </Link>
  </section>
)}
