'use client'

import { useState, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PostItem {
  id: string
  platform: string
  post_type: string
  caption: string
  responding_to?: string
  thread_url?: string
  status: 'pending' | 'done' | 'skipped'
  copied?: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_ICON: Record<string, string> = {
  Reddit: '🔴',
  'X/Twitter': '𝕏',
  Facebook: '👤',
}

const PLATFORM_COLOR: Record<string, string> = {
  Reddit: '#ff4500',
  'X/Twitter': '#000000',
  Facebook: '#1877f2',
}

const TODAY_KEY = () => `social_hub_${new Date().toISOString().slice(0, 10)}`

// ─── Component ────────────────────────────────────────────────────────────────

export default function SocialPostingPage() {
  const [items, setItems] = useState<PostItem[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [lastGenerated, setLastGenerated] = useState<string | null>(null)
  const [redditError, setRedditError] = useState<string | null>(null)

  // Load today's queue from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(TODAY_KEY())
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setItems(parsed.items || [])
        setLastGenerated(parsed.generatedAt || null)
      } catch {}
    }
  }, [])

  // Save to localStorage whenever items change
  useEffect(() => {
    if (items.length === 0) return
    const saved = localStorage.getItem(TODAY_KEY())
    const generatedAt = saved ? JSON.parse(saved).generatedAt : lastGenerated
    localStorage.setItem(TODAY_KEY(), JSON.stringify({ items, generatedAt }))
  }, [items, lastGenerated])

  const systemPrompt = `You are the social media voice for Endless Tales — an audio storytelling app launching April 17, 2026. 
Your tone is genuine, community-first, never salesy. You sound like a real person who loves audio stories.
PRE-LAUNCH RULES (enforced until April 18, 2026):
- Never mention any in-app stories — the app is NOT live yet
- Only reference these 3 free landing page stories if relevant: "When Rosie Came Home" (3 min), "The Grave He Dug Himself" (14 min western), "The Letters He Was Meant to Carry" (14 min uplifting)
- Always position as "launching April 17" — never imply it's live
- All links go to endless-tales.com ONLY`

  async function generatePosts() {
    setLoading(true)
    setRedditError(null)
    const newItems: PostItem[] = []

    try {
      // 1. Reddit replies — loaded from Supabase (pre-populated by local 8 AM cron on Mac)
      const today = new Date().toISOString().slice(0, 10)
      const redditRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/social_posts?queue_date=eq.${today}&platform=eq.Reddit&order=created_at.asc`,
        { headers: { 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}` } }
      )
      const redditPosts = await redditRes.json()
      if (!Array.isArray(redditPosts) || redditPosts.length === 0) {
        setRedditError("No Reddit posts yet for today — the daily cron runs at 8 AM. You can also run it manually from your Mac.")
      }
      for (const p of (Array.isArray(redditPosts) ? redditPosts : [])) {
        newItems.push({
          id: p.id,
          platform: 'Reddit',
          post_type: p.post_type || 'Reply',
          caption: p.caption,
          responding_to: p.responding_to,
          thread_url: p.thread_url,
          status: (p.status === 'pending' ? 'pending' : p.status) as 'pending' | 'done' | 'skipped',
        })
      }

      // 2. X/Twitter posts (3)
      const xRes = await fetch('/api/admin/social-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'audio stories Endless Tales launch April 17', count: 3, system: systemPrompt, platform: 'X/Twitter' }),
      })
      const xData = await xRes.json()
      for (const item of (xData.items || [])) {
        newItems.push({ ...item, id: crypto.randomUUID(), status: 'pending' })
      }

      // 3. Facebook posts (2)
      const fbRes = await fetch('/api/admin/social-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'audio stories Endless Tales launch April 17', count: 2, system: systemPrompt, platform: 'Facebook' }),
      })
      const fbData = await fbRes.json()
      for (const item of (fbData.items || [])) {
        newItems.push({ ...item, id: crypto.randomUUID(), status: 'pending' })
      }

    } catch (err) {
      console.error('Generate error:', err)
    }

    const generatedAt = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    setItems(newItems)
    setLastGenerated(generatedAt)
    localStorage.setItem(TODAY_KEY(), JSON.stringify({ items: newItems, generatedAt }))
    setLoading(false)
  }

  function markDone(id: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'done' } : i))
  }

  function markSkipped(id: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'skipped' } : i))
  }

  function startEdit(item: PostItem) {
    setEditingId(item.id)
    setEditText(item.caption)
  }

  function saveEdit(id: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, caption: editText } : i))
    setEditingId(null)
  }

  async function copyToClipboard(id: string, text: string) {
    await navigator.clipboard.writeText(text)
    setItems(prev => prev.map(i => i.id === id ? { ...i, copied: true } : i))
    setTimeout(() => setItems(prev => prev.map(i => i.id === id ? { ...i, copied: false } : i)), 2000)
  }

  const pending = items.filter(i => i.status === 'pending')
  const done = items.filter(i => i.status === 'done')
  const skipped = items.filter(i => i.status === 'skipped')

  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111', margin: 0 }}>
          🌅 Morning Social Hub
        </h1>
        <p style={{ color: '#666', marginTop: '4px', fontSize: '14px' }}>{todayStr}</p>
      </div>

      {/* Generate Button */}
      <div style={{ 
        background: 'white', 
        border: '1px solid #e5e7eb', 
        borderRadius: '12px', 
        padding: '20px',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <p style={{ fontWeight: 600, color: '#111', margin: 0, fontSize: '15px' }}>
            {items.length === 0 ? "Ready to generate today's posts" : `${pending.length} pending · ${done.length} done · ${skipped.length} skipped`}
          </p>
          {lastGenerated && (
            <p style={{ color: '#888', fontSize: '13px', margin: '2px 0 0' }}>
              Generated at {lastGenerated} · {items.length} total posts across Reddit, X, Facebook
            </p>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <button
            onClick={() => {
              if (items.length > 0 && !window.confirm("This will replace today's queue with a fresh batch. Posts you've already marked done will be cleared. Continue?")) return
              generatePosts()
            }}
            disabled={loading}
            style={{
              background: loading ? '#9ca3af' : '#111',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? '⏳ Generating...' : items.length === 0 ? '⚡ Generate Today\'s Posts' : '🔄 Replace with New Batch'}
          </button>
          {items.length > 0 && !loading && (
            <span style={{ fontSize: '11px', color: '#9ca3af' }}>Only regenerate if drafts look bad</span>
          )}
        </div>
      </div>

      {/* Reddit error banner */}
      {redditError && !loading && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#c2410c' }}>
          ⚠️ <strong>Reddit:</strong> {redditError}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#888' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
          <p style={{ margin: 0, fontWeight: 500 }}>Searching Reddit + drafting posts...</p>
          <p style={{ margin: '4px 0 0', fontSize: '13px' }}>Usually takes 15–30 seconds</p>
        </div>
      )}

      {/* Pending Posts */}
      {!loading && pending.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#111', marginBottom: '12px' }}>
            📋 To Do ({pending.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {pending.map(item => (
              <PostCard
                key={item.id}
                item={item}
                editingId={editingId}
                editText={editText}
                onEdit={startEdit}
                onEditChange={setEditText}
                onSaveEdit={saveEdit}
                onCancelEdit={() => setEditingId(null)}
                onCopy={copyToClipboard}
                onDone={markDone}
                onSkip={markSkipped}
              />
            ))}
          </div>
        </div>
      )}

      {/* Done Posts */}
      {!loading && done.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#22c55e', marginBottom: '12px' }}>
            ✅ Done ({done.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {done.map(item => (
              <div key={item.id} style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <span style={{ fontSize: '18px' }}>{PLATFORM_ICON[item.platform] || '🌐'}</span>
                  <span style={{ fontSize: '13px', color: '#166534', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.responding_to || item.caption.slice(0, 60) + '...'}
                  </span>
                </div>
                <button onClick={() => setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'pending' } : i))}
                  style={{ background: 'none', border: 'none', color: '#888', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  ↩ Undo
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skipped Posts */}
      {!loading && skipped.length > 0 && (
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#9ca3af', marginBottom: '12px' }}>
            ⏭ Skipped ({skipped.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {skipped.map(item => (
              <div key={item.id} style={{
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                opacity: 0.6
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <span style={{ fontSize: '18px' }}>{PLATFORM_ICON[item.platform] || '🌐'}</span>
                  <span style={{ fontSize: '13px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.responding_to || item.caption.slice(0, 60) + '...'}
                  </span>
                </div>
                <button onClick={() => setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'pending' } : i))}
                  style={{ background: 'none', border: 'none', color: '#888', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  ↩ Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '64px 24px', color: '#9ca3af' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌅</div>
          <p style={{ fontWeight: 600, fontSize: '16px', color: '#374151', margin: '0 0 8px' }}>Good morning!</p>
          <p style={{ margin: 0, fontSize: '14px' }}>Hit Generate to get today's Reddit replies, tweets, and Facebook posts — all in one place.</p>
        </div>
      )}

      {/* All done state */}
      {!loading && items.length > 0 && pending.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: '32px', 
          background: '#f0fdf4', 
          borderRadius: '12px',
          border: '1px solid #bbf7d0',
          marginTop: '16px'
        }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎉</div>
          <p style={{ fontWeight: 700, fontSize: '16px', color: '#166534', margin: '0 0 4px' }}>You're done for today!</p>
          <p style={{ margin: 0, fontSize: '13px', color: '#15803d' }}>All social posts handled. Go build the app.</p>
        </div>
      )}
    </div>
  )
}

// ─── Post Card ─────────────────────────────────────────────────────────────────

function PostCard({ item, editingId, editText, onEdit, onEditChange, onSaveEdit, onCancelEdit, onCopy, onDone, onSkip }: {
  item: PostItem
  editingId: string | null
  editText: string
  onEdit: (item: PostItem) => void
  onEditChange: (text: string) => void
  onSaveEdit: (id: string) => void
  onCancelEdit: () => void
  onCopy: (id: string, text: string) => void
  onDone: (id: string) => void
  onSkip: (id: string) => void
}) {
  const isEditing = editingId === item.id
  const color = PLATFORM_COLOR[item.platform] || '#374151'
  const icon = PLATFORM_ICON[item.platform] || '🌐'
  const isReddit = item.platform === 'Reddit'

  return (
    <div style={{
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      {/* Card header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #f3f4f6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ fontSize: '20px' }}>{icon}</span>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontWeight: 700, color, fontSize: '13px' }}>{item.platform}</span>
            {item.post_type && (
              <span style={{ color: '#9ca3af', fontSize: '12px', marginLeft: '6px' }}>· {item.post_type}</span>
            )}
            {item.responding_to && (
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                ↳ {item.responding_to}
              </div>
            )}
          </div>
        </div>
        {item.thread_url && (
          <a
            href={item.thread_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '12px', color: '#f97316', textDecoration: 'none', whiteSpace: 'nowrap', fontWeight: 500 }}
          >
            Open Thread ↗
          </a>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '16px' }}>
        {isEditing ? (
          <div>
            <textarea
              value={editText}
              onChange={e => onEditChange(e.target.value)}
              rows={5}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                lineHeight: '1.5',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                color: '#111',
              }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button onClick={() => onSaveEdit(item.id)} style={btnStyle('#111', 'white')}>Save</button>
              <button onClick={onCancelEdit} style={btnStyle('#f3f4f6', '#374151')}>Cancel</button>
            </div>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.6', color: '#111', whiteSpace: 'pre-wrap' }}>
            {item.caption}
          </p>
        )}
      </div>

      {/* Actions */}
      {!isEditing && (
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #f3f4f6',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
        }}>
          {isReddit ? (
            // Reddit: copy reply + mark done
            <>
              <button
                onClick={() => { onCopy(item.id, item.caption); onDone(item.id) }}
                style={btnStyle('#16a34a', 'white')}
              >
                {item.copied ? '✅ Copied!' : '📋 Copy & Mark Done'}
              </button>
              <button onClick={() => onEdit(item)} style={btnStyle('#f3f4f6', '#374151')}>✏️ Edit</button>
              <button onClick={() => onSkip(item.id)} style={btnStyle('#f3f4f6', '#9ca3af')}>Skip</button>
            </>
          ) : (
            // X / Facebook: copy text + mark done
            <>
              <button
                onClick={() => { onCopy(item.id, item.caption); onDone(item.id) }}
                style={btnStyle('#111', 'white')}
              >
                {item.copied ? '✅ Copied!' : '📋 Copy & Mark Done'}
              </button>
              <button onClick={() => onEdit(item)} style={btnStyle('#f3f4f6', '#374151')}>✏️ Edit</button>
              <button onClick={() => onSkip(item.id)} style={btnStyle('#f3f4f6', '#9ca3af')}>Skip</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function btnStyle(bg: string, color: string) {
  return {
    background: bg,
    color,
    border: 'none',
    borderRadius: '7px',
    padding: '7px 14px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties
}
