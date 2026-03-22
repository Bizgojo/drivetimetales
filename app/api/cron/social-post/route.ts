import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { CONTENT_CALENDAR } from '@/app/lib/content-calendar'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const LAUNCH_DATE = new Date('2026-04-17T12:00:00Z')

// OAuth 1.0a signing for X API
function oauthSign(method: string, url: string, params: Record<string, string>, secrets: { consumerSecret: string; tokenSecret: string }) {
  const oauthParams = {
    oauth_consumer_key: process.env.X_API_KEY!,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: process.env.X_ACCESS_TOKEN!,
    oauth_version: '1.0',
    ...params,
  }
  const sortedParams = Object.entries(oauthParams).sort(([a], [b]) => a.localeCompare(b))
  const paramStr = sortedParams.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  const baseStr = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramStr)}`
  const sigKey = `${encodeURIComponent(secrets.consumerSecret)}&${encodeURIComponent(secrets.tokenSecret)}`
  const sig = crypto.createHmac('sha1', sigKey).update(baseStr).digest('base64')
  const authParams = { ...oauthParams, oauth_signature: sig }
  const authHeader = 'OAuth ' + Object.entries(authParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
    .join(', ')
  return authHeader
}

async function postToX(text: string): Promise<{ id: string; text: string } | null> {
  const url = 'https://api.twitter.com/2/tweets'
  const authHeader = oauthSign('POST', url, {}, {
    consumerSecret: process.env.X_API_SECRET!,
    tokenSecret: process.env.X_ACCESS_TOKEN_SECRET!,
  })
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('[X Post] Error:', res.status, err)
    return null
  }
  const data = await res.json()
  return data.data
}

export async function POST(req: Request) {
  // Verify this is called from Vercel cron or our OpenClaw cron
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && authHeader !== `Bearer ${process.env.BROADCAST_SECRET}`) {
    // Allow if no secret is set (dev mode)
    if (process.env.CRON_SECRET || process.env.BROADCAST_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const now = new Date()
  const hour = now.getHours()
  const isEvening = hour >= 17
  const timeSlot = isEvening ? 'evening' : 'morning'

  // Calculate days to launch
  const msPerDay = 24 * 60 * 60 * 1000
  const daysToLaunch = Math.ceil((LAUNCH_DATE.getTime() - now.getTime()) / msPerDay)

  // Find today's post for this time slot
  const post = CONTENT_CALENDAR.find(p => p.dayOffset === daysToLaunch && p.timeSlot === timeSlot)

  if (!post) {
    console.log(`[Social Cron] No post scheduled for day offset ${daysToLaunch} / ${timeSlot}`)
    return NextResponse.json({ ok: true, message: 'No post scheduled for this slot' })
  }

  // Check if already posted today
  const today = now.toISOString().slice(0, 10)
  const { data: existing } = await supabase
    .from('social_posts')
    .select('id')
    .eq('content_id', post.id)
    .eq('platform', 'twitter')
    .single()

  if (existing) {
    return NextResponse.json({ ok: true, message: 'Already posted this content', contentId: post.id })
  }

  // Post to X
  const result = await postToX(post.text)

  if (!result) {
    return NextResponse.json({ ok: false, error: 'X posting failed' }, { status: 500 })
  }

  // Log to social_posts table
  await supabase.from('social_posts').insert({
    platform: 'twitter',
    content_id: post.id,
    content: post.text,
    theme: post.theme,
    time_slot: timeSlot,
    tweet_id: result.id,
    posted_at: now.toISOString(),
    status: 'posted',
  })

  console.log(`[Social Cron] ✅ Posted ${post.id} to X: ${result.id}`)
  return NextResponse.json({ ok: true, posted: true, contentId: post.id, tweetId: result.id, preview: post.text.slice(0, 100) })
}

// GET for manual trigger/status check
export async function GET() {
  const now = new Date()
  const msPerDay = 24 * 60 * 60 * 1000
  const daysToLaunch = Math.ceil((LAUNCH_DATE.getTime() - now.getTime()) / msPerDay)
  const todayPosts = CONTENT_CALENDAR.filter(p => p.dayOffset === daysToLaunch)
  const { data: posted } = await supabase.from('social_posts').select('content_id, posted_at, tweet_id').eq('platform', 'twitter').order('posted_at', { ascending: false }).limit(10)

  return NextResponse.json({
    daysToLaunch,
    todayScheduled: todayPosts.map(p => ({ id: p.id, slot: p.timeSlot, preview: p.text.slice(0, 80) })),
    recentlyPosted: posted || [],
  })
}
