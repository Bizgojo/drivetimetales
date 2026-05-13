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
  /\bbegins now\b/i,
  /\bonly on endless tales\b/i,
  /\bthis is ["“][^"”]+["”]\b/i,
  /\bin this story\b/i,
  /\bthis story is about\b/i,
  /\bthis episode is about\b/i,
  /\bfollows the journey\b/i,
  /\bjoin us as\b/i,
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
  if (!text) errors.push('text is empty')
  if (!['intro', 'outro'].includes(variant.kind)) errors.push('kind must be intro or outro')
  if (!variant.variant_key) errors.push('variant_key is required')
  if (lower.includes('belle b')) errors.push('must say Belle, not Belle B')
  if (/^(narrator|character|announcer|sandy|belle b)\s*:/i.test(text)) errors.push('must not include speaker labels')
  if (CANNED_PATTERNS.some((pattern) => pattern.test(text))) errors.push('generic/canned wording detected')
  if (variant.kind === 'intro' && text.split(/\s+/).filter(Boolean).length > 38) errors.push('intro must be short and conversational')
  if (/\b(summary|summarize|plot|synopsis)\b/i.test(text)) errors.push('must not mechanically summarize the plot')
  if (variant.kind === 'intro' && /\bendless tales original\b/i.test(text)) errors.push('intro must not include platform credits')
  if (variant.kind === 'intro' && story?.author && lower.includes(` by ${String(story.author).trim().toLowerCase()}`)) errors.push('intro must not include author credits')
  const terms = storySpecificTerms(story)
  if (terms.length > 0 && !terms.some((term) => lower.includes(term))) {
    errors.push('must include a concrete story-specific detail')
  }
  if (variant.uses_name && !text.includes('[LISTENER_NAME]')) errors.push('uses_name variants must include [LISTENER_NAME]')
  if (!variant.uses_name && text.includes('[LISTENER_NAME]')) errors.push('only uses_name variants may include [LISTENER_NAME]')
  return { valid: errors.length === 0, errors, text }
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
    const prompt = `Generate story-specific host copy for Belle, a trusted friend quietly recommending an Endless Tales story.

Canonical rules:
- Belle is the name. Never write "Belle B".
- Belle only speaks intros/outros, never narrator or character dialogue.
- Write for this exact story/episode. No generic canned templates.
- Belle may reference the title, but should not sound like a show announcer.
- Avoid trailer-style plot summaries. Do not explain the whole premise.
- Intros should be 1–2 sentences, usually under 35 words.
- Intros should usually reference one sensory image or emotional hook.
- Use [LISTENER_NAME] in exactly two intro variants, naturally and casually. Never write "Welcome, [LISTENER_NAME]".
- Outros should create emotional continuation, not promotion.
- No time-of-day references.
- No speaker labels.
- Do not write: "Welcome", "begins now", "only on Endless Tales", "This is [title]", "You're listening to", "sit back", "relax and enjoy".
- Series outros must not say "only on Endless Tales".

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
    const validationErrors = validations
      .filter((entry) => !entry.valid)
      .map((entry) => ({ kind: entry.variant.kind, variant_key: entry.variant.variant_key, errors: entry.errors, text: entry.text }))

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
