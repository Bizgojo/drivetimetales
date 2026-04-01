'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const bg = '#FAF9F6'
const card = '#fff'
const border = '#e5e7eb'
const text = '#111'
const muted = '#6b7280'
const orange = '#f97316'

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ background: color + '22', color, border: `1px solid ${color}55`, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{children}</span>
}

function defaultBody(code: string, days: number) {
  return `Hi there,

I wanted to personally invite you to try Endless Tales — original audio dramas made for people on the move. Mystery, western, thriller, sci-fi, and more. Perfect for your commute or road trip.

I'm giving you ${days} days completely free. No credit card needed to redeem.

Your code: ${code}

Just go to the link below and enter your code to get started. I think you're going to love it.

— Marc`
}

export default function AdminPromoPage() {
  const [codes, setCodes] = useState<any[]>([])
  const [redemptions, setRedemptions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'codes' | 'redemptions'>('codes')
  const [form, setForm] = useState({ code: '', description: '', campaign: '', label: '', subscription_days: '30', max_uses: '1' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  // Email composer state
  const [composing, setComposing] = useState<string | null>(null) // code id being composed
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sendMsg, setSendMsg] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: c }, { data: r }] = await Promise.all([
      supabase.from('promo_codes').select('*').order('created_at', { ascending: false }),
      supabase.from('promo_redemptions').select('*').order('redeemed_at', { ascending: false })
    ])
    setCodes(c || [])
    setRedemptions(r || [])
    setLoading(false)
  }

  async function createCode() {
    setSaving(true); setMsg('')
    const { error } = await supabase.from('promo_codes').insert({
      code: form.code.trim().toUpperCase(),
      description: form.description,
      campaign: form.campaign || null,
      label: form.label || null,
      subscription_days: parseInt(form.subscription_days),
      max_uses: parseInt(form.max_uses),
      uses_count: 0,
      is_active: true,
      is_redeemed: false,
      subscription_type: 'active',
    })
    if (error) { setMsg('Error: ' + error.message) }
    else { setMsg('Code created!'); setForm({ code: '', description: '', campaign: '', label: '', subscription_days: '30', max_uses: '1' }); load() }
    setSaving(false)
  }

  async function generateUnique() {
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
    const prefix = form.campaign ? form.campaign.substring(0, 4).toUpperCase() : 'ET'
    setForm(f => ({ ...f, code: prefix + '-' + rand }))
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('promo_codes').update({ is_active: !current }).eq('id', id)
    load()
  }

  function openComposer(c: any) {
    setComposing(c.id)
    setEmailTo(c.label || '')
    setEmailSubject(`Your Endless Tales access code: ${c.code}`)
    setEmailBody(defaultBody(c.code, c.subscription_days))
    setSendMsg('')
  }

  async function sendEmail(c: any) {
    if (!emailTo.includes('@')) { setSendMsg('Enter a valid email address'); return }
    setSending(true); setSendMsg('')
    const res = await fetch('/api/promo/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: emailTo, subject: emailSubject, body: emailBody, code: c.code, days: c.subscription_days })
    })
    const data = await res.json()
    if (data.success) { setSendMsg('Sent!'); setTimeout(() => { setComposing(null); setSendMsg('') }, 1500) }
    else { setSendMsg('Error: ' + data.error) }
    setSending(false)
  }

  const input = { width: '100%', padding: '8px 10px', border: `1px solid ${border}`, borderRadius: 6, fontSize: 13, color: text, background: '#fff', boxSizing: 'border-box' as const }
  const label = { fontSize: 12, fontWeight: 600, color: muted, display: 'block' as const, marginBottom: 4 }

  return (
    <div style={{ background: bg, minHeight: '100vh', padding: '24px', color: text }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 4px' }}>Promo Codes</h1>
        <p style={{ color: muted, fontSize: 13, margin: '0 0 24px' }}>Create, send, and track promo codes for testers, partners, and campaigns.</p>

        {/* Create form */}
        <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 16px' }}>Create New Code</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={label}>Code *</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={{ ...input, flex: 1 }} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="LAUNCH2026" />
                <button onClick={generateUnique} style={{ padding: '8px 10px', background: '#f3f4f6', border: `1px solid ${border}`, borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Auto</button>
              </div>
            </div>
            <div>
              <label style={label}>Campaign</label>
              <input style={input} value={form.campaign} onChange={e => setForm(f => ({ ...f, campaign: e.target.value }))} placeholder="beta-testers" />
            </div>
            <div>
              <label style={label}>Label (person/partner)</label>
              <input style={input} value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="John Smith" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={label}>Description</label>
              <input style={input} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Beta tester — 30 days free" />
            </div>
            <div>
              <label style={label}>Days Free</label>
              <input style={input} type="number" value={form.subscription_days} onChange={e => setForm(f => ({ ...f, subscription_days: e.target.value }))} />
            </div>
            <div>
              <label style={label}>Max Uses</label>
              <input style={input} type="number" value={form.max_uses} onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))} />
            </div>
          </div>
          {msg && <p style={{ color: msg.startsWith('Error') ? '#dc2626' : '#16a34a', fontSize: 13, margin: '0 0 12px', fontWeight: 600 }}>{msg}</p>}
          <button onClick={createCode} disabled={saving || !form.code} style={{ padding: '10px 24px', background: orange, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            {saving ? 'Creating...' : 'Create Code'}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['codes', 'redemptions'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${border}`, background: tab === t ? text : card, color: tab === t ? '#fff' : muted, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {t === 'codes' ? `Codes (${codes.length})` : `Redemptions (${redemptions.length})`}
            </button>
          ))}
        </div>

        {loading ? <p style={{ color: muted }}>Loading...</p> : tab === 'codes' ? (
          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: `1px solid ${border}` }}>
                  {['Code', 'Campaign', 'Label', 'Days', 'Uses', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: muted, fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {codes.map((c, i) => (
                  <>
                    <tr key={c.id} style={{ borderBottom: composing === c.id ? 'none' : i < codes.length - 1 ? `1px solid ${border}` : 'none', background: composing === c.id ? '#fafafa' : '#fff' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 800, fontFamily: 'monospace', color: orange }}>{c.code}</td>
                      <td style={{ padding: '10px 14px', color: muted }}>{c.campaign || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{c.label || '—'}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700 }}>{c.subscription_days}d</td>
                      <td style={{ padding: '10px 14px' }}>{c.uses_count || 0}/{c.max_uses ?? '∞'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {c.is_active ? <Badge color="#16a34a">Active</Badge> : <Badge color="#dc2626">Inactive</Badge>}
                      </td>
                      <td style={{ padding: '10px 14px', display: 'flex', gap: 6 }}>
                        <button onClick={() => composing === c.id ? setComposing(null) : openComposer(c)} style={{ padding: '4px 10px', border: `1px solid ${orange}`, borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: composing === c.id ? orange : '#fff', color: composing === c.id ? '#fff' : orange }}>
                          {composing === c.id ? 'Cancel' : 'Send Email'}
                        </button>
                        <button onClick={() => toggleActive(c.id, c.is_active)} style={{ padding: '4px 10px', border: `1px solid ${border}`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: '#f9fafb', color: text }}>
                          {c.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                    {composing === c.id && (
                      <tr key={c.id + '-composer'} style={{ borderBottom: `1px solid ${border}` }}>
                        <td colSpan={7} style={{ padding: '0 14px 16px' }}>
                          <div style={{ background: '#f9fafb', border: `1px solid ${border}`, borderRadius: 10, padding: 16, marginTop: 8 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginBottom: 10 }}>
                              <div>
                                <label style={label}>To (email address)</label>
                                <input style={input} value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="john@example.com" />
                              </div>
                              <div>
                                <label style={label}>Subject</label>
                                <input style={input} value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
                              </div>
                            </div>
                            <div style={{ marginBottom: 12 }}>
                              <label style={label}>Message (the code and CTA button are added automatically below this)</label>
                              <textarea
                                value={emailBody}
                                onChange={e => setEmailBody(e.target.value)}
                                rows={8}
                                style={{ ...input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
                              />
                            </div>
                            {sendMsg && <p style={{ color: sendMsg === 'Sent!' ? '#16a34a' : '#dc2626', fontSize: 13, fontWeight: 700, margin: '0 0 10px' }}>{sendMsg}</p>}
                            <button onClick={() => sendEmail(c)} disabled={sending} style={{ padding: '10px 24px', background: orange, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                              {sending ? 'Sending...' : `Send to ${emailTo || '...'}`}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden' }}>
            {redemptions.length === 0 ? <p style={{ padding: 20, color: muted }}>No redemptions yet.</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: `1px solid ${border}` }}>
                    {['Code', 'Email', 'Campaign', 'Label', 'Days', 'Redeemed At'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: muted, fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: i < redemptions.length - 1 ? `1px solid ${border}` : 'none' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 800, fontFamily: 'monospace', color: orange }}>{r.code}</td>
                      <td style={{ padding: '10px 14px' }}>{r.email}</td>
                      <td style={{ padding: '10px 14px', color: muted }}>{r.campaign || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{r.label || '—'}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700 }}>{r.days_granted}d</td>
                      <td style={{ padding: '10px 14px', color: muted }}>{new Date(r.redeemed_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
