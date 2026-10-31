// app/admin/marketing/approvals/[campaignId]/page.tsx — Campaign Approval Card.
// Spec Sec 2 (layout top-to-bottom) + Sec 3 (previews) + Sec 5 (test panel) +
// Sec 7 (buttons) + Sec 10 (LAUNCH/PAUSE after approval).
// Admin UI rule: light background, black text, 18px+ body, 22px+ buttons.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

interface CardData {
  success: boolean
  error?: string
  message?: string
  campaignId?: string
  versionHash?: string
  shortHash?: string
  changedSinceApproval?: boolean
  approveEnabled?: boolean
  approval?: { status: string; decided_by?: string; decided_at?: string; spend_ceiling?: string; notes?: string } | null
  testResults?: Record<string, string>
  destinationUrl?: string
  shareablePreviewLink?: string | null
  live?: boolean
  ads?: Array<{
    adId: string; name?: string; configured_status?: string; effective_status?: string
    headline?: string; primaryText?: string; ctaType?: string; videoId?: string | null
  }>
}

interface PreviewData {
  success: boolean
  previews?: Array<{ placement: string; iframe_html: string | null; error: string | null }>
  internalSimulation?: boolean
  unavailableNote?: string | null
  shareablePreviewLink?: string | null
  destinationUrl?: string | null
  videoId?: string | null
}

const btn: React.CSSProperties = {
  fontSize: '22px', fontWeight: 700, padding: '0.9rem 1.4rem',
  borderRadius: '10px', border: '2px solid #111', cursor: 'pointer',
}

