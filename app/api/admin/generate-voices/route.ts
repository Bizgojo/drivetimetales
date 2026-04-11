import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EL_API_KEY = process.env.ELEVENLABS_API_KEY!
const BELLE_B_VOICE_ID = 'KWDD3Wyq30ZF5NEL01EJ'
const BASE_STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`
const EL_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true }

const MALE_VOICE_NAMES = ['Cole Hargrove', 'Elliott Crane', 'Finn Calloway', 'James Alcott', 'Marcus Hale', 'Ray Dolan']
const FEMALE_VOICE_NAMES = ['Iris Calloway', 'June Harlow', 'Morgan Veil', 'Nora Ashby', 'Quinn Merritt', 'Sage Wilder']

async function findVoiceForCharacter(
  characterName: string,
  gender: 'male' | 'female' | 'unknown',
  charDescription: string,
  narratorVoiceId: string,
  voiceByName: Record<string,string>
): Promise<string> {
  const cacheKey = `char:${characterName.toLowerCase().replace(/[^a-z0-9]/g,'-')}`
  try {
    const { data: cached } = await supabase.from('narrator_voices').select('elevenlabs_voice_id').eq('name', cacheKey).single()
    if (cached?.elevenlabs_voice_id) { console.log(`  Cache hit: ${characterName}`); return cached.elevenlabs_voice_id }
    const lower = charDescription.toLowerCase()
    const ageNum = lower.match(/(\d+)/)?.[1] ? parseInt(lower.match(/(\d+)/)![1]) : 30
    const age = ageNum < 25 ? 'young' : ageNum < 55 ? 'middle_aged' : 'old'
    const accent = lower.includes('british')||lower.includes('london') ? 'british'
      : lower.includes('australian') ? 'australian'
      : lower.includes('irish') ? 'irish'
      : lower.includes('african')||lower.includes('nigerian') ? 'african'
      : lower.includes('indian') ? 'indian'
      : 'american'
    let voices: any[] = []
    const params = new URLSearchParams({ gender: gender==='male'?'male':'female', age, accent, use_cases: 'characters_animation', page_size: '30', category: 'high_quality' })
    const res = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${params}`, { headers: { 'xi-api-key': EL_API_KEY } })
    if (res.ok) { const d = await res.json(); voices = d.voices || [] }
    if (voices.length === 0) {
      const p2 = new URLSearchParams({ gender: gender==='male'?'male':'female', age, use_cases: 'characters_animation', page_size: '30' })
      const r2 = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${p2}`, { headers: { 'xi-api-key': EL_API_KEY } })
      if (r2.ok) { const d2 = await r2.json(); voices = d2.voices || [] }
    }
    if (voices.length === 0) return gender==='male' ? (voiceByName[MALE_VOICE_NAMES[0]]||narratorVoiceId) : (voiceByName[FEMALE_VOICE_NAMES[0]]||narratorVoiceId)
    const pick = voices[Math.floor(Math.random() * Math.min(5, voices.length))]
    const addRes = await fetch(`https://api.elevenlabs.io/v1/voices/add/${pick.voice_id}`, { method: 'POST', headers: { 'xi-api-key': EL_API_KEY } })
    const addData = addRes.ok ? await addRes.json() : null
    const finalVoiceId = addData?.voice_id || pick.voice_id
    await supabase.from('narrator_voices').upsert({ name: cacheKey, elevenlabs_voice_id: finalVoiceId }, { onConflict: 'name' })
    console.log(`  Voice for ${characterName}: ${pick.name} (${finalVoiceId})`)
    return finalVoiceId
  } catch(e) {
    console.warn(`  Voice search failed for ${characterName}:`, e)
    return gender==='male' ? (voiceByName[MALE_VOICE_NAMES[0]]||narratorVoiceId) : (voiceByName[FEMALE_VOICE_NAMES[0]]||narratorVoiceId)
  }
}

interface ScriptLine {
  index: number; speaker: string; text: string
  type: 'announcer' | 'narrator' | 'character' | 'sfx' | 'beat' | 'pause'
  isIntro: boolean; isOutro: boolean
}

interface CharacterInfo {
  name: string
  gender: 'male' | 'female' | 'unknown'
  description: string
}

