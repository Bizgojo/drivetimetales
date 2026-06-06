'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

// ─── Constants ───────────────────────────────────────────────────────────────
const WS_COMPOSE_KEY = 'ws_compose'
const WS_RESPONSE_KEY = 'ws_response'
const WS_NOTES_KEY = 'ws_notes'
const WS_SPLIT_KEY = 'ws_split_pct'
const WS_SAVED_PROMPTS_KEY = 'ws_saved_prompts'
const WS_LEFT_TAB_KEY = 'ws_left_tab'
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

const PROMPT_TEMPLATES = [
  { label: '🔍 Analyze', text: 'Please analyze the following and provide key insights:\n\n' },
  { label: '📋 Explain', text: 'Explain the following in simple terms for an executive:\n\n' },
  { label: '⚡ Next Actions', text: 'Based on the following, what are the recommended next 3 actions?\n\n' },
  { label: '⚠️ Risks', text: 'What are the key risks and concerns with:\n\n' },
  { label: '⚖️ Compare', text: 'Compare these options and recommend the best one:\n\n' },
  { label: '📊 Status', text: 'What is the current status and readiness of:\n\n' },
  { label: '💡 Refine', text: 'Refine and improve the following message:\n\n' },
]

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

interface SavedPrompt {
  id: string
  label: string
  text: string
  savedAt: string
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

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function WorkspacePage() {
  // ── Left pane state ──────────────────────────────────────────────────────
  const [leftTab, setLeftTab] = useState<'compose' | 'response' | 'notes'>(() =>
    readLS(WS_LEFT_TAB_KEY, 'compose')
  )
  const [composeText, setComposeText] = useState(() => readLS(WS_COMPOSE_KEY, ''))
  const [responseText, setResponseText] = useState(() => readLS(WS_RESPONSE_KEY, ''))
  const [notesText, setNotesText] = useState(() => readLS(WS_NOTES_KEY, ''))
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>(() =>
    readLS(WS_SAVED_PROMPTS_KEY, [])
  )
  const [showSavedPrompts, setShowSavedPrompts] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<'compose' | 'response' | null>(null)

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

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // localStorage persistence for left pane
  useEffect(() => { writeLS(WS_COMPOSE_KEY, composeText) }, [composeText])
  useEffect(() => { writeLS(WS_RESPONSE_KEY, responseText) }, [responseText])
  useEffect(() => { writeLS(WS_NOTES_KEY, notesText) }, [notesText])
  useEffect(() => { writeLS(WS_LEFT_TAB_KEY, leftTab) }, [leftTab])

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

  const copyToClipboard = async (text: string, source: 'compose' | 'response') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyFeedback(source)
      setTimeout(() => setCopyFeedback(null), 2000)
    } catch {}
  }

  const sendToOrion = () => {
    const text = composeText.trim()
    if (!text) return
    setChatInput(text)
    if (isMobile) setMobileTab('terminal')
    setTimeout(() => terminalInputRef.current?.focus(), 100)
  }

  const savePrompt = () => {
    const text = composeText.trim()
    if (!text) return
    const label = text.slice(0, 40) + (text.length > 40 ? '…' : '')
    const next: SavedPrompt[] = [
      { id: `sp-${Date.now()}`, label, text, savedAt: new Date().toISOString() },
      ...savedPrompts,
    ].slice(0, 20)
    setSavedPrompts(next)
    writeLS(WS_SAVED_PROMPTS_KEY, next)
  }

  const deletePrompt = (id: string) => {
    const next = savedPrompts.filter(p => p.id !== id)
    setSavedPrompts(next)
    writeLS(WS_SAVED_PROMPTS_KEY, next)
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderLeftPane = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#fff', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>💬 Prompt Workspace</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Draft · Paste ChatGPT responses · Notes</div>
          </div>
          <button
            onClick={sendToOrion}
            disabled={!composeText.trim()}
            title="Copy compose text to Orion Terminal input"
            style={{
              ...BTN,
              backgroundColor: composeText.trim() ? '#6366f1' : '#e2e8f0',
              color: composeText.trim() ? '#fff' : '#94a3b8',
              borderColor: composeText.trim() ? '#6366f1' : '#e2e8f0',
              fontSize: 12,
              padding: '6px 12px',
            }}
          >
            → Orion
          </button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
          {(['compose', 'response', 'notes'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setLeftTab(tab)}
              style={{
                ...BTN,
                padding: '4px 12px',
                fontSize: 12,
                backgroundColor: leftTab === tab ? '#0f172a' : '#f1f5f9',
                color: leftTab === tab ? '#fff' : '#475569',
                borderColor: leftTab === tab ? '#0f172a' : '#e2e8f0',
                borderRadius: 6,
              }}
            >
              {tab === 'compose' ? '✏️ Compose' : tab === 'response' ? '📋 Paste Response' : '📝 Notes'}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt templates (shown only on Compose tab) */}
      {leftTab === 'compose' && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#fafafa', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginRight: 2 }}>Templates:</span>
            {PROMPT_TEMPLATES.map(t => (
              <button
                key={t.label}
                onClick={() => setComposeText(prev => t.text + (prev ? '\n\n' + prev : ''))}
                style={{ ...BTN, fontSize: 11, padding: '3px 8px', borderRadius: 12, backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }}
              >
                {t.label}
              </button>
            ))}
            <button
              onClick={() => setShowSavedPrompts(p => !p)}
              style={{ ...BTN, fontSize: 11, padding: '3px 8px', borderRadius: 12, backgroundColor: showSavedPrompts ? '#0f172a' : '#f1f5f9', color: showSavedPrompts ? '#fff' : '#475569', borderColor: showSavedPrompts ? '#0f172a' : '#e2e8f0' }}
            >
              💾 Saved ({savedPrompts.length})
            </button>
          </div>

          {showSavedPrompts && (
            <div style={{ marginTop: 8, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 0', maxHeight: 160, overflowY: 'auto' as const }}>
              {savedPrompts.length === 0 ? (
                <div style={{ fontSize: 12, color: '#94a3b8', padding: '4px 12px' }}>No saved prompts. Write something and click Save.</div>
              ) : (
                savedPrompts.map(sp => (
                  <div key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderBottom: '1px solid #f8fafc' }}>
                    <button
                      onClick={() => { setComposeText(sp.text); setShowSavedPrompts(false) }}
                      style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', fontSize: 12, color: '#0f172a', cursor: 'pointer', padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}
                    >
                      {sp.label}
                    </button>
                    <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{relativeTime(sp.savedAt)}</span>
                    <button onClick={() => deletePrompt(sp.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#94a3b8', padding: 0, flexShrink: 0 }}>×</button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Main textarea */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '10px 12px', gap: 8, overflow: 'hidden' }}>
        <textarea
          value={leftTab === 'compose' ? composeText : leftTab === 'response' ? responseText : notesText}
          onChange={e => {
            if (leftTab === 'compose') setComposeText(e.target.value)
            else if (leftTab === 'response') setResponseText(e.target.value)
            else setNotesText(e.target.value)
          }}
          placeholder={
            leftTab === 'compose'
              ? 'Draft your prompt here. Use templates above to start. Click → Orion to send to the Terminal, or copy and paste into ChatGPT.'
              : leftTab === 'response'
              ? "Paste ChatGPT's response here for reference alongside Orion's Terminal output."
              : 'Notes, context, decisions, links — anything you want to track during this working session.'
          }
          style={{
            flex: 1,
            resize: 'none',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '12px',
            fontSize: 13,
            lineHeight: 1.6,
            color: '#0f172a',
            fontFamily: 'inherit',
            outline: 'none',
            backgroundColor: leftTab === 'response' ? '#fffbeb' : leftTab === 'notes' ? '#f0fdf4' : '#fff',
          }}
        />

        {/* Action bar */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {leftTab === 'compose' && (
            <>
              <button
                onClick={() => copyToClipboard(composeText, 'compose')}
                disabled={!composeText.trim()}
                style={{
                  ...BTN,
                  flex: 1,
                  backgroundColor: copyFeedback === 'compose' ? '#16a34a' : '#f1f5f9',
                  color: copyFeedback === 'compose' ? '#fff' : '#475569',
                  borderColor: copyFeedback === 'compose' ? '#16a34a' : '#e2e8f0',
                  fontSize: 12,
                }}
              >
                {copyFeedback === 'compose' ? '✓ Copied!' : '📋 Copy to ChatGPT'}
              </button>
              <button
                onClick={savePrompt}
                disabled={!composeText.trim()}
                style={{ ...BTN, fontSize: 12, backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: '#475569' }}
                title="Save to prompt library"
              >
                💾 Save
              </button>
              <button
                onClick={() => setComposeText('')}
                disabled={!composeText.trim()}
                style={{ ...BTN, fontSize: 12, color: '#94a3b8', borderColor: '#e2e8f0' }}
                title="Clear compose area"
              >
                ✕ Clear
              </button>
            </>
          )}
          {leftTab === 'response' && (
            <>
              <button
                onClick={() => copyToClipboard(responseText, 'response')}
                disabled={!responseText.trim()}
                style={{
                  ...BTN, flex: 1, fontSize: 12,
                  backgroundColor: copyFeedback === 'response' ? '#16a34a' : '#f1f5f9',
                  color: copyFeedback === 'response' ? '#fff' : '#475569',
                  borderColor: copyFeedback === 'response' ? '#16a34a' : '#e2e8f0',
                }}
              >
                {copyFeedback === 'response' ? '✓ Copied!' : '📋 Copy Response'}
              </button>
              <button
                onClick={() => setResponseText('')}
                disabled={!responseText.trim()}
                style={{ ...BTN, fontSize: 12, color: '#94a3b8', borderColor: '#e2e8f0' }}
              >
                ✕ Clear
              </button>
            </>
          )}
          {leftTab === 'notes' && (
            <button
              onClick={() => setNotesText('')}
              disabled={!notesText.trim()}
              style={{ ...BTN, fontSize: 12, color: '#94a3b8', borderColor: '#e2e8f0' }}
            >
              ✕ Clear Notes
            </button>
          )}
        </div>
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
            Draft prompts · Paste ChatGPT responses · Send to Orion · Compare side by side
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
              {tab === 'workspace' ? '💬 Workspace' : '🧭 Terminal'}
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
