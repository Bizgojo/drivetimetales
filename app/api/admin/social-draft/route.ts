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

// Try multiple subreddits individually as fallback (more reliable than multi-search from server IPs)
const TARGET_SUBREDDITS = ['audiodrama', 'Truckers', 'commuting', 'audiobooks', 'podcasts', 'running', 'Mommit']

async function searchReddit(topic: string, limit: number) {
  // Try multi-search first
  const multiUrl = `https://www.reddit.com/r/${SUBREDDIT_MULTI}/search.json?q=${encodeURIComponent(topic)}&restrict_sr=1&sort=hot&limit=${limit * 2}&t=month`
  try {
    const res = await fetch(multiUrl, {
      headers: { 'User-Agent': 'EndlessTalesBot/1.0 by /u/EndlessTalesAudio' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = await res.json()
      const posts = data?.data?.children || []
      if (posts.length > 0) {
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
    }
  } catch { /* fall through to individual sub approach */ }

  // Fallback: fetch hot posts from individual subreddits
  const allPosts: {title: string, subreddit: string, body: string, url: string, score: number, comments: number}[] = []
  for (const sub of TARGET_SUBREDDITS.slice(0, 4)) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=5`, {
        headers: { 'User-Agent': 'EndlessTalesBot/1.0 by /u/EndlessTalesAudio' },
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) continue
      const data = await res.json()
      const posts = data?.data?.children || []
      for (const p of posts.filter((p: {data: {stickied?: boolean}}) => !p.data.stickied).slice(0, 2)) {
        allPosts.push({
          title: p.data.title,
          subreddit: p.data.subreddit,
          body: p.data.selftext?.slice(0, 500) || '',
          url: `https://reddit.com${p.data.permalink}`,
          score: p.data.score,
          comments: p.data.num_comments,
        })
      }
    } catch { continue }
  }
  return allPosts.slice(0, limit)
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
⚠️ PRE-LAUNCH RULES (enforced until April 18, 2026):
- NEVER mention any Endless Tales app stories — app has NOT launched yet
- ONLY reference these 3 free landing page stories if relevant: "When Rosie Came Home" (3 min), "The Grave He Dug Himself" (14 min western), "The Letters He Was Meant to Carry" (14 min uplifting)
- Always say Endless Tales is "launching April 17" — NEVER imply it's live
- Links MUST go to endless-tales.com ONLY
- Community-first, genuine, helpful. Only mention ET when it fits naturally.
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
  const log = await import('@/app/lib/anthropic-logger').then(m => m.logAnthropicCall).catch(() => null)
  if (log) log({ route: '/api/admin/social-draft', purpose: 'reddit-reply-draft', model: 'claude-haiku-4-5', inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 }).catch(() => {})
  return data.content?.[0]?.text || ''
}

const REDDIT_PLATFORMS = ['reddit']
const SEARCH_PLATFORMS = [...REDDIT_PLATFORMS] // only Reddit has a public search API

