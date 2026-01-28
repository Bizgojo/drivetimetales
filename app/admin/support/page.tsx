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

export default function AdminSupportPage() {
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'new' | 'read' | 'answered'>('all')
  const [selectedMessage, setSelectedMessage] = useState<SupportMessage | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    loadMessages()
  }, [])

  async function loadMessages() {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      
      if (!url || !key) return
      
      const response = await fetch(
        `${url}/rest/v1/support_messages?select=*&order=created_at.desc`,
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
        {/* Message List */}
        <div style={{ flex: 1, maxWidth: '400px' }}>
          {loading ? (
            <p style={{ color: '#64748b' }}>Loading...</p>
          ) : filteredMessages.length === 0 ? (
            <p style={{ color: '#64748b' }}>No messages found.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {filteredMessages.map(msg => (
                <div
                  key={msg.id}
                  onClick={() => {
                    setSelectedMessage(msg)
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
                  <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>
                    {msg.name}
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '0.25rem' }}>
                    {msg.subject}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    {formatDate(msg.created_at)}
                  </div>
                  <div style={{
                    marginTop: '0.5rem',
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
        <div style={{ flex: 2 }}>
          {selectedMessage ? (
            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>
                      {selectedMessage.subject}
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '14px' }}>
                      From: {selectedMessage.name} &lt;{selectedMessage.email}&gt;
                    </p>
                    <p style={{ color: '#94a3b8', fontSize: '13px' }}>
                      {formatDate(selectedMessage.created_at)}
                    </p>
                  </div>
                  {selectedMessage.user_id && (
                    <a 
                      href={`/admin/users?search=${selectedMessage.email}`}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        borderRadius: '6px',
                        fontSize: '13px',
                        textDecoration: 'none'
                      }}
                    >
                      View User
                    </a>
                  )}
                </div>
              </div>

              {/* Message Body */}
              <div style={{ padding: '1.5rem', backgroundColor: '#f8fafc' }}>
                <p style={{ color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {selectedMessage.message}
                </p>
              </div>

              {/* Previous Response */}
              {selectedMessage.admin_response && (
                <div style={{ padding: '1.5rem', borderTop: '1px solid #e2e8f0', backgroundColor: '#f0fdf4' }}>
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
                <div style={{ padding: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '0.5rem' }}>
                    Reply to {selectedMessage.name}
                  </label>
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
                      marginBottom: '1rem'
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
