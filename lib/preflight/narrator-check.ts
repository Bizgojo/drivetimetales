/**
 * narrator-check.ts
 *
 * Resolves the narrator voice_code for a story via the author→narrator registry.
 *
 * Rules enforced:
 * 1. Story must have author_id.
 * 2. author must have narrator_id linking to narrator_voices.
 * 3. narrator_voices row must have a voice_code.
 * 4. If any step fails → AUTHOR_NARRATOR_MISSING blocks preflight with retry_safe=false.
 *
 * Claude/Hal may never assign a narrator voice_code — it must come from this lookup.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import type { VoiceCodeAssignment } from './voice-code-check'

export interface NarratorResolution {
  ok: true
  assignment: VoiceCodeAssignment
  narratorName: string
  narratorVoiceId: string  // raw EL voice ID (for generate-voices compatibility)
  narratorVoiceCode: string
  authorName: string
  source: 'author_narrator_registry'
}

export interface NarratorResolutionError {
  ok: false
  code: 'AUTHOR_NARRATOR_MISSING' | 'NARRATOR_VOICE_CODE_MISSING' | 'STORY_AUTHOR_MISSING'
  message: string
  retry_safe: false
  author?: string
  narrator?: string
}

export type NarratorCheckResult = NarratorResolution | NarratorResolutionError

/**
 * Resolve the narrator voice_code for a story from the author→narrator registry.
 *
 * @param storyId  - UUID of the story
 * @param supabase - Supabase client (service role for production, anon for client-side)
 */
export async function resolveNarratorVoiceCode(
  storyId: string,
  supabase: SupabaseClient
): Promise<NarratorCheckResult> {
  // Step 1: Load story author_id and author text (fallback label)
  const { data: story, error: storyError } = await supabase
    .from('stories')
    .select('author_id, author')
    .eq('id', storyId)
    .maybeSingle()

  if (storyError) {
    return {
      ok: false,
      code: 'STORY_AUTHOR_MISSING',
      message: `Failed to load story ${storyId}: ${storyError.message}`,
      retry_safe: false,
    }
  }

  const authorId = (story as any)?.author_id
  const authorLabel = String((story as any)?.author || '').trim() || storyId

  if (!authorId) {
    return {
      ok: false,
      code: 'AUTHOR_NARRATOR_MISSING',
      message: `AUTHOR_NARRATOR_MISSING: No author_id on story for "${authorLabel}". Assign an author before generating voices.`,
      retry_safe: false,
      author: authorLabel,
    }
  }

  // Step 2: Load author → narrator_id
  const { data: author, error: authorError } = await supabase
    .from('authors')
    .select('name, narrator_id')
    .eq('id', authorId)
    .maybeSingle()

  if (authorError || !author) {
    return {
      ok: false,
      code: 'AUTHOR_NARRATOR_MISSING',
      message: `AUTHOR_NARRATOR_MISSING: Author record not found for id ${authorId} (story author: "${authorLabel}").`,
      retry_safe: false,
      author: authorLabel,
    }
  }

  const authorName = String((author as any).name || authorLabel).trim()
  const narratorId = String((author as any).narrator_id || '').trim()

  if (!narratorId) {
    return {
      ok: false,
      code: 'AUTHOR_NARRATOR_MISSING',
      message: `AUTHOR_NARRATOR_MISSING: No narrator assigned for author "${authorName}". Assign a narrator in the Author/Narrator registry before generating voices.`,
      retry_safe: false,
      author: authorName,
    }
  }

  // Step 3: Load narrator_voices → voice_code + elevenlabs_voice_id
  const { data: narrator, error: narratorError } = await supabase
    .from('narrator_voices')
    .select('name, voice_code, elevenlabs_voice_id')
    .eq('id', narratorId)
    .maybeSingle()

  if (narratorError || !narrator) {
    return {
      ok: false,
      code: 'AUTHOR_NARRATOR_MISSING',
      message: `AUTHOR_NARRATOR_MISSING: Narrator record ${narratorId} not found for author "${authorName}".`,
      retry_safe: false,
      author: authorName,
    }
  }

  const narratorName = String((narrator as any).name || '').trim()
  const voiceCode = String((narrator as any).voice_code || '').trim()
  const narratorVoiceId = String((narrator as any).elevenlabs_voice_id || '').trim()

  if (!voiceCode) {
    return {
      ok: false,
      code: 'NARRATOR_VOICE_CODE_MISSING',
      message: `AUTHOR_NARRATOR_MISSING: Narrator "${narratorName}" (id: ${narratorId}) has no voice_code. Assign a voice_code in narrator_voices before generating voices.`,
      retry_safe: false,
      author: authorName,
      narrator: narratorName,
    }
  }

  return {
    ok: true,
    assignment: {
      role: 'NARRATOR',
      voice_code: voiceCode,
    },
    narratorName,
    narratorVoiceId,
    narratorVoiceCode: voiceCode,
    authorName,
    source: 'author_narrator_registry',
  }
}
