'use client'

import { useEffect, useMemo, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react'
import {
  COMMAND_CENTER_EXTERNAL_LINKS,
  COMMAND_PANELS,
  type CommandPanel,
  type CommandPanelId,
} from '@/lib/config/command-center'

type PanelTextMap = Record<CommandPanelId, string>

type CommandCenterSnapshot = {
  timestamp: string
  activeWork: string
  promptQueue: string
  lastReports: string
  panels: Record<CommandPanelId, {
    prompt: string
    response: string
    notes: string
  }>
}

const STORAGE_PREFIX = 'command_center_'
const ACTIVE_WORK_KEY = `${STORAGE_PREFIX}active_work`
const PROMPT_QUEUE_KEY = `${STORAGE_PREFIX}prompt_queue`
const LAST_REPORTS_KEY = `${STORAGE_PREFIX}last_reports`

const page: CSSProperties = {
  padding: '2rem',
  minHeight: '100vh',
  backgroundColor: '#FAF9F6',
  color: '#0f172a',
}

const card: CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.06)',
}

const button: CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: '7px',
  backgroundColor: '#ffffff',
  color: '#0f172a',
  fontWeight: 800,
  fontSize: '12px',
  padding: '0.5rem 0.65rem',
  cursor: 'pointer',
}

function panelKey(panelId: CommandPanelId, field: 'prompt' | 'response' | 'notes') {
  return `${STORAGE_PREFIX}${panelId}_${field}`
}

function emptyPanelMap() {
  return COMMAND_PANELS.reduce((map, panel) => {
    map[panel.id] = ''
    return map
  }, {} as PanelTextMap)
}

function readStorage(key: string) {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(key) || ''
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
}

function textAreaStyle(minHeight: number): CSSProperties {
  return {
    width: '100%',
    minHeight,
    boxSizing: 'border-box',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    padding: '0.75rem',
    color: '#0f172a',
    backgroundColor: '#fff',
    fontFamily: 'inherit',
    fontSize: '14px',
    lineHeight: 1.5,
    resize: 'vertical',
  }
}

