// app/admin/marketing/approvals/page.tsx — Amendment 1 (Sec 1.1).
// List of campaigns in the Airtable "Approval Pipeline" view.
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

interface Campaign {
  id: string
  fields: Record<string, unknown>
}

export default function ApprovalsListPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/marketing/campaigns?view=Approval%20Pipeline', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json()
        if (!j.success) throw new Error(j.error || 'Failed to load')
        setCampaigns(j.campaigns || [])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding: '2rem', maxWidth: '1100px', background: '#fff', color: '#000', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 800, margin: '0 0 0.5rem' }}>Campaign Approvals</h1>
      <p style={{ fontSize: '18px', margin: '0 0 1.5rem' }}>
        Campaigns awaiting review. Open a card to preview the live Meta ad, run the six tests, and approve.
      </p>
      {loading && <p style={{ fontSize: '18px' }}>Loading…</p>}
      {error && <p style={{ fontSize: '18px', color: '#b00020' }}>Error: {error}</p>}
      {!loading && !error && campaigns.length === 0 && (
        <p style={{ fontSize: '18px' }}>No campaigns in the Approval Pipeline.</p>
      )}
      <div style={{ display: 'grid', gap: '1rem' }}>
        {campaigns.map((c) => (
          <Link
            key={c.id}
            href={`/admin/marketing/approvals/${c.id}`}
            style={{
              display: 'block', background: '#fff', border: '2px solid #111',
              borderRadius: '12px', padding: '1.25rem', textDecoration: 'none', color: '#000',
            }}
          >
            <div style={{ fontSize: '22px', fontWeight: 700 }}>
              {String(c.fields['Campaign Name'] || c.id)}
            </div>
            <div style={{ fontSize: '18px', marginTop: '0.25rem' }}>
              Status: {String(c.fields['Status'] || '—')} · Ceiling: {String(c.fields['Forecast Spend'] ?? '—')} ·
              Forecast CAC: {String(c.fields['Forecast CAC'] ?? '—')}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