async function draftOriginalPost(topic: string, system: string, platform: string, index: number) {
  const platformGuide: Record<string, string> = {
    facebook: 'Write a Facebook post: conversational, 2-4 sentences, no hashtags, warm and personal tone. Can be slightly longer than a tweet. End with a soft call to action or question to drive engagement.',
    'x/twitter': 'Write an X/Twitter post: max 280 characters, punchy, hook in first line. Can use 1-2 relevant hashtags.',
    instagram: 'Write an Instagram caption: engaging opener, 3-5 sentences, storytelling tone, 3-5 relevant hashtags at the end.',
    tiktok: 'Write a TikTok video caption: very short (1-2 sentences), energetic, hook-first. Include 3-4 trending hashtags.',
    linkedin: 'Write a LinkedIn post: professional but personal, 3-5 sentences, insight or story-driven, no hashtags.',
  }
  const key = platform.toLowerCase().replace('/', '')
  const formatNote = platformGuide[key] || `Write a ${platform} post: engaging, 2-4 sentences, appropriate tone for the platform.`

  const angles = [
    'the free listening experience — no signup, just listen',
    'the April 17 launch date and what to expect',
    'the emotional appeal of short audio stories for busy people',
    'the 3 free stories available now on endless-tales.com',
    'audio stories as "me time" for commuters, parents, or fitness routines',
  ]
  const angle = angles[index % angles.length]

  const prompt = `Draft a ${platform} post about: "${topic}"
Angle to focus on: ${angle}

⚠️ PRE-LAUNCH RULES:
- Endless Tales is NOT live yet — launching April 17, 2026
- ONLY reference these 3 free stories if mentioning stories: "When Rosie Came Home" (3 min), "The Grave He Dug Himself" (14 min western), "The Letters He Was Meant to Carry" (14 min uplifting)
- Link to endless-tales.com ONLY
- Never imply the app is live
- Community-first, genuine — never salesy

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
  const log = await import('@/app/lib/anthropic-logger').then(m => m.logAnthropicCall).catch(() => null)
  if (log) log({ route: '/api/admin/social-draft', purpose: 'social-original-post-draft', model: 'claude-haiku-4-5', inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 }).catch(() => {})
  return data.content?.[0]?.text || ''
}

export async function POST(req: NextRequest) {
  try {
    const { topic, count = 3, system = '', platform = 'Reddit', _raw_prompt, posts: prefetchedPosts } = await req.json()

    // Handle original Reddit post drafts (not replies — standalone posts Marc submits to subreddits)
    if (platform === 'reddit-original') {
      const ORIGINAL_SUBREDDITS = ['r/audiodrama', 'r/storytelling', 'r/audiobooks', 'r/podcasts']
      const indices = Array.from({ length: count }, (_, i) => i)
      const items = await Promise.all(indices.map(async (i) => {
        const sub = ORIGINAL_SUBREDDITS[i % ORIGINAL_SUBREDDITS.length]
        const angles = [
          'share the 3 free stories available now on endless-tales.com and invite feedback',
          'talk about the April 17 launch and what makes Endless Tales different from audiobooks',
          'ask the community what kinds of audio stories they want to hear more of',
          'share a behind-the-scenes look at building an audio drama platform',
        ]
        const angle = angles[i % angles.length]
        const prompt = `Write an original Reddit post for ${sub} from the perspective of someone building Endless Tales (an audio drama platform launching April 17, 2026).
Angle: ${angle}

Rules:
- Sound like a real creator, not a marketer
- Community-first, genuine, adds value to the subreddit
- Pre-launch only — never imply it's live
- Only reference these 3 free stories if mentioning stories: "When Rosie Came Home" (3 min), "The Grave He Dug Himself" (14 min western), "The Letters He Was Meant to Carry" (14 min uplifting)
- Link to endless-tales.com only
- Include a suggested post title on the first line starting with TITLE: then a blank line, then the post body

Reply with ONLY the post (title line + body), nothing else.`
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 400, system, messages: [{ role: 'user', content: prompt }] }),
        })
        const data = await res.json()
        const text = data.content?.[0]?.text || ''
        return { platform: 'Reddit Post', post_type: 'Original Post', caption: text, responding_to: `Post to ${sub}`, utm_campaign: `reddit_original_${Date.now()}_${i}` }
      }))
      return NextResponse.json({ items })
    }

    // Handle pre-fetched Reddit posts (browser fetched, server just drafts)
    if (platform === 'reddit-prefetched' && Array.isArray(prefetchedPosts)) {
      const items = await Promise.all(prefetchedPosts.slice(0, count).map(async (post: {title: string, subreddit: string, body: string, url: string}) => {
        const caption = await draftReply(post, system, 'reddit')
        return {
          platform: 'Reddit',
          post_type: 'Reply',
          responding_to: `r/${post.subreddit}: ${post.title}`,
          thread_url: post.url,
          caption,
        }
      }))
      return NextResponse.json({ items })
    }
    if (!topic) return NextResponse.json({ error: 'topic required' }, { status: 400 })

    // Handle raw paste prompt (from Paste a Thread tab)
    if (platform === 'paste' && _raw_prompt) {
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
          messages: [{ role: 'user', content: _raw_prompt }],
        }),
      })
      const data = await res.json()
      const caption = data.content?.[0]?.text || ''
      return NextResponse.json({ items: [{ platform: 'Reddit', post_type: 'Reply', caption, utm_campaign: `paste_${Date.now()}` }] })
    }

    const isReddit = SEARCH_PLATFORMS.includes(platform.toLowerCase())

    if (isReddit) {
      // Search real Reddit threads and draft replies
      const posts = await searchReddit(topic, count)
      if (!posts.length) return NextResponse.json({ items: [] })

      const items = await Promise.all(posts.map(async (post: {title: string, subreddit: string, body: string, url: string}) => {
        const caption = await draftReply(post, system, platform)
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

    } else {
      // For Facebook, X, Instagram, TikTok, LinkedIn — draft original posts
      const indices = Array.from({ length: count }, (_, i) => i)
      const items = await Promise.all(indices.map(async (i) => {
        const caption = await draftOriginalPost(topic, system, platform, i)
        const campaign = `${platform.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}_${i}`
        return {
          platform,
          post_type: 'Original Post',
          responding_to: undefined,
          thread_url: undefined,
          caption,
          utm_campaign: campaign,
        }
      }))
      return NextResponse.json({ items })
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('social-draft error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