function fieldLabel(label: string) {
  return (
    <label style={{ display: 'block', color: '#334155', fontSize: '12px', fontWeight: 900, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {label}
    </label>
  )
}

export default function AdminCommandCenterPage() {
  const [loaded, setLoaded] = useState(false)
  const [activeWork, setActiveWork] = useState('')
  const [promptQueue, setPromptQueue] = useState('')
  const [lastReports, setLastReports] = useState('')
  const [panelPrompts, setPanelPrompts] = useState<PanelTextMap>(() => emptyPanelMap())
  const [panelResponses, setPanelResponses] = useState<PanelTextMap>(() => emptyPanelMap())
  const [panelNotes, setPanelNotes] = useState<PanelTextMap>(() => emptyPanelMap())
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  const today = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }, [])

  useEffect(() => {
    setActiveWork(readStorage(ACTIVE_WORK_KEY))
    setPromptQueue(readStorage(PROMPT_QUEUE_KEY))
    setLastReports(readStorage(LAST_REPORTS_KEY))
    setPanelPrompts(() => {
      const next = emptyPanelMap()
      for (const panel of COMMAND_PANELS) next[panel.id] = readStorage(panelKey(panel.id, 'prompt')) || panel.starterPrompt
      return next
    })
    setPanelResponses(() => {
      const next = emptyPanelMap()
      for (const panel of COMMAND_PANELS) next[panel.id] = readStorage(panelKey(panel.id, 'response'))
      return next
    })
    setPanelNotes(() => {
      const next = emptyPanelMap()
      for (const panel of COMMAND_PANELS) next[panel.id] = readStorage(panelKey(panel.id, 'notes'))
      return next
    })
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    localStorage.setItem(ACTIVE_WORK_KEY, activeWork)
  }, [activeWork, loaded])

  useEffect(() => {
    if (!loaded) return
    localStorage.setItem(PROMPT_QUEUE_KEY, promptQueue)
  }, [promptQueue, loaded])

  useEffect(() => {
    if (!loaded) return
    localStorage.setItem(LAST_REPORTS_KEY, lastReports)
  }, [lastReports, loaded])

  useEffect(() => {
    if (!loaded) return
    for (const panel of COMMAND_PANELS) localStorage.setItem(panelKey(panel.id, 'prompt'), panelPrompts[panel.id])
  }, [panelPrompts, loaded])

  useEffect(() => {
    if (!loaded) return
    for (const panel of COMMAND_PANELS) localStorage.setItem(panelKey(panel.id, 'response'), panelResponses[panel.id])
  }, [panelResponses, loaded])

  useEffect(() => {
    if (!loaded) return
    for (const panel of COMMAND_PANELS) localStorage.setItem(panelKey(panel.id, 'notes'), panelNotes[panel.id])
  }, [panelNotes, loaded])

  const showCopied = (label: string) => {
    setCopyStatus(label)
    window.setTimeout(() => setCopyStatus(null), 1400)
  }

  const updatePanelText = (
    setter: Dispatch<SetStateAction<PanelTextMap>>,
    panelId: CommandPanelId,
    value: string
  ) => {
    setter((current) => ({ ...current, [panelId]: value }))
  }

  const makeSnapshot = (): CommandCenterSnapshot => {
    const panels = COMMAND_PANELS.reduce((map, panel) => {
      map[panel.id] = {
        prompt: panelPrompts[panel.id],
        response: panelResponses[panel.id],
        notes: panelNotes[panel.id],
      }
      return map
    }, {} as CommandCenterSnapshot['panels'])

    return {
      timestamp: new Date().toISOString(),
      activeWork,
      promptQueue,
      lastReports,
      panels,
    }
  }

  const saveSnapshot = async () => {
    await copyText(JSON.stringify(makeSnapshot(), null, 2))
    showCopied('Snapshot copied')
  }

  const clearAll = () => {
    if (!window.confirm('Clear all Command Center fields on this device?')) return

    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key)
    }

    setActiveWork('')
    setPromptQueue('')
    setLastReports('')
    setPanelPrompts(emptyPanelMap())
    setPanelResponses(emptyPanelMap())
    setPanelNotes(emptyPanelMap())
  }

  const renderPanel = (panel: CommandPanel) => (
    <article key={panel.id} style={{ ...card, borderTop: `5px solid ${panel.accentColor}`, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <div style={{ width: 38, height: 38, borderRadius: '9px', backgroundColor: panel.accentColor, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: '14px' }}>
            {panel.icon}
          </div>
          <div>
            <h2 style={{ fontSize: '20px', margin: 0, color: '#0f172a' }}>{panel.name}</h2>
            <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '13px', fontWeight: 800 }}>{panel.purpose}</p>
          </div>
        </div>
        {panel.externalUrl && panel.externalLabel && (
          <a href={panel.externalUrl} target="_blank" rel="noopener noreferrer" style={{ color: panel.accentColor, fontSize: '12px', fontWeight: 900, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {panel.externalLabel}
          </a>
        )}
      </header>

      <p style={{ color: '#475569', backgroundColor: '#f8fafc', borderRadius: '8px', padding: '0.7rem', margin: 0, fontSize: '13px', lineHeight: 1.45 }}>
        {panel.currentRole}
      </p>

      <div>
        {fieldLabel('Prompt')}
        <textarea value={panelPrompts[panel.id]} onChange={(event) => updatePanelText(setPanelPrompts, panel.id, event.target.value)} style={textAreaStyle(126)} />
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          <button type="button" onClick={async () => { await copyText(panelPrompts[panel.id]); showCopied(`${panel.name} prompt copied`) }} style={button}>Copy Prompt</button>
          <button type="button" onClick={() => updatePanelText(setPanelPrompts, panel.id, '')} style={button}>Clear Prompt</button>
        </div>
      </div>

      <div>
        {fieldLabel('Response / Report Paste')}
        <textarea value={panelResponses[panel.id]} onChange={(event) => updatePanelText(setPanelResponses, panel.id, event.target.value)} style={textAreaStyle(126)} />
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          <button type="button" onClick={async () => { await copyText(panelResponses[panel.id]); showCopied(`${panel.name} response copied`) }} style={button}>Copy Response</button>
          <button type="button" onClick={() => updatePanelText(setPanelResponses, panel.id, '')} style={button}>Clear Response</button>
        </div>
      </div>

      <div>
        {fieldLabel('Notes / Status')}
        <input
          value={panelNotes[panel.id]}
          onChange={(event) => updatePanelText(setPanelNotes, panel.id, event.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.7rem', color: '#0f172a', fontSize: '14px' }}
        />
        <div style={{ marginTop: '0.5rem' }}>
          <button type="button" onClick={() => updatePanelText(setPanelNotes, panel.id, '')} style={button}>Clear Notes</button>
        </div>
      </div>
    </article>
  )

  return (
    <div style={page}>
      <style jsx>{`
        .command-center-panels {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1rem;
        }
        .command-center-top {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }
        @media (max-width: 1199px) {
          .command-center-panels {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 767px) {
          .command-center-panels,
          .command-center-top {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <p style={{ color: '#f97316', margin: '0 0 0.35rem', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Admin Workspace</p>
          <h1 style={{ color: '#0f172a', margin: 0, fontSize: '31px', lineHeight: 1.1 }}>Command Center</h1>
          <p style={{ color: '#64748b', margin: '0.5rem 0 0', fontSize: '14px', fontWeight: 700 }}>{today}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {copyStatus && <span style={{ color: '#166534', fontSize: '13px', fontWeight: 900 }}>{copyStatus}</span>}
          <button type="button" onClick={saveSnapshot} style={{ ...button, backgroundColor: '#f97316', borderColor: '#f97316', color: '#111827' }}>Save Snapshot</button>
          <button type="button" onClick={clearAll} style={{ ...button, borderColor: '#fecaca', color: '#991b1b' }}>Clear All</button>
        </div>
      </header>

      <section className="command-center-top" style={{ marginBottom: '1rem' }}>
        <div style={{ ...card, padding: '1rem' }}>
          {fieldLabel("Today's Active Work")}
          <textarea value={activeWork} onChange={(event) => setActiveWork(event.target.value)} style={textAreaStyle(150)} />
        </div>
        <div style={{ ...card, padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.4rem' }}>
            {fieldLabel('Next Prompt Queue')}
            <button type="button" onClick={async () => { await copyText(promptQueue); showCopied('Prompt queue copied') }} style={button}>Copy All Prompt Queue</button>
          </div>
          <textarea value={promptQueue} onChange={(event) => setPromptQueue(event.target.value)} style={textAreaStyle(150)} />
        </div>
      </section>

      <section className="command-center-panels" style={{ marginBottom: '1rem' }}>
        {COMMAND_PANELS.map(renderPanel)}
      </section>

      <section style={{ ...card, padding: '1rem', marginBottom: '1rem' }}>
        {fieldLabel('Last Reports')}
        <textarea value={lastReports} onChange={(event) => setLastReports(event.target.value)} style={textAreaStyle(170)} />
      </section>

      <footer style={{ ...card, padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <span style={{ color: '#64748b', fontSize: '13px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>External Tools</span>
        <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
          {COMMAND_CENTER_EXTERNAL_LINKS.map((link) => (
            <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" style={{ color: '#ea580c', fontSize: '13px', fontWeight: 900, textDecoration: 'none' }}>
              {link.label}
            </a>
          ))}
        </div>
      </footer>
    </div>
  )
}
