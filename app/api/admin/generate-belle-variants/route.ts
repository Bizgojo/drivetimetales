import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { anthropicCall } from '@/app/lib/anthropic-logger'
import { CANONICAL_BELLE_B_VOICE_ID } from '@/lib/voiceConstants'

export const runtime = 'nodejs'
export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type BelleVariant = {
  kind: 'intro' | 'outro'
  variant_key: string
  text: string
  uses_name?: boolean
  tone?: string | null
  series_position?: string | null
  opening_style?: string | null
}

const INTRO_VARIANTS = ['session_first', 'session_continue', 'returning_listener', 'simple']
const OUTRO_VARIANTS = ['simple', 'reflective', 'series_continue']
const CANNED_PATTERNS = [
  /\bwelcome\b/i,
  /\bwelcome to endless tales\b/i,
  /\bsit back\b/i,
  /\brelax and enjoy\b/i,
  /\btonight'?s story\b/i,
  /\bonly on endless tales\b/i,
  /\bin this story\b/i,
  /\bthis story is about\b/i,
  /\bthis episode is about\b/i,
  /\bfollows the journey\b/i,
  /\bjoin us as\b/i,
  /\byou'?re about to\b/i,
  /\bcome with me\b/i,
  /\bcome back\b/i,
  /\bcome down\b/i,
  /\bget ready\b/i,
  /\byou should\b/i,
]
const CREEPY_TIME_PATTERNS = [
  /\b\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?\b/i,
  /\bit'?s\s+\d{1,2}\b/i,
  /\bwhere you are right now\b/i,
  /\byour exact location\b/i,
  /\byou'?re driving near\b/i,
  /\bi know where you\b/i,
]

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status })
}

function extractJsonObject(raw: string) {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('Claude did not return a JSON object')
  return JSON.parse(raw.slice(start, end + 1))
}

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function storySpecificTerms(story: any) {
  return [
    story?.title,
    story?.episode_title,
    story?.series_name,
    story?.description,
    String(story?.prose_text || '').slice(0, 1000),
    String(story?.script || '').slice(0, 1000),
  ]
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((word) => word.length >= 5)
    .filter((word) => !['story', 'episode', 'series', 'about', 'after', 'before', 'their', 'there', 'where', 'which'].includes(word))
}

function validateVariant(variant: BelleVariant, story: any) {
  const errors: string[] = []
  const text = cleanText(variant.text)
  const lower = text.toLowerCase()
  const position = seriesPosition(story)
  if (!text) errors.push('text is empty')
  if (!['intro', 'outro'].includes(variant.kind)) errors.push('kind must be intro or outro')
  if (!variant.variant_key) errors.push('variant_key is required')
  if (lower.includes('belle b')) errors.push('must say Belle, not Belle B')
  if (/^(narrator|character|announcer|sandy|belle b)\s*:/i.test(text)) errors.push('must not include speaker labels')
  if (CANNED_PATTERNS.some((pattern) => pattern.test(text))) errors.push('generic/canned wording detected')
  if (CREEPY_TIME_PATTERNS.some((pattern) => pattern.test(text))) errors.push('exact or creepy listener context detected')
  if (variant.kind === 'intro' && /\bbegins now\b/i.test(text)) errors.push('generic/canned wording detected')
  if (variant.kind === 'intro' && text.split(/\s+/).filter(Boolean).length > 35) errors.push('intro must be short and conversational')
  if (variant.kind === 'outro' && text.split(/\s+/).filter(Boolean).length < 12) errors.push('outro must leave emotional warmth, not a hard stop')
  if (variant.kind === 'outro' && text.split(/\s+/).filter(Boolean).length > 55) errors.push('outro must be short and leave a feeling, not resolve the whole plot')
  if (variant.kind === 'outro' && (text.match(/[.!?]+/g) || []).length > 3) errors.push('outro must be concise')
  if (variant.kind === 'outro' && /^\s*that was\b/i.test(text)) errors.push('outro must not use a flat "That was..." structure')
  if (/\b(summary|summarize|plot|synopsis)\b/i.test(text)) errors.push('must not mechanically summarize the plot')
  if (variant.kind === 'outro' && position && position !== 'finale' && variant.variant_key === 'series_continue' && !/\b(next time|next episode|in the next episode|continues|will have to|will need to)\b/i.test(text)) {
    errors.push('non-final series outro must pull toward the next episode')
  }
  if (variant.kind === 'outro' && position === 'finale' && /\b(next time|next episode|continues|to be continued)\b/i.test(text)) {
    errors.push('finale outro must not tease another episode')
  }
  const terms = storySpecificTerms(story)
  if (variant.kind === 'intro' && variant.variant_key !== 'session_continue' && terms.length > 0 && !terms.some((term) => lower.includes(term))) {
    errors.push('must include a concrete story-specific detail')
  }
  if (variant.uses_name && !text.includes('[LISTENER_NAME]')) errors.push('uses_name variants must include [LISTENER_NAME]')
  if (!variant.uses_name && text.includes('[LISTENER_NAME]')) errors.push('only uses_name variants may include [LISTENER_NAME]')
  if (text.includes('[LISTENER_NAME]') && hasAwkwardNamePlacement(text)) errors.push('[LISTENER_NAME] placement breaks natural grammar')
  return { valid: errors.length === 0, errors, text }
}

