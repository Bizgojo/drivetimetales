// app/api/admin/voice-approval/route.ts
// VOICE-APPROVAL-001 — Marc approves every character voice before a series voices.
// GET  ?series=<title>            → story + cast rows (age, gender, relation, current voice)
// GET  ?series=<title>&line=<name> → the script lines for that character (sample text)
// POST action=sample              → play one line via one voice (small credit cost, logged)
// POST action=read-voices         → ElevenLabs voice catalogue filtered by gender
// POST action=approve             → save voice_id/voice_name/age, return re-voice cost
//                                  NOTHING is voiced here. Approval only writes the roster.

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createHash } from 'crypto'

export const dynamic = 'force-dynamic'

const EL_KEY = process.env.ELEVENLABS_API_KEY
const CHARS_PER_CREDIT = 1 // ElevenLabs bills 1 credit per character on standard TTS

// VOICE-APPROVAL-002: cached samples.
// Marc, Nov 18 2026: "cached samples". The old route billed ElevenLabs on every
// play, so re-listening to the same voice cost credits each time — exactly wrong
// for a page whose job is comparison by ear. Samples are now content-addressed by
// (voice_id + exact text) and stored in the existing `audio` bucket, so the same
// pairing is billed once, ever. A different line for the same voice is a new key
// and is billed once; that is intended, not a cache miss.
const SAMPLE_PREFIX = 'voice-samples'

function sampleKey(voiceId: string, text: string) {
  const h = createHash('sha256').update(voiceId + '\u0000' + text).digest('hex').slice(0, 32)
  return `${SAMPLE_PREFIX}/${voiceId}/${h}.mp3`
}

function sb() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  )
}

async function elVoices() {
  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': EL_KEY || '' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`EL voices ${res.status}`)
  const data = await res.json()
  return (data.voices || []).filter(
    (v: any) => v.category !== 'generated' && (!v.labels?.language || v.labels.language === 'en')
  )
}

