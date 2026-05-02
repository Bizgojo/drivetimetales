import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const EL_KEY = process.env.ELEVENLABS_API_KEY!
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Known story titles for classification
const STORY_PATTERNS: [string, string][] = [
  ['when rosie came home', 'When Rosie Came Home'],
  ['rosie', 'When Rosie Came Home'],
  ['cipher of st. augustine', 'The Cipher of St. Augustine'],
  ['cipher of saint augustine', 'The Cipher of St. Augustine'],
  ['thomas reid', 'The Cipher of St. Augustine'],
  ['blackwell', 'The Cipher of St. Augustine'],
  ['vanishing hour', 'The Vanishing Hour'],
  ['grave he dug', 'The Grave He Dug Himself'],
  ['letters he was meant', 'The Letters He Was Meant to Carry'],
  ['origin 2.0', 'Origin 2.0'],
  ['station 7', 'Station 7'],
]

const NEWS_PATTERNS = ['mitchell', 'statehouse', 'bringing you the south carolina', 'gamecocks', 'upstate', 'midlands', 'south carolina news']

function elevenLabsErrorBody(status: number, body: any) {
  const detail = body?.detail
  if (typeof detail === 'string') return detail
  if (detail?.message && detail?.status) return `${detail.status}: ${detail.message}`
  if (detail?.message) return detail.message
  if (body?.error) return String(body.error)
  return `ElevenLabs API returned HTTP ${status}`
}

function classify(text: string, chars: number): { category: string; story_title: string | null } {
  const t = text.toLowerCase()
  if (NEWS_PATTERNS.some(p => t.includes(p))) return { category: 'news', story_title: null }
  if (chars <= 300) return { category: 'testing', story_title: null }
  for (const [pattern, title] of STORY_PATTERNS) {
    if (t.includes(pattern)) return { category: 'story', story_title: title }
  }
  if (t.includes('welcome to endless') || t.includes('all subscriptions') || t.includes("let's begin")) {
    // Intro/outro — try to find story from text
    for (const [pattern, title] of STORY_PATTERNS) {
      if (t.includes(pattern)) return { category: 'intro', story_title: title }
    }
    return { category: 'intro', story_title: null }
  }
  return { category: chars > 500 ? 'production' : 'testing', story_title: null }
}

export async function POST() {
  try {
    if (!EL_KEY) {
      return NextResponse.json(
        { success: false, error: 'ElevenLabs sync unavailable', status: 500, detail: 'ELEVENLABS_API_KEY is not configured' },
        { status: 500 }
      )
    }

    let synced = 0
    let lastId: string | null = null
    let hasMore = true
    let pages = 0

    while (hasMore && pages < 30) {
      let url = 'https://api.elevenlabs.io/v1/history?page_size=100'
      if (lastId) url += `&start_after_history_item_id=${lastId}`
      const res = await fetch(url, { headers: { 'xi-api-key': EL_KEY } })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        return NextResponse.json(
          {
            success: false,
            error: 'ElevenLabs sync unavailable',
            status: res.status,
            detail: elevenLabsErrorBody(res.status, body),
          },
          { status: res.status }
        )
      }
      const data = await res.json()
      const batch = data.history || []
      hasMore = data.has_more
      if (batch.length) lastId = batch[batch.length - 1].history_item_id
      pages++

      const rows = batch.map((item: any) => {
        const chars = Math.abs((item.character_count_change_to || 0) - (item.character_count_change_from || 0))
        const { category, story_title } = classify(item.text || '', chars)
        return {
          history_item_id: item.history_item_id,
          voice_name: item.voice_name || null,
          chars,
          category,
          story_title,
          date_utc: new Date(item.date_unix * 1000).toISOString().slice(0, 10),
          ts_utc: new Date(item.date_unix * 1000).toISOString(),
          cost_usd: +(chars / 1000 * 0.30).toFixed(4),
          raw_text: (item.text || '').slice(0, 200),
          synced_at: new Date().toISOString(),
        }
      })

      if (rows.length) {
        const { error } = await supabase.from('el_usage_log').upsert(rows, { onConflict: 'history_item_id' })
        if (!error) synced += rows.length
      }
    }

    return NextResponse.json({ success: true, ok: true, synced, pages })
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: 'ElevenLabs sync unavailable', status: 500, detail: e.message },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    // Summary stats
    const { data: byDay } = await supabase
      .from('el_usage_log')
      .select('date_utc, category, story_title, chars, cost_usd')
      .order('date_utc', { ascending: false })
      .limit(5000)

    const rows = byDay || []

    // Group by day
    const days: Record<string, any> = {}
    const stories: Record<string, any> = {}
    const categories: Record<string, any> = { news: 0, story: 0, production: 0, intro: 0, testing: 0 }

    for (const r of rows) {
      if (!days[r.date_utc]) days[r.date_utc] = { news: 0, story: 0, production: 0, intro: 0, testing: 0, total: 0, cost: 0 }
      days[r.date_utc][r.category] = (days[r.date_utc][r.category] || 0) + r.chars
      days[r.date_utc].total += r.chars
      days[r.date_utc].cost = +(days[r.date_utc].cost + r.cost_usd).toFixed(4)

      if (r.story_title) {
        if (!stories[r.story_title]) stories[r.story_title] = { chars: 0, cost: 0, calls: 0 }
        stories[r.story_title].chars += r.chars
        stories[r.story_title].cost = +(stories[r.story_title].cost + r.cost_usd).toFixed(4)
        stories[r.story_title].calls += 1
      }
      categories[r.category] = (categories[r.category] || 0) + r.chars
    }

    const totalChars = rows.reduce((s, r) => s + r.chars, 0)
    const totalCost = rows.reduce((s, r) => s + r.cost_usd, 0)

    return NextResponse.json({
      summary: { totalChars, totalCost: +totalCost.toFixed(2), totalCalls: rows.length },
      byDay: Object.entries(days).sort(([a],[b]) => b.localeCompare(a)).slice(0, 30).map(([date, v]) => ({ date, ...v })),
      byStory: Object.entries(stories).sort(([,a],[,b]) => b.cost - a.cost).map(([title, v]) => ({ title, ...v })),
      byCategory: Object.entries(categories).sort(([,a],[,b]) => b - a).map(([cat, chars]) => ({ cat, chars, cost: +(+chars/1000*0.30).toFixed(2) }))
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