export default function ApprovalCardPage() {
  const params = useParams()
  const search = useSearchParams()
  const campaignId = String(params.campaignId || '')
  const adIds = search.get('ad_ids') || ''

  const [card, setCard] = useState<CardData | null>(null)
  const [previews, setPreviews] = useState<PreviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [ownerTested, setOwnerTested] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setMsg(null)
    try {
      const qs = new URLSearchParams({ ad_ids: adIds })
      const r = await fetch(`/api/admin/marketing/approvals/${campaignId}?${qs}`, { cache: 'no-store' })
      const j = (await r.json()) as CardData
      setCard(j)
      if (j.success && j.ads?.length) {
        const p = await fetch(
          `/api/admin/marketing/approvals/${campaignId}/previews?ad_id=${j.ads[0].adId}`,
          { cache: 'no-store' }
        )
        setPreviews(await p.json())
      }
    } catch (e: any) {
      setCard({ success: false, error: e?.message || String(e) })
    } finally {
      setLoading(false)
    }
  }, [campaignId, adIds])

  useEffect(() => {
    if (campaignId && adIds) load()
    else {
      setLoading(false)
      setCard({ success: false, error: 'Open this card with ?ad_ids=<meta_ad_id,...> for the PAUSED draft ads.' })
    }
  }, [campaignId, adIds, load])

  async function post(path: string, body: unknown, label: string) {
    setBusy(label)
    setMsg(null)
    try {
      const r = await fetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!j.success) setMsg(`FAILED: ${j.error || 'unknown'} — ${j.message || ''}`)
      else {
        setMsg(`${label} recorded.`)
        await load()
      }
    } catch (e: any) {
      setMsg(`FAILED: ${e?.message || e}`)
    } finally {
      setBusy(null)
    }
  }

  const runTests = () =>
    post(`/api/admin/marketing/approvals/${campaignId}/test`, {
      version_hash: card?.versionHash,
      destination_url: card?.destinationUrl,
      video_url: null,
      owner_tested_personally: ownerTested,
    }, 'Test run')

  const decide = (action: 'approve' | 'request_changes' | 'reject') =>
    post(`/api/admin/marketing/approvals/${campaignId}`, {
      version_hash: card?.versionHash, action, notes,
    }, action)

  const launch = () =>
    post(`/api/admin/marketing/approvals/${campaignId}/launch`, {
      version_hash: card?.versionHash,
      ad_ids: (card?.ads || []).map((a) => a.adId),
    }, 'LAUNCH')

  const pause = () =>
    post(`/api/admin/marketing/approvals/${campaignId}/pause`, {
      version_hash: card?.versionHash,
      ad_ids: (card?.ads || []).map((a) => a.adId),
    }, 'PAUSE')

  const cell: React.CSSProperties = { fontSize: '18px', color: '#000' }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', background: '#fff', color: '#000', minHeight: '100vh' }}>
      <a href="/admin/marketing/approvals" style={{ fontSize: '18px' }}>← All approvals</a>
      <h1 style={{ fontSize: '28px', fontWeight: 800, margin: '0.5rem 0' }}>Campaign Approval Card</h1>
      {loading && <p style={cell}>Loading live Meta data…</p>}
      {card && !card.success && <p style={{ ...cell, color: '#b00020' }}>{card.error} {card.message || ''}</p>}

      {card?.success && (
        <>
          <p style={cell}>
            Version hash: <code>{card.shortHash}</code>
            {card.changedSinceApproval && (
              <strong style={{ color: '#b00020' }}> — CHANGED SINCE APPROVAL — needs re-approval. Launch blocked.</strong>
            )}
            {card.live && <strong style={{ color: '#0a7d00' }}> — LIVE</strong>}
          </p>

          <h2 style={{ fontSize: '24px' }}>Ad previews (fresh from Meta)</h2>
          {previews?.internalSimulation && (
            <p style={{ ...cell, background: '#fff3cd', border: '2px solid #856404', padding: '1rem' }}>
              INTERNAL SIMULATION — NOT META&apos;S PREVIEW. Approve stays disabled until a real Meta preview loads (Marc may override in writing).
            </p>
          )}
          {previews?.shareablePreviewLink && (
            <p style={cell}>
              <a href={previews.shareablePreviewLink} target="_blank" rel="noreferrer">
                Open on my phone in Facebook/Instagram
              </a>
            </p>
          )}
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {(previews?.previews || []).map((p) => (
              <div key={p.placement} style={{ border: '2px solid #111', borderRadius: '12px', padding: '1rem' }}>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>{p.placement}</div>
                {p.iframe_html
                  ? <div dangerouslySetInnerHTML={{ __html: p.iframe_html }} />
                  : <p style={cell}>Preview unavailable: {p.error}</p>}
                {card.destinationUrl && (
                  <p style={cell}>
                    <a href={card.destinationUrl} target="_blank" rel="noreferrer">Tap the CTA</a>
                  </p>
                )}
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: '24px' }}>Creative (from Meta, not retyped)</h2>
          {(card.ads || []).map((a) => (
            <div key={a.adId} style={{ ...cell, border: '1px solid #999', borderRadius: '8px', padding: '1rem', marginBottom: '0.5rem' }}>
              <div><strong>{a.name || a.adId}</strong> — {a.effective_status}</div>
              <div>Headline: {a.headline || '—'}</div>
              <div>Primary text: {a.primaryText || '—'}</div>
              <div>CTA: {a.ctaType || '—'}</div>
            </div>
          ))}
          <p style={cell}>Destination URL: {card.destinationUrl ? <a href={card.destinationUrl} target="_blank" rel="noreferrer">{card.destinationUrl}</a> : '—'}</p>

          <h2 style={{ fontSize: '24px' }}>Test status</h2>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              {Object.entries(card.testResults || {}).map(([check, result]) => (
                <tr key={check} style={{ borderBottom: '1px solid #999' }}>
                  <td style={{ ...cell, padding: '0.5rem' }}>{check}</td>
                  <td style={{ ...cell, padding: '0.5rem', fontWeight: 700,
                    color: result === 'pass' ? '#0a7d00' : result === 'fail' ? '#b00020' : '#000' }}>
                    {String(result).toUpperCase().replace('_', ' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 style={{ fontSize: '24px' }}>Marc&apos;s buttons</h2>
          <label style={{ ...cell, display: 'block', marginBottom: '1rem' }}>
            <input type="checkbox" checked={ownerTested} onChange={(e) => setOwnerTested(e.target.checked)}
              style={{ width: '24px', height: '24px', marginRight: '0.5rem' }} />
            Owner tested personally (started from the Meta preview on my phone)
          </label>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button style={{ ...btn, background: '#111', color: '#fff' }} disabled={!!busy} onClick={runTests}>
              {busy === 'Test run' ? 'Testing…' : 'TEST THIS AD'}
            </button>
            <button style={{ ...btn, background: card.approveEnabled ? '#0a7d00' : '#ccc', color: '#fff' }}
              disabled={!!busy || !card.approveEnabled} onClick={() => decide('approve')}
              title={card.approveEnabled ? 'Approve' : 'Disabled until all six checks Pass on the current hash'}>
              APPROVE &amp; AUTHORIZE
            </button>
            <button style={{ ...btn, background: '#fff' }} disabled={!!busy} onClick={() => decide('request_changes')}>
              REQUEST CHANGES
            </button>
            <button style={{ ...btn, background: '#fff', borderColor: '#b00020', color: '#b00020' }}
              disabled={!!busy} onClick={() => decide('reject')}>
              REJECT
            </button>
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes for Susan (request changes / rejection reason)"
            style={{ fontSize: '18px', width: '100%', minHeight: '90px', marginTop: '1rem', color: '#000' }} />

          {card.approval && (card.approval.status === 'approved' || card.approval.status === 'live' || card.approval.status === 'paused') && (
            <>
              <h2 style={{ fontSize: '24px' }}>Launch</h2>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button style={{ ...btn, background: '#0a7d00', color: '#fff' }} disabled={!!busy} onClick={launch}>
                  {busy === 'LAUNCH' ? 'Launching…' : 'LAUNCH'}
                </button>
                <button style={{ ...btn, background: '#fff' }} disabled={!!busy} onClick={pause}>
                  {busy === 'PAUSE' ? 'Pausing…' : 'PAUSE'}
                </button>
              </div>
            </>
          )}
          {msg && <p style={{ ...cell, fontWeight: 700, marginTop: '1rem' }}>{msg}</p>}
        </>
      )}
    </div>
  )
}