function parseCharacterGuide(script: string): CharacterInfo[] {
  const chars: CharacterInfo[] = []
  const guideMatch = script.match(/CHARACTER GUIDE\s*\n---\s*\n([\s\S]*?)(?:\n---|\[START AUDIO DRAMA SCRIPT\])/i)
  if (!guideMatch) return chars
  const guideLines = guideMatch[1].split('\n').filter(l => l.trim())
  for (const line of guideLines) {
    const nameMatch = line.match(/^([A-Z][A-Z\s'.()]+?)\s*[—–-]/)
    if (!nameMatch) continue
    const name = nameMatch[1].trim()
    const lower = line.toLowerCase()
    let gender: CharacterInfo['gender'] = 'unknown'
    if (lower.includes(', male') || lower.includes(' male,') || lower.includes('male ')) gender = 'male'
    if (lower.includes(', female') || lower.includes(' female,') || lower.includes('female ')) gender = 'female'
    chars.push({ name, gender, description: line })
  }
  return chars
}

function parseScript(script: string): ScriptLine[] {
  const lines: ScriptLine[] = []
  const rawLines = script.split('\n')
  const announcerIndices: number[] = []
  rawLines.forEach((line, i) => {
    if (line.trim().match(/^(ANNOUNCER|BELLE B):/i)) announcerIndices.push(i)
  })
  const firstAnnouncerIdx = announcerIndices[0] ?? -1
  const lastAnnouncerIdx = announcerIndices[announcerIndices.length - 1] ?? -1
  const scriptStartIdx = rawLines.findIndex(l =>
    l.includes('[START AUDIO DRAMA SCRIPT]') || l.includes('CHARACTER GUIDE')
  )
  const headerEndIdx = scriptStartIdx > -1 ? scriptStartIdx : (firstAnnouncerIdx + 1)
  const HEADER_KEYS = [
    'SERIES:', 'EPISODE:', 'AUTHOR:', 'GENRE:', 'DESCRIPTION:', 'SUNO PROMPT:',
    'NARRATIVE_VOICE:', 'NARRATOR_IS_CHARACTER:', 'NARRATOR_IS_', 'EPISODE_TITLE:',
    'SERIES_TOTAL', 'SERIES_IS_FINALE:', '[START AUDIO DRAMA SCRIPT]',
    'CHARACTER GUIDE', '---'
  ]
  let lineIndex = 0
  rawLines.forEach((line, rawIdx) => {
    const trimmed = line.trim()
    if (!trimmed) return
    if (HEADER_KEYS.some(k => trimmed.startsWith(k))) return
    if (rawIdx < headerEndIdx && rawIdx !== firstAnnouncerIdx && rawIdx !== lastAnnouncerIdx) {
      if (trimmed.startsWith('NARRATOR:') || trimmed.startsWith('ANNOUNCER:')) return
    }
    if (trimmed === '[BEAT]') { lines.push({ index: lineIndex++, speaker: 'BEAT', text: '0.75', type: 'beat', isIntro: false, isOutro: false }); return }
    const pauseMatch = trimmed.match(/^\[PAUSE:(\d+)\]$/)
    if (pauseMatch) { lines.push({ index: lineIndex++, speaker: 'PAUSE', text: pauseMatch[1], type: 'pause', isIntro: false, isOutro: false }); return }
    if (trimmed.startsWith('[SFX:')) { const sfxText = trimmed.replace(/^\[SFX:\s*/, '').replace(/\]$/, '').trim(); lines.push({ index: lineIndex++, speaker: 'SFX', text: sfxText, type: 'sfx', isIntro: false, isOutro: false }); return }
    if (trimmed.startsWith('[')) return
    // Skip ANNOUNCER intro lines that slipped through
    if (trimmed.startsWith('ANNOUNCER:') && trimmed.toLowerCase().includes('endless tales presents')) return
    const dm = trimmed.match(/^([A-Z][A-ZÀ-Ú\s'.()]+?):\s*(.+)$/)
    if (dm) {
      const speaker = dm[1].trim(); const text = dm[2].trim()
      const isAnnouncer = speaker === 'ANNOUNCER' || speaker === 'BELLE B'
      const isIntro = isAnnouncer && rawIdx === firstAnnouncerIdx
      const isOutro = isAnnouncer && rawIdx === lastAnnouncerIdx
      let type: ScriptLine['type'] = 'character'
      if (isAnnouncer) type = 'announcer'
      else if (speaker === 'NARRATOR') type = 'narrator'
      lines.push({ index: lineIndex++, speaker, text, type, isIntro, isOutro })
    }
  })
  return lines
}

async function generateVoiceLine(rawText: string, voiceId: string, storyId: string, lineIndex: number, prefix: string): Promise<string> {
  // Clean markdown and special characters before sending to ElevenLabs
  const text = rawText
    .replace(/\*+/g, '')        // remove asterisks (bold/italic markdown)
    .replace(/\_/g, '')         // remove underscores
    .replace(/#{1,6}\s/g, '')   // remove markdown headers
    .replace(/\[LISTENER_NAME\]/g, 'friend')  // replace listener placeholder
    .trim()
  const fileName = `${prefix}_${lineIndex.toString().padStart(4, '0')}.mp3`
  const cachePath = `asc3/${storyId}/${fileName}`
  const cacheUrl = `${BASE_STORAGE}/${cachePath}`
  try { const r = await fetch(cacheUrl, { method: 'HEAD' }); if (r.ok) return cacheUrl } catch {}
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': EL_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: EL_SETTINGS })
  })
  if (!res.ok) throw new Error(`ElevenLabs error ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const { error: ue } = await supabase.storage.from('audio').upload(cachePath, buf, { contentType: 'audio/mpeg', upsert: true })
  if (ue) throw new Error(`Upload error: ${ue.message}`)
  return cacheUrl
}

async function generateSFX(description: string, storyId: string, lineIndex: number): Promise<string | null> {
  const fileName = `sfx_${lineIndex.toString().padStart(4, '0')}.mp3`
  const cachePath = `asc3/${storyId}/${fileName}`
  const cacheUrl = `${BASE_STORAGE}/${cachePath}`
  try { const r = await fetch(cacheUrl, { method: 'HEAD' }); if (r.ok) return cacheUrl } catch {}
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: { 'xi-api-key': EL_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({ text: description, duration_seconds: 3.0, prompt_influence: 0.3 })
    })
    if (!res.ok) { console.warn(`SFX failed: ${res.status}`); return null }
    const buf = Buffer.from(await res.arrayBuffer())
    await supabase.storage.from('audio').upload(cachePath, buf, { contentType: 'audio/mpeg', upsert: true })
    return cacheUrl
  } catch (e) { console.warn('SFX error:', e); return null }
}

export async function POST(req: NextRequest) {
  try {
    const { storyId, script: scriptParam, narratorVoiceId, narratorVoiceName, characterVoices } = await req.json()
    if (!storyId) return NextResponse.json({ success: false, error: 'storyId required' }, { status: 400 })
    let script = scriptParam
    if (!script) {
      const { data: row } = await supabase.from('stories').select('script').eq('id', storyId).single()
      script = row?.script
      if (!script) return NextResponse.json({ success: false, error: 'Script not found in database' }, { status: 400 })
    }
    console.log(`\n🎙 generate-voices: ${storyId}`)
    const { data: allVoices } = await supabase.from('narrator_voices').select('name,elevenlabs_voice_id')
    const voiceByName: Record<string, string> = {}
    if (allVoices) allVoices.forEach((v: any) => { voiceByName[v.name] = v.elevenlabs_voice_id })
    let resolvedNarratorVoiceId = narratorVoiceId
    if (!resolvedNarratorVoiceId && narratorVoiceName) resolvedNarratorVoiceId = voiceByName[narratorVoiceName]
    if (!resolvedNarratorVoiceId) {
      const { data: row } = await supabase.from('stories').select('narrator_voice_id,narrator_voice_name').eq('id', storyId).single()
      if (row?.narrator_voice_id) resolvedNarratorVoiceId = row.narrator_voice_id
      else if (row?.narrator_voice_name) resolvedNarratorVoiceId = voiceByName[row.narrator_voice_name]
    }
    if (!resolvedNarratorVoiceId) resolvedNarratorVoiceId = voiceByName['Cole Hargrove']
    if (!resolvedNarratorVoiceId) return NextResponse.json({ success: false, error: 'No narrator voice found' }, { status: 400 })
    const characterGuide = parseCharacterGuide(script)
    const narratorName = allVoices?.find((v: any) => v.elevenlabs_voice_id === resolvedNarratorVoiceId)?.name || ''
    const maleVoices = MALE_VOICE_NAMES.filter(n => n !== narratorName && voiceByName[n]).map(n => voiceByName[n])
    const femaleVoices = FEMALE_VOICE_NAMES.filter(n => voiceByName[n]).map(n => voiceByName[n])
    // Build voice map using ElevenLabs library search
    const voiceMap: Record<string, string> = {}
    for (const char of characterGuide) {
      const key = char.name.toUpperCase()
      // Check if manually overridden
      if (characterVoices?.[char.name] || characterVoices?.[key]) {
        voiceMap[key] = (characterVoices[char.name] || characterVoices[key]) as string
        continue
      }
      // Child characters (under 12) use female voice — sounds more natural in audio drama
      const ageMatch = char.description?.match(/(\d+)/)
      const age = ageMatch ? parseInt(ageMatch[1]) : 30
      const effectiveGender = (age < 12) ? 'female' : char.gender
      // Search EL library for best matching voice
      voiceMap[key] = await findVoiceForCharacter(
        char.name, effectiveGender, char.description || char.name,
        resolvedNarratorVoiceId, voiceByName
      )
    }
    // Apply any remaining manual overrides
    if (characterVoices) Object.entries(characterVoices).forEach(([name, id]) => { voiceMap[name.toUpperCase()] = id as string })
    console.log(`  Characters:`, characterGuide.map(c => `${c.name}(${c.gender})`).join(', '))
    const lines = parseScript(script)
    const announcerLines = lines.filter(l => l.type === 'announcer')
    const introLine = announcerLines[0]
    const outroLine = announcerLines[announcerLines.length - 1]
    const storyLines = lines.filter(l => !l.isIntro && !l.isOutro)
    const results: { intro?: string; outro?: string; segments: any[] } = { segments: [] }
    let succeeded = 0; let failed = 0
    if (introLine) { try { results.intro = await generateVoiceLine(introLine.text, BELLE_B_VOICE_ID, storyId, introLine.index, 'intro'); console.log('  ✅ Belle B intro') } catch (e) { console.error('  ❌ Intro failed:', e) } }
    if (outroLine && outroLine.index !== introLine?.index) { try { results.outro = await generateVoiceLine(outroLine.text, BELLE_B_VOICE_ID, storyId, outroLine.index, 'outro'); console.log('  ✅ Belle B outro') } catch (e) { console.error('  ❌ Outro failed:', e) } }
    for (const line of storyLines) {
      if (line.type === 'beat' || line.type === 'pause') { results.segments.push({ index: line.index, speaker: line.speaker, type: line.type, duration: line.text }); continue }
      if (line.type === 'sfx') { const sfxUrl = await generateSFX(line.text, storyId, line.index); results.segments.push({ index: line.index, speaker: 'SFX', type: 'sfx', url: sfxUrl || undefined }); continue }
      let voiceId = resolvedNarratorVoiceId
      if (line.type === 'character') voiceId = voiceMap[line.speaker.toUpperCase()] || resolvedNarratorVoiceId
      try { const url = await generateVoiceLine(line.text, voiceId, storyId, line.index, 'segment'); results.segments.push({ index: line.index, speaker: line.speaker, type: line.type, url }); succeeded++ }
      catch (e) { console.error(`  ❌ Line ${line.index} (${line.speaker}):`, e); results.segments.push({ index: line.index, speaker: line.speaker, type: line.type }); failed++ }
    }
    const updates: Record<string, string> = {}
    if (results.intro) updates.intro_audio_url = results.intro
    if (results.outro) updates.outro_audio_url = results.outro
    if (Object.keys(updates).length > 0) await supabase.from('stories').update(updates).eq('id', storyId)
    const voiceTotal = storyLines.filter(l => l.type === 'narrator' || l.type === 'character').length
    console.log(`  ✅ Done: ${succeeded}/${voiceTotal} lines, ${failed} failed`)
    return NextResponse.json({ success: failed === 0, intro: results.intro, outro: results.outro, segments: results.segments, stats: { total: lines.length, voice: voiceTotal, succeeded, failed } })
  } catch (err) {
    console.error('generate-voices error:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
