'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface SocialPost {
  id: string
  created_at: string
  platform: string
  post_type: string | null
  caption: string | null
  utm_campaign: string | null
  utm_medium: string | null
  posted_at: string | null
  posted_by: string | null
}

interface WaitlistEntry {
  source: string | null
  medium: string | null
  campaign: string | null
  created_at: string
}

interface UtmVisit {
  source: string | null
  medium: string | null
  campaign: string | null
  visited_at: string
}

const PLATFORMS = ['Instagram', 'TikTok', 'Facebook', 'X/Twitter', 'Reddit', 'Pinterest']
const POST_TYPES = ['Reel', 'Story', 'Post', 'Thread', 'Pin', 'Comment', 'Ad']

const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E4405F',
  tiktok: '#000000',
  facebook: '#1877F2',
  'x/twitter': '#000000',
  reddit: '#FF4500',
  pinterest: '#E60023',
}

const PLATFORM_ICONS: Record<string, string> = {
  instagram: '📸',
  tiktok: '🎵',
  facebook: '👤',
  'x/twitter': '𝕏',
  reddit: '🔴',
  pinterest: '📌',
}

export default function AdminSocialAnalyticsPage() {
  const router = useRouter()
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [signups, setSignups] = useState<WaitlistEntry[]>([])
  const [visits, setVisits] = useState<UtmVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    platform: '',
    post_type: '',
    caption: '',
    utm_campaign: '',
    utm_medium: '',
    posted_at: new Date().toISOString().slice(0, 16),
  })

  const bg = '#FAF9F6'
  const cardBg = '#FFFFFF'
  const textPrimary = '#1a1a1a'
  const textSecondary = '#4a4a4a'
  const border = '#e0e0e0'
  const ember = '#e8520a'

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: postsData }, { data: signupsData }, { data: visitsData }] = await Promise.all([
      supabase.from('social_posts').select('*').order('posted_at', { ascending: false }),
      supabase.from('waitlist').select('source, medium, campaign, created_at').order('created_at', { ascending: false }),
      supabase.from('utm_visits').select('source, medium, campaign, visited_at').order('visited_at', { ascending: false })
    ])
    if (postsData) setPosts(postsData)
    if (signupsData) setSignups(signupsData)
    if (visitsData) setVisits(visitsData)
    setLoading(false)
  }

  async function savePost() {
    if (!form.platform) return
    setSaving(true)
    const utm_campaign = form.utm_campaign || `${form.platform.toLowerCase().replace('/', '_')}_${Date.now()}`
    await supabase.from('social_posts').insert({
      platform: form.platform,
      post_type: form.post_type || null,
      caption: form.caption || null,
      utm_campaign,
      utm_medium: form.utm_medium || form.post_type?.toLowerCase() || null,
      posted_at: form.posted_at ? new Date(form.posted_at).toISOString() : new Date().toISOString(),
    })
    setForm({ platform: '', post_type: '', caption: '', utm_campaign: '', utm_medium: '', posted_at: new Date().toISOString().slice(0, 16) })
    setShowForm(false)
    setSaving(false)
    fetchData()
  }

  function signupsForPost(post: SocialPost) {
    return signups.filter(s => s.campaign === post.utm_campaign).length
  }

  function visitsForPost(post: SocialPost) {
    return visits.filter(v => v.campaign === post.utm_campaign).length
  }

  function visitsForPlatform(platform: string) {
    return visits.filter(v => v.source?.toLowerCase() === platform.toLowerCase()).length
  }

  function signupsForPlatform(platform: string) {
    return signups.filter(s => s.source?.toLowerCase() === platform.toLowerCase()).length
  }

  function conversionRate(v: number, s: number) {
    if (!v) return '—'
    return `${Math.round((s / v) * 100)}%`
  }

  function utmLink(post: SocialPost) {
    const base = 'https://endless-tales.com'
    const params = new URLSearchParams()
    params.set('utm_source', post.platform.toLowerCase().replace('/', '_'))
    if (post.utm_medium) params.set('utm_medium', post.utm_medium)
    if (post.utm_campaign) params.set('utm_campaign', post.utm_campaign)
    return `${base}?${params.toString()}`
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Platform summary stats
  const platformStats = PLATFORMS.map(p => ({
    platform: p,
    posts: posts.filter(post => post.platform.toLowerCase() === p.toLowerCase()).length,
    visits: visitsForPlatform(p),
    signups: signupsForPlatform(p),
  })).filter(s => s.posts > 0 || s.visits > 0 || s.signups > 0)

  const totalVisits = visits.length
  const totalSignups = signups.length

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: `4px solid ${ember}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, padding: '1rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => router.push('/admin')} style={{ backgroundColor: '#e5e5e5', color: textPrimary, padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 500 }}>← Back</button>
          <h1 style={{ color: textPrimary, fontSize: '24px', fontWeight: 'bold' }}>Social Analytics</h1>
        </div>
        <button onClick={() => setShowForm(true)} style={{ backgroundColor: ember, color: 'white', padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '15px' }}>+ Log Post</button>
      </div>

      {/* How It Works */}
      <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: textPrimary, fontSize: '16px', fontWeight: 'bold', marginBottom: '1rem' }}>📖 How This Works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
          {[
            { step: '1', title: 'Hal recommends a post', desc: 'Go to Social Posting and ask Hal for a post idea. Copy the caption.' },
            { step: '2', title: 'Post it on social media', desc: 'Paste the caption into Instagram, TikTok, Reddit, etc. and publish it.' },
            { step: '3', title: 'Log it here', desc: 'Click the Log Post button, pick the platform, paste the caption, and save to get a tracking link.' },
            { step: '4', title: 'Add the tracking link', desc: 'Put the UTM link in your bio or post. Every signup from that link gets credited to that post.' },
            { step: '5', title: 'Watch the results', desc: 'The dashboard shows which platforms and post types bring in the most waitlist signups.' },
          ].map(({ step, title, desc }) => (
            <div key={step} style={{ display: 'flex', gap: '0.75rem' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: ember, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px', flexShrink: 0 }}>{step}</div>
              <div>
                <div style={{ color: textPrimary, fontWeight: 700, fontSize: '13px', marginBottom: '0.2rem' }}>{title}</div>
                <div style={{ color: textSecondary, fontSize: '12px', lineHeight: 1.5 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Totals Banner */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Total Landing Page Visits', value: totalVisits, color: '#2563eb' },
          { label: 'Total Signups', value: totalSignups, color: '#16a34a' },
          { label: 'Overall Conversion', value: conversionRate(totalVisits, totalSignups), color: ember },
        ].map(s => (
          <div key={s.label} style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1rem 1.5rem', border: `1px solid ${border}`, flex: 1, minWidth: '140px' }}>
            <div style={{ color: textSecondary, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>{s.label}</div>
            <div style={{ color: s.color, fontSize: '28px', fontWeight: 800 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Platform Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {PLATFORMS.map(p => {
          const stat = platformStats.find(s => s.platform === p)
          const icon = PLATFORM_ICONS[p.toLowerCase()] || '🌐'
          const color = PLATFORM_COLORS[p.toLowerCase()] || '#333'
          const v = stat?.visits || 0
          const s = stat?.signups || 0
          return (
            <div key={p} style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1rem', border: `1px solid ${border}` }}>
              <div style={{ fontSize: '24px', marginBottom: '0.25rem' }}>{icon}</div>
              <div style={{ color: textPrimary, fontWeight: 700, fontSize: '14px', marginBottom: '0.5rem' }}>{p}</div>
              <div style={{ fontSize: '12px', color: textSecondary, lineHeight: 1.8 }}>
                <div>👆 <strong style={{ color: '#2563eb' }}>{v}</strong> visits</div>
                <div>✅ <strong style={{ color: '#16a34a' }}>{s}</strong> signups</div>
                <div>📈 <strong style={{ color: ember }}>{conversionRate(v, s)}</strong> CVR</div>
              </div>
              <div style={{ color: textSecondary, fontSize: '11px', marginTop: '0.4rem' }}>{stat?.posts || 0} posts logged</div>
            </div>
          )
        })}
      </div>

      {/* Posts Table */}
      <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
        <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 'bold', marginBottom: '1rem' }}>Posts & Results</h2>
        {posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: textSecondary }}>
            <div style={{ fontSize: '48px', marginBottom: '1rem' }}>📊</div>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '0.5rem' }}>No posts logged yet</div>
            <div style={{ fontSize: '14px' }}>Click &quot;+ Log Post&quot; to record your first social post.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${border}` }}>
                  {['Date', 'Platform', 'Type', 'Caption', 'UTM Link', 'Visits', 'Signups', 'CVR'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: textSecondary, fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {posts.map(post => {
                  const sups = signupsForPost(post)
                  const vis = visitsForPost(post)
                  const icon = PLATFORM_ICONS[post.platform.toLowerCase()] || '🌐'
                  return (
                    <tr key={post.id} style={{ borderBottom: `1px solid ${border}` }}>
                      <td style={{ padding: '0.75rem', color: textSecondary, whiteSpace: 'nowrap' }}>{formatDate(post.posted_at)}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: textPrimary, fontWeight: 500 }}>
                          {icon} {post.platform}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', color: textSecondary }}>{post.post_type || '—'}</td>
                      <td style={{ padding: '0.75rem', color: textPrimary, maxWidth: '200px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.caption || '—'}</div>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <button
                          onClick={() => { navigator.clipboard.writeText(utmLink(post)) }}
                          style={{ backgroundColor: '#f5f5f5', color: textPrimary, border: `1px solid ${border}`, borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '12px', cursor: 'pointer' }}
                        >
                          📋 Copy Link
                        </button>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ color: '#2563eb', fontWeight: 700, fontSize: '14px' }}>{vis}</span>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ backgroundColor: sups > 0 ? '#dcfce7' : '#f5f5f5', color: sups > 0 ? '#16a34a' : textSecondary, padding: '0.2rem 0.75rem', borderRadius: '999px', fontWeight: 700, fontSize: '14px' }}>
                          {sups}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', color: ember, fontWeight: 700, fontSize: '13px' }}>
                        {conversionRate(vis, sups)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log Post Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: cardBg, borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '480px', margin: '1rem' }}>
            <h2 style={{ color: textPrimary, fontSize: '20px', fontWeight: 'bold', marginBottom: '1.5rem' }}>Log a Social Post</h2>

            {[
              { label: 'Platform', key: 'platform', options: PLATFORMS },
              { label: 'Post Type', key: 'post_type', options: POST_TYPES },
            ].map(({ label, key, options }) => (
              <div key={key} style={{ marginBottom: '1rem' }}>
                <label style={{ color: textSecondary, fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>{label}</label>
                <select
                  value={form[key as keyof typeof form]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: '#fff', color: textPrimary, fontSize: '14px' }}
                >
                  <option value="">Select {label}...</option>
                  {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: textSecondary, fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Caption / Post Text</label>
              <textarea
                value={form.caption}
                onChange={e => setForm(f => ({ ...f, caption: e.target.value }))}
                rows={3}
                placeholder="Paste your post caption here..."
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: `1px solid ${border}`, color: textPrimary, fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: textSecondary, fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Campaign Tag (optional)</label>
              <input
                type="text"
                value={form.utm_campaign}
                onChange={e => setForm(f => ({ ...f, utm_campaign: e.target.value }))}
                placeholder="e.g. rosie_story_march"
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: `1px solid ${border}`, color: textPrimary, fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ color: textSecondary, fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Posted At</label>
              <input
                type="datetime-local"
                value={form.posted_at}
                onChange={e => setForm(f => ({ ...f, posted_at: e.target.value }))}
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: `1px solid ${border}`, color: textPrimary, fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: '#f5f5f5', color: textPrimary, cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
              <button onClick={savePost} disabled={saving || !form.platform} style={{ flex: 2, padding: '0.75rem', borderRadius: '8px', border: 'none', backgroundColor: form.platform ? ember : '#e5e5e5', color: form.platform ? 'white' : textSecondary, cursor: form.platform ? 'pointer' : 'not-allowed', fontWeight: 700 }}>
                {saving ? 'Saving...' : 'Save Post + Copy UTM Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
