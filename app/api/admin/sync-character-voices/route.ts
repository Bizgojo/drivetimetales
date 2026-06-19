import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

type ElevenLabsVoice = {
  voice_id: string
  name?: string | null
  category?: string | null
  labels?: Record<string, string | null | undefined> | null
  description?: string | null
  preview_url?: string | null
}

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status })
}

function clean(value: unknown) {
  return String(value || '').trim()
}

async function requireAdmin() {
  const cookieStore = cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user } } = await authClient.auth.getUser()
  const email = (user?.email || '').toLowerCase()
  if (!email || !ADMIN_EMAILS.has(email)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  return null
}

function normalizeAge(value: unknown) {
  const age = clean(value).toLowerCase()
  if (age === 'middle-aged') return 'middle_aged'
  return age || null
}

function normalizeAccentForMatching(value: unknown) {
  const accent = clean(value).toLowerCase()
  if (accent === 'en-american') return 'american'
  return accent
}

function addTag(tags: Set<string>, condition: boolean, tag: string) {
  if (condition) tags.add(tag)
}

function deriveRegionalTags(voice: ElevenLabsVoice) {
  const labels = voice.labels || {}
  const rawAccent = clean(labels.accent).toLowerCase()
  const accent = normalizeAccentForMatching(rawAccent)
  const text = `${voice.name || ''} ${voice.description || ''} ${rawAccent}`.toLowerCase()
  const tags = new Set<string>()

  addTag(tags, rawAccent === 'southern' || rawAccent === 'us southern' || /\bsouthern\b/.test(text), 'southern')
  addTag(tags, /(\bus midwest\b|\bmidwest\b|\bmidwestern\b)/.test(`${rawAccent} ${text}`), 'midwest')
  addTag(tags, /\bnew england\b/.test(text), 'new_england')
  addTag(tags, rawAccent === 'new york' || /\b(new york|brooklyn|bronx|queens)\b/.test(text), 'new_york')
  addTag(tags, rawAccent === 'boston' || /\bboston\b/.test(text), 'boston')
  addTag(tags, rawAccent === 'western' || /\b(western|cowboy|cowgirl)\b/.test(text), 'western')
  addTag(tags, /\b(texas|texan)\b/.test(text), 'texas')

  // `accent` is normalized for matching only; the DB stores ElevenLabs' raw accent label.
  if (accent === 'us southern') tags.add('southern')

  return Array.from(tags).sort()
}

async function fetchVoicePage(pageToken?: string) {
  const url = new URL('https://api.elevenlabs.io/v2/voices')
  url.searchParams.set('page_size', '100')
  if (pageToken) url.searchParams.set('next_page_token', pageToken)

  const res = await fetch(url.toString(), {
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY || '',
      Accept: 'application/json',
    },
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`ElevenLabs voices failed: ${res.status} ${text}`)
  }

  return JSON.parse(text)
}

async function fetchAllElevenLabsVoices() {
  const voices: ElevenLabsVoice[] = []
  let pageToken: string | undefined

  for (let page = 0; page < 30; page += 1) {
    const data = await fetchVoicePage(pageToken)
    voices.push(...((data.voices || []) as ElevenLabsVoice[]))
    pageToken = data.next_page_token || undefined
    if (!data.has_more || !pageToken) break
  }

  return voices
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function genderAgeBucketCounts(rows: Array<Record<string, any>>) {
  const counts: Record<string, Record<string, number>> = {}
  for (const row of rows) {
    if (!row.is_character_eligible) continue
    const gender = clean(row.gender).toLowerCase() || 'missing'
    const age = clean(row.age).toLowerCase() || 'missing'
    counts[gender] ||= {}
    counts[gender][age] = (counts[gender][age] || 0) + 1
  }
  return counts
}

function regionalTagCounts(rows: Array<Record<string, any>>) {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    for (const tag of row.regional_tags || []) {
      counts[tag] = (counts[tag] || 0) + 1
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
}

export async function POST(_req: NextRequest) {
  try {
    const unauthorized = await requireAdmin()
    if (unauthorized) return unauthorized

    if (!process.env.ELEVENLABS_API_KEY) {
      return json({ success: false, error: 'ELEVENLABS_API_KEY is not configured' }, 500)
    }

    const runStartedAt = new Date().toISOString()
    const voices = await fetchAllElevenLabsVoices()
    const now = new Date().toISOString()
    const voiceIds = voices.map((voice) => voice.voice_id).filter(Boolean)

    const existingIds = new Set<string>()
    for (const idChunk of chunk(voiceIds, 500)) {
      const { data, error } = await supabase
        .from('character_voices')
        .select('voice_id')
        .in('voice_id', idChunk)

      if (error) return json({ success: false, error: error.message }, 500)
      for (const row of data || []) existingIds.add(row.voice_id)
    }

    const rows = voices.map((voice) => {
      const labels = voice.labels || {}
      const gender = clean(labels.gender).toLowerCase()
      const useCase = clean(labels.use_case).toLowerCase()

      return {
        voice_id: voice.voice_id,
        name: clean(voice.name),
        category: clean(voice.category) || null,
        gender: gender || null,
        age: normalizeAge(labels.age),
        accent: clean(labels.accent) || null,
        regional_tags: deriveRegionalTags(voice),
        use_case: useCase || null,
        descriptive: clean(labels.descriptive) || null,
        description: clean(voice.description) || null,
        preview_url: clean(voice.preview_url) || null,
        is_active: true,
        is_character_eligible: useCase !== 'narrative_story',
        needs_labeling: !gender,
        last_seen_at: now,
        updated_at: now,
        raw_json: voice,
      }
    })

    for (const rowChunk of chunk(rows, 100)) {
      const { error } = await supabase
        .from('character_voices')
        .upsert(rowChunk, { onConflict: 'voice_id' })

      if (error) return json({ success: false, error: error.message }, 500)
    }

    const { data: retiredRows, error: retireError } = await supabase
      .from('character_voices')
      .update({ is_active: false, updated_at: now })
      .lt('last_seen_at', runStartedAt)
      .eq('is_active', true)
      .select('voice_id')

    if (retireError) return json({ success: false, error: retireError.message }, 500)

    const inserted = rows.filter((row) => !existingIds.has(row.voice_id)).length
    const updated = rows.length - inserted
    const needsLabelingCount = rows.filter((row) => row.needs_labeling).length
    const eligibleRows = rows.filter((row) => row.is_character_eligible)

    return json({
      success: true,
      totalFetched: rows.length,
      inserted,
      updated,
      retired: retiredRows?.length || 0,
      needsLabelingCount,
      eligibleCount: eligibleRows.length,
      genderAgeBucketCounts: genderAgeBucketCounts(rows),
      regionalTagCounts: regionalTagCounts(rows),
      runStartedAt,
      lastSeenAt: now,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[sync-character-voices] Error:', message)
    return json({ success: false, error: message }, 500)
  }
}
