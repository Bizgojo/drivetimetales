import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const EL_KEY = process.env.ELEVENLABS_API_KEY!
const COST_PER_1K = 0.30 // approximate

async function fetchAllHistory() {
  let items: any[] = []
  let lastId: string | null = null
  let hasMore = true
  let pages = 0

  while (hasMore && pages < 20) {
    const url = new URL('https://api.elevenlabs.io/v1/history')
    url.searchParams.set('page_size', '100')
    if (lastId) url.searchParams.set('start_after_history_item_id', lastId)

    const res = await fetch(url.toString(), { headers: { 'xi-api-key': EL_KEY } })
    if (!res.ok) break
    const data = await res.json()
    const batch = data.history || []
    items = items.concat(batch)
    hasMore = data.has_more
    if (batch.length > 0) lastId = batch[batch.length - 1].history_item_id
    pages++
  }
  return items
}

export async function GET() {
  try {
    // Get subscription info
    const subRes = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': EL_KEY }
    })
    const sub = await subRes.json()

    // Get full history
    const items = await fetchAllHistory()

    // Group by day
    const byDay: Record<string, { chars: number; calls: number; voices: Record<string, number> }> = {}
    const byVoice: Record<string, number> = {}
    let totalChars = 0

    for (const item of items) {
      const chars = Math.abs(
        (item.character_count_change_to || 0) - (item.character_count_change_from || 0)
      )
      const date = new Date(item.date_unix * 1000).toISOString().slice(0, 10)
      const voice = item.voice_name || 'Unknown'

      if (!byDay[date]) byDay[date] = { chars: 0, calls: 0, voices: {} }
      byDay[date].chars += chars
      byDay[date].calls += 1
      byDay[date].voices[voice] = (byDay[date].voices[voice] || 0) + chars

      byVoice[voice] = (byVoice[voice] || 0) + chars
      totalChars += chars
    }

    // Sort days descending
    const days = Object.entries(byDay)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, data]) => ({
        date,
        chars: data.chars,
        calls: data.calls,
        cost: +(data.chars / 1000 * COST_PER_1K).toFixed(2),
        topVoices: Object.entries(data.voices)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([name, chars]) => ({ name: name.split(' - ')[0], chars }))
      }))

    const voices = Object.entries(byVoice)
      .sort(([, a], [, b]) => b - a)
      .map(([name, chars]) => ({
        name: name.split(' - ')[0],
        chars,
        cost: +(chars / 1000 * COST_PER_1K).toFixed(2)
      }))

    return NextResponse.json({
      subscription: {
        plan: sub.tier || 'unknown',
        charUsed: sub.character_count || 0,
        charLimit: sub.character_limit || 0,
        resetDate: sub.next_character_count_reset_unix
          ? new Date(sub.next_character_count_reset_unix * 1000).toISOString().slice(0, 10)
          : null,
        pct: sub.character_limit ? Math.round((sub.character_count / sub.character_limit) * 100) : 0
      },
      summary: {
        totalChars,
        totalCalls: items.length,
        estimatedCost: +(totalChars / 1000 * COST_PER_1K).toFixed(2),
        days: days.length
      },
      days,
      voices
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