function hasAwkwardNamePlacement(text: string): boolean {
  const compact = cleanText(text)
  if (!compact.includes('[LISTENER_NAME]')) return false
  const withoutName = cleanText(compact.replace(/\s*,?\s*\[LISTENER_NAME\]\s*,?\s*/g, ' '))
  if (/^(and|but|or|so|because|that|which|where|when)\b/i.test(withoutName)) return true
  if (/\b(find|finds|found|hear|hears|heard|see|sees|saw|open|opens|opened|answer|answers|answered|pull|pulls|pulled|hold|holds|held|meet|meets|met|watch|watches|watched)\s+\[LISTENER_NAME\]\s+(that|which|who|where|when|what|inside|beneath|under|behind|in|on|at|from|with)\b/i.test(compact)) return true
  if (/\b(something|someone|anything|anyone|nothing|voice|sound|room|door|phone|letter|pages|secret|truth)\s+\[LISTENER_NAME\]\s+(that|which|who|where|when|inside|beneath|under|behind|in|on|at|from|with)\b/i.test(compact)) return true
  if (/\b(the|a|an|this|that|his|her|their|our|your)\s+\[LISTENER_NAME\]\s+\w+/i.test(compact)) return true
  return false
}

function validateBatch(variants: BelleVariant[]) {
  const errors: Array<{ variant_key: string; errors: string[]; text: string }> = []
  const intros = variants.filter((variant) => variant.kind === 'intro')
  const introTexts = intros.map((variant) => cleanText(variant.text))
  const startsWithTheres = introTexts.filter((text) => /^there'?s\b/i.test(text)).length
  const rhetoricalQuestions = introTexts.filter((text) => /\?\s*$/.test(text) || /\?/.test(text)).length
  const firstWords = new Map<string, number>()

  introTexts.forEach((text) => {
    const first = text.toLowerCase().match(/^[a-z'\[]+/)?.[0] || ''
    if (first) firstWords.set(first, (firstWords.get(first) || 0) + 1)
  })

  if (startsWithTheres > 1) {
    errors.push({ variant_key: 'batch', errors: ['only one intro may start with "There\'s"'], text: '' })
  }
  if (rhetoricalQuestions > 1) {
    errors.push({ variant_key: 'batch', errors: ['only one intro may use a rhetorical question'], text: '' })
  }

  Array.from(firstWords.entries()).forEach(([word, count]) => {
    if (count > 2) {
      errors.push({ variant_key: 'batch', errors: [`intro cadence repeats too often: ${word}`], text: '' })
    }
  })

  return errors
}

function normalizeVariant(input: any): BelleVariant {
  return {
    kind: input?.kind,
    variant_key: cleanText(input?.variant_key),
    text: cleanText(input?.text),
    uses_name: Boolean(input?.uses_name),
    tone: cleanText(input?.tone) || null,
    series_position: cleanText(input?.series_position) || null,
    opening_style: cleanText(input?.opening_style) || null,
  }
}

function seriesPosition(story: any) {
  const episodeNumber = Number(story?.episode_number || story?.series_number || 0)
  const total = Number(story?.series_total || story?.series_total_episodes || 0)
  if (!story?.series_id && !story?.series_name) return null
  if (episodeNumber <= 1) return 'first'
  if (total > 0 && episodeNumber >= total) return 'finale'
  return 'middle'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const storyId = String(body.storyId || '').trim()
    if (!storyId) return json({ success: false, error: 'storyId required' }, 400)

    const { data: story, error } = await supabase
      .from('stories')
      .select('id,title,author,genre,primary_genre,description,script,prose_text,episode_title,series_name,series_id,episode_number,series_number,series_total,series_total_episodes')
      .eq('id', storyId)
      .single()

    if (error || !story) {
      return json({ success: false, error: error?.message || `Story not found: ${storyId}`, storyId }, error?.code === 'PGRST116' ? 404 : 500)
    }

    const proseExcerpt = cleanText(story.prose_text).slice(0, 1600)
    const scriptExcerpt = cleanText(story.script).slice(0, 2200)
    const position = seriesPosition(story)
    const title = story.episode_title || story.title || 'Untitled'
    const prompt = `Generate story-specific intro/outro copy for Belle.

Canonical rules:
- Belle is the name. Never write "Belle B".
- Belle only speaks intros/outros, never narrator or character dialogue.
- Belle is the Endless Tales host, curator, and continuity bridge, not a DJ, trailer voice, or promo voice.
- She sounds warm, composed, perceptive, and specific.
- Write for this exact story/episode. No generic canned templates.
- Use one concrete sensory image from the story and one emotional pressure point.
- Do not explain the premise or summarize the plot.
- Intros should lightly orient the listener into the story world before the hook.
- Establish the real-world frame first: the place, object, job, system, route, case, or situation involved.
- Then add the strange, emotional, or mysterious element.
- The listener should understand the situation immediately while driving.
- Avoid abstract teaser imagery with no grounding.
- Intros must be 1–2 short sentences, usually under 28 words, hard max 35.
- Title is allowed when it sounds natural and helps orient the listener.
- Use [LISTENER_NAME] in exactly two intro variants, naturally and casually.
- Never start with "Welcome, [LISTENER_NAME]".
- If using the listener name, make it feel incidental and warm.
- [LISTENER_NAME] must appear naturally in a complete sentence.
- Place [LISTENER_NAME] near the beginning or after a natural pause, like "[LISTENER_NAME], ..." or "... , [LISTENER_NAME], ..."
- Never insert [LISTENER_NAME] between verb/object phrases or inside clauses where it breaks grammar.
- If [LISTENER_NAME] is removed, the sentence should still read naturally.
- Outros should feel reflective, human, host-like, and emotionally lingering.
- Belle should bridge the listener from the story ending into either the next episode or closure.
- Outros may be slightly longer than intros, but still concise.
- Non-final series outros must briefly recap the current stakes and strongly pull the listener toward the next episode.
- Finale outros must give emotional closure and may say the title, author, and "an Endless Tales Original."
- Standalone outros should feel complete but not emotionally closed-off.
- Series outros should create a natural emotional pull toward the next episode.
- Subtle time-of-day atmosphere is allowed, but never exact time, location, or creepy listener surveillance.
- No speaker labels.
- Do not write: "Welcome", "begins now", "only on Endless Tales", "come with me", "come back", "come down", "you should", "get ready", "sit back", "relax and enjoy".
- Avoid rhetorical questions unless the line sounds like real speech.
- Series outros must not say "only on Endless Tales".

Intro variation shapes:
- session_first: sensory image
- session_continue: emotional warning
- returning_listener: character-focused and may use [LISTENER_NAME]
- simple: quiet direct recommendation
- returning_listener must not use "you're about to" or "you are about to".

Cadence rules:
- Do not make every variant ominous.
- Do not repeat the same opening rhythm.
- No more than one intro may start with "There is" or "There's".
- No more than one intro may use a question.

Outro rules:
- One to three short sentences, usually under 38 words, hard max 55 words.
- Do not write period-separated fragments. Avoid patterns like "That handprint. That bell. Some calls..."
- Land on the feeling left by the story, not a recap.
- Leave an emotional echo. Do not resolve the whole plot beat-by-beat.
- Leave the listener with warmth, ache, curiosity, or quiet momentum.
- Avoid hard-stop endings that simply close the file.
- Avoid "That was..." as the dominant structure.
- Finale outros may include title, author, and "an Endless Tales Original." Non-final outros should not sound like final credits.
- For standalone stories, close with a resonant image or consequence.
- For series non-finales, name one specific unresolved consequence and create a next-episode pull.
- For finales, do not tease another episode.
- The variant_key values are fixed API keys. Return exactly these seven keys and do not rename them, even for finales: session_first, session_continue, returning_listener, simple, simple, reflective, series_continue.

Story:
Title: ${title}
Series: ${story.series_name || 'Standalone'}
Series position: ${position || 'standalone'}
Author: ${story.author || ''}
Genre: ${story.genre || story.primary_genre || ''}
Description: ${story.description || ''}

Prose excerpt:
${proseExcerpt}

Script excerpt:
${scriptExcerpt}

Return strict JSON only:
{
  "variants": [
    {"kind":"intro","variant_key":"session_first","text":"","uses_name":true,"tone":"","series_position":"${position || ''}","opening_style":""},
    {"kind":"intro","variant_key":"session_continue","text":"","uses_name":false,"tone":"","series_position":"${position || ''}","opening_style":""},
    {"kind":"intro","variant_key":"returning_listener","text":"","uses_name":true,"tone":"","series_position":"${position || ''}","opening_style":""},
    {"kind":"intro","variant_key":"simple","text":"","uses_name":false,"tone":"","series_position":"${position || ''}","opening_style":""},
    {"kind":"outro","variant_key":"simple","text":"","uses_name":false,"tone":"","series_position":"${position || ''}","opening_style":""},
    {"kind":"outro","variant_key":"reflective","text":"","uses_name":false,"tone":"","series_position":"${position || ''}","opening_style":""},
    {"kind":"outro","variant_key":"series_continue","text":"","uses_name":false,"tone":"","series_position":"${position || ''}","opening_style":""}
  ]
}`

    const response = await anthropicCall({
      model: 'claude-haiku-4-5',
      max_tokens: 1800,
      messages: [{ role: 'user', content: prompt }],
    }, {
      route: '/api/admin/generate-belle-variants',
      purpose: 'Generate Belle story-specific intro/outro text variants',
      storyId,
      storyTitle: title,
      metadata: { belleVoiceId: CANONICAL_BELLE_B_VOICE_ID, phase: 'v1_text_variants' },
    })

    const raw = String(response.content?.[0]?.type === 'text' ? response.content[0].text : '').trim()
    const parsed = extractJsonObject(raw)
    const variants = Array.isArray(parsed?.variants) ? parsed.variants.map(normalizeVariant) : []
    const expectedKeys = new Set([...INTRO_VARIANTS.map((key) => `intro:${key}`), ...OUTRO_VARIANTS.map((key) => `outro:${key}`)])
    const seenKeys = new Set(variants.map((variant) => `${variant.kind}:${variant.variant_key}`))
    const missingExpected = Array.from(expectedKeys).filter((key) => !seenKeys.has(key))

    const validations = variants.map((variant) => ({ variant, ...validateVariant(variant, story) }))
    const batchValidationErrors = validateBatch(variants)
    const validationErrors = validations
      .filter((entry) => !entry.valid)
      .map((entry) => ({ kind: entry.variant.kind, variant_key: entry.variant.variant_key, errors: entry.errors, text: entry.text }))
      .concat(batchValidationErrors.map((entry) => ({ kind: 'intro' as const, variant_key: entry.variant_key, errors: entry.errors, text: entry.text })))

    if (variants.length !== 7 || missingExpected.length > 0 || validationErrors.length > 0) {
      return json({
        success: false,
        error: 'Belle variant validation failed',
        storyId,
        expectedCount: 7,
        actualCount: variants.length,
        missingExpected,
        validationErrors,
        raw,
      }, 422)
    }

    const rows = validations.map((entry) => ({
      story_id: storyId,
      kind: entry.variant.kind,
      variant_key: entry.variant.variant_key,
      text: entry.text,
      uses_name: Boolean(entry.variant.uses_name),
      tone: entry.variant.tone || null,
      series_position: entry.variant.series_position || position,
      opening_style: entry.variant.opening_style || null,
    }))

    const { error: deleteError } = await supabase.from('story_belle_variants').delete().eq('story_id', storyId)
    if (deleteError) throw new Error(`Failed to clear existing Belle variants: ${deleteError.message}`)

    const { data: inserted, error: insertError } = await supabase
      .from('story_belle_variants')
      .insert(rows)
      .select('*')
      .order('kind', { ascending: true })

    if (insertError) throw new Error(`Failed to store Belle variants: ${insertError.message}`)

    return json({
      success: true,
      storyId,
      belleName: 'Belle',
      belleVoiceId: CANONICAL_BELLE_B_VOICE_ID,
      count: inserted?.length || 0,
      variants: inserted || [],
    })
  } catch (err) {
    return json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }, 500)
  }
}
