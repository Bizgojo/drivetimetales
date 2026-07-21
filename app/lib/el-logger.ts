/**
 * ElevenLabs Usage Logger
 * Call this after every ElevenLabs TTS request to log chars + cost to el_usage_log.
 * Uses with-timestamps endpoint to capture history_item_id when possible.
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type ELCategory = 'story' | 'intro' | 'testing' | 'news' | 'production'

export async function logELCall(opts: {
  historyItemId?: string | null
  voiceName: string
  chars: number
  category: ELCategory
  storyTitle?: string | null
  text: string
}) {
  if (!opts.historyItemId && !opts.chars) return
  try {
    const id = opts.historyItemId || `manual_${Date.now()}_${Math.random().toString(36).slice(2,8)}`
    await supabase.from('el_usage_log').upsert({
      history_item_id: id,
      voice_name: opts.voiceName,
      chars: opts.chars,
      category: opts.category,
      story_title: opts.storyTitle || null,
      date_utc: new Date().toISOString().slice(0, 10),
      ts_utc: new Date().toISOString(),
      cost_usd: +(opts.chars / 1000 * 0.30).toFixed(4),
      raw_text: opts.text.slice(0, 200),
      synced_at: new Date().toISOString(),
    }, { onConflict: 'history_item_id' })
  } catch (e) {
    console.warn('[EL Logger] Non-blocking log failure:', e)
  }
}

/**
 * Drop-in wrapper: calls ElevenLabs with-timestamps, logs usage, returns audio Buffer.
 * Falls back to standard endpoint if with-timestamps fails.
 */
export async function elevenLabsTTS(opts: {
  text: string
  voiceId: string
  voiceName: string
  category: ELCategory
  storyTitle?: string | null
  modelId?: string
}): Promise<Buffer> {
  const EL_KEY = process.env.ELEVENLABS_API_KEY!
  const model = opts.modelId || 'eleven_multilingual_v2'
  const body = JSON.stringify({
    text: opts.text,
    model_id: model,
    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
  })

  // Try with-timestamps first (returns history_item_id)
  const tsRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}/with-timestamps`,
    { method: 'POST', headers: { 'xi-api-key': EL_KEY, 'Content-Type': 'application/json' }, body }
  )

  if (tsRes.ok) {
    const json = await tsRes.json()
    await logELCall({
      historyItemId: json.history_item_id || null,
      voiceName: opts.voiceName,
      chars: opts.text.length,
      category: opts.category,
      storyTitle: opts.storyTitle,
      text: opts.text,
    })
    return Buffer.from(json.audio || '', 'base64')
  }

  // Fallback: standard endpoint (no history_item_id)
  const stdRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}`,
    { method: 'POST', headers: { 'xi-api-key': EL_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' }, body }
  )
  if (!stdRes.ok) {
    throw new Error(`ElevenLabs error ${stdRes.status}: ${await stdRes.text()}`)
  }
  const buf = Buffer.from(await stdRes.arrayBuffer())
  // Log without history_item_id
  await logELCall({
    voiceName: opts.voiceName,
    chars: opts.text.length,
    category: opts.category,
    storyTitle: opts.storyTitle,
    text: opts.text,
  })
  return buf
}
