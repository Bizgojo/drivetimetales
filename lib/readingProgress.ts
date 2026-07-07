type SupabaseLike = {
  from: (table: string) => any
}

export type ReadingProgress = {
  storyId: string
  paragraphIndex: number
  charOffset: number
  pageNumber: number | null
  totalPages: number | null
  percent: number
  completed: boolean
  updatedAt: string
}

const READ_PROGRESS_PREFIX = 'et_read_progress_'

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function progressKey(storyId: string) {
  return `${READ_PROGRESS_PREFIX}${storyId}`
}

function safeIso(value?: string | null) {
  if (!value) return new Date(0).toISOString()
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? value : new Date(0).toISOString()
}

function recordTime(value?: string | null) {
  return new Date(safeIso(value)).getTime()
}

export function normalizeReadingProgress(storyId: string, raw: any): ReadingProgress | null {
  if (!storyId || !raw || typeof raw !== 'object') return null
  const paragraphIndex = Number(raw.paragraphIndex ?? raw.paragraph_index ?? 0)
  const charOffset = Number(raw.charOffset ?? raw.char_offset ?? 0)
  const pageNumber = Number(raw.pageNumber ?? raw.page_number ?? 0)
  const totalPages = Number(raw.totalPages ?? raw.total_pages ?? 0)
  const percent = Number(raw.percent ?? 0)
  if (!Number.isFinite(paragraphIndex) || paragraphIndex < 0) return null
  return {
    storyId,
    paragraphIndex: Math.floor(paragraphIndex),
    charOffset: Number.isFinite(charOffset) && charOffset > 0 ? Math.floor(charOffset) : 0,
    pageNumber: Number.isFinite(pageNumber) && pageNumber > 0 ? Math.floor(pageNumber) : null,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? Math.floor(totalPages) : null,
    percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, Number(percent.toFixed(2)))) : 0,
    completed: Boolean(raw.completed),
    updatedAt: safeIso(raw.updatedAt ?? raw.updated_at),
  }
}

export function getLocalReadingProgress(storyId: string): ReadingProgress | null {
  if (!canUseStorage() || !storyId) return null
  try {
    const raw = window.localStorage.getItem(progressKey(storyId))
    if (!raw) return null
    return normalizeReadingProgress(storyId, JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveLocalReadingProgress(progress: ReadingProgress) {
  if (!canUseStorage() || !progress.storyId) return
  try {
    window.localStorage.setItem(progressKey(progress.storyId), JSON.stringify(progress))
  } catch {
    // Private mode/quota issues should never interrupt reading.
  }
}

export function clearLocalReadingProgress(storyId: string) {
  if (!canUseStorage() || !storyId) return
  try {
    window.localStorage.removeItem(progressKey(storyId))
  } catch {
    // Silent by design.
  }
}

export async function loadReadingProgress(
  supabase: SupabaseLike,
  userId: string | null | undefined,
  storyId: string
): Promise<ReadingProgress | null> {
  const local = getLocalReadingProgress(storyId)
  if (!userId) return local

  let server: ReadingProgress | null = null
  try {
    const { data, error } = await supabase
      .from('reading_progress')
      .select('story_id,paragraph_index,char_offset,page_number,total_pages,percent,completed,updated_at')
      .eq('user_id', userId)
      .eq('story_id', storyId)
      .maybeSingle()
    if (error) throw error
    server = data ? normalizeReadingProgress(storyId, data) : null
  } catch (err) {
    console.warn('[reading-progress] server load failed:', err)
  }

  if (!server) return local
  if (!local) return server
  return recordTime(local.updatedAt) > recordTime(server.updatedAt) ? local : server
}

export async function saveReadingProgress(
  supabase: SupabaseLike,
  userId: string | null | undefined,
  progress: ReadingProgress
) {
  saveLocalReadingProgress(progress)
  if (!userId) return
  try {
    const { error } = await supabase.from('reading_progress').upsert({
      user_id: userId,
      story_id: progress.storyId,
      paragraph_index: progress.paragraphIndex,
      char_offset: progress.charOffset,
      page_number: progress.pageNumber,
      total_pages: progress.totalPages,
      percent: progress.percent,
      completed: progress.completed,
      updated_at: progress.updatedAt,
    }, { onConflict: 'user_id,story_id' })
    if (error) throw error
  } catch (err) {
    console.warn('[reading-progress] server save failed:', err)
  }
}

export async function mergeLocalReadingProgress(supabase: SupabaseLike, userId: string) {
  if (!canUseStorage() || !userId) return
  const keys: string[] = []
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i)
    if (key?.startsWith(READ_PROGRESS_PREFIX)) keys.push(key)
  }

  for (const key of keys) {
    const storyId = key.slice(READ_PROGRESS_PREFIX.length)
    const local = getLocalReadingProgress(storyId)
    if (!local) continue

    try {
      const { data, error } = await supabase
        .from('reading_progress')
        .select('updated_at')
        .eq('user_id', userId)
        .eq('story_id', storyId)
        .maybeSingle()
      if (error) throw error
      if (!data?.updated_at || recordTime(local.updatedAt) > recordTime(data.updated_at)) {
        await saveReadingProgress(supabase, userId, local)
      }
      clearLocalReadingProgress(storyId)
    } catch (err) {
      console.warn('[reading-progress] local merge failed:', { storyId, err })
    }
  }
}

export function flushReadingProgressKeepalive(
  userId: string | null | undefined,
  accessToken: string | null | undefined,
  progress: ReadingProgress
) {
  saveLocalReadingProgress(progress)
  if (!userId || !accessToken) return
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key || typeof fetch === 'undefined') return

  fetch(`${url}/rest/v1/reading_progress?on_conflict=user_id,story_id`, {
    method: 'POST',
    keepalive: true,
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      user_id: userId,
      story_id: progress.storyId,
      paragraph_index: progress.paragraphIndex,
      char_offset: progress.charOffset,
      page_number: progress.pageNumber,
      total_pages: progress.totalPages,
      percent: progress.percent,
      completed: progress.completed,
      updated_at: progress.updatedAt,
    }),
  }).catch(() => {})
}
