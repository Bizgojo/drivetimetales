/**
 * Flag Utilities for Drive Time Tales
 * 
 * This module computes which flags to display on a story card
 * based on story data, user ownership status, and business rules.
 * 
 * See FLAG_RULES.md for complete documentation.
 */

interface Story {
  id: string
  is_free?: boolean
  flag?: 'editors-pick' | 'listeners-pick' | null
  series_number?: number | null
  created_at?: string // ISO date string
  is_trending?: boolean // Calculated: top 10 played in last 5 days
}

interface UserLibraryEntry {
  story_id: string
  progress?: number // Playback position in seconds
  completed?: boolean
  reserved?: boolean
}

/**
 * Determines if a story qualifies as NEW (added within last 25 days)
 */
function isStoryNew(createdAt: string | undefined): boolean {
  if (!createdAt) return false
  
  const storyDate = new Date(createdAt)
  const now = new Date()
  const daysDiff = (now.getTime() - storyDate.getTime()) / (1000 * 60 * 60 * 24)
  
  return daysDiff <= 25
}

/**
 * Computes the flags to display for a story card.
 * 
 * @param story - The story data
 * @param userLibraryEntry - The user's library entry for this story (if any)
 * @returns Array of flag strings, max 3, sorted by priority
 * 
 * Priority order:
 * 1. continue
 * 2. reserved  
 * 3. owned
 * 4. series
 * 5. trending
 * 6. new
 * 7. free
 * 8. editors-pick / listeners-pick
 */
export function computeStoryFlags(
  story: Story,
  userLibraryEntry?: UserLibraryEntry | null
): string[] {
  const flags: string[] = []
  
  // Determine user's relationship to story
  const isOwned = !!userLibraryEntry
  const isReserved = userLibraryEntry?.reserved === true
  const isContinue = (userLibraryEntry?.progress ?? 0) > 0 && !userLibraryEntry?.completed
  
  // User status flags (mutually exclusive - only one can apply)
  // Continue implies Owned, so we don't show Owned if Continue
  if (isContinue) {
    flags.push('continue')
  } else if (isReserved) {
    flags.push('reserved')
  } else if (isOwned) {
    flags.push('owned')
  }
  
  const userHasStory = isContinue || isOwned || isReserved
  
  // Series flag (always shows if applicable)
  if (story.series_number) {
    flags.push('series')
  }
  
  // Content flags (only if user doesn't have story)
  if (!userHasStory) {
    // Trending
    if (story.is_trending) {
      flags.push('trending')
    }
    
    // NEW (also excluded if reserved per rules)
    if (isStoryNew(story.created_at) && !isReserved) {
      flags.push('new')
    }
    
    // FREE (not shown if owned)
    if (story.is_free && !isOwned) {
      flags.push('free')
    }
  }
  
  // Editorial flags (mutually exclusive)
  if (story.flag === 'editors-pick') {
    flags.push('editors-pick')
  } else if (story.flag === 'listeners-pick') {
    flags.push('listeners-pick')
  }
  
  // Sort by priority and return top 3
  const priorityOrder = [
    'continue', 
    'reserved', 
    'owned', 
    'series', 
    'trending', 
    'new', 
    'free', 
    'editors-pick', 
    'listeners-pick'
  ]
  
  flags.sort((a, b) => priorityOrder.indexOf(a) - priorityOrder.indexOf(b))
  
  return flags.slice(0, 3)
}

/**
 * Batch compute flags for multiple stories
 * Useful for library/list pages
 */
export function computeFlagsForStories(
  stories: Story[],
  userLibrary: UserLibraryEntry[]
): Map<string, string[]> {
  const result = new Map<string, string[]>()
  
  // Create lookup for user library
  const libraryLookup = new Map<string, UserLibraryEntry>()
  for (const entry of userLibrary) {
    libraryLookup.set(entry.story_id, entry)
  }
  
  // Compute flags for each story
  for (const story of stories) {
    const libraryEntry = libraryLookup.get(story.id)
    const flags = computeStoryFlags(story, libraryEntry)
    result.set(story.id, flags)
  }
  
  return result
}
