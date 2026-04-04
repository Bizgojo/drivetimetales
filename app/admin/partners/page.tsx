'use client'
import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import QRCode from 'qrcode'

const bg = '#FAF9F6', card = '#fff', border = '#e5e7eb', text = '#111', muted = '#6b7280', orange = '#f97316'

const inp = { width: '100%', padding: '9px 12px', border: `1.5px solid #d1d5db`, borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: '#fff', color: '#111', outline: 'none' }
const inpSm = { padding: '7px 10px', border: `1.5px solid #d1d5db`, borderRadius: 6, fontSize: 14, background: '#fff', color: '#111', outline: 'none', appearance: 'none' as const }

interface Partner {
  id: string; name: string; slug: string; email: string | null; phone: string | null
  contact_name: string | null; contact_title: string | null
  contact_email: string | null; contact_phone: string | null
  address: string | null; city: string | null; state: string | null; zip: string | null
  notes: string | null; is_active: boolean; qr_url: string | null; created_at: string
  agreement?: Agreement
  stats?: { scans: number; trials: number; subs: number; owed: number }
  materials?: Material[]
}
interface Agreement {
  id?: string; scan_rate: number; trial_rate: number; sub_rate: number
  sub_payout_type: string; sub_payout_months: number; effective_date: string
}
interface Material {
  id?: string; material_type: string; quantity: number; cost: number
  shipped_at: string; notes: string
}
interface Payout {
  id: string; period_start: string; period_end: string; scan_count: number
  trial_count: number; sub_count: number; total_amount: number; status: string
  paid_at: string | null; notes: string | null; partner?: { name: string }
}

const APP_URL = 'https://endless-tales.com'
const MATERIAL_TYPES = ['Posters', 'Static Cling (Window)', 'Stickers', 'Table Tents', 'Business Cards', 'Flyers', 'Other']
function fmt$(n: number) { return '$' + Number(n).toFixed(2) }
function fmtPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 10)
  if (d.length < 4) return d
  if (d.length < 7) return `(${d.slice(0,3)}) ${d.slice(3)}`
  return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
}
const blankMaterial = (): Material => ({ material_type: 'Posters', quantity: 0, cost: 0, shipped_at: '', notes: '' })

