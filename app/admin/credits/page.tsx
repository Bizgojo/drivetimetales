'use client'

// CREDITS-WATCH-001 — /admin/credits. Every paid AI service: what it is used for, its balance,
// and the link to add credits. Low services first. Large type (Marc has low vision).

import { useEffect, useState } from 'react'

type Row = { id: string; name: string; usedFor: string; topUpUrl: string; card: string; status: string; balance: string | null; detail: string; lowBelow: string | null }
type Snapshot = { checkedAt: string; services: Row[] }

const ORDER: Record<string, number> = { low: 0, cannot_check: 1, not_connected: 2, ok: 3 }
const LABEL: Record<string, string> = { low: 'NEEDS CREDITS', cannot_check: 'Cannot check', not_connected: 'Not connected', ok: 'OK' }
const COLOR: Record<string, string> = { low: '#b91c1c', cannot_check: '#92400e', not_connected: '#555', ok: '#166534' }

export default function CreditsPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = (refresh: boolean) => {
    setBusy(true)
    setError(null)
    fetch(`/api/admin/credits${refresh ? '?refresh=1' : ''}`, { credentials: 'same-origin' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`); setSnap(j.snapshot) })
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setBusy(false))
  }
  useEffect(() => { load(false) }, [])

  const rows = [...(snap?.services || [])].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9))
  return (
    <main style={{ background: '#fff', color: '#111', minHeight: '100vh', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 34, fontWeight: 900, margin: '0 0 8px' }}>AI credits</h1>
      <p style={{ fontSize: 20, margin: '0 0 16px' }}>
        {snap ? `Checked ${new Date(snap.checkedAt).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET. Checks run every hour.` : 'Not checked yet.'}
      </p>
      <button onClick={() => load(true)} disabled={busy}
        style={{ fontSize: 22, fontWeight: 800, padding: '12px 20px', borderRadius: 10, border: '2px solid #111', background: '#111', color: '#fff', marginBottom: 20 }}>
        {busy ? 'Checking…' : 'Check now'}
      </button>
      {error && <p style={{ fontSize: 22, color: '#b91c1c', fontWeight: 800 }}>Could not load: {error}</p>}
      {rows.map((r) => (
        <section key={r.id} style={{ border: `3px solid ${COLOR[r.status] || '#111'}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 26, fontWeight: 900 }}>{r.name} — <span style={{ color: COLOR[r.status] }}>{LABEL[r.status] || r.status}</span></div>
          <div style={{ fontSize: 22, marginTop: 6 }}>Used for: {r.usedFor}</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>Balance: {r.balance || 'unknown'}{r.lowBelow ? ` (low below ${r.lowBelow})` : ''}</div>
          {r.detail && <div style={{ fontSize: 20, marginTop: 6 }}>{r.detail}</div>}
          <div style={{ fontSize: 22, marginTop: 10 }}>
            <a href={r.topUpUrl} target="_blank" rel="noreferrer" style={{ color: '#1d4ed8', fontWeight: 800 }}>Add credits</a> · Card: {r.card}
          </div>
        </section>
      ))}
    </main>
  )
}
