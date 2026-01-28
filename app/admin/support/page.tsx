'use client'

import { useState, useEffect } from 'react'

interface SupportMessage {
  id: string
  user_id: string | null
  name: string
  email: string
  subject: string
  message: string
  status: 'new' | 'read' | 'answered'
  admin_response: string | null
  responded_at: string | null
  created_at: string
}

interface UserDetails {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  display_name: string | null
  credits: number
  plan: string | null
  subscription_type: string | null
  created_at: string
  completedLast30: number
  completedLifetime: number
  messageCount: number
}

export default function AdminSupportPage() {
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'new' | 'read' | 'answered'>('all')
  const [selectedMessage, setSelectedMessage] = useState<SupportMessage | null>(null)
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null)
  const [userMessages, setUserMessages] = useState<SupportMessage[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [generatingAI, setGeneratingAI] = useState(false)
  const [loadingUser, setLoadingUser] = useState(false)

  useEffect(() => {
    loadMessages()
  }, [])

  async function loadMessages() {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      
      if (!url || !key) return
      
      const response = await fetch(
        `${url}/rest/v1/support_messages?select=*&order=created_at.asc`,
        {
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
          }
        }
      )
      
      if (response.ok) {
        const data = await response.json()
        setMessages(data)
      }
    } catch (error) {
      console.error('Error loading messages:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadUserDetails(email: string, userId: string | null) {
    setLoadingUser(true)
    setUserDetails(null)
    
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      
      if (!url || !key) return

      // Get user info
      let userData = null
      if (userId) {
        const userResponse = await fetch(
          `${url}/rest/v1/users?id=eq.${userId}&select=*`,
          { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
        )
        if (userResponse.ok) {
          const users = await userResponse.json()
          userData = users[0] || null
        }
      } else {
        // Try to find by email
        const userResponse = await fetch(
          `${url}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=*`,
          { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
        )
        if (userResponse.ok) {
          const users = await userResponse.json()
          userData = users[0] || null
        }
      }

      // Get message count for this email
      const msgResponse = await fetch(
        `${url}/rest/v1/support_messages?email=eq.${encodeURIComponent(email)}&select=id`,
        { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
      )
      let messageCount = 0
      if (msgResponse.ok) {
        const msgs = await msgResponse.json()
        messageCount = msgs.length
      }

      // Get completed stories
      let completedLast30 = 0
      let completedLifetime = 0
      
      if (userData?.id) {
        // Lifetime completed
        const lifetimeResponse = await fetch(
          `${url}/rest/v1/user_library?user_id=eq.${userData.id}&completed=eq.true&select=id`,
          { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
        )
        if (lifetimeResponse.ok) {
          const lifetime = await lifetimeResponse.json()
          completedLifetime = lifetime.length
        }

        // Last 30 days
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        const last30Response = await fetch(
          `${url}/rest/v1/user_library?user_id=eq.${userData.id}&completed=eq.true&updated_at=gte.${thirtyDaysAgo.toISOString()}&select=id`,
          { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
        )
        if (last30Response.ok) {
          const last30 = await last30Response.json()
          completedLast30 = last30.length
        }
      }

      if (userData) {
        setUserDetails({
          ...userData,
          completedLast30,
          completedLifetime,
          messageCount
        })
      } else {
        // Non-registered user
        setUserDetails({
          id: '',
          email: email,
          first_name: null,
          last_name: null,
          display_name: null,
          credits: 0,
          plan: null,
          subscription_type: null,
          created_at: '',
          completedLast30: 0,
          completedLifetime: 0,
          messageCount
        })
      }

      // Load all messages from this user
      const allMsgsResponse = await fetch(
        `${url}/rest/v1/support_messages?email=eq.${encodeURIComponent(email)}&order=created_at.desc&select=*`,
        { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
      )
      if (allMsgsResponse.ok) {
        const allMsgs = await allMsgsResponse.json()
        setUserMessages(allMsgs)
      }

    } catch (error) {
      console.error('Error loading user details:', error)
    } finally {
      setLoadingUser(false)
    }
  }

  async function markAsRead(id: string) {
    try {
      const response = await fetch('/api/admin/support/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'read' })
      })
      
      if (response.ok) {
        setMessages(msgs => msgs.map(m => 
          m.id === id ? { ...m, status: 'read' } : m
        ))
      }
    } catch (error) {
      console.error('Error updating message:', error)
    }
  }

  async function generateAIResponse() {
    if (!selectedMessage) return
    
    setGeneratingAI(true)
    try {
      const response = await fetch('/api/admin/support/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: selectedMessage.subject,
          message: selectedMessage.message,
          userName: selectedMessage.name,
          userPlan: userDetails?.plan || userDetails?.subscription_type || 'free'
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setReplyText(data.suggestion)
      } else {
        alert('Failed to generate AI response')
      }
    } catch (error) {
      console.error('Error generating AI response:', error)
      alert('Failed to generate AI response')
    } finally {
      setGeneratingAI(false)
    }
  }

  async function sendReply() {
    if (!selectedMessage || !replyText.trim()) return
    
    setSending(true)
    try {
      const response = await fetch('/api/admin/support/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedMessage.id,
          email: selectedMessage.email,
          name: selectedMessage.name,
          subject: selectedMessage.subject,
          response: replyText
        })
      })
      
      if (response.ok) {
        setMessages(msgs => msgs.map(m => 
          m.id === selectedMessage.id 
            ? { ...m, status: 'answered', admin_response: replyText, responded_at: new Date().toISOString() } 
            : m
        ))
        setSelectedMessage(prev => prev ? { ...prev, status: 'answered', admin_response: replyText } : null)
        setReplyText('')
        alert('Reply sent successfully!')
      } else {
        alert('Failed to send reply')
      }
    } catch (error) {
      console.error('Error sending reply:', error)
      alert('Failed to send reply')
    } finally {
      setSending(false)
    }
  }

  const filteredMessages = messages.filter(m => {
    if (filter === 'all') return true
    return m.status === filter
  })

  const counts = {
    all: messages.length,
    new: messages.filter(m => m.status === 'new').length,
    read: messages.filter(m => m.status === 'read').length,
    answered: messages.filter(m => m.status === 'answered').length,
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const formatMemberSince = (dateStr: string) => {
    if (!dateStr) return 'Not registered'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays < 30) return `${diffDays} days`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months`
    return `${Math.floor(diffDays / 365)} years, ${Math.floor((diffDays % 365) / 30)} months`
  }

  const getPlanDisplay = (plan: string | null, subType: string | null) => {
    const p = plan || subType || 'free'
    const plans: Record<string, string> = {
      'free': 'Free',
      'test_driver': 'Test Driver',
      'commuter': 'Commuter',
      'road_warrior': 'Road Warrior'
    }
    return plans[p] || p
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '1.5rem', color: '#1e293b' }}>
        💬 Support Messages
      </h1>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {(['all', 'new', 'read', 'answered'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: filter === tab ? '#f97316' : '#e2e8f0',
              color: filter === tab ? 'white' : '#475569',
              fontWeight: filter === tab ? 600 : 400,
              fontSize: '14px'
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)} ({counts[tab]})
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '1.5rem' }}>
        {/* Message List - Oldest First */}
        <div style={{ width: '320px', flexShrink: 0 }}>
          {loading ? (
            <p style={{ color: '#64748b' }}>Loading...</p>
          ) : filteredMessages.length === 0 ? (
            <p style={{ color: '#64748b' }}>No messages found.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
              {filteredMessages.map(msg => (
                <div
                  key={msg.id}
                  onClick={() => {
                    setSelectedMessage(msg)
                    setShowHistory(false)
                    loadUserDetails(msg.email, msg.user_id)
                    if (msg.status === 'new') {
                      markAsRead(msg.id)
                    }
                  }}
                  style={{
                    padding: '1rem',
                    backgroundColor: selectedMessage?.id === msg.id ? '#fff7ed' : 'white',
                    border: `2px solid ${selectedMessage?.id === msg.id ? '#f97316' : '#e2e8f0'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    position: 'relative'
                  }}
                >
                  {msg.status === 'new' && (
                    <span style={{
                      position: 'absolute',
                      top: '0.5rem',
                      right: '0.5rem',
                      width: '10px',
                      height: '10px',
                      backgroundColor: '#ef4444',
                      borderRadius: '50%'
                    }} />
                  )}
                  {/* Date Prominent */}
                  <div style={{ 
                    fontSize: '14px', 
                    fontWeight: 700, 
                    color: '#f97316', 
                    marginBottom: '0.5rem',
                    backgroundColor: '#fff7ed',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    display: 'inline-block'
                  }}>
                    {formatDate(msg.created_at)}
                  </div>
                  <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>
                    {msg.name}
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '0.5rem' }}>
                    {msg.subject}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    display: 'inline-block',
                    backgroundColor: msg.status === 'new' ? '#fef2f2' : msg.status === 'read' ? '#fef9c3' : '#dcfce7',
                    color: msg.status === 'new' ? '#dc2626' : msg.status === 'read' ? '#ca8a04' : '#16a34a'
                  }}>
                    {msg.status.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Message Detail */}
        <div style={{ flex: 1 }}>
          {selectedMessage ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* User Info Card */}
              <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.25rem', color: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '0.25rem' }}>
                      {selectedMessage.name}
                    </h3>
                    <p style={{ color: '#94a3b8', fontSize: '14px' }}>{selectedMessage.email}</p>
                  </div>
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    {showHistory ? 'Hide History' : `Message History (${userMessages.length})`}
                  </button>
                </div>
                
                {loadingUser ? (
                  <p style={{ color: '#94a3b8' }}>Loading user details...</p>
                ) : userDetails ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                    <div style={{ backgroundColor: 'white', padding: '0.75rem', borderRadius: '8px' }}>
                      <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '0.25rem' }}>MEMBER FOR</div>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{formatMemberSince(userDetails.created_at)}</div>
                    </div>
                    <div style={{ backgroundColor: 'white', padding: '0.75rem', borderRadius: '8px' }}>
                      <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '0.25rem' }}>PLAN</div>
                      <div style={{ fontWeight: 600, color: '#f97316' }}>{getPlanDisplay(userDetails.plan, userDetails.subscription_type)}</div>
                    </div>
                    <div style={{ backgroundColor: 'white', padding: '0.75rem', borderRadius: '8px' }}>
                      <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '0.25rem' }}>CREDITS</div>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{userDetails.credits}</div>
                    </div>
                    <div style={{ backgroundColor: 'white', padding: '0.75rem', borderRadius: '8px' }}>
                      <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '0.25rem' }}>MESSAGES SENT</div>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{userDetails.messageCount}</div>
                    </div>
                    <div style={{ backgroundColor: 'white', padding: '0.75rem', borderRadius: '8px' }}>
                      <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '0.25rem' }}>STORIES (30 DAYS)</div>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{userDetails.completedLast30}</div>
                    </div>
                    <div style={{ backgroundColor: 'white', padding: '0.75rem', borderRadius: '8px' }}>
                      <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '0.25rem' }}>STORIES (LIFETIME)</div>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{userDetails.completedLifetime}</div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Message History Panel */}
              {showHistory && (
                <div style={{ backgroundColor: '#f1f5f9', borderRadius: '12px', padding: '1rem', maxHeight: '300px', overflowY: 'auto' }}>
                  <h4 style={{ fontWeight: 600, marginBottom: '1rem', color: '#1e293b' }}>All Messages from {selectedMessage.name}</h4>
                  {userMessages.map(msg => (
                    <div 
                      key={msg.id}
                      onClick={() => {
                        setSelectedMessage(msg)
                        setShowHistory(false)
                      }}
                      style={{
                        padding: '0.75rem',
                        backgroundColor: msg.id === selectedMessage.id ? '#fff7ed' : 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        marginBottom: '0.5rem',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{msg.subject}</span>
                        <span style={{
                          fontSize: '11px',
                          padding: '0.125rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor: msg.status === 'answered' ? '#dcfce7' : '#fef9c3',
                          color: msg.status === 'answered' ? '#16a34a' : '#ca8a04'
                        }}>
                          {msg.status.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{formatDate(msg.created_at)}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Message Content */}
              <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                  <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>{selectedMessage.subject}</div>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>{formatDate(selectedMessage.created_at)}</div>
                </div>
                <div style={{ padding: '1.25rem' }}>
                  <p style={{ color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {selectedMessage.message}
                  </p>
                </div>

                {/* Previous Response */}
                {selectedMessage.admin_response && (
                  <div style={{ padding: '1.25rem', borderTop: '1px solid #e2e8f0', backgroundColor: '#f0fdf4' }}>
                    <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600, marginBottom: '0.5rem' }}>
                      ✓ YOUR RESPONSE ({selectedMessage.responded_at ? formatDate(selectedMessage.responded_at) : ''})
                    </div>
                    <p style={{ color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {selectedMessage.admin_response}
                    </p>
                  </div>
                )}

                {/* Reply Form */}
                {selectedMessage.status !== 'answered' && (
                  <div style={{ padding: '1.25rem', borderTop: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <label style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                        Reply to {selectedMessage.name}
                      </label>
                      <button
                        onClick={generateAIResponse}
                        disabled={generatingAI}
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: generatingAI ? '#cbd5e1' : '#8b5cf6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '13px',
                          cursor: generatingAI ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}
                      >
                        {generatingAI ? '⏳ Generating...' : '✨ AI Suggest Response'}
                      </button>
                    </div>
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type your response..."
                      rows={5}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '14px',
                        resize: 'vertical',
                        marginBottom: '1rem',
                        backgroundColor: 'white',
                        color: '#1e293b'
                      }}
                    />
                    <button
                      onClick={sendReply}
                      disabled={sending || !replyText.trim()}
                      style={{
                        padding: '0.75rem 1.5rem',
                        backgroundColor: sending || !replyText.trim() ? '#cbd5e1' : '#f97316',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 600,
                        cursor: sending || !replyText.trim() ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {sending ? 'Sending...' : 'Send Reply'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ 
              backgroundColor: 'white', 
              borderRadius: '12px', 
              border: '1px solid #e2e8f0',
              padding: '3rem',
              textAlign: 'center',
              color: '#94a3b8'
            }}>
              <span style={{ fontSize: '48px', display: 'block', marginBottom: '1rem' }}>💬</span>
              Select a message to view details
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
