/**
 * narrator-check.ts
 *
 * Resolves the narrator ElevenLabs voice ID for a story via the author→narrator registry.
 * Option B (launch path): narrators bypass the voice_code_registry entirely.
 * Narrator voice IDs are stable and come directly from narrator_voices.elevenlabs_voice_id.
 *
 * Resolution chain:
 *   story.author_id → authors.narrator_id → narrator_voices.elevenlabs_voice_id
 *
 * Rules enforced:
 * 1. If story.narrator_voice_id is already set, return it (explicit override wins).
 * 2. If not, resolve from author.narrator_id → narrator_voices.
 * 3. If author has no narrator_id, or narrator has no elevenlabs_voice_id → AUTHOR_NARRATOR_MISSING.
 *
 * Claude/Hal must never assign a narrator voice. Resolution comes only from this chain.
 *
 * Option A (future): add narrator_voices.voice_code and migrate narrators into the
 * voice_code_registry for unified idempotent resolution. Not needed for launch.
 */

import { SupabaseClient } from '@supabase/supabase-js'

export interface NarratorResolution {
  ok: true
  /** Raw ElevenLabs voice ID — goes directly to generate-voices, no registry needed. */
  narratorVoiceId: string
  narratorVoiceName: string
  authorName: string
  /** 'story_row' = narrator_voice_id was already set; 'author_registry' = resolved from author */
  source: 'story_row' | 'author_registry'
}

export interface NarratorResolutionError {
  ok: false
  code: 'AUTHOR_NARRATOR_MISSING' | 'NARRATOR_VOICE_ID_MISSING' | 'STORY_AUTHOR_MISSING'
  message: string
  retry_safe: false
  author?: string
  narrator?: string
}

export type NarratorCheckResult = NarratorResolution | NarratorResolutionError

/**
 * Resolve the narrator ElevenLabs voice ID for a story.
 *
 * Callers should pass the storyRow if they already have it (avoids a DB round-trip).
 *
 * @param storyId   - UUID of the story
 * @param supabase  - Supabase client (service role)
 * @param storyRow  - Optional pre-loaded story row (must include author_id, author,
 *                    narrator_voice_id, narrator_voice_name)
 */
export async function resolveNarratorVoiceId(
  storyId: string,
  supabase: SupabaseClient,
  storyRow?: {
    author_id?: string | null
    author?: string | null
    narrator_voice_id?: string | null
    narrator_voice_name?: string | null
  }
): Promise<NarratorCheckResult> {
  // Step 1: Load story row if not provided
  let row = storyRow
  if (!row) {
    const { data, error } = await supabase
      .from('stories')
      .select('author_id, author, narrator_voice_id, narrator_voice_name')
      .eq('id', storyId)
      .maybeSingle()

    if (error || !data) {
      return {
        ok: false,
        code: 'STORY_AUTHOR_MISSING',
        message: `AUTHOR_NARRATOR_MISSING: Story "${storyId}" not found or failed to load: ${error?.message ?? 'not found'}.`,
        retry_safe: false,
      }
    }
    row = data as any
  }

  // Step 2: If narrator_voice_id is already set on the story row, use it directly
  const existingVoiceId = String(row?.narrator_voice_id ?? '').trim()
  const existingVoiceName = String(row?.narrator_voice_name ?? '').trim()
  if (existingVoiceId) {
    return {
      ok: true,
      narratorVoiceId: existingVoiceId,
      narratorVoiceName: existingVoiceName,
      authorName: String(row?.author ?? '').trim(),
      source: 'story_row',
    }
  }

  // Step 3: Resolve from author → narrator registry
  const authorId = String(row?.author_id ?? '').trim()
  const authorLabel = String(row?.author ?? storyId).trim()

  if (!authorId) {
    return {
      ok: false,
      code: 'AUTHOR_NARRATOR_MISSING',
      message: `AUTHOR_NARRATOR_MISSING: No author_id on story for "${authorLabel}". Assign an author before generating voices.`,
      retry_safe: false,
      author: authorLabel,
    }
  }

  const { data: author, error: authorError } = await supabase
    .from('authors')
    .select('name, narrator_id')
    .eq('id', authorId)
    .maybeSingle()

  if (authorError || !author) {
    return {
      ok: false,
      code: 'AUTHOR_NARRATOR_MISSING',
      message: `AUTHOR_NARRATOR_MISSING: Author record not found for id "${authorId}" (story author: "${authorLabel}").`,
      retry_safe: false,
      author: authorLabel,
    }
  }

  const authorName = String((author as any).name ?? authorLabel).trim()
  const narratorId = String((author as any).narrator_id ?? '').trim()

  if (!narratorId) {
    return {
      ok: false,
      code: 'AUTHOR_NARRATOR_MISSING',
      message: `AUTHOR_NARRATOR_MISSING: No narrator assigned for author "${authorName}". Assign a narrator in the Author/Narrator registry before generating voices.`,
      retry_safe: false,
      author: authorName,
    }
  }

  // Step 4: Load narrator voice
  const { data: narrator, error: narratorError } = await supabase
    .from('narrator_voices')
    .select('name, elevenlabs_voice_id')
    .eq('id', narratorId)
    .maybeSingle()

  if (narratorError || !narrator) {
    return {
      ok: false,
      code: 'AUTHOR_NARRATOR_MISSING',
      message: `AUTHOR_NARRATOR_MISSING: Narrator record "${narratorId}" not found for author "${authorName}".`,
      retry_safe: false,
      author: authorName,
    }
  }

  const narratorName = String((narrator as any).name ?? '').trim()
  const narratorVoiceId = String((narrator as any).elevenlabs_voice_id ?? '').trim()

  if (!narratorVoiceId) {
    return {
      ok: false,
      code: 'NARRATOR_VOICE_ID_MISSING',
      message: `AUTHOR_NARRATOR_MISSING: Narrator "${narratorName}" has no elevenlabs_voice_id. Fix narrator_voices record before generating voices.`,
      retry_safe: false,
      author: authorName,
      narrator: narratorName,
    }
  }

  return {
    ok: true,
    narratorVoiceId,
    narratorVoiceName: narratorName,
    authorName,
    source: 'author_registry',
  }
}
