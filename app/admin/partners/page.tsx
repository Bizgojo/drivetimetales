'use client'
import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import QRCode from 'qrcode'

const bg = '#FAF9F6', card = '#fff', border = '#e5e7eb', text = '#111', muted = '#6b7280', orange = '#f97316'

interface Partner {
  id: string; name: string; slug: string; email: string | null; phone: string | null
  notes: string | null; is_active: boolean; qr_url: string | null; created_at: string
  agreement?: Agreement
  stats?: { scans: number; trials: number; subs: number; owed: number }
}
interface Agreement {
  id?: string; scan_rate: number; trial_rate: number; sub_rate: number
  sub_payout_type: string; sub_payout_months: number; effective_date: string
}
interface Payout {
  id: string; period_start: string; period_end: string; scan_count: number
  trial_count: number; sub_count: number; total_amount: number; status: string
  paid_at: string | null; notes: string | null; partner?: { name: string }
}

const APP_URL = 'https://endless-tales.com'

function fmt$(n: number) { return '$' + n.toFixed(2) }

export default function AdminPartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'directory' | 'payouts'>('directory')
  const [selected, setSelected] = useState<Partner | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', email: '', phone: '', notes: '' })
  const [agreement, setAgreement] = useState<Agreement>({ scan_rate: 0, trial_rate: 0, sub_rate: 0, sub_payout_type: 'one_time', sub_payout_months: 1, effective_date: new Date().toISOString().split('T')[0] })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [generatingPayout, setGeneratingPayout] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: pp }, { data: po }] = await Promise.all([
      supabase.from('partners').select('*').order('created_at', { ascending: false }),
      supabase.from('partner_payouts').select('*, partners(name)').order('created_at', { ascending: false }).limit(50),
    ])

    // Load stats per partner
    const { data: events } = await supabase.from('partner_events').select('partner_id, event_type, amount_owed, paid_out')
    const statsMap: Record<string, Partner['stats']> = {}
    ;(events || []).forEach((e: any) => {
      if (!statsMap[e.partner_id]) statsMap[e.partner_id] = { scans: 0, trials: 0, subs: 0, owed: 0 }
      const s = statsMap[e.partner_id]!
      if (e.event_type === 'scan') s.scans++
      if (e.event_type === 'trial') s.trials++
      if (e.event_type === 'subscription') s.subs++
      if (!e.paid_out) s.owed += Number(e.amount_owed)
    })

    // Load agreements
    const { data: agreements } = await supabase.from('partner_agreements').select('*').order('effective_date', { ascending: false })
    const agreementMap: Record<string, Agreement> = {}
    ;(agreements || []).forEach((a: any) => {
      if (!agreementMap[a.partner_id]) agreementMap[a.partner_id] = a
    })

    const enriched = (pp || []).map((p: any) => ({
      ...p,
      stats: statsMap[p.id] || { scans: 0, trials: 0, subs: 0, owed: 0 },
      agreement: agreementMap[p.id],
    }))

    setPartners(enriched)
    setPayouts((po || []).map((p: any) => ({ ...p, partner: p.partners })))
    setLoading(false)
  }

  async function generateQR(partner: Partner) {
    const url = `${APP_URL}/?partner=${partner.slug}`
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: '#000', light: '#fff' } })
      setQrDataUrl(dataUrl)
      return dataUrl
    } catch { return null }
  }

  async function savePartner() {
    setSaving(true); setMsg('')
    const slug = form.slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const { data: p, error } = await supabase.from('partners').insert({
      name: form.name.trim(), slug, email: form.email || null,
      phone: form.phone || null, notes: form.notes || null,
    }).select().single()
    if (error) { setMsg('Error: ' + error.message); setSaving(false); return }

    // Save agreement
    if (agreement.scan_rate > 0 || agreement.trial_rate > 0 || agreement.sub_rate > 0) {
      await supabase.from('partner_agreements').insert({ ...agreement, partner_id: p.id })
    }

    setMsg('Partner created!'); setShowForm(false)
    setForm({ name: '', slug: '', email: '', phone: '', notes: '' })
    load()
    setSaving(false)
  }

  async function saveAgreement(partnerId: string) {
    setSaving(true)
    const { data: existing } = await supabase.from('partner_agreements').select('id').eq('partner_id', partnerId).order('effective_date', { ascending: false }).limit(1).single()
    if (existing) {
      await supabase.from('partner_agreements').update({ ...agreement }).eq('id', existing.id)
    } else {
      await supabase.from('partner_agreements').insert({ ...agreement, partner_id: partnerId })
    }
    setMsg('Agreement saved!')
    setSaving(false)
    load()
  }

  async function generateMonthlyPayout(partnerId: string, partnerName: string) {
    setGeneratingPayout(true)
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0)

    const { data: events } = await supabase.from('partner_events')
      .select('*').eq('partner_id', partnerId).eq('paid_out', false)
      .gte('created_at', start.toISOString()).lte('created_at', end.toISOString())

    if (!events || events.length === 0) { setMsg('No unpaid events for this period'); setGeneratingPayout(false); return }

    let scanCount = 0, scanAmount = 0, trialCount = 0, trialAmount = 0, subCount = 0, subAmount = 0
    events.forEach((e: any) => {
      if (e.event_type === 'scan') { scanCount++; scanAmount += Number(e.amount_owed) }
      if (e.event_type === 'trial') { trialCount++; trialAmount += Number(e.amount_owed) }
      if (e.event_type === 'subscription') { subCount++; subAmount += Number(e.amount_owed) }
    })
    const total = scanAmount + trialAmount + subAmount

    await supabase.from('partner_payouts').insert({
      partner_id: partnerId, period_start: start.toISOString().split('T')[0],
      period_end: end.toISOString().split('T')[0], scan_count: scanCount, scan_amount: scanAmount,
      trial_count: trialCount, trial_amount: trialAmount, sub_count: subCount, sub_amount: subAmount,
      total_amount: total, status: 'pending',
    })

    // Mark events as paid out
    await supabase.from('partner_events').update({ paid_out: true }).in('id', events.map((e: any) => e.id))
    setMsg(`Payout generated for ${partnerName}: ${fmt$(total)}`)
    setGeneratingPayout(false)
    load()
  }

  async function markPaid(payoutId: string) {
    await supabase.from('partner_payouts').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', payoutId)
    load()
  }

  const cell = { padding: '10px 12px', borderBottom: `1px solid ${border}`, fontSize: 13, color: text }
  const th = { ...cell, fontWeight: 600, color: muted, background: '#f9fafb', fontSize: 12 }

  if (loading) return <div style={{ padding: 32, color: muted }}>Loading...</div>

  return (
    <div style={{ background: bg, minHeight: '100vh', padding: '24px 28px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: text, margin: 0 }}>Partner Program</h1>
          <p style={{ color: muted, fontSize: 13, margin: '4px 0 0' }}>QR tracking, agreements, and payouts</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ background: orange, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Add Partner</button>
      </div>

      {msg && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 16px', color: '#166534', fontSize: 13, marginBottom: 16 }}>{msg}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${border}`, paddingBottom: 0 }}>
        {(['directory', 'payouts'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', borderBottom: tab === t ? `2px solid ${orange}` : '2px solid transparent', padding: '8px 16px', fontWeight: tab === t ? 700 : 400, color: tab === t ? orange : muted, fontSize: 13, cursor: 'pointer', textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>

      {/* Directory tab */}
      {tab === 'directory' && (
        <div>
          {partners.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: muted }}>No partners yet. Add your first partner above.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {partners.map(p => (
                <div key={p.id} style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden' }}>
                  {/* Partner header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: p.is_active ? '#dcfce7' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                        {p.is_active ? '✓' : '—'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: text }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: muted }}>{APP_URL}/?partner={p.slug}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>Owes {fmt$(p.stats?.owed || 0)}</span>
                      <button onClick={() => { setSelected(selected?.id === p.id ? null : p); if (p.agreement) setAgreement(p.agreement) }} style={{ background: 'none', border: `1px solid ${border}`, borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: muted }}>
                        {selected?.id === p.id ? 'Close' : 'Manage'}
                      </button>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: `1px solid ${border}` }}>
                    {[
                      { label: 'Scans', value: p.stats?.scans || 0 },
                      { label: 'Trials', value: p.stats?.trials || 0 },
                      { label: 'Subscriptions', value: p.stats?.subs || 0 },
                      { label: 'Total owed', value: fmt$(p.stats?.owed || 0) },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '10px 16px', borderRight: `1px solid ${border}` }}>
                        <div style={{ fontSize: 11, color: muted, marginBottom: 2 }}>{s.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: text }}>{s.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Expanded management panel */}
                  {selected?.id === p.id && (
                    <div style={{ padding: '18px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

                      {/* QR Code */}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: text, marginBottom: 10 }}>QR Code</div>
                        {qrDataUrl ? (
                          <div>
                            <img src={qrDataUrl} alt="QR" style={{ width: 140, height: 140, borderRadius: 8 }} />
                            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                              <a href={qrDataUrl} download={`${p.slug}-qr.png`} style={{ background: orange, color: '#fff', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Download</a>
                              <button onClick={() => setQrDataUrl(null)} style={{ background: 'none', border: `1px solid ${border}`, borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', color: muted }}>Clear</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => generateQR(p)} style={{ background: '#f3f4f6', border: `1px solid ${border}`, borderRadius: 8, padding: '12px 20px', fontSize: 13, cursor: 'pointer', color: text }}>Generate QR Code</button>
                        )}
                        <div style={{ marginTop: 12, fontSize: 12, color: muted }}>
                          <div>{p.email || '—'}</div>
                          <div>{p.phone || '—'}</div>
                          {p.notes && <div style={{ marginTop: 4, fontStyle: 'italic' }}>{p.notes}</div>}
                        </div>
                      </div>

                      {/* Agreement */}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: text, marginBottom: 10 }}>Pay Agreement</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {[
                            { label: '$ per scan', key: 'scan_rate' },
                            { label: '$ per trial', key: 'trial_rate' },
                            { label: '$ per subscription', key: 'sub_rate' },
                          ].map(f => (
                            <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <label style={{ fontSize: 12, color: muted, width: 110 }}>{f.label}</label>
                              <input type="number" step="0.01" value={(agreement as any)[f.key]} onChange={e => setAgreement(a => ({ ...a, [f.key]: parseFloat(e.target.value) || 0 }))} style={{ width: 80, padding: '5px 8px', border: `1px solid ${border}`, borderRadius: 6, fontSize: 13 }} />
                            </div>
                          ))}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <label style={{ fontSize: 12, color: muted, width: 110 }}>Sub payout</label>
                            <select value={agreement.sub_payout_type} onChange={e => setAgreement(a => ({ ...a, sub_payout_type: e.target.value }))} style={{ padding: '5px 8px', border: `1px solid ${border}`, borderRadius: 6, fontSize: 13 }}>
                              <option value="one_time">One-time</option>
                              <option value="monthly">Monthly</option>
                            </select>
                            {agreement.sub_payout_type === 'monthly' && (
                              <input type="number" value={agreement.sub_payout_months} onChange={e => setAgreement(a => ({ ...a, sub_payout_months: parseInt(e.target.value) || 1 }))} style={{ width: 50, padding: '5px 8px', border: `1px solid ${border}`, borderRadius: 6, fontSize: 13 }} />
                            )}
                            {agreement.sub_payout_type === 'monthly' && <span style={{ fontSize: 11, color: muted }}>months</span>}
                          </div>
                          <button onClick={() => saveAgreement(p.id)} disabled={saving} style={{ background: orange, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', marginTop: 4 }}>
                            {saving ? 'Saving...' : 'Save Agreement'}
                          </button>
                        </div>
                      </div>

                      {/* Payout actions */}
                      <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${border}`, paddingTop: 14 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: text, marginBottom: 8 }}>Generate Payout</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button onClick={() => generateMonthlyPayout(p.id, p.name)} disabled={generatingPayout} style={{ background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                            {generatingPayout ? 'Generating...' : 'Generate Last Month Payout'}
                          </button>
                          <span style={{ fontSize: 12, color: muted }}>Tallies all unpaid scan, trial, and subscription events</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Payouts tab */}
      {tab === 'payouts' && (
        <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden' }}>
          {payouts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: muted }}>No payouts generated yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Partner', 'Period', 'Scans', 'Trials', 'Subs', 'Total', 'Status', ''].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payouts.map(po => (
                  <tr key={po.id}>
                    <td style={cell}>{(po.partner as any)?.name || '—'}</td>
                    <td style={{ ...cell, fontSize: 12 }}>{po.period_start} → {po.period_end}</td>
                    <td style={cell}>{po.scan_count}</td>
                    <td style={cell}>{po.trial_count}</td>
                    <td style={cell}>{po.sub_count}</td>
                    <td style={{ ...cell, fontWeight: 700 }}>{fmt$(po.total_amount)}</td>
                    <td style={cell}>
                      <span style={{ background: po.status === 'paid' ? '#dcfce7' : '#fef3c7', color: po.status === 'paid' ? '#166534' : '#92400e', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                        {po.status}
                      </span>
                    </td>
                    <td style={cell}>
                      {po.status !== 'paid' && (
                        <button onClick={() => markPaid(po.id)} style={{ background: '#dcfce7', color: '#166534', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Mark Paid</button>
                      )}
                      {po.paid_at && <span style={{ fontSize: 11, color: muted }}>{new Date(po.paid_at).toLocaleDateString()}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Add Partner Modal */}
      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: card, borderRadius: 16, padding: 28, width: 480, maxWidth: '90vw' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: text, margin: '0 0 20px' }}>Add Partner</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Partner name *', key: 'name', placeholder: 'Acme Trucking Co.' },
                { label: 'Slug (URL) *', key: 'slug', placeholder: 'acme-trucking' },
                { label: 'Email', key: 'email', placeholder: 'partner@example.com' },
                { label: 'Phone', key: 'phone', placeholder: '+1 555 000 0000' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 4 }}>{f.label}</label>
                  <input value={(form as any)[f.key]} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))} placeholder={f.placeholder} style={{ width: '100%', padding: '8px 10px', border: `1px solid ${border}`, borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 4 }}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(fm => ({ ...fm, notes: e.target.value }))} rows={2} style={{ width: '100%', padding: '8px 10px', border: `1px solid ${border}`, borderRadius: 8, fontSize: 14, boxSizing: 'border-box', resize: 'none' }} />
              </div>
              <div style={{ borderTop: `1px solid ${border}`, paddingTop: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: text, marginBottom: 8 }}>Pay rates (optional — set now or later)</div>
                {[
                  { label: '$ per scan', key: 'scan_rate' },
                  { label: '$ per trial', key: 'trial_rate' },
                  { label: '$ per subscription', key: 'sub_rate' },
                ].map(f => (
                  <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <label style={{ fontSize: 12, color: muted, width: 120 }}>{f.label}</label>
                    <input type="number" step="0.01" value={(agreement as any)[f.key]} onChange={e => setAgreement(a => ({ ...a, [f.key]: parseFloat(e.target.value) || 0 }))} style={{ width: 80, padding: '5px 8px', border: `1px solid ${border}`, borderRadius: 6, fontSize: 13 }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button onClick={() => setShowForm(false)} style={{ background: 'none', border: `1px solid ${border}`, borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', color: muted }}>Cancel</button>
                <button onClick={savePartner} disabled={saving || !form.name || !form.slug} style={{ background: orange, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Create Partner'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
