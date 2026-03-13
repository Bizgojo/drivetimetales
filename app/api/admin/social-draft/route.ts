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

async function searchReddit(topic: string, limit: number) {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(topic)}&sort=hot&limit=${limit * 2}&t=week`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'EndlessTalesBot/1.0 (social media manager)' }
  })
  if (!res.ok) throw new Error(`Reddit search failed: ${res.status}`)
  const data = await res.json()
  const posts = data?.data?.children || []
  return posts
    .filter((p: {data: {stickied?: boolean, is_self?: boolean}}) => !p.data.stickied)
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

async function draftReply(post: {title: string, subreddit: string, body: string, url: string}, system: string) {
  const prompt = `You're replying to this Reddit post in r/${post.subreddit}:

Title: "${post.title}"
${post.body ? `Post: "${post.body}"` : ''}

Write a genuine, helpful reply that adds real value to this conversation. Only mention Endless Tales if it fits naturally — never be promotional or spammy. Keep it 2-4 sentences, conversational Reddit tone. Reply with ONLY the reply text, nothing else.`

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
    const { topic, count = 3, system = '' } = await req.json()
    if (!topic) return NextResponse.json({ error: 'topic required' }, { status: 400 })

    // 1. Get real Reddit threads
    const posts = await searchReddit(topic, count)
    if (!posts.length) return NextResponse.json({ items: [] })

    // 2. Draft a reply for each
    const items = await Promise.all(posts.map(async (post: {title: string, subreddit: string, body: string, url: string}) => {
      const caption = await draftReply(post, system)
      const campaign = `reddit_${post.subreddit}_${Date.now()}`
      return {
        platform: 'Reddit',
        post_type: 'Reply',
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
