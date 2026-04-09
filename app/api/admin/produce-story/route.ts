import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildCoverPrompt } from '@/lib/coverPrompt'

export const runtime = 'nodejs'
export const maxDuration = 300

let sharp: any
try { sharp = eval('require')('sharp') } catch { sharp = null }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

async function generateDescription(script: string, title: string, genre: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-opus-4-6', max_tokens: 100,
      messages: [{ role: 'user', content: `Write a story card description. EXACTLY 24 words or fewer. Present tense. Punchy hook. No spoilers. Must make a listener press play immediately.\n\nTitle: ${title}\nGenre: ${genre}\n\nSCRIPT (first 3000 chars):\n${script.slice(0, 3000)}\n\nReturn ONLY the description text.` }]
    })
  })
  const data = await res.json()
  return data.content?.[0]?.text?.trim() || ''
}

async function generateProse(script: string, title: string, author: string, genre: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-opus-4-6', max_tokens: 8000,
      messages: [{ role: 'user', content: `You are ${author}, adapting your audio drama into prose fiction for the Endless Tales "Read It" feature.\n\nWrite a complete prose novel adaptation. Same plot, hooks, cliffhangers as the audio drama. Longer than the audio script (3,500-5,000 words). Written in your established author voice. Include interior thoughts and sensory details audio cannot convey. No stage directions, no SFX markers, no [BEAT] markers. End at the same cliffhanger or conclusion.\n\nGenre: ${genre}\nTitle: ${title}\n\nAUDIO DRAMA SCRIPT:\n${script}\n\nWrite the complete prose adaptation now. No preamble.` }]
    })
  })
  const data = await res.json()
  return data.content?.[0]?.text?.trim() || ''
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function overlayText(imageBuffer: Buffer, title: string, author: string): Promise<Buffer> {
  if (!sharp) return imageBuffer
  const size = 1024
  const words = title.toUpperCase().split(' ')
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    const test = current ? `${current} ${w}` : w
    if (test.length > 16 && current) { lines.push(current); current = w } else current = test
  }
  if (current) lines.push(current)
  const pillW = 220, pillH = 64, pillR = 32, pillMargin = 20
  const pillX = size - pillW - pillMargin
  const pillY = size - pillH - pillMargin
  const titleFontSize = lines.length > 2 ? 72 : 86
  const lineHeight = titleFontSize + 10
  const titleBlockHeight = lines.length * lineHeight
  const safeBottomY = pillY - 30
  const titleY = safeBottomY - (lines.length - 1) * lineHeight
  const titleLines = lines.map((line, i) =>
    `<text x="512" y="${titleY + i * lineHeight}" font-family="Georgia, serif" font-size="${titleFontSize}" font-weight="bold" fill="white" text-anchor="middle" filter="url(#shadow)">${escapeXml(line)}</text>`
  ).join('\n')
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="shadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="2" dy="2" stdDeviation="4" flood-color="black" flood-opacity="0.9"/></filter><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="black" stop-opacity="0"/><stop offset="100%" stop-color="black" stop-opacity="0.75"/></linearGradient></defs><rect x="0" y="${size - 300}" width="${size}" height="300" fill="url(#grad)"/><rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillR}" ry="${pillR}" fill="black" fill-opacity="0.45"/>${titleLines}<text x="512" y="${titleY + titleBlockHeight + 28}" font-family="Georgia, serif" font-size="36" fill="#d4a843" text-anchor="middle" filter="url(#shadow)">${escapeXml(author)}</text></svg>`
  return sharp(imageBuffer).resize(size, size).composite([{ input: Buffer.from(svg), blend: 'over' }]).jpeg({ quality: 90 }).toBuffer()
}

async function generateCover(script: string, title: string, author: string, genre: string): Promise<string> {
  const dallePrompt = buildCoverPrompt({ title, author, genre, script })
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'dall-e-3', prompt: dallePrompt.slice(0, 4000), n: 1, size: '1024x1024', quality: 'hd', response_format: 'url' }),
  })
  if (!res.ok) throw new Error(`DALL-E error: ${res.status} - ${await res.text()}`)
  const json = await res.json() as any
  const imageUrl = json.data?.[0]?.url
  if (!imageUrl) throw new Error('DALL-E returned no image URL')
  const imgRes = await fetch(imageUrl)
  const rawBuffer = Buffer.from(await imgRes.arrayBuffer())
  const imgBuffer = await overlayText(rawBuffer, title, author)
  return imgBuffer.toString('base64')
}

async function resolveAuthorId(authorName: string): Promise<string | null> {
  const { data } = await supabase.from('authors').select('id, name').ilike('name', `%${authorName.split(' ')[0]}%`).limit(5)
  if (!data || data.length === 0) return null
  const exact = data.find((a: any) => a.name.toLowerCase() === authorName.toLowerCase())
  return exact?.id || data[0]?.id || null
}

async function resolveNarratorVoiceId(narratorName: string): Promise<{ id: string, voiceId: string } | null> {
  const { data } = await supabase.from('narrator_voices').select('id, name, elevenlabs_voice_id').ilike('name', `%${narratorName.split(' ')[0]}%`).limit(5)
  if (!data || data.length === 0) return null
  const exact = data.find((n: any) => n.name.toLowerCase() === narratorName.toLowerCase())
  const match = exact || data[0]
  return match ? { id: match.id, voiceId: match.elevenlabs_voice_id } : null
}

