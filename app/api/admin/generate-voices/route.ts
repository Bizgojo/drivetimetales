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

interface ScriptLine {
  index: number; speaker: string; text: string
  type: 'announcer' | 'narrator' | 'character' | 'sfx' | 'beat' | 'pause'
  isIntro: boolean; isOutro: boolean
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
  const HEADER_KEYS = ['SERIES:','EPISODE:','AUTHOR:','GENRE:','DESCRIPTION:','SUNO PROMPT:',
    'NARRATIVE_VOICE:','NARRATOR_IS_CHARACTER:','EPISODE_TITLE:','SERIES_TOTAL','SERIES_IS_FINALE:',
    '[START AUDIO DRAMA SCRIPT]','CHARACTER GUIDE','---']
  let lineIndex = 0
  rawLines.forEach((line, rawIdx) => {
    const trimmed = line.trim()
    if (!trimmed) return
    if (HEADER_KEYS.some(k => trimmed.startsWith(k))) return
    if (trimmed.startsWith('NARRATOR:') && rawIdx < firstAnnouncerIdx) return
    if (trimmed.startsWith('ANNOUNCER:') && rawIdx < firstAnnouncerIdx) return
    if (trimmed === '[BEAT]') { lines.push({ index: lineIndex++, speaker: 'BEAT', text: '1', type: 'beat', isIntro: false, isOutro: false }); return }
    const pauseMatch = trimmed.match(/^\[PAUSE:(\d+)\]$/)
    if (pauseMatch) { lines.push({ index: lineIndex++, speaker: 'PAUSE', text: pauseMatch[1], type: 'pause', isIntro: false, isOutro: false }); return }
    if (trimmed.startsWith('[SFX:')) { lines.push({ index: lineIndex++, speaker: 'SFX', text: trimmed.replace(/^\[SFX:\s*/,'').replace(/\]$/,''), type: 'sfx', isIntro: false, isOutro: false }); return }
    const dm = trimmed.match(/^([A-Z][A-Z\s'.]+?):\s*(.+)$/)
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

async function generateVoiceLine(text: string, voiceId: string, storyId: string, lineIndex: number, segment: string): Promise<string> {
  const cachePath = `asc3/${storyId}/${segment}_${lineIndex.toString().padStart(4,'0')}.mp3`
  const cacheUrl = `${BASE_STORAGE}/${cachePath}`
  try { const r = await fetch(cacheUrl,{method:'HEAD'}); if(r.ok) return cacheUrl } catch {}
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,{
    method:'POST',
    headers:{'xi-api-key':EL_API_KEY,'Content-Type':'application/json','Accept':'audio/mpeg'},
    body:JSON.stringify({text,model_id:'eleven_multilingual_v2',voice_settings:EL_SETTINGS})
  })
  if(!res.ok) throw new Error(`EL error ${res.status}: ${(await res.text()).slice(0,200)}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const {error:ue} = await supabase.storage.from('audio').upload(cachePath,buf,{contentType:'audio/mpeg',upsert:true})
  if(ue) throw new Error(`Upload error: ${ue.message}`)
  return cacheUrl
}

export async function POST(req: NextRequest) {
  try {
    const {storyId,script,narratorVoiceId,narratorVoiceName,characterVoices} = await req.json()
    if(!storyId) return NextResponse.json({success:false,error:'storyId required'},{status:400})
    let script = scriptParam
    if(!script) {
      const {data:storyRow} = await supabase.from('stories').select('script').eq('id',storyId).single()
      script = storyRow?.script
      if(!script) return NextResponse.json({success:false,error:'Script not found'},{status:400})
    }
    const lines = parseScript(script)
    let resolvedNarratorVoiceId = narratorVoiceId
    if(!resolvedNarratorVoiceId&&narratorVoiceName) {
      const {data:nv} = await supabase.from('narrator_voices').select('elevenlabs_voice_id').ilike('name',`%${narratorVoiceName}%`).single()
      resolvedNarratorVoiceId = nv?.elevenlabs_voice_id
    }
    if(!resolvedNarratorVoiceId) return NextResponse.json({success:false,error:'Narrator voice ID required'},{status:400})
    const {data:allVoices} = await supabase.from('narrator_voices').select('name,elevenlabs_voice_id')
    const voiceMap: Record<string,string> = {}
    if(allVoices) allVoices.forEach((v:any)=>{ voiceMap[v.name.toUpperCase()]=v.elevenlabs_voice_id })
    if(characterVoices) Object.entries(characterVoices).forEach(([n,id])=>{ voiceMap[n.toUpperCase()]=id as string })
    const announcerLines = lines.filter(l=>l.type==='announcer')
    const introLine = announcerLines[0]
    const outroLine = announcerLines[announcerLines.length-1]
    const storyLines = lines.filter(l=>!l.isIntro&&!l.isOutro)
    const results: {intro?:string;outro?:string;segments:any[]} = {segments:[]}
    if(introLine) { try { results.intro = await generateVoiceLine(introLine.text,BELLE_B_VOICE_ID,storyId,introLine.index,'intro') } catch(e){console.error('Intro failed:',e)} }
    if(outroLine&&outroLine.index!==introLine?.index) { try { results.outro = await generateVoiceLine(outroLine.text,BELLE_B_VOICE_ID,storyId,outroLine.index,'outro') } catch(e){console.error('Outro failed:',e)} }
    for(const line of storyLines) {
      if(line.type==='beat'||line.type==='pause'||line.type==='sfx') { results.segments.push({index:line.index,speaker:line.speaker,type:line.type}); continue }
      let voiceId = resolvedNarratorVoiceId
      if(line.type==='character') voiceId = voiceMap[line.speaker.toUpperCase()]||resolvedNarratorVoiceId
      try { const url = await generateVoiceLine(line.text,voiceId,storyId,line.index,'segment'); results.segments.push({index:line.index,speaker:line.speaker,type:line.type,url}) }
      catch(e) { console.error(`Line ${line.index} failed:`,e); results.segments.push({index:line.index,speaker:line.speaker,type:line.type}) }
    }
    const updates: Record<string,string> = {}
    if(results.intro) updates.intro_audio_url = results.intro
    if(results.outro) updates.outro_audio_url = results.outro
    if(Object.keys(updates).length>0) await supabase.from('stories').update(updates).eq('id',storyId)
    const succeeded = results.segments.filter(s=>s.url).length
    const total = storyLines.filter(l=>l.type!=='beat'&&l.type!=='pause'&&l.type!=='sfx').length
    return NextResponse.json({success:true,intro:results.intro,outro:results.outro,segments:results.segments,stats:{total:lines.length,voice:total,succeeded,failed:total-succeeded}})
  } catch(err) {
    return NextResponse.json({success:false,error:String(err)},{status:500})
  }
}
