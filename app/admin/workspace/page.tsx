'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

// ─── Constants ───────────────────────────────────────────────────────────────
const WS_PAD_KEY = 'ws_pad'
const WS_SPLIT_KEY = 'ws_split_pct'
const ORION_CHAT_KEY = 'cc_orion_chat_v1'
const ORION_CHAT_POLL_MS = 5000
const MIN_PANE_PCT = 25
const MAX_PANE_PCT = 75
const MOBILE_BREAKPOINT = 768

const BTN: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 13,
  cursor: 'pointer',
  backgroundColor: '#fff',
  color: '#0f172a',
  fontWeight: 600,
  fontFamily: 'inherit',
}

const AGENT_TERMINAL_CONFIG: Record<string, { emoji: string; color: string; name: string }> = {
  marc:   { emoji: '👤', color: '#0f172a', name: 'Marc' },
  orion:  { emoji: '🧭', color: '#6366f1', name: 'Orion' },
  hal:    { emoji: '🎙', color: '#f59e0b', name: 'Hal' },
  atlas:  { emoji: '⚙️', color: '#3b82f6', name: 'Atlas' },
  maya:   { emoji: '🔮', color: '#8b5cf6', name: 'Maya' },
  susan:  { emoji: '🩷', color: '#ec4899', name: 'Susan' },
  vega:   { emoji: '🎚', color: '#10b981', name: 'Vega' },
  bart:   { emoji: '💰', color: '#16a34a', name: 'Bart' },
  system: { emoji: '⚡', color: '#94a3b8', name: 'System' },
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string
  role: string
  agent: string
  content: string
  created_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function readLS<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const v = window.localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch { return fallback }
}