// Rough age-group match: ElevenLabs labels are young / middle-aged / old.
function ageGroupMatch(vAge: string | undefined, charAge: number | null) {
  if (!charAge || !vAge) return true // unknown stays "possible", flagged in the UI
  const g = String(vAge).toLowerCase()
  if (charAge < 25) return g === 'young'
  if (charAge < 46) return g === 'young' || g === 'middle-aged'
  if (charAge < 61) return g === 'middle-aged'
  return g === 'old' || g === 'middle-aged'
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const series = url.searchParams.get('series')
  const wantLine = url.searchParams.get('line')
  if (!series) return NextResponse.json({ error: 'series required' }, { status: 400 })

  const supabase = sb()

  const { data: s } = await supabase
    .from('series')
    .select('id, title, description')
    .ilike('title', series)
    .limit(1)
    .maybeSingle()

  if (!s) return NextResponse.json({ error: `series not found: ${series}` }, { status: 404 })

  const { data: roster } = await supabase
    .from('series_character_roster')
    .select('canonical_name, gender, age, voice_id, voice_name, description, accent, is_locked')
    .eq('series_id', s.id)
    .order('canonical_name')

  // Script lines: take each character's spoken lines from the episode scripts.
  // Stories table holds episode_number + script per series.
  const { data: scripts } = await supabase
    .from('stories')
    .select('episode_number, script')
    .eq('series_id', s.id)
    .order('episode_number', { ascending: true })

  const lines = new Map<string, string>()
  for (const sc of scripts || []) {
    const text = String(sc.script || '')
    // Scripts are formatted `NAME: dialogue`; collect up to 2 sentences per character.
    const re = /^\s*([A-Z][A-Z '\-]{1,24}):\s*(.+)$/gm
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const name = m[1].trim()
      if (lines.has(name)) continue
      let line = m[2].trim()
      if (wantLine && name !== wantLine.toUpperCase()) continue
      // Trim to at most two sentences.
      const parts = line.match(/[^.!?]+[.!?]+/g)
      if (parts && parts.length > 2) line = parts.slice(0, 2).join(' ').trim()
      lines.set(name, line)
    }
  }

  if (wantLine) {
    return NextResponse.json({ series: s.title, character: wantLine, line: lines.get(wantLine.toUpperCase()) || null })
  }

  return NextResponse.json({
    series: s.title,
    series_id: s.id,
    characters: (roster || []).map((r: any) => ({
      name: r.canonical_name,
      gender: r.gender,
      age: r.age,
      age_unknown: r.age === null,
      description: r.description,
      relation: relationFrom(r.description),
      current_voice: { voice_id: r.voice_id, voice_name: r.voice_name },
      is_locked: r.is_locked,
      line: lines.get(r.canonical_name.toUpperCase()) || null,
    })),
  })
}

// The relation is stated in the roster description, e.g. "Victoria's mother".
function relationFrom(description: string | null) {
  if (!description) return null
  const m = description.match(/([A-Z][a-z]+['’]s (?:mother|father|daughter|son|wife|husband|sister|brother|fiancée|fiance|best friend|business partner)[^,.;]*)/)
  return m ? m[1].trim() : null
}

export async function POST(req: Request) {
  const body = await req.json()
  const supabase = sb()

  if (body.action === 'read-voices') {
    const all = await elVoices()
    const gender = String(body.gender || '').toLowerCase()
    const age = body.age ?? null
    const filtered = all.filter(
      (v: any) =>
        (!gender || String(v.labels?.gender || '').toLowerCase() === gender) &&
        ageGroupMatch(v.labels?.age, age)
    )
    // VOICE-APPROVAL-003: flag similar voices, WITHIN THIS STORY ONLY.
    // Marc, Nov 18 2026: "flag similar voices only within the SAME story."
    // The point is to stop two characters in one series sounding alike. A voice
    // already used by a DIFFERENT series is not a problem — reusing a good voice
    // across unrelated series is fine — so it must not be flagged. Scoping here
    // (rather than globally) is what makes the flag trustworthy: if every match
    // turned red, the admin would learn to ignore the colour.
    const seriesId = body.series_id ? String(body.series_id) : null
    let usedInThisStory: Array<{ voice_id: string; canonical_name: string }> = []
    if (seriesId) {
      const { data: rosterRows } = await supabase
        .from('series_character_roster')
        .select('voice_id, canonical_name')
        .eq('series_id', seriesId)
        .not('voice_id', 'is', null)
      usedInThisStory = (rosterRows || []).filter(
        (r: any) => r.voice_id && r.voice_id !== String(body.exclude_character || '')
      )
    }
    // Accept only a real match: same voice_id, or the same voice_name compared
    // case-insensitively (ElevenLabs ids differ across accounts for the same
    // voice name, so name comparison catches that case).
    const sameVoice = (v: any) =>
      usedInThisStory.find(
        (r: any) =>
          r.voice_id === v.voice_id ||
          String(r.canonical_name || '').toLowerCase() === String(v.name || '').toLowerCase()
      )

    return NextResponse.json({
      voices: filtered.slice(0, 40).map((v: any) => {
        const clash = sameVoice(v)
        return {
          voice_id: v.voice_id,
          name: v.name,
          gender: v.labels?.gender,
          age: v.labels?.age,
          accent: v.labels?.accent,
          // null = no clash in this story. Non-null names the character already using it.
          used_by_in_story: clash ? clash.canonical_name : null,
        }
      }),
    })
  }

  if (body.action === 'sample') {
    const { voice_id, text } = body
    if (!voice_id || !text) return NextResponse.json({ error: 'voice_id and text required' }, { status: 400 })
    if (String(text).length > 300) return NextResponse.json({ error: 'line too long (max 300 chars)' }, { status: 400 })

    // VOICE-APPROVAL-002: serve from cache before spending a credit.
    const key = sampleKey(voice_id, String(text))
    const cached = await supabase.storage.from('audio').download(key)
    if (!cached.error && cached.data) {
      const buf = Buffer.from(await cached.data.arrayBuffer())
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'private, max-age=86400',
          'X-Credits-Used': '0',
          'X-Sample-Cache': 'hit',
        },
      })
    }

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
      method: 'POST',
      headers: { 'xi-api-key': EL_KEY || '', 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    })
    if (!res.ok) {
      return NextResponse.json({ error: `EL ${res.status}: ${await res.text()}` }, { status: 502 })
    }
    const buf = Buffer.from(await res.arrayBuffer())

    // Store for next time. A failed upload must NOT fail the request — the
    // listener still gets their audio, we just pay again next time.
    try {
      const { error: upErr } = await supabase.storage
        .from('audio')
        .upload(key, buf, { contentType: 'audio/mpeg', upsert: true })
      if (upErr) console.warn('[voice-approval] sample cache upload failed:', upErr.message)
    } catch (e: any) {
      console.warn('[voice-approval] sample cache upload threw:', e?.message)
    }

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'private, max-age=86400',
        'X-Credits-Used': String(String(text).length),
        'X-Sample-Cache': 'miss',
      },
    })
  }

  if (body.action === 'approve') {
    const { series_id, character, voice_id, voice_name, age } = body
    if (!series_id || !character || !voice_id) {
      return NextResponse.json({ error: 'series_id, character, voice_id required' }, { status: 400 })
    }

    // Save the approval. Live audio is untouched at this point.
    const { error } = await supabase
      .from('series_character_roster')
      .update({ voice_id, voice_name, age: age ?? null })
      .eq('series_id', series_id)
      .eq('canonical_name', character)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Re-voice cost: every line this character speaks across the series, at 1 credit/char.
    const { data: scripts } = await supabase
      .from('stories')
      .select('script')
      .eq('series_id', series_id)

    let chars = 0
    const re = /^\s*([A-Z][A-Z '\-]{1,24}):\s*(.+)$/gm
    for (const sc of scripts || []) {
      let m: RegExpExecArray | null
      while ((m = re.exec(String(sc.script || ''))) !== null) {
        if (m[1].trim().toUpperCase() === String(character).toUpperCase()) chars += m[2].trim().length
      }
    }

    return NextResponse.json({
      approved: true,
      character,
      voice_id,
      voice_name,
      estimated_credits: chars,
      note: 'Roster updated. No audio generated. Re-voice cost is the estimate for every line this character speaks.',
    })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