export async function POST(req: NextRequest) {
  const steps: Record<string, { status: string, message?: string }> = {
    description: { status: 'pending' }, prose: { status: 'pending' }, cover: { status: 'pending' },
    author: { status: 'pending' }, narrator: { status: 'pending' }, save: { status: 'pending' },
  }
  try {
    const body = await req.json()
    const { storyId, script, title, author, narrator, genre } = body
    if (!script || !title || !author || !genre) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    // Narrator map — resolve correct narrator from author name
    const NARRATOR_MAP: Record<string, string> = {
      'Marc Hobelman': 'Ray Dolan', 'Sara Keene': 'Cole Hargrove', 'Elias Thorn': 'Cole Hargrove',
      'Dale Harmon': 'Finn Calloway', 'Julian Mercer': 'Iris Calloway', 'Daniel Wren': 'Elliott Crane',
      'Mark Holbrook': 'Morgan Veil', 'Silas Graves': 'Cole Hargrove', 'Nina Vasquez': 'Marcus Hale',
      'Caroline Drake': 'Iris Calloway', 'Claire Ashford': 'Iris Calloway', 'Edmund Worth': 'James Alcott',
      'Dani Reeves': 'Nora Ashby', 'Vera Blackwood': 'Quinn Merritt', 'Buck Callahan': 'Finn Calloway',
      'Zara Osei': 'Marcus Hale', 'Vera Moss': 'Nora Ashby', 'Dr. Kai Osei': 'Elliott Crane',
      'Zara Storm': 'Sage Wilder', 'Coop Delray': 'Ray Dolan'
    }
    const resolvedNarrator = NARRATOR_MAP[author] || narrator

    // Create real DB row if storyId looks like a localStorage key
    let realStoryId = storyId
    if (!storyId || storyId.startsWith('story_')) {
      const { data: inserted, error: insertErr } = await supabase.from('stories').insert({
        title, author, genre,
        duration_mins: 15, duration_label: '15 min', is_hidden: true,
        published_on: new Date().toISOString().split('T')[0]
      }).select('id').single()
      if (insertErr) console.error('Story insert error:', JSON.stringify(insertErr))
      if (inserted?.id) realStoryId = inserted.id
      else return NextResponse.json({ success: false, error: `Failed to create story row: ${insertErr?.message}`, steps }, { status: 500 })
    }

    const updates: Record<string, any> = {}

    try { const d = await generateDescription(script, title, genre); updates.description = d; steps.description = { status: 'done', message: d.slice(0, 80) } }
    catch (e) { steps.description = { status: 'error', message: String(e) } }

    try { const p = await generateProse(script, title, author, genre); updates.prose_text = p; steps.prose = { status: 'done', message: `${p.split(' ').length} words` } }
    catch (e) { steps.prose = { status: 'error', message: String(e) } }

    try {
      // Retry DALL-E up to 3 times on 500 errors
      let base64 = ''
      for (let attempt = 1; attempt <= 3; attempt++) {
        try { base64 = await generateCover(script, title, author, genre); break }
        catch (e) { if (attempt === 3) throw e; await new Promise(r => setTimeout(r, 2000 * attempt)) }
      }
      const imgBuffer = Buffer.from(base64, 'base64')
      const storagePath = `stories/${realStoryId}/cover_${Date.now()}.jpg`
      const { error: uploadErr } = await supabase.storage.from('audio').upload(storagePath, imgBuffer, { contentType: 'image/jpeg', upsert: true })
      if (uploadErr) throw new Error(uploadErr.message)
      const { data: { publicUrl } } = supabase.storage.from('audio').getPublicUrl(storagePath)
      updates.cover_url = publicUrl
      steps.cover = { status: 'done', message: publicUrl }
    } catch (e) { steps.cover = { status: 'error', message: String(e) } }

    try { const id = await resolveAuthorId(author); if (id) { updates.author_id = id; steps.author = { status: 'done', message: author } } else steps.author = { status: 'error', message: `Not found: ${author}` } }
    catch (e) { steps.author = { status: 'error', message: String(e) } }

    if (resolvedNarrator) {
      try { const n = await resolveNarratorVoiceId(resolvedNarrator); if (n) { updates.narrator_voice_id = n.voiceId; updates.narrator_voice_name = resolvedNarrator; steps.narrator = { status: 'done', message: resolvedNarrator } } else steps.narrator = { status: 'error', message: `Not found: ${resolvedNarrator}` } }
      catch (e) { steps.narrator = { status: 'error', message: String(e) } }
    } else steps.narrator = { status: 'done', message: 'No narrator specified' }

    try {
      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await supabase.from('stories').update(updates).eq('id', realStoryId)
        if (updateErr) throw new Error(updateErr.message)
      }
      steps.save = { status: 'done', message: Object.keys(updates).join(', ') }
    } catch (e) { steps.save = { status: 'error', message: String(e) } }

    const anyError = Object.values(steps).some(s => s.status === 'error')
    return NextResponse.json({ success: !anyError, steps, updates: Object.keys(updates), coverUrl: updates.cover_url, description: updates.description, storyId: realStoryId })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err), steps }, { status: 500 })
  }
}
