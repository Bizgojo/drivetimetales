'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Story {
  id: string
  title: string
  author: string
  genre: string
  cover_url: string | null
  created_at: string
}

export default function AdminMarketingPage() {
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStory, setSelectedStory] = useState<Story | null>(null)
  const [postText, setPostText] = useState('')
  const [copied, setCopied] = useState(false)

  // Theme
  const bg = '#FAF9F6'
  const cardBg = '#FFFFFF'
  const textPrimary = '#1a1a1a'
  const textSecondary = '#4a4a4a'
  const border = '#e0e0e0'
  const inputBg = '#FFFFFF'

  useEffect(() => {
    fetchRecentStories()
  }, [])

  async function fetchRecentStories() {
    setLoading(true)
    const { data } = await supabase
      .from('stories')
      .select('id, title, author, genre, cover_url, created_at')
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (data) setStories(data)
    setLoading(false)
  }

  // Generate social post text for a story
  function generatePost(story: Story, platform: 'twitter' | 'facebook' | 'instagram') {
    const baseUrl = 'https://drivetimetales.com'
    const storyUrl = `${baseUrl}/story/${story.id}`
    
    const hashtags = '#AudioDrama #Audiobook #DrivingEntertainment #DriveTimeTales'
    
    if (platform === 'twitter') {
      return `🎧 NEW STORY: "${story.title}" by ${story.author}\n\n${story.genre} • Perfect for your commute!\n\n${storyUrl}\n\n${hashtags}`
    } else if (platform === 'facebook') {
      return `🎧 New Audio Drama Alert! 🚗\n\n"${story.title}" by ${story.author} is now available on Drive Time Tales!\n\nGenre: ${story.genre}\n\nPerfect for your daily commute, road trips, or anytime you need great audio entertainment.\n\n👉 Listen now: ${storyUrl}\n\n${hashtags}`
    } else {
      return `🎧 NEW RELEASE 🎧\n\n"${story.title}"\nby ${story.author}\n\n📚 ${story.genre}\n🚗 Perfect for your commute!\n\nLink in bio to listen!\n\n${hashtags} #NewRelease #AudioStories`
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Open Buffer composer with pre-filled text
  function openBuffer(text: string) {
    const encoded = encodeURIComponent(text)
    window.open(`https://buffer.com/add?text=${encoded}`, '_blank')
  }

  // Social media templates
  const templates = [
    {
      name: 'New Story Release',
      icon: '🆕',
      template: '🎧 NEW STORY: "[TITLE]" by [AUTHOR]\n\nNow streaming on Drive Time Tales!\n\n[URL]\n\n#AudioDrama #DriveTimeTales'
    },
    {
      name: 'Weekly Picks',
      icon: '⭐',
      template: '⭐ THIS WEEK\'S TOP PICKS ⭐\n\n1. [STORY1]\n2. [STORY2]\n3. [STORY3]\n\nListen now at drivetimetales.com\n\n#AudioDrama #WeeklyPicks'
    },
    {
      name: 'Free Story Promo',
      icon: '🆓',
      template: '🆓 FREE TODAY! 🆓\n\n"[TITLE]" is FREE to listen!\n\nPerfect for your commute 🚗\n\n👉 drivetimetales.com\n\n#FreeAudio #DriveTimeTales'
    },
    {
      name: 'Trucker Special',
      icon: '🚛',
      template: '🚛 TRUCKERS! 🚛\n\nLong haul? We\'ve got you covered with hours of audio stories!\n\n✅ Mysteries\n✅ Thrillers\n✅ Sci-Fi\n✅ And more!\n\ndrivetimetales.com\n\n#TruckerLife #AudioStories'
    },
    {
      name: 'Commuter Tips',
      icon: '🚗',
      template: '🚗 Make your commute fly by!\n\nTurn traffic time into story time with Drive Time Tales.\n\n🎧 Premium audio dramas\n📱 Works offline\n⏱️ 15min to 2hr stories\n\ndrivetimetales.com\n\n#CommuterLife #AudioDrama'
    }
  ]

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, padding: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => router.push('/admin')} style={{ backgroundColor: '#e5e5e5', color: textPrimary, padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 500 }}>← Back</button>
          <h1 style={{ color: textPrimary, fontSize: '24px', fontWeight: 'bold' }}>Marketing & Social Media</h1>
        </div>
        <a href="https://buffer.com/publish" target="_blank" rel="noopener noreferrer" style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          📱 Open Buffer
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Left: Story Selector & Generator */}
        <div>
          {/* Quick Post Generator */}
          <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}`, marginBottom: '1.5rem' }}>
            <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 'bold', marginBottom: '1rem' }}>🚀 Quick Post Generator</h2>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: textSecondary, fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>Select a Story</label>
              <select 
                value={selectedStory?.id || ''} 
                onChange={(e) => {
                  const story = stories.find(s => s.id === e.target.value)
                  setSelectedStory(story || null)
                  if (story) {
                    setPostText(generatePost(story, 'twitter'))
                  }
                }}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textPrimary }}
              >
                <option value="">Choose a story...</option>
                {stories.map(story => (
                  <option key={story.id} value={story.id}>{story.title} - {story.author}</option>
                ))}
              </select>
            </div>

            {selectedStory && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ color: textSecondary, fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>Platform Style</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => setPostText(generatePost(selectedStory, 'twitter'))} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: '#1DA1F2', color: 'white', cursor: 'pointer', fontWeight: 500 }}>𝕏 Twitter</button>
                    <button onClick={() => setPostText(generatePost(selectedStory, 'facebook'))} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: '#1877F2', color: 'white', cursor: 'pointer', fontWeight: 500 }}>📘 Facebook</button>
                    <button onClick={() => setPostText(generatePost(selectedStory, 'instagram'))} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: '#E4405F', color: 'white', cursor: 'pointer', fontWeight: 500 }}>📷 Instagram</button>
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ color: textSecondary, fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>Post Text</label>
                  <textarea 
                    value={postText}
                    onChange={(e) => setPostText(e.target.value)}
                    rows={8}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textPrimary, resize: 'vertical', fontFamily: 'inherit' }}
                  />
                  <div style={{ color: textSecondary, fontSize: '12px', marginTop: '0.25rem' }}>{postText.length} characters</div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => copyToClipboard(postText)} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', backgroundColor: copied ? '#16a34a' : '#e5e5e5', color: copied ? 'white' : textPrimary, cursor: 'pointer', fontWeight: 500 }}>
                    {copied ? '✓ Copied!' : '📋 Copy'}
                  </button>
                  <button onClick={() => openBuffer(postText)} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', backgroundColor: '#2563eb', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                    📱 Send to Buffer
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Recent Stories */}
          <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
            <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 'bold', marginBottom: '1rem' }}>📚 Recent Stories</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {stories.slice(0, 5).map(story => (
                <div 
                  key={story.id} 
                  onClick={() => {
                    setSelectedStory(story)
                    setPostText(generatePost(story, 'twitter'))
                  }}
                  style={{ 
                    padding: '0.75rem', 
                    borderRadius: '8px', 
                    backgroundColor: selectedStory?.id === story.id ? '#fff7ed' : '#f5f5f5',
                    border: selectedStory?.id === story.id ? '2px solid #f97316' : `1px solid ${border}`,
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ color: textPrimary, fontWeight: 500 }}>{story.title}</div>
                  <div style={{ color: textSecondary, fontSize: '12px' }}>{story.author} • {story.genre}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Templates & Quick Actions */}
        <div>
          {/* Social Media Accounts */}
          <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}`, marginBottom: '1.5rem' }}>
            <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 'bold', marginBottom: '1rem' }}>📱 Social Media Accounts</h2>
            <p style={{ color: textSecondary, fontSize: '13px', marginBottom: '1rem' }}>Connect your accounts in Buffer to schedule posts across all platforms.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <a href="https://buffer.com/manage/channels" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', borderRadius: '8px', backgroundColor: '#f5f5f5', textDecoration: 'none' }}>
                <span style={{ fontSize: '24px' }}>𝕏</span>
                <div>
                  <div style={{ color: textPrimary, fontWeight: 500 }}>Twitter/X</div>
                  <div style={{ color: textSecondary, fontSize: '12px' }}>Connect in Buffer →</div>
                </div>
              </a>
              <a href="https://buffer.com/manage/channels" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', borderRadius: '8px', backgroundColor: '#f5f5f5', textDecoration: 'none' }}>
                <span style={{ fontSize: '24px' }}>📘</span>
                <div>
                  <div style={{ color: textPrimary, fontWeight: 500 }}>Facebook</div>
                  <div style={{ color: textSecondary, fontSize: '12px' }}>Connect in Buffer →</div>
                </div>
              </a>
              <a href="https://buffer.com/manage/channels" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', borderRadius: '8px', backgroundColor: '#f5f5f5', textDecoration: 'none' }}>
                <span style={{ fontSize: '24px' }}>📷</span>
                <div>
                  <div style={{ color: textPrimary, fontWeight: 500 }}>Instagram</div>
                  <div style={{ color: textSecondary, fontSize: '12px' }}>Connect in Buffer →</div>
                </div>
              </a>
              <a href="https://buffer.com/manage/channels" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', borderRadius: '8px', backgroundColor: '#f5f5f5', textDecoration: 'none' }}>
                <span style={{ fontSize: '24px' }}>🔗</span>
                <div>
                  <div style={{ color: textPrimary, fontWeight: 500 }}>LinkedIn</div>
                  <div style={{ color: textSecondary, fontSize: '12px' }}>Connect in Buffer →</div>
                </div>
              </a>
            </div>
          </div>

          {/* Templates */}
          <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
            <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 'bold', marginBottom: '1rem' }}>📝 Post Templates</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {templates.map((template, i) => (
                <div 
                  key={i}
                  onClick={() => {
                    setPostText(template.template)
                    setSelectedStory(null)
                  }}
                  style={{ padding: '0.75rem', borderRadius: '8px', backgroundColor: '#f5f5f5', cursor: 'pointer', border: `1px solid ${border}` }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '20px' }}>{template.icon}</span>
                    <span style={{ color: textPrimary, fontWeight: 500 }}>{template.name}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#dbeafe', borderRadius: '8px' }}>
              <div style={{ color: '#1e40af', fontSize: '13px', fontWeight: 500 }}>💡 Buffer Free Tier</div>
              <div style={{ color: '#1e40af', fontSize: '12px', marginTop: '0.25rem' }}>
                • 3 social channels<br />
                • 10 scheduled posts per channel<br />
                • Basic analytics
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
