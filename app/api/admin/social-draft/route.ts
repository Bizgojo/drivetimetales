/**
 * POST /api/admin/social-draft
 * 1. Searches Reddit for live threads matching the topic
 * 2. Uses Claude to draft a genuine reply for each thread
 *
 * Body: { topic: string, count: number, system: string }
 */
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

// Search these subreddits using Reddit's multi-sub search
const SUBREDDIT_MULTI = 'audiodrama+audiobooks+podcasts+storytelling+nosleep+shortstories+commuting+truckers+running+fitness+Mommit+SAHM+boredom'

async function searchReddit(topic: string, limit: number) {
  const url = `https://www.reddit.com/r/${SUBREDDIT_MULTI}/search.json?q=${encodeURIComponent(topic)}&restrict_sr=1&sort=hot&limit=${limit * 2}&t=month`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'EndlessTalesBot/1.0 (social media manager)' }
  })
  if (!res.ok) throw new Error(`Reddit search failed: ${res.status}`)
  const data = await res.json()
  const posts = data?.data?.children || []
  return posts
    .filter((p: {data: {stickied?: boolean}}) => !p.data.stickied)
    .slice(0, limit)
    .map((p: {data: {title: string, subreddit: string, selftext: string, permalink: string, score: number, num_comments: number}}) => ({
      title: p.data.title,
      subreddit: p.data.subreddit,
      body: p.data.selftext?.slice(0, 500) || '',
      url: `https://reddit.com${p.data.permalink}`,
      score: p.data.score,
      comments: p.data.num_comments,
    }))
}

async function draftReply(post: {title: string, subreddit: string, body: string, url: string}, system: string, platform: string) {
  const isTwitter = platform.toLowerCase().includes('x') || platform.toLowerCase().includes('twitter')
  const formatNote = isTwitter
    ? '- Format as an X/Twitter post: max 280 characters, punchy and engaging, can include relevant hashtags'
    : '- 2-4 sentences, conversational Reddit tone, no hashtags'

  const prompt = `You're ${isTwitter ? 'writing an X/Twitter post inspired by' : 'replying to'} this Reddit post in r/${post.subreddit}:

Title: "${post.title}"
${post.body ? `Post: "${post.body}"` : ''}

Write a genuine, helpful ${isTwitter ? 'tweet' : 'reply'} that adds real value. Rules:
- Endless Tales is NOT live yet — launching April 17, 2026. Never imply it's live.
- Do NOT mention specific app stories — only the 3 free sample stories on endless-tales.com if relevant: "When Rosie Came Home" (3 min), "The Grave He Dug Himself" (14 min western), "The Letters He Was Meant to Carry" (14 min uplifting)
- If you mention Endless Tales, say it's "launching April 17" and link to endless-tales.com
- Be helpful and community-first. Only mention ET if it fits naturally.
${formatNote}
Reply with ONLY the post text, nothing else.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

export async function POST(req: NextRequest) {
  try {
    const { topic, count = 3, system = '', platform = 'Reddit' } = await req.json()
    if (!topic) return NextResponse.json({ error: 'topic required' }, { status: 400 })

    // 1. Get real Reddit threads
    const posts = await searchReddit(topic, count)
    if (!posts.length) return NextResponse.json({ items: [] })

    // 2. Draft a reply for each
    const isTwitter = platform.toLowerCase().includes('x') || platform.toLowerCase().includes('twitter')
    const items = await Promise.all(posts.map(async (post: {title: string, subreddit: string, body: string, url: string}) => {
      const caption = await draftReply(post, system, platform)
      const campaign = `${isTwitter ? 'twitter' : 'reddit'}_${post.subreddit}_${Date.now()}`
      return {
        platform: isTwitter ? 'X/Twitter' : 'Reddit',
        post_type: isTwitter ? 'Original Post' : 'Reply',
        responding_to: `r/${post.subreddit}: ${post.title}`,
        thread_url: post.url,
        caption,
        utm_campaign: campaign,
      }
    }))

    return NextResponse.json({ items })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('social-draft error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