function writeLS<T>(key: string, value: T) {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function WorkspacePage() {
  // ── Workpad state ────────────────────────────────────────────────────────
  const [padText, setPadText] = useState(() => readLS(WS_PAD_KEY, ''))
  const [copyFeedback, setCopyFeedback] = useState(false)
  const padRef = useRef<HTMLTextAreaElement>(null)

  // ── Split pane state ─────────────────────────────────────────────────────
  const [splitPct, setSplitPct] = useState(() => readLS(WS_SPLIT_KEY, 50))
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Mobile state ─────────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(false)
  const [mobileTab, setMobileTab] = useState<'workspace' | 'terminal'>('workspace')

  // ── Orion Terminal state (self-contained, reads same DB) ─────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() =>
    readLS<ChatMessage[]>(ORION_CHAT_KEY, [])
  )
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatAgentTarget, setChatAgentTarget] = useState('orion')
  const [chatThinking, setChatThinking] = useState(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const terminalInputRef = useRef<HTMLTextAreaElement>(null)

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Workpad persistence
  useEffect(() => { writeLS(WS_PAD_KEY, padText) }, [padText])

  // Orion Terminal polling
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const res = await fetch('/api/admin/orion-chat')
        if (!res.ok) return
        const data = await res.json()
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          setChatMessages(data.messages)
          writeLS(ORION_CHAT_KEY, data.messages)
        }
      } catch {}
    }
    fetchMessages()
    const interval = setInterval(fetchMessages, ORION_CHAT_POLL_MS)
    return () => clearInterval(interval)
  }, [])

  // Auto-scroll terminal
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatThinking])

  // Clear thinking when response arrives
  useEffect(() => {
    const last = chatMessages[chatMessages.length - 1]
    if (last && last.role !== 'marc') setChatThinking(false)
  }, [chatMessages])

  // Drag-to-resize
  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = Math.round(((e.clientX - rect.left) / rect.width) * 100)
      const clamped = Math.max(MIN_PANE_PCT, Math.min(MAX_PANE_PCT, pct))
      setSplitPct(clamped)
      writeLS(WS_SPLIT_KEY, clamped)
    }
    const onUp = () => setIsDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDragging])

  // ── Handlers ─────────────────────────────────────────────────────────────

  const sendChatMessage = async () => {
    const content = chatInput.trim()
    if (!content || chatSending) return
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'marc', agent: 'marc', content,
      created_at: new Date().toISOString(),
    }
    setChatMessages(prev => [...prev, optimistic])
    setChatInput('')
    setChatSending(true)
    setChatThinking(true)
    try {
      await fetch('/api/admin/orion-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'marc', agent: 'marc', content }),
      })
    } catch {}
    setChatSending(false)
    setTimeout(() => setChatThinking(false), 60000)
  }

  const handleCopy = async () => {
    if (!padText.trim()) return
    try {
      await navigator.clipboard.writeText(padText)
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 2000)
    } catch {}
  }

  const handleClear = () => setPadText('')

  const handleSendToOrion = () => {
    const el = padRef.current
    if (!el || !padText.trim()) return
    const selected = el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0).trim()
    const text = selected || el.value.trim()
    if (!text) return
    setChatInput(text)
    if (isMobile) setMobileTab('terminal')
    setTimeout(() => terminalInputRef.current?.focus(), 100)
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderLeftPane = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#fff', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>📋 Workpad</div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>Type · Paste · Draft · Edit anything in place</div>
      </div>

      {/* Textarea */}
      <div style={{ flex: 1, padding: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <textarea
          ref={padRef}
          value={padText}
          onChange={e => setPadText(e.target.value)}
          placeholder={'Paste ChatGPT responses here. Draft prompts for Orion. Take notes. Edit anything in place.\n\nSelect text before clicking Send to Orion → to send only that passage. Leave nothing selected to send everything.'}
          style={{
            flex: 1,
            resize: 'none',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '14px',
            fontSize: 14,
            lineHeight: 1.65,
            color: '#0f172a',
            fontFamily: 'inherit',
            outline: 'none',
            backgroundColor: '#fff',
          }}
        />
      </div>

      {/* Action bar */}
      <div style={{ borderTop: '1px solid #e2e8f0', padding: '10px 14px', backgroundColor: '#fff', flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={handleCopy}
          disabled={!padText.trim()}
          style={{
            ...BTN,
            backgroundColor: copyFeedback ? '#16a34a' : '#f8fafc',
            color: copyFeedback ? '#fff' : '#475569',
            borderColor: copyFeedback ? '#16a34a' : '#e2e8f0',
          }}
        >
          {copyFeedback ? '✓ Copied!' : '📋 Copy'}
        </button>
        <button
          onClick={handleClear}
          disabled={!padText.trim()}
          style={{ ...BTN, backgroundColor: '#f8fafc', color: '#94a3b8', borderColor: '#e2e8f0' }}
        >
          ✕ Clear
        </button>
        <button
          onClick={handleSendToOrion}
          disabled={!padText.trim()}
          style={{
            ...BTN,
            marginLeft: 'auto',
            backgroundColor: padText.trim() ? '#6366f1' : '#e2e8f0',
            color: padText.trim() ? '#fff' : '#94a3b8',
            borderColor: padText.trim() ? '#6366f1' : '#e2e8f0',
          }}
        >
          Send to Orion →
        </button>
      </div>
    </div>
  )

  const renderOrionTerminal = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#fff', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>🧭</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Orion Terminal</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Direct line · auto-routes · 5s refresh</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <select
            value={chatAgentTarget}
            onChange={e => setChatAgentTarget(e.target.value)}
            style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#0f172a', cursor: 'pointer' }}
          >
            <option value="orion">🧭 Orion</option>
            <option value="hal">🎙 Hal</option>
            <option value="atlas">⚙️ Atlas</option>
            <option value="maya">🔮 Maya</option>
            <option value="susan">🩷 Susan</option>
            <option value="vega">🎚 Vega</option>
            <option value="bart">💰 Bart</option>
          </select>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {chatMessages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🧭</div>
            <div>Send a message to start a conversation with Orion.</div>
          </div>
        )}
        {chatMessages.map(msg => {
          const isMarc = msg.role === 'marc'
          const config = AGENT_TERMINAL_CONFIG[msg.agent] ?? AGENT_TERMINAL_CONFIG['orion']
          const bubbleTime = new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: isMarc ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6 }}>
              {!isMarc && (
                <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: config.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                  {config.emoji}
                </div>
              )}
              <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: isMarc ? 'flex-end' : 'flex-start' }}>
                {!isMarc && <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2, fontWeight: 600 }}>{config.name}</div>}
                <div style={{ padding: '8px 12px', borderRadius: isMarc ? '14px 14px 4px 14px' : '14px 14px 14px 4px', backgroundColor: isMarc ? '#6366f1' : '#f1f5f9', color: isMarc ? '#fff' : '#0f172a', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {msg.content}
                </div>
                <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 2 }}>{bubbleTime}</div>
              </div>
            </div>
          )
        })}
        {chatThinking && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: AGENT_TERMINAL_CONFIG[chatAgentTarget]?.color ?? '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
              {AGENT_TERMINAL_CONFIG[chatAgentTarget]?.emoji ?? '🧭'}
            </div>
            <div style={{ padding: '8px 14px', borderRadius: '14px 14px 14px 4px', backgroundColor: '#f1f5f9', fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>
              {AGENT_TERMINAL_CONFIG[chatAgentTarget]?.name ?? 'Orion'} is thinking…
            </div>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Input */}
      <div style={{ borderTop: '1px solid #e2e8f0', padding: '10px 12px', backgroundColor: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={terminalInputRef}
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage() } }}
            placeholder={`Message ${AGENT_TERMINAL_CONFIG[chatAgentTarget]?.name ?? 'Orion'}…`}
            rows={2}
            style={{ flex: 1, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, resize: 'none', fontFamily: 'inherit', lineHeight: 1.4, color: '#0f172a', outline: 'none' }}
          />
          <button
            onClick={sendChatMessage}
            disabled={!chatInput.trim() || chatSending}
            style={{ ...BTN, backgroundColor: chatInput.trim() && !chatSending ? '#6366f1' : '#e2e8f0', color: chatInput.trim() && !chatSending ? '#fff' : '#94a3b8', borderColor: chatInput.trim() && !chatSending ? '#6366f1' : '#e2e8f0', padding: '10px 16px', fontWeight: 700, minWidth: 60, minHeight: 44, borderRadius: 10 }}
          >
            {chatSending ? '…' : '↑'}
          </button>
        </div>
      </div>
    </div>
  )

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '0', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#FAF9F6' }}>
      {/* Page header */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>🗂 Executive Workspace</h1>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b', marginTop: 2 }}>
            Read · Type · Copy · Paste · Send to Orion
          </p>
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          {isMobile ? 'Mobile: tap tabs to switch' : `Split: ${splitPct}% / ${100 - splitPct}% · drag divider to resize`}
        </div>
      </div>

      {/* Mobile tab switcher */}
      {isMobile && (
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff', flexShrink: 0 }}>
          {(['workspace', 'terminal'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              style={{ flex: 1, padding: '12px', border: 'none', borderBottom: mobileTab === tab ? '2px solid #6366f1' : '2px solid transparent', backgroundColor: '#fff', color: mobileTab === tab ? '#6366f1' : '#64748b', fontWeight: mobileTab === tab ? 700 : 400, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {tab === 'workspace' ? '📋 Workpad' : '🧭 Terminal'}
            </button>
          ))}
        </div>
      )}

      {/* Split pane container */}
      {isMobile ? (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {mobileTab === 'workspace' ? renderLeftPane() : renderOrionTerminal()}
        </div>
      ) : (
        <div ref={containerRef} style={{ flex: 1, display: 'flex', overflow: 'hidden', userSelect: isDragging ? 'none' : 'auto' }}>
          {/* Left pane */}
          <div style={{ width: `${splitPct}%`, overflow: 'hidden', borderRight: '1px solid #e2e8f0' }}>
            {renderLeftPane()}
          </div>

          {/* Draggable divider */}
          <div
            onMouseDown={() => setIsDragging(true)}
            style={{
              width: 6,
              cursor: 'col-resize',
              backgroundColor: isDragging ? '#6366f1' : '#e2e8f0',
              transition: isDragging ? 'none' : 'background-color 0.15s',
              flexShrink: 0,
              position: 'relative',
            }}
            title="Drag to resize"
          >
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 2, height: 20, backgroundColor: isDragging ? '#fff' : '#94a3b8', borderRadius: 1 }} />
              ))}
            </div>
          </div>

          {/* Right pane */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {renderOrionTerminal()}
          </div>
        </div>
      )}
    </div>
  )
}
