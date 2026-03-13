'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const PLATFORMS = ['Instagram', 'TikTok', 'Facebook', 'X/Twitter', 'Reddit', 'Pinterest']
const POST_TYPES = ['Original Post', 'Reel', 'Story', 'Thread', 'Reply', 'Pin', 'Comment']

const PLATFORM_ICONS: Record<string, string> = {
  'Instagram': '📸', 'TikTok': '🎵', 'Facebook': '👤',
  'X/Twitter': '𝕏', 'Reddit': '🔴', 'Pinterest': '📌',
}

interface QueueItem {
  id: string
  platform: string
  post_type: string
  caption: string
  responding_to?: string
  thread_url?: string
  utm_campaign: string
  status: 'draft' | 'posted'
  utm_link?: string
}

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODk2MTIsImV4cCI6MjA4MTY2NTYxMn0.7asAd8ctLKJLdv2AojbF8WEo-N6dVheVA3mWxjkFwkk'

async function findAndDraft(topic: string, count: number, system: string, platform: string) {
  const res = await fetch('/api/admin/social-draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, count, system, platform }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'API error')
  return data.items || []
}

function makeUTMLink(platform: string, postType: string, campaign: string) {
  const source = platform.toLowerCase().replace('/', '_').replace(' ', '')
  const medium = postType.toLowerCase().replace(' ', '_')
  return `https://endless-tales.com?utm_source=${source}&utm_medium=${medium}&utm_campaign=${campaign}`
}

export default function SocialPostingPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'queue' | 'paste'>('queue')
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [searching, setSearching] = useState(false)
  const [searchPlatform, setSearchPlatform] = useState('Reddit')
  const [searchTopic, setSearchTopic] = useState('')
  const [postCount, setPostCount] = useState(3)
  const [pasteThread, setPasteThread] = useState('')
  const [pastePlatform, setPastePlatform] = useState('Reddit')
  const [pastePostType, setPastePostType] = useState('Reply')
  const [generatingReply, setGeneratingReply] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const bg = '#FAF9F6'
  const cardBg = '#FFFFFF'
  const textPrimary = '#1a1a1a'
  const textSecondary = '#4a4a4a'
  const border = '#e0e0e0'
  const ember = '#e8520a'

  // PRE-LAUNCH RULE (enforced until April 18, 2026):
  // NO posts about app stories. Only the 3 landing page stories + launch date + general audio drama content.
  const SYSTEM = `You are Hal, social media manager for Endless Tales — an audio drama app LAUNCHING APRIL 17, 2026. It is NOT live yet. $7.99/month, 14-day free trial, unlimited access.

⚠️ PRE-LAUNCH RULES — STRICTLY ENFORCED UNTIL APRIL 18, 2026:
- NEVER mention any stories from the Endless Tales app library — the app has NOT launched
- The ONLY Endless Tales stories you may ever reference are these 3 FREE sample stories on endless-tales.com:
    1. "When Rosie Came Home" — 3 min heartwarming story about a soldier's dog
    2. "The Grave He Dug Himself" — 14 min adventure western
    3. "The Letters He Was Meant to Carry" — 14 min uplifting drama about a bus driver delivering letters
- Always position Endless Tales as "launching April 17" or "coming April 17" — NEVER imply it is already live
- ALL links must go to endless-tales.com ONLY — never link to the app or any app page
- Be helpful, genuine, community-first. Add real value to the conversation first
- Only mention Endless Tales when it fits naturally — never be salesy or promotional
- Target audience: commuters, parents, fitness/active people, anyone who wants "me time"`

  async function searchAndGenerate() {
    if (!searchTopic.trim()) return
    setSearching(true)
    try {
      const items = await findAndDraft(searchTopic, postCount, SYSTEM, searchPlatform)
      const newItems: QueueItem[] = items.map((item: {platform: string, post_type: string, responding_to?: string, thread_url?: string, caption: string, utm_campaign: string}, i: number) => ({
        id: `${Date.now()}_${i}`,
        platform: item.platform || searchPlatform,
        post_type: item.post_type || 'Reply',
        caption: item.caption,
        responding_to: item.responding_to || undefined,
        thread_url: item.thread_url || undefined,
        utm_campaign: item.utm_campaign,
        status: 'draft',
        utm_link: makeUTMLink(item.platform || searchPlatform, item.post_type || 'Reply', item.utm_campaign),
      }))
      setQueue(q => [...newItems, ...q])
    } catch (e) {
      console.error(e)
    }
    setSearching(false)
  }

  async function generateReply() {
    if (!pasteThread.trim()) return
    setGeneratingReply(true)
    try {
      const prompt = `Here is a social media post/thread on ${pastePlatform}:\n\n${pasteThread}\n\nWrite a genuine ${pastePostType.toLowerCase()} that adds real value to this conversation and naturally mentions Endless Tales where it fits. Return ONLY the post text, nothing else.`
      const reply = await callClaude(prompt, SYSTEM)
      const campaign = `${pastePlatform.toLowerCase().replace('/', '_')}_paste_${Date.now()}`
      const newItem: QueueItem = {
        id: `paste_${Date.now()}`,
        platform: pastePlatform,
        post_type: pastePostType,
        caption: reply.trim(),
        responding_to: pasteThread.slice(0, 80) + (pasteThread.length > 80 ? '...' : ''),
        utm_campaign: campaign,
        status: 'draft',
        utm_link: makeUTMLink(pastePlatform, pastePostType, campaign),
      }
      setQueue(q => [newItem, ...q])
      setPasteThread('')
      setTab('queue')
    } catch (e) {
      console.error(e)
    }
    setGeneratingReply(false)
  }

  async function markPosted(item: QueueItem) {
    // Log to social_posts table
    await supabase.from('social_posts').insert({
      platform: item.platform,
      post_type: item.post_type,
      caption: item.caption,
      utm_campaign: item.utm_campaign,
      utm_medium: item.post_type.toLowerCase().replace(' ', '_'),
      posted_at: new Date().toISOString(),
      posted_by: 'hal',
    })
    // Copy UTM link
    if (item.utm_link) {
      navigator.clipboard.writeText(item.utm_link)
      setCopiedId(item.id)
      setTimeout(() => setCopiedId(null), 3000)
    }
    // Update status
    setQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'posted' } : i))
  }

  function removeFromQueue(id: string) {
    setQueue(q => q.filter(i => i.id !== id))
  }

  const drafted = queue.filter(i => i.status === 'draft').length
  const posted = queue.filter(i => i.status === 'posted').length

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, padding: '1rem' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => router.push('/admin')} style={{ backgroundColor: '#e5e5e5', color: textPrimary, padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 500 }}>← Back</button>
          <h1 style={{ color: textPrimary, fontSize: '24px', fontWeight: 'bold' }}>Social Posting</h1>
        </div>
        <button onClick={() => router.push('/admin/social-analytics')} style={{ backgroundColor: '#e5e5e5', color: textPrimary, padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 500 }}>📊 View Analytics →</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        {[{ label: 'In Queue', value: drafted, color: ember }, { label: 'Posted Today', value: posted, color: '#16a34a' }].map(s => (
          <div key={s.label} style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1rem 1.5rem', border: `1px solid ${border}` }}>
            <div style={{ color: textSecondary, fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</div>
            <div style={{ color: s.color, fontSize: '28px', fontWeight: 800 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {[{ key: 'queue', label: '🤖 Hal Finds Posts' }, { key: 'paste', label: '📋 Paste a Thread' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as 'queue' | 'paste')}
            style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '14px', backgroundColor: tab === t.key ? ember : '#e5e5e5', color: tab === t.key ? 'white' : textPrimary }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Hal Finds Posts */}
      {tab === 'queue' && (
        <>
          <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}`, marginBottom: '1.5rem' }}>
            <h2 style={{ color: textPrimary, fontSize: '16px', fontWeight: 'bold', marginBottom: '1rem' }}>Ask Hal to find posting opportunities</h2>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <select value={searchPlatform} onChange={e => setSearchPlatform(e.target.value)}
                style={{ padding: '0.65rem', borderRadius: '8px', border: `1px solid ${border}`, color: textPrimary, fontSize: '14px', backgroundColor: '#fff' }}>
                {PLATFORMS.map(p => <option key={p}>{p}</option>)}
              </select>
              <input type="text" value={searchTopic} onChange={e => setSearchTopic(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchAndGenerate()}
                placeholder="Topic, genre, audience... (e.g. audio dramas for commuters)"
                style={{ flex: 1, minWidth: '200px', padding: '0.65rem', borderRadius: '8px', border: `1px solid ${border}`, color: '#000000', backgroundColor: '#ffffff', fontSize: '14px' }} />
              <select value={postCount} onChange={e => setPostCount(Number(e.target.value))}
                style={{ padding: '0.65rem', borderRadius: '8px', border: `1px solid ${border}`, color: textPrimary, fontSize: '14px', backgroundColor: '#fff' }}>
                {[1,2,3,5].map(n => <option key={n} value={n}>{n} posts</option>)}
              </select>
              <button onClick={searchAndGenerate} disabled={searching || !searchTopic.trim()}
                style={{ padding: '0.65rem 1.5rem', borderRadius: '8px', border: 'none', cursor: searching || !searchTopic.trim() ? 'not-allowed' : 'pointer', fontWeight: 700, backgroundColor: searching || !searchTopic.trim() ? '#e5e5e5' : ember, color: searching || !searchTopic.trim() ? textSecondary : 'white' }}>
                {searching ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                    Searching Reddit...
                  </span>
                ) : '🔍 Find & Draft'}
              </button>
            </div>
          </div>

          {/* Queue */}
          {queue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: textSecondary, backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${border}` }}>
              <div style={{ fontSize: '48px', marginBottom: '1rem' }}>🤖</div>
              <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '0.5rem' }}>Queue is empty</div>
              <div style={{ fontSize: '14px' }}>Use the search above or paste a thread to generate posts.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {queue.map(item => (
                <div key={item.id} style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `2px solid ${item.status === 'posted' ? '#86efac' : border}`, opacity: item.status === 'posted' ? 0.7 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '20px' }}>{PLATFORM_ICONS[item.platform] || '🌐'}</span>
                      <span style={{ color: textPrimary, fontWeight: 700 }}>{item.platform}</span>
                      <span style={{ backgroundColor: '#f5f5f5', color: textSecondary, padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '12px' }}>{item.post_type}</span>
                      {item.status === 'posted' && <span style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '12px', fontWeight: 700 }}>✓ Posted</span>}
                    </div>
                    <button onClick={() => removeFromQueue(item.id)} style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: textSecondary, fontSize: '18px' }}>×</button>
                  </div>

                  {item.responding_to && (
                    <div style={{ backgroundColor: '#f5f5f5', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '12px', color: textSecondary, marginBottom: '0.75rem' }}>
                      <strong>Responding to:</strong> {item.thread_url
                        ? <a href={item.thread_url} target="_blank" rel="noreferrer" style={{ color: '#f97316', marginLeft: '4px' }}>{item.responding_to} ↗</a>
                        : ` ${item.responding_to}`}
                    </div>
                  )}

                  {editingId === item.id ? (
                    <textarea
                      value={item.caption}
                      onChange={e => setQueue(q => q.map(i => i.id === item.id ? { ...i, caption: e.target.value } : i))}
                      rows={5}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: `1px solid ${border}`, color: textPrimary, fontSize: '14px', resize: 'vertical', marginBottom: '0.75rem', boxSizing: 'border-box' }}
                    />
                  ) : (
                    <p style={{ color: textPrimary, fontSize: '14px', lineHeight: 1.6, marginBottom: '0.75rem', whiteSpace: 'pre-wrap' }}>{item.caption}</p>
                  )}

                  {item.status === 'draft' && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                        style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: '#f5f5f5', color: textPrimary, cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
                        {editingId === item.id ? 'Done Editing' : '✏️ Edit'}
                      </button>
                      <button onClick={() => { navigator.clipboard.writeText(item.caption); setCopiedId(item.id + '_copy'); setTimeout(() => setCopiedId(null), 2000) }}
                        style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: '#f5f5f5', color: textPrimary, cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
                        {copiedId === item.id + '_copy' ? '✓ Copied!' : '📋 Copy Caption'}
                      </button>
                      <button onClick={() => markPosted(item)}
                        style={{ flex: 1, padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', backgroundColor: ember, color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
                        {copiedId === item.id ? '✓ Logged + UTM Copied!' : '✅ Mark Posted + Copy UTM Link'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tab: Paste a Thread */}
      {tab === 'paste' && (
        <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.5rem', border: `1px solid ${border}` }}>
          <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 'bold', marginBottom: '0.5rem' }}>Paste a post or thread</h2>
          <p style={{ color: textSecondary, fontSize: '14px', marginBottom: '1.25rem' }}>Copy a post from Reddit, X, etc. and Hal will write a genuine reply that fits naturally.</p>

          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
            <select value={pastePlatform} onChange={e => setPastePlatform(e.target.value)}
              style={{ padding: '0.65rem', borderRadius: '8px', border: `1px solid ${border}`, color: textPrimary, fontSize: '14px', backgroundColor: '#fff' }}>
              {PLATFORMS.map(p => <option key={p}>{p}</option>)}
            </select>
            <select value={pastePostType} onChange={e => setPastePostType(e.target.value)}
              style={{ padding: '0.65rem', borderRadius: '8px', border: `1px solid ${border}`, color: textPrimary, fontSize: '14px', backgroundColor: '#fff' }}>
              {POST_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <textarea
            value={pasteThread}
            onChange={e => setPasteThread(e.target.value)}
            rows={8}
            placeholder="Paste the thread, post, or conversation here..."
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: `1px solid ${border}`, color: textPrimary, fontSize: '14px', resize: 'vertical', marginBottom: '1rem', boxSizing: 'border-box' }}
          />

          <button onClick={generateReply} disabled={generatingReply || !pasteThread.trim()}
            style={{ width: '100%', padding: '0.85rem', borderRadius: '8px', border: 'none', cursor: generatingReply || !pasteThread.trim() ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '15px', backgroundColor: generatingReply || !pasteThread.trim() ? '#e5e5e5' : ember, color: generatingReply || !pasteThread.trim() ? textSecondary : 'white' }}>
            {generatingReply ? 'Hal is writing...' : '🤖 Generate Reply with Hal'}
          </button>
        </div>
      )}
    </div>
  )
}
