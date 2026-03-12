import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const claude  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const sb      = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Hal's voice — warm American male (George / NARRATOR from Third Key)
const HAL_VOICE = 'JBFqnCBsd6RMkjVDRZzb'
const EL_KEY    = process.env.ELEVENLABS_API_KEY!

// Store conversation history in Supabase so it persists across serverless calls
async function getHistory(sessionId: string) {
  const { data } = await sb.from('voice_chat_sessions')
    .select('messages').eq('session_id', sessionId).single()
  return data?.messages || []
}

async function saveHistory(sessionId: string, messages: any[]) {
  await sb.from('voice_chat_sessions').upsert({
    session_id: sessionId,
    messages: messages.slice(-20), // keep last 20 turns
    updated_at: new Date().toISOString()
  }, { onConflict: 'session_id' })
}

export async function POST(req: NextRequest) {
  try {
    const { text, session_id = 'marc-voice' } = await req.json()
    if (!text?.trim()) return NextResponse.json({ error: 'No text provided' }, { status: 400 })

    // Load history
    const history = await getHistory(session_id)
    history.push({ role: 'user', content: text })

    // Claude response — short, spoken, natural
    const msg = await claude.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 250,
      system: `You are Hal, Marc's sharp AI business assistant for Endless Tales — an audio storytelling platform launching April 17th. Keep responses concise and conversational — this is voice, not text. 1-3 sentences max. No bullet points, no markdown. Speak naturally like you're in a conversation. Marc is the founder, solo operator, pre-launch.`,
      messages: history.map((m: any) => ({ role: m.role, content: m.content }))
    })

    const responseText = msg.content[0].type === 'text'
      ? msg.content[0].text
      : 'Sorry, I had a moment there — say that again?'

    history.push({ role: 'assistant', content: responseText })
    await saveHistory(session_id, history)

    // ElevenLabs TTS
    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${HAL_VOICE}`, {
      method:  'POST',
      headers: { 'xi-api-key': EL_KEY, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        text:           responseText,
        model_id:       'eleven_turbo_v2_5',
        voice_settings: { stability: 0.55, similarity_boost: 0.75 }
      })
    })

    if (!ttsRes.ok) {
      // Fallback — return text only, let shortcut use iOS Speak Text
      return NextResponse.json({ text: responseText, audio_url: null })
    }

    const audioBuf  = Buffer.from(await ttsRes.arrayBuffer())
    const storagePath = `voice-chat/${session_id}_${Date.now()}.mp3`
    const { error: upErr } = await sb.storage.from('audio')
      .upload(storagePath, audioBuf, { contentType: 'audio/mpeg', upsert: false })

    if (upErr) return NextResponse.json({ text: responseText, audio_url: null })

    const audioUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${storagePath}`
    return NextResponse.json({ text: responseText, audio_url: audioUrl })

  } catch (e: any) {
    console.error('voice-chat error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
