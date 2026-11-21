'use client'
// /admin/voice-approval — VOICE-APPROVAL-001 (Marc, 2026-11-18)
// Big type, big Play buttons, iPhone-first. One page per story.
// Approving a voice writes the roster only. No audio is generated here.

import { useEffect, useMemo, useState } from 'react'

type Char = {
  name: string
  gender: string | null
  age: number | null
  age_unknown: boolean
  description: string | null
  relation: string | null
  current_voice: { voice_id: string | null; voice_name: string | null }
  is_locked: boolean
  line: string | null
}

type Voice = { voice_id: string; name: string; gender?: string; age?: string; accent?: string }

const SERIES_LIST = [
  'Storm Season Vows',
  "The Nanny's Rule",
]

export default function VoiceApprovalPage() {
  const [series, setSeries] = useState(SERIES_LIST[0])
  const [chars, setChars] = useState<Char[]>([])
  const [seriesId, setSeriesId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    fetch(`/api/admin/voice-approval?series=${encodeURIComponent(series)}`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        return j
      })
      .then((j) => {
        if (!alive) return
        setChars(j.characters || [])
        setSeriesId(j.series_id)
      })
      .catch((e) => alive && setError(String(e.message || e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [series])

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px 80px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1 style={{ fontSize: 34, lineHeight: 1.15, margin: '8px 0 16px', fontWeight: 800, textTransform: 'uppercase' }}>
        {series} — Voice Approval
      </h1>

      <label style={{ display: 'block', fontSize: 15, color: '#555', marginBottom: 6 }}>Story</label>
      <select
        value={series}
        onChange={(e) => setSeries(e.target.value)}
        style={{ width: '100%', fontSize: 20, padding: 12, borderRadius: 10, border: '2px solid #ddd', marginBottom: 18 }}
      >
        {SERIES_LIST.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <p style={{ fontSize: 16, color: '#555', lineHeight: 1.5, background: '#f6f6f6', padding: 12, borderRadius: 10 }}>
        Nothing changes in live audio until you approve. Each sample costs 1 ElevenLabs credit per character of the line.
      </p>

      {loading && <p style={{ fontSize: 20 }}>Loading…</p>}
      {error && <p style={{ fontSize: 18, color: '#b00020' }}>Error: {error}</p>}

      {!loading && !error && chars.map((c) => (
        <CharCard key={c.name} c={c} seriesId={seriesId} />
      ))}
    </main>
  )
}

function CharCard({ c, seriesId }: { c: Char; seriesId: string | null }) {
  const [options, setOptions] = useState<Voice[]>([])
  const [picked, setPicked] = useState<string>(c.current_voice.voice_id || '')
  const [pickedName, setPickedName] = useState<string>(c.current_voice.voice_name || '')
  const [manualId, setManualId] = useState('')
  const [age, setAge] = useState<string>(c.age != null ? String(c.age) : '')
  const [busy, setBusy] = useState<string | null>(null)
  const [approved, setApproved] = useState<string | null>(null)
  const [loadOpts, setLoadOpts] = useState(false)

  const line = c.line || 'This line is not in the script yet.'

  async function loadOptions() {
    setLoadOpts(true)
    try {
      const r = await fetch('/api/admin/voice-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // VOICE-APPROVAL-003: series_id lets the API scope similarity to THIS story.
        body: JSON.stringify({
          action: 'read-voices',
          gender: c.gender,
          age: c.age,
          series_id: seriesId,
          exclude_character: c.name,
        }),
      })
      const j = await r.json()
      setOptions((j.voices || []).slice(0, 3))
    } finally {
      setLoadOpts(false)
    }
  }

  async function play(voiceId: string) {
    if (!voiceId) return
    setBusy(voiceId)
    try {
      const r = await fetch('/api/admin/voice-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sample', voice_id: voiceId, text: line }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        alert(j.error || `Play failed (${r.status})`)
        return
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = new Audio(url)
      a.play().catch(() => {})
    } finally {
      setBusy(null)
    }
  }

  async function approve(voiceId: string, voiceName: string) {
    if (!seriesId) return
    setBusy('approve')
    try {
      const r = await fetch('/api/admin/voice-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          series_id: seriesId,
          character: c.name,
          voice_id: voiceId,
          voice_name: voiceName,
          age: age === '' ? null : Number(age),
        }),
      })
      const j = await r.json()
      if (!r.ok) {
        alert(j.error || 'Approve failed')
        return
      }
      setApproved(`Saved. Re-voice estimate: ${j.estimated_credits.toLocaleString()} credits (no audio generated).`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section style={{ border: '2px solid #e3e3e3', borderRadius: 14, padding: 16, marginBottom: 18 }}>
      <h2 style={{ fontSize: 26, margin: '0 0 6px', fontWeight: 800 }}>{c.name}</h2>

      <div style={{ fontSize: 18, marginBottom: 4 }}>
        Age:{' '}
        {c.age_unknown ? (
          <strong style={{ color: '#b00020' }}>AGE UNKNOWN</strong>
        ) : (
          <strong>{c.age}</strong>
        )}
      </div>
      <div style={{ fontSize: 18, marginBottom: 4 }}>Gender: <strong>{c.gender || 'unknown'}</strong></div>
      {c.relation && <div style={{ fontSize: 18, marginBottom: 4 }}>Relation: <strong>{c.relation}</strong></div>}
      <p style={{ fontSize: 17, color: '#333', lineHeight: 1.5, margin: '8px 0 14px' }}>{c.description}</p>

      <div style={{ background: '#f3f6fb', borderRadius: 10, padding: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 15, color: '#555', marginBottom: 6 }}>Line used for every sample</div>
        <div style={{ fontSize: 19, fontStyle: 'italic' }}>“{line}”</div>
      </div>

      <div style={{ fontSize: 15, color: '#555', marginBottom: 6 }}>Current voice</div>
      <BigPlay
        label={`${c.current_voice.voice_name || 'none'} — ${c.current_voice.voice_id || 'no id'}`}
        disabled={!c.current_voice.voice_id || busy === c.current_voice.voice_id}
        onClick={() => c.current_voice.voice_id && play(c.current_voice.voice_id)}
      />

      {!loadOpts && (
        <button
          onClick={loadOptions}
          style={{ fontSize: 18, padding: '12px 16px', borderRadius: 10, border: '2px solid #0b57d0', background: '#fff', color: '#0b57d0', marginTop: 12, width: '100%' }}
        >
          Show 3 matching voice options
        </button>
      )}

      {options.map((v) => (
        <div key={v.voice_id} style={{ marginTop: 12 }}>
          <BigPlay
            label={`${v.name} — ${v.voice_id}`}
            sub={`${v.gender || ''} ${v.age || ''} ${v.accent || ''}`}
            disabled={busy === v.voice_id}
            onClick={() => play(v.voice_id)}
          />
          {/* VOICE-APPROVAL-003: only a clash INSIDE this story is flagged. A voice
              used by another series is fine and stays unmarked. */}
          {v.used_by_in_story && (
            <div style={{ marginTop: 6, fontSize: 15, color: '#b3261e', fontWeight: 600 }}>
              ⚠ Already used in this story by {v.used_by_in_story}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={() => {
                setPicked(v.voice_id)
                setPickedName(v.name)
              }}
              style={{ flex: 1, fontSize: 17, padding: 12, borderRadius: 10, border: '2px solid #ccc', background: picked === v.voice_id ? '#e8f0fe' : '#fff' }}
            >
              {picked === v.voice_id ? '✓ Selected' : 'Select'}
            </button>
            <button
              onClick={() => approve(v.voice_id, v.name)}
              disabled={busy === 'approve'}
              style={{ flex: 1, fontSize: 17, fontWeight: 700, padding: 12, borderRadius: 10, border: 'none', background: '#0b8043', color: '#fff' }}
            >
              Approve
            </button>
          </div>
        </div>
      ))}

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 15, color: '#555', marginBottom: 6 }}>Try another voice — paste ElevenLabs voice ID</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={manualId}
            onChange={(e) => setManualId(e.target.value.trim())}
            placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
            style={{ flex: 1, fontSize: 17, padding: 12, borderRadius: 10, border: '2px solid #ddd' }}
          />
          <button
            onClick={() => {
              setPicked(manualId)
              setPickedName(manualId)
              play(manualId)
            }}
            disabled={!manualId}
            style={{ fontSize: 17, padding: '12px 18px', borderRadius: 10, border: 'none', background: '#0b57d0', color: '#fff' }}
          >
            Play
          </button>
        </div>
        {manualId && (
          <button
            onClick={() => approve(manualId, manualId)}
            style={{ width: '100%', marginTop: 8, fontSize: 17, fontWeight: 700, padding: 12, borderRadius: 10, border: 'none', background: '#0b8043', color: '#fff' }}
          >
            Approve this ID
          </button>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={{ fontSize: 15, color: '#555' }}>Age (saved with the approval)</label>
        <input
          value={age}
          onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="e.g. 34"
          inputMode="numeric"
          style={{ display: 'block', width: '100%', fontSize: 18, padding: 12, borderRadius: 10, border: '2px solid #ddd', marginTop: 6 }}
        />
      </div>

      {approved && (
        <p style={{ marginTop: 12, fontSize: 17, color: '#0b8043', fontWeight: 600 }}>{approved}</p>
      )}
      {picked && <p style={{ fontSize: 14, color: '#777', marginTop: 10 }}>Selected: {pickedName} ({picked})</p>}
    </section>
  )
}

function BigPlay({
  label,
  sub,
  onClick,
  disabled,
}: {
  label: string
  sub?: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        width: '100%',
        textAlign: 'left',
        fontSize: 18,
        padding: 16,
        borderRadius: 12,
        border: '2px solid #ddd',
        background: disabled ? '#f0f0f0' : '#fff',
        minHeight: 64,
      }}
    >
      <span style={{ fontSize: 28, lineHeight: 1 }}>▶️</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontWeight: 600 }}>{label}</span>
        {sub && <span style={{ display: 'block', fontSize: 14, color: '#666' }}>{sub}</span>}
      </span>
    </button>
  )
}