export default function AdminPartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'directory' | 'payouts'>('directory')
  const [selected, setSelected] = useState<Partner | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '', slug: '', email: '', phone: '',
    contact_name: '', contact_title: '', contact_email: '', contact_phone: '',
    address: '', city: '', state: '', zip: '', notes: ''
  })
  const [agreement, setAgreement] = useState<Agreement>({ scan_rate: 0, trial_rate: 0, sub_rate: 0, sub_payout_type: 'one_time', sub_payout_months: 1, effective_date: new Date().toISOString().split('T')[0] })
  const [newMaterial, setNewMaterial] = useState<Material>(blankMaterial())
  const [saving, setSaving] = useState(false)
  const [savingMaterial, setSavingMaterial] = useState(false)
  const [msg, setMsg] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [generatingPayout, setGeneratingPayout] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'scans' | 'trial_rate' | 'sub_rate' | 'owed'>('name')
  const [period, setPeriod] = useState<'all' | 'month' | 'lastmonth' | '90days'>('all')
  const [allEvents, setAllEvents] = useState<any[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: pp }, { data: po }, { data: events }, { data: agreements }, { data: materials }] = await Promise.all([
      supabase.from('partners').select('*').order('created_at', { ascending: false }),
      supabase.from('partner_payouts').select('*, partners(name)').order('created_at', { ascending: false }).limit(50),
      supabase.from('partner_events').select('partner_id, event_type, amount_owed, paid_out'),
      supabase.from('partner_agreements').select('*').order('effective_date', { ascending: false }),
      supabase.from('partner_materials').select('*').order('created_at', { ascending: false }),
    ])

    setAllEvents(events || [])
    const statsMap: Record<string, Partner['stats']> = {}
    ;(events || []).forEach((e: any) => {
      if (!statsMap[e.partner_id]) statsMap[e.partner_id] = { scans: 0, trials: 0, subs: 0, owed: 0 }
      const s = statsMap[e.partner_id]!
      if (e.event_type === 'scan') s.scans++
      if (e.event_type === 'trial') s.trials++
      if (e.event_type === 'subscription') s.subs++
      if (!e.paid_out) s.owed += Number(e.amount_owed)
    })

    const agreementMap: Record<string, Agreement> = {}
    ;(agreements || []).forEach((a: any) => { if (!agreementMap[a.partner_id]) agreementMap[a.partner_id] = a })

    const materialsMap: Record<string, Material[]> = {}
    ;(materials || []).forEach((m: any) => {
      if (!materialsMap[m.partner_id]) materialsMap[m.partner_id] = []
      materialsMap[m.partner_id].push(m)
    })

    setPartners((pp || []).map((p: any) => ({
      ...p,
      stats: statsMap[p.id] || { scans: 0, trials: 0, subs: 0, owed: 0 },
      agreement: agreementMap[p.id],
      materials: materialsMap[p.id] || [],
    })))
    setPayouts((po || []).map((p: any) => ({ ...p, partner: p.partners })))
    setLoading(false)
  }

  async function generateQR(partner: Partner) {
    const url = `${APP_URL}/?partner=${partner.slug}`
    try {
      const qr = await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: '#000', light: '#fff' } })
      // Composite QR + partner name onto canvas
      const canvas = document.createElement('canvas')
      const size = 400
      const pad = 16
      const nameH = 48
      canvas.width = size + pad * 2
      canvas.height = size + pad * 2 + nameH
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const img = new Image()
      img.src = qr
      await new Promise(r => { img.onload = r })
      ctx.drawImage(img, pad, pad, size, size)
      ctx.fillStyle = '#111'
      ctx.font = 'bold 22px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(partner.name, canvas.width / 2, size + pad * 2 + 18)
      ctx.font = '14px system-ui, sans-serif'
      ctx.fillStyle = '#666'
      ctx.fillText(`${APP_URL}/?partner=${partner.slug}`, canvas.width / 2, size + pad * 2 + 38)
      setQrDataUrl(canvas.toDataURL('image/png'))
    } catch {}
  }

  async function savePartner() {
    setSaving(true); setMsg('')
    const slug = form.slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const { data: p, error } = await supabase.from('partners').insert({
      name: form.name.trim(), slug,
      email: form.email || null, phone: form.phone || null,
      contact_name: form.contact_name || null, contact_title: form.contact_title || null,
      contact_email: form.contact_email || null, contact_phone: form.contact_phone || null,
      address: form.address || null, city: form.city || null,
      state: form.state || null, zip: form.zip || null,
      notes: form.notes || null,
    }).select().single()
    if (error) { setMsg('Error: ' + error.message); setSaving(false); return }
    if (agreement.scan_rate > 0 || agreement.trial_rate > 0 || agreement.sub_rate > 0) {
      await supabase.from('partner_agreements').insert({ ...agreement, partner_id: p.id })
    }
    setMsg('Partner created!'); setShowForm(false)
    setForm({ name: '', slug: '', email: '', phone: '', contact_name: '', contact_title: '', contact_email: '', contact_phone: '', address: '', city: '', state: '', zip: '', notes: '' })
    load(); setSaving(false)
  }

  async function saveAgreement(partnerId: string) {
    setSaving(true)
    const { data: existing } = await supabase.from('partner_agreements').select('id').eq('partner_id', partnerId).order('effective_date', { ascending: false }).limit(1).single()
    if (existing) { await supabase.from('partner_agreements').update({ ...agreement }).eq('id', existing.id) }
    else { await supabase.from('partner_agreements').insert({ ...agreement, partner_id: partnerId }) }
    setMsg('Agreement saved!'); setSaving(false); load()
  }

  async function addMaterial(partnerId: string) {
    setSavingMaterial(true)
    await supabase.from('partner_materials').insert({ ...newMaterial, partner_id: partnerId, shipped_at: newMaterial.shipped_at || null })
    setNewMaterial(blankMaterial()); setMsg('Material added!'); setSavingMaterial(false); load()
  }

  async function deleteMaterial(id: string) {
    await supabase.from('partner_materials').delete().eq('id', id)
    load()
  }

  async function generateMonthlyPayout(partnerId: string, partnerName: string) {
    setGeneratingPayout(true)
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0)
    const { data: events } = await supabase.from('partner_events').select('*').eq('partner_id', partnerId).eq('paid_out', false).gte('created_at', start.toISOString()).lte('created_at', end.toISOString())
    if (!events || events.length === 0) { setMsg('No unpaid events for this period'); setGeneratingPayout(false); return }
    let scanCount = 0, scanAmount = 0, trialCount = 0, trialAmount = 0, subCount = 0, subAmount = 0
    events.forEach((e: any) => {
      if (e.event_type === 'scan') { scanCount++; scanAmount += Number(e.amount_owed) }
      if (e.event_type === 'trial') { trialCount++; trialAmount += Number(e.amount_owed) }
      if (e.event_type === 'subscription') { subCount++; subAmount += Number(e.amount_owed) }
    })
    const total = scanAmount + trialAmount + subAmount
    await supabase.from('partner_payouts').insert({ partner_id: partnerId, period_start: start.toISOString().split('T')[0], period_end: end.toISOString().split('T')[0], scan_count: scanCount, scan_amount: scanAmount, trial_count: trialCount, trial_amount: trialAmount, sub_count: subCount, sub_amount: subAmount, total_amount: total, status: 'pending' })
    await supabase.from('partner_events').update({ paid_out: true }).in('id', events.map((e: any) => e.id))
    setMsg(`Payout generated for ${partnerName}: ${fmt$(total)}`); setGeneratingPayout(false); load()
  }

  async function markPaid(payoutId: string) {
    await supabase.from('partner_payouts').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', payoutId)
    load()
  }

  // Filter events by period
  const now = new Date()
  const periodStart = period === 'all' ? null
    : period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1)
    : period === 'lastmonth' ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
    : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
  const periodEnd = period === 'lastmonth' ? new Date(now.getFullYear(), now.getMonth(), 0) : now

  const filteredPartners = [...partners].map(p => {
    const pevents = allEvents.filter((e: any) => {
      if (e.partner_id !== p.id) return false
      if (periodStart) {
        const t = new Date(e.created_at)
        if (t < periodStart || t > periodEnd) return false
      }
      return true
    })
    const scans = pevents.filter((e: any) => e.event_type === 'scan').length
    const trials = pevents.filter((e: any) => e.event_type === 'trial').length
    const subs = pevents.filter((e: any) => e.event_type === 'subscription').length
    const owed = pevents.filter((e: any) => !e.paid_out).reduce((s: number, e: any) => s + Number(e.amount_owed), 0)
    const trialRate = scans > 0 ? Math.round((trials / scans) * 100) : 0
    const subRate = trials > 0 ? Math.round((subs / trials) * 100) : 0
    return { ...p, filteredStats: { scans, trials, subs, owed, trialRate, subRate } }
  }).sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name)
    if (sortBy === 'scans') return b.filteredStats.scans - a.filteredStats.scans
    if (sortBy === 'trial_rate') return b.filteredStats.trialRate - a.filteredStats.trialRate
    if (sortBy === 'sub_rate') return b.filteredStats.subRate - a.filteredStats.subRate
    if (sortBy === 'owed') return b.filteredStats.owed - a.filteredStats.owed
    return 0
  })

  const cell = { padding: '10px 12px', borderBottom: `1px solid ${border}`, fontSize: 13, color: text }
  const th = { ...cell, fontWeight: 600, color: muted, background: '#f9fafb', fontSize: 12 }
  const label = (txt: string) => <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 4, fontWeight: 500 }}>{txt}</label>

  if (loading) return <div style={{ padding: 32, color: muted }}>Loading...</div>

  return (
    <div style={{ background: bg, minHeight: '100vh', padding: '24px 28px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: text, margin: 0 }}>Partner Program</h1>
          <p style={{ color: muted, fontSize: 13, margin: '4px 0 0' }}>QR tracking, agreements, materials, and payouts</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ background: orange, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Add Partner</button>
      </div>

      {msg && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 16px', color: '#166534', fontSize: 13, marginBottom: 16 }}>{msg}<button onClick={() => setMsg('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#166534' }}>✕</button></div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${border}` }}>
        {(['directory', 'payouts'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', borderBottom: tab === t ? `2px solid ${orange}` : '2px solid transparent', padding: '8px 16px', fontWeight: tab === t ? 700 : 400, color: tab === t ? orange : muted, fontSize: 13, cursor: 'pointer', textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>

      {/* Directory */}
      {tab === 'directory' && (
        <div>
          {/* Sort + Period controls */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: muted, fontWeight: 600 }}>Period:</span>
              {(['all', 'month', 'lastmonth', '90days'] as const).map(p => (
                <button key={p} onClick={() => setPeriod(p)} style={{ background: period === p ? orange : '#f3f4f6', color: period === p ? '#fff' : muted, border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {p === 'all' ? 'All time' : p === 'month' ? 'This month' : p === 'lastmonth' ? 'Last month' : '90 days'}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
              <span style={{ fontSize: 12, color: muted, fontWeight: 600 }}>Sort:</span>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={{ padding: '4px 8px', border: `1px solid ${border}`, borderRadius: 6, fontSize: 12, background: '#fff', color: text }}>
                <option value='name'>Name</option>
                <option value='scans'>Most scans</option>
                <option value='trial_rate'>Trial rate %</option>
                <option value='sub_rate'>Sub rate %</option>
                <option value='owed'>Amount owed</option>
              </select>
            </div>
          </div>

          {partners.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: muted }}>No partners yet. Add your first partner above.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {filteredPartners.map(p => (
                <div key={p.id} style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden' }}>

                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: p.is_active ? '#dcfce7' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{p.is_active ? '✓' : '—'}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: text }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: muted }}>{APP_URL}/?partner={p.slug}</div>
                        {p.contact_name && <div style={{ fontSize: 12, color: muted }}>Contact: {p.contact_name}{p.contact_title ? ` · ${p.contact_title}` : ''}</div>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>Owes {fmt$(p.stats?.owed || 0)}</span>
                      <button onClick={() => { setSelected(selected?.id === p.id ? null : p); if (p.agreement) setAgreement(p.agreement); setQrDataUrl(null); setNewMaterial(blankMaterial()) }} style={{ background: 'none', border: `1px solid ${border}`, borderRadius: 6, padding: '5px 14px', fontSize: 12, cursor: 'pointer', color: muted, fontWeight: 600 }}>
                        {selected?.id === p.id ? 'Close' : 'Manage'}
                      </button>
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: `1px solid ${border}` }}>
                    {[
                      { label: 'Scans', count: (p as any).filteredStats?.scans ?? p.stats?.scans ?? 0, sub: null, amount: fmt$((p.agreement?.scan_rate || 0) * ((p as any).filteredStats?.scans ?? p.stats?.scans ?? 0)) },
                      { label: 'Trials', count: (p as any).filteredStats?.trials ?? p.stats?.trials ?? 0, sub: (p as any).filteredStats?.trialRate != null ? `${(p as any).filteredStats.trialRate}% of scans` : null, amount: fmt$((p.agreement?.trial_rate || 0) * ((p as any).filteredStats?.trials ?? p.stats?.trials ?? 0)) },
                      { label: 'Subscriptions', count: (p as any).filteredStats?.subs ?? p.stats?.subs ?? 0, sub: (p as any).filteredStats?.subRate != null ? `${(p as any).filteredStats.subRate}% of trials` : null, amount: fmt$((p.agreement?.sub_rate || 0) * ((p as any).filteredStats?.subs ?? p.stats?.subs ?? 0)) },
                      { label: 'Total owed', count: null, sub: null, amount: fmt$((p as any).filteredStats?.owed ?? p.stats?.owed ?? 0) },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '12px 16px', borderRight: `1px solid ${border}` }}>
                        <div style={{ fontSize: 11, color: muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                        {s.count !== null && <div style={{ fontSize: 22, fontWeight: 700, color: text, lineHeight: 1 }}>{s.count}</div>}
                        {(s as any).sub && <div style={{ fontSize: 11, color: muted, marginTop: 1 }}>{(s as any).sub}</div>}
                        <div style={{ fontSize: 13, fontWeight: 600, color: s.label === 'Total owed' ? '#92400e' : '#059669', marginTop: 2 }}>{s.amount}</div>
                      </div>
                    ))}
                  </div>

                  {/* Manage panel */}
                  {selected?.id === p.id && (
                    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>

                      {/* Row 1: QR + Contact + Address */}
                      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: 20 }}>

                        {/* QR Code */}
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: text, marginBottom: 10 }}>QR Code</div>
                          {qrDataUrl ? (
                            <div>
                              <img src={qrDataUrl} alt="QR" style={{ width: 130, height: 130, borderRadius: 8, display: 'block' }} />
                              <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                                <a href={qrDataUrl} download={`${p.slug}-qr.png`} style={{ background: orange, color: '#fff', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Download</a>
                                <button onClick={() => setQrDataUrl(null)} style={{ background: 'none', border: `1px solid ${border}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: muted }}>Clear</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => generateQR(p)} style={{ background: '#f3f4f6', border: `1px solid ${border}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, cursor: 'pointer', color: text }}>Generate QR</button>
                          )}
                        </div>

                        {/* Contact */}
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: text, marginBottom: 10 }}>Contact Person</div>
                          <div style={{ fontSize: 13, color: text, lineHeight: 2 }}>
                            {p.contact_name ? <div><strong>{p.contact_name}</strong>{p.contact_title ? ` · ${p.contact_title}` : ''}</div> : <div style={{ color: muted }}>No contact set</div>}
                            {p.contact_email && <div>{p.contact_email}</div>}
                            {p.contact_phone && <div>{p.contact_phone}</div>}
                            {p.email && <div style={{ color: muted }}>Main: {p.email}</div>}
                            {p.phone && <div style={{ color: muted }}>{p.phone}</div>}
                          </div>
                        </div>

                        {/* Address */}
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: text, marginBottom: 10 }}>Address</div>
                          <div style={{ fontSize: 13, color: text, lineHeight: 2 }}>
                            {p.address ? <><div>{p.address}</div><div>{[p.city, p.state, p.zip].filter(Boolean).join(', ')}</div></> : <div style={{ color: muted }}>No address set</div>}
                            {p.notes && <div style={{ color: muted, fontStyle: 'italic', marginTop: 4 }}>{p.notes}</div>}
                          </div>
                        </div>
                      </div>

                      {/* Row 2: Pay Agreement */}
                      <div style={{ borderTop: `1px solid ${border}`, paddingTop: 16 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: text, marginBottom: 12 }}>Pay Agreement</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                          {[
                            { label: '$ per scan', key: 'scan_rate' },
                            { label: '$ per trial', key: 'trial_rate' },
                            { label: '$ per subscription', key: 'sub_rate' },
                          ].map(f => (
                            <div key={f.key}>
                              {label(f.label)}
                              <input type="text" inputMode="decimal" value={(agreement as any)[f.key]} onChange={e => setAgreement(a => ({ ...a, [f.key]: parseFloat(e.target.value) || 0 }))} style={{ ...inpSm, width: '100%' }} />
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                          {label('Sub payout type')}
                          <select value={agreement.sub_payout_type} onChange={e => setAgreement(a => ({ ...a, sub_payout_type: e.target.value }))} style={{ ...inpSm }}>
                            <option value="one_time">One-time</option>
                            <option value="monthly">Monthly</option>
                          </select>
                          {agreement.sub_payout_type === 'monthly' && <>
                            <input type="text" inputMode="numeric" value={agreement.sub_payout_months} onChange={e => setAgreement(a => ({ ...a, sub_payout_months: parseInt(e.target.value) || 1 }))} style={{ ...inpSm, width: 60 }} />
                            <span style={{ fontSize: 13, color: muted }}>months</span>
                            {agreement.sub_payout_months > 0 && <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>{fmt$(agreement.sub_rate / agreement.sub_payout_months)}/mo per sub</span>}
                          </>}
                          <button onClick={() => saveAgreement(p.id)} disabled={saving} style={{ marginLeft: 'auto', background: orange, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save Agreement'}</button>
                        </div>
                      </div>

                      {/* Row 3: Marketing Materials */}
                      <div style={{ borderTop: `1px solid ${border}`, paddingTop: 16 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: text, marginBottom: 12 }}>Marketing Materials & Expenses</div>

                        {/* Existing materials */}
                        {(p.materials || []).length > 0 && (
                          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
                            <thead>
                              <tr style={{ background: '#f9fafb' }}>
                                {['Type', 'Qty', 'Cost', 'Shipped', 'Notes', ''].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: muted, fontWeight: 600, fontSize: 12, borderBottom: `1px solid ${border}` }}>{h}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {(p.materials || []).map((m: any) => (
                                <tr key={m.id}>
                                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${border}`, color: text }}>{m.material_type}</td>
                                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${border}`, color: text }}>{m.quantity}</td>
                                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${border}`, color: text }}>{fmt$(m.cost)}</td>
                                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${border}`, color: text }}>{m.shipped_at || '—'}</td>
                                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${border}`, color: muted, fontStyle: 'italic' }}>{m.notes || ''}</td>
                                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${border}` }}>
                                    <button onClick={() => deleteMaterial(m.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 13 }}>✕</button>
                                  </td>
                                </tr>
                              ))}
                              <tr style={{ background: '#fef3c7' }}>
                                <td style={{ padding: '8px 10px', fontWeight: 700, color: text }} colSpan={2}>Total cost</td>
                                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#92400e' }}>{fmt$((p.materials || []).reduce((s: number, m: any) => s + Number(m.cost), 0))}</td>
                                <td colSpan={3} />
                              </tr>
                            </tbody>
                          </table>
                        )}

                        {/* Add material form */}
                        <div style={{ background: '#f9fafb', border: `1px solid ${border}`, borderRadius: 8, padding: 14 }}>
                          <div style={{ fontWeight: 600, fontSize: 12, color: muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add shipment</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 2fr auto', gap: 8, alignItems: 'end' }}>
                            <div>
                              {label('Type')}
                              <select value={newMaterial.material_type} onChange={e => setNewMaterial(m => ({ ...m, material_type: e.target.value }))} style={{ ...inpSm, width: '100%' }}>
                                {MATERIAL_TYPES.map(t => <option key={t}>{t}</option>)}
                              </select>
                            </div>
                            <div>
                              {label('Qty')}
                              <input type="text" inputMode="numeric" value={newMaterial.quantity} onChange={e => setNewMaterial(m => ({ ...m, quantity: parseInt(e.target.value) || 0 }))} style={{ ...inpSm, width: '100%' }} />
                            </div>
                            <div>
                              {label('Cost $')}
                              <input type="text" inputMode="decimal" value={newMaterial.cost} onChange={e => setNewMaterial(m => ({ ...m, cost: parseFloat(e.target.value) || 0 }))} style={{ ...inpSm, width: '100%' }} />
                            </div>
                            <div>
                              {label('Shipped')}
                              <input type="date" value={newMaterial.shipped_at} onChange={e => setNewMaterial(m => ({ ...m, shipped_at: e.target.value }))} style={{ ...inpSm, width: '100%' }} />
                            </div>
                            <div>
                              {label('Notes')}
                              <input value={newMaterial.notes} onChange={e => setNewMaterial(m => ({ ...m, notes: e.target.value }))} placeholder="Optional" style={{ ...inpSm, width: '100%' }} />
                            </div>
                            <button onClick={() => addMaterial(p.id)} disabled={savingMaterial} style={{ background: orange, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add</button>
                          </div>
                        </div>
                      </div>

                      {/* Row 4: Payout */}
                      <div style={{ borderTop: `1px solid ${border}`, paddingTop: 16 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: text, marginBottom: 8 }}>Generate Payout</div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <button onClick={() => generateMonthlyPayout(p.id, p.name)} disabled={generatingPayout} style={{ background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                            {generatingPayout ? 'Generating...' : 'Generate Last Month Payout'}
                          </button>
                          <span style={{ fontSize: 12, color: muted }}>Tallies all unpaid scan, trial, and subscription events from last month</span>
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
                <tr>{['Partner', 'Period', 'Scans', 'Trials', 'Subs', 'Total', 'Status', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr>
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
                    <td style={cell}><span style={{ background: po.status === 'paid' ? '#dcfce7' : '#fef3c7', color: po.status === 'paid' ? '#166534' : '#92400e', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{po.status}</span></td>
                    <td style={cell}>
                      {po.status !== 'paid' && <button onClick={() => markPaid(po.id)} style={{ background: '#dcfce7', color: '#166534', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Mark Paid</button>}
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
        <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: card, borderRadius: 16, padding: 28, width: 540, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: text, margin: '0 0 20px' }}>Add Partner</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>{label('Partner name *')}<input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Trucking Co." style={inp} /></div>
                <div>{label('Slug (URL) *')}<input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="acme-trucking" style={inp} /></div>
                <div>{label('Business email')}<input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="info@acme.com" style={inp} /></div>
                <div>{label('Business phone')}<input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: fmtPhone(e.target.value) }))} placeholder="(555) 000-0000" style={inp} /></div>
              </div>

              <div style={{ borderTop: `1px solid ${border}`, paddingTop: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: text, marginBottom: 10 }}>Contact Person</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>{label('Name')}<input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Jane Smith" style={inp} /></div>
                  <div>{label('Title')}<input value={form.contact_title} onChange={e => setForm(f => ({ ...f, contact_title: e.target.value }))} placeholder="Manager" style={inp} /></div>
                  <div>{label('Email')}<input value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="jane@acme.com" style={inp} /></div>
                  <div>{label('Phone')}<input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: fmtPhone(e.target.value) }))} placeholder="(555) 111-2222" style={inp} /></div>
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${border}`, paddingTop: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: text, marginBottom: 10 }}>Address</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>{label('Street address')}<input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Main St" style={inp} /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                    <div>{label('City')}<input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Nashville" style={inp} /></div>
                    <div>{label('State')}<input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder="TN" maxLength={2} style={inp} /></div>
                    <div>{label('ZIP')}<input value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} placeholder="37201" style={inp} /></div>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${border}`, paddingTop: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: text, marginBottom: 10 }}>Pay Rates (optional)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[{ label: '$ per scan', key: 'scan_rate' }, { label: '$ per trial', key: 'trial_rate' }, { label: '$ per subscription', key: 'sub_rate' }].map(f => (
                    <div key={f.key}>{label(f.label)}<input type="text" inputMode="decimal" value={(agreement as any)[f.key]} onChange={e => setAgreement(a => ({ ...a, [f.key]: parseFloat(e.target.value) || 0 }))} style={inp} /></div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  {label('Sub payout')}
                  <select value={agreement.sub_payout_type} onChange={e => setAgreement(a => ({ ...a, sub_payout_type: e.target.value }))} style={{ ...inpSm }}>
                    <option value="one_time">One-time</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  {agreement.sub_payout_type === 'monthly' && <>
                    <input type="text" inputMode="numeric" value={agreement.sub_payout_months} onChange={e => setAgreement(a => ({ ...a, sub_payout_months: parseInt(e.target.value) || 1 }))} style={{ ...inpSm, width: 60 }} />
                    <span style={{ fontSize: 13, color: muted }}>months</span>
                    {agreement.sub_payout_months > 0 && <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>{fmt$(agreement.sub_rate / agreement.sub_payout_months)}/mo per sub</span>}
                  </>}
                </div>
              </div>

              <div>{label('Notes')}<textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inp, resize: 'none' as const }} /></div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowForm(false)} style={{ background: 'none', border: `1px solid ${border}`, borderRadius: 8, padding: '9px 20px', fontSize: 14, cursor: 'pointer', color: muted }}>Cancel</button>
                <button onClick={savePartner} disabled={saving || !form.name || !form.slug} style={{ background: orange, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Create Partner'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
