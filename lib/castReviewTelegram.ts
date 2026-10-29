/**
 * CAST-REVIEW-001 — delivery: one short ElevenLabs clip per character (a real
 * line of theirs, read by the cast voice) sent to the "Voices Ready" Telegram
 * group with its caption. Paid but tiny (one short line per character).
 *
 * Env: TELEGRAM_BOT_TOKEN, ELEVENLABS_API_KEY, optional CAST_REVIEW_CHAT_ID
 * (default: Voices Ready group). Falls back to Marc's DM chat when the group
 * send is refused. Never throws: returns what was sent so the caller can log it.
 */
import {
  CastReviewItem,
  castReviewCaption,
  castReviewHeader,
  DEFAULT_CAST_REVIEW_CHAT_ID,
} from '@/lib/castReview'

const MARC_DM_CHAT_ID = process.env.MARC_TELEGRAM_CHAT_ID || '8737860822'

type SendResult = { ok: boolean; status: number; description?: string }

async function tg(method: string, token: string, body: FormData | Record<string, unknown>): Promise<SendResult> {
  try {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      ...(isForm ? { body: body as FormData } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string }
    return { ok: Boolean(data.ok), status: res.status, description: data.description }
  } catch (e) {
    return { ok: false, status: 0, description: e instanceof Error ? e.message : String(e) }
  }
}

async function auditionClip(voiceId: string, line: string, apiKey: string): Promise<Buffer | null> {
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: line,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
      }),
    })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

export type CastReviewDelivery = {
  chatId: string
  headerSent: boolean
  clipsSent: number
  clipsFailed: string[]
  fellBackToDm: boolean
  error?: string
}

export async function sendCastReview(args: {
  seriesTitle: string
  narratorName?: string | null
  items: CastReviewItem[]
}): Promise<CastReviewDelivery> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const apiKey = process.env.ELEVENLABS_API_KEY
  let chatId = (process.env.CAST_REVIEW_CHAT_ID || DEFAULT_CAST_REVIEW_CHAT_ID).trim()
  const result: CastReviewDelivery = { chatId, headerSent: false, clipsSent: 0, clipsFailed: [], fellBackToDm: false }
  if (!token) return { ...result, error: 'TELEGRAM_BOT_TOKEN not set' }

  const header = castReviewHeader(args.seriesTitle, args.items.length, args.narratorName)
  let sent = await tg('sendMessage', token, { chat_id: chatId, text: header })
  if (!sent.ok && chatId !== MARC_DM_CHAT_ID) {
    chatId = MARC_DM_CHAT_ID
    result.chatId = chatId
    result.fellBackToDm = true
    sent = await tg('sendMessage', token, { chat_id: chatId, text: header })
  }
  result.headerSent = sent.ok
  if (!sent.ok) return { ...result, error: `Telegram header send failed (${sent.status}): ${sent.description || ''}`.trim() }

  for (const [i, item] of args.items.entries()) {
    const caption = castReviewCaption(item, i + 1)
    const audio = apiKey && item.sampleLine ? await auditionClip(item.voiceId, item.sampleLine, apiKey) : null
    if (!audio) {
      const r = await tg('sendMessage', token, { chat_id: chatId, text: `${caption}\n(clip unavailable)` })
      if (!r.ok) result.clipsFailed.push(item.name)
      continue
    }
    const form = new FormData()
    form.append('chat_id', chatId)
    form.append('caption', caption)
    form.append('title', item.name)
    form.append('performer', item.voiceName.split(/\s+[-–—]\s+/)[0].trim())
    const file = `${String(i + 1).padStart(2, '0')}-${item.name.replace(/[^A-Za-z0-9]+/g, '-')}.mp3`
    form.append('audio', new Blob([new Uint8Array(audio)], { type: 'audio/mpeg' }), file)
    const r = await tg('sendAudio', token, form)
    if (r.ok) result.clipsSent += 1
    else result.clipsFailed.push(item.name)
  }
  return result
}
