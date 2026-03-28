'use client'
import { useState, useEffect } from 'react'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const YEAR = 2026
const EL_PLAN_MONTHLY = 315.33
const EL_INCLUDED_CHARS = 2_000_000
const EL_OVERAGE_RATE = 0.30 // per 1,000 chars

// ─── EXPENSE LINE ITEMS ───────────────────────────────────────────────────────
interface ExpenseItem {
  id: string; name: string; category: string
  billingType: 'monthly' | 'usage-based' | 'one-time'
  url: string; notes: string; defaults: number[]
}

const EXPENSES: ExpenseItem[] = [
  // AI & Voice
  { id:'anthropic', name:'Anthropic (Claude)', category:'AI & Voice', billingType:'usage-based', url:'https://console.anthropic.com', notes:'AI story generation, scripting, content tasks. Pay-per-token.', defaults:[5,12,18,0,0,0,0,0,0,0,0,0] },
  { id:'elevenlabs_plan', name:'ElevenLabs — Subscription', category:'AI & Voice', billingType:'monthly', url:'https://elevenlabs.io/app', notes:'Growing Business plan (annual). 2,000,000 chars/month included. ~$315.33/mo billed annually.', defaults:[315.33,315.33,315.33,0,0,0,0,0,0,0,0,0] },
  { id:'elevenlabs_overage', name:'ElevenLabs — Overage', category:'AI & Voice', billingType:'usage-based', url:'https://elevenlabs.io/app', notes:'Chars beyond 2M/month × $0.30 per 1,000. Mar 2026: ~7.4M overage ≈ $2,228. See 🎙️ EL Detail tab for breakdown.', defaults:[0,0,2228,0,0,0,0,0,0,0,0,0] },
  { id:'openai', name:'OpenAI (DALL-E / TTS)', category:'AI & Voice', billingType:'usage-based', url:'https://platform.openai.com', notes:'Cover art (DALL-E ~$0.04/image) + draft TTS ($0.015/1K chars).', defaults:[1,2,3,0,0,0,0,0,0,0,0,0] },
  { id:'suno', name:'Suno', category:'AI & Voice', billingType:'monthly', url:'https://suno.com', notes:'AI background music for audio dramas. Pro plan: 2,500 credits/month.', defaults:[8,8,8,0,0,0,0,0,0,0,0,0] },
  // Infrastructure
  { id:'vercel', name:'Vercel', category:'Infrastructure', billingType:'monthly', url:'https://vercel.com/dashboard', notes:'App hosting + serverless functions + CDN. Pro plan.', defaults:[20,20,20,0,0,0,0,0,0,0,0,0] },
  { id:'supabase', name:'Supabase', category:'Infrastructure', billingType:'monthly', url:'https://supabase.com/dashboard', notes:'PostgreSQL database + file storage (audio, covers). Free tier pre-launch.', defaults:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { id:'stripe', name:'Stripe', category:'Infrastructure', billingType:'usage-based', url:'https://dashboard.stripe.com', notes:'Payment processing. 2.9% + $0.30/transaction. $0 until launch.', defaults:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { id:'github', name:'GitHub', category:'Infrastructure', billingType:'monthly', url:'https://github.com', notes:'Source code. Free tier.', defaults:[0,0,0,0,0,0,0,0,0,0,0,0] },
  // Audio Production
  { id:'reaper', name:'REAPER (DAW)', category:'Audio Production', billingType:'one-time', url:'https://www.reaper.fm', notes:'DAW for mixing. One-time discounted license ~$60.', defaults:[60,0,0,0,0,0,0,0,0,0,0,0] },
  { id:'freesound', name:'Freesound API', category:'Audio Production', billingType:'monthly', url:'https://freesound.org', notes:'SFX library in ASC3 pipeline. Free.', defaults:[0,0,0,0,0,0,0,0,0,0,0,0] },
  // Business & Legal
  { id:'microsoft365', name:'Microsoft 365', category:'Business & Legal', billingType:'monthly', url:'https://admin.microsoft.com', notes:'Business email (marc@, support@, sales@endless-tales.com). Business Basic.', defaults:[6,6,6,0,0,0,0,0,0,0,0,0] },
  { id:'domain', name:'Domain (endless-tales.com)', category:'Business & Legal', billingType:'one-time', url:'https://domains.google.com', notes:'Annual domain. ~$12/year.', defaults:[12,0,0,0,0,0,0,0,0,0,0,0] },
  { id:'openclaw', name:'OpenClaw (Hal AI)', category:'Business & Legal', billingType:'monthly', url:'https://openclaw.ai', notes:'OpenClaw subscription fee (if any). See Anthropic line for actual Claude API charges from Hal conversations.', defaults:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { id:'anthropic_hal', name:'Anthropic — Hal/OpenClaw Usage', category:'AI & Voice', billingType:'usage-based', url:'https://console.anthropic.com/billing', notes:'Claude API charges from Hal conversations (OpenClaw). Check console.anthropic.com → Usage, separate from app usage. Log monthly total here.', defaults:[0,0,0,0,0,0,0,0,0,0,0,0] },
  // Data & APIs
  { id:'resend', name:'Resend (Email)', category:'Data & APIs', billingType:'monthly', url:'https://resend.com', notes:'Transactional email (waitlist, referrals). Free up to 3K/month.', defaults:[0,0,0,0,0,0,0,0,0,0,0,0] },
  // Marketing
  { id:'mkt_social_tools', name:'Social Media Tools', category:'Marketing', billingType:'monthly', url:'', notes:'Scheduling, analytics, or management tools for social platforms.', defaults:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { id:'mkt_ads_facebook', name:'Advertising — Facebook', category:'Marketing', billingType:'usage-based', url:'https://adsmanager.facebook.com', notes:'Facebook & Instagram paid ads budget.', defaults:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { id:'mkt_ads_x', name:'Advertising — X (Twitter)', category:'Marketing', billingType:'usage-based', url:'https://ads.twitter.com', notes:'X promoted posts and ad campaigns.', defaults:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { id:'mkt_ads_reddit', name:'Advertising — Reddit', category:'Marketing', billingType:'usage-based', url:'https://ads.reddit.com', notes:'Reddit promoted posts and sponsored content.', defaults:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { id:'mkt_ads_tiktok', name:'Advertising — TikTok', category:'Marketing', billingType:'usage-based', url:'https://ads.tiktok.com', notes:'TikTok paid ad campaigns.', defaults:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { id:'mkt_ads_other', name:'Advertising — Other', category:'Marketing', billingType:'usage-based', url:'', notes:'Google Ads, podcast sponsorships, or other digital advertising.', defaults:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { id:'mkt_qr', name:'QR Codes & Print', category:'Marketing', billingType:'one-time', url:'', notes:'QR code printing, truck stop / rest area placement, physical marketing materials.', defaults:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { id:'mkt_influencers', name:'Influencer Partnerships', category:'Marketing', billingType:'usage-based', url:'', notes:'Paid influencer deals — travel, trucker, commuter niche creators.', defaults:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { id:'mkt_other', name:'Marketing — Other', category:'Marketing', billingType:'usage-based', url:'', notes:'PR, press, events, or any other marketing spend.', defaults:[0,0,0,0,0,0,0,0,0,0,0,0] },
]

const EXPENSE_CATEGORIES = Array.from(new Set(EXPENSES.map(e => e.category)))
const CAT_ICONS: Record<string,string> = { 'AI & Voice':'🤖', 'Infrastructure':'🏗️', 'Audio Production':'🎧', 'Business & Legal':'💼', 'Data & APIs':'📡', 'Marketing':'📣' }

// ─── REVENUE LINE ITEMS ───────────────────────────────────────────────────────
interface RevenueItem { id: string; name: string; notes: string; defaults: number[] }
const REVENUES: RevenueItem[] = [
  { id:'founding_subs', name:'Founding Member Subscriptions ($7.99/mo locked)', notes:'First 500 subscribers at locked $7.99/month for life.', defaults:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { id:'standard_subs', name:'Standard Subscriptions ($7.99/mo)', notes:'After first 500 founding spots filled.', defaults:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { id:'other', name:'Other Revenue', notes:'Sponsorships, partnerships, or other income.', defaults:[0,0,0,0,0,0,0,0,0,0,0,0] },
]

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => n === 0 ? '—' : `$${n.toFixed(2)}`
const fmtSigned = (n: number) => n === 0 ? '—' : n > 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`
const fmtNum = (n: number) => n.toLocaleString()

function useFinanceData(key: string, defaults: Record<string,number[]>) {
  const [data, setData] = useState<Record<string,number[]>>(defaults)
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    const saved = localStorage.getItem(key)
    if (saved) setData(JSON.parse(saved))
    else setData(defaults)
  }, [key])
  const update = (id: string, month: number, val: number) => {
    setData(prev => { const next = { ...prev, [id]: [...(prev[id] || Array(12).fill(0))] }; next[id][month] = val; return next })
    setDirty(true)
  }
  const save = () => { localStorage.setItem(key, JSON.stringify(data)); setDirty(false) }
  return { data, update, save, dirty }
}

function EditCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  if (editing) return (
    <input type="number" value={draft} step="0.01"
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { onChange(parseFloat(draft)||0); setEditing(false) }}
      onKeyDown={e => { if(e.key==='Enter'){onChange(parseFloat(draft)||0);setEditing(false)} if(e.key==='Escape')setEditing(false) }}
      autoFocus style={{ width:72, textAlign:'right', padding:'2px 4px', border:'2px solid #f97316', borderRadius:4, fontSize:13, background:'#fff', color:'#000' }}
    />
  )
  return (
    <span onClick={() => { setDraft(value.toString()); setEditing(true) }}
      style={{ cursor:'pointer', color: value>0?'#000':'#bbb', display:'block', textAlign:'right', padding:'2px 0' }}>
      {fmt(value)}
    </span>
  )
}

// ─── LIVE EXPENSES ────────────────────────────────────────────────────────────
const VENDORS = [
  { label: 'OpenAI / ChatGPT', vendor: 'OpenAI', category: 'AI & Voice' },
  { label: 'ElevenLabs', vendor: 'ElevenLabs', category: 'AI & Voice' },
  { label: 'Anthropic — App (Claude API)', vendor: 'Anthropic', category: 'AI & Voice' },
  { label: 'Anthropic — Hal/OpenClaw', vendor: 'Anthropic (Hal)', category: 'AI & Voice' },
  { label: 'Suno', vendor: 'Suno', category: 'AI & Voice' },
  { label: 'Vercel', vendor: 'Vercel', category: 'Infrastructure' },
  { label: 'Supabase', vendor: 'Supabase', category: 'Infrastructure' },
  { label: 'Stripe', vendor: 'Stripe', category: 'Infrastructure' },
  { label: 'Microsoft 365', vendor: 'Microsoft 365', category: 'Business & Legal' },
  { label: 'GoDaddy / Domain', vendor: 'GoDaddy', category: 'Business & Legal' },
  { label: 'OpenClaw', vendor: 'OpenClaw', category: 'Business & Legal' },
  { label: 'Resend', vendor: 'Resend', category: 'Data & APIs' },
  { label: 'Facebook Ads', vendor: 'Facebook Ads', category: 'Marketing' },
  { label: 'X (Twitter) Ads', vendor: 'X Ads', category: 'Marketing' },
  { label: 'Reddit Ads', vendor: 'Reddit Ads', category: 'Marketing' },
  { label: 'TikTok Ads', vendor: 'TikTok Ads', category: 'Marketing' },
  { label: 'Influencer Payment', vendor: 'Influencer', category: 'Marketing' },
  { label: 'QR Codes / Print', vendor: 'QR Codes', category: 'Marketing' },
  { label: 'Social Media Tools', vendor: 'Social Tools', category: 'Marketing' },
  { label: 'Marketing — Other', vendor: 'Marketing Other', category: 'Marketing' },
  { label: 'Other', vendor: 'Other', category: 'Other' },
]

function LiveExpenses() {
  const [entries, setEntries]     = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState({ vendor: 'OpenAI', category: 'AI & Voice', description: '', amount_usd: '', expense_date: new Date().toISOString().split('T')[0] })
  const [byVendor, setByVendor]   = useState<Record<string,number>>({})

  const load = () => {
    setLoading(true)
    fetch(`/api/admin/expenses?year=${YEAR}`)
      .then(r => r.json())
      .then(d => { setEntries(d.data || []); setByVendor(d.byVendor || {}); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleVendorChange = (v: string) => {
    const found = VENDORS.find(x => x.vendor === v)
    setForm(f => ({ ...f, vendor: v, category: found?.category || f.category }))
  }

  const submit = async () => {
    if (!form.amount_usd || !form.vendor) return
    setSaving(true)
    await fetch('/api/admin/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setShowAdd(false)
    setForm(f => ({ ...f, amount_usd: '', description: '' }))
    load()
  }

  const del = async (id: string) => {
    if (!confirm('Delete this entry?')) return
    await fetch(`/api/admin/expenses?id=${id}`, { method: 'DELETE' })
    load()
  }

  const total = entries.reduce((s, e) => s + parseFloat(e.amount_usd), 0)
  const thisMonth = entries.filter(e => e.month === new Date().getMonth() + 1 && e.year === YEAR).reduce((s, e) => s + parseFloat(e.amount_usd), 0)

  return (
    <div style={{ background:'#fff', border:'2px solid #f97316', borderRadius:12, marginBottom:20, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ background:'#fff7ed', borderBottom:'1px solid #fed7aa', padding:'12px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
        <div>
          <span style={{ fontWeight:800, fontSize:15, color:'#ea580c' }}>⚡ Live Expense Log</span>
          <span style={{ fontSize:12, color:'#888', marginLeft:12 }}>Real-time — every purchase or charge you log appears instantly</span>
        </div>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <span style={{ fontWeight:700, color:'#dc2626', fontSize:14 }}>This month: ${thisMonth.toFixed(2)}</span>
          <span style={{ fontWeight:700, color:'#374151', fontSize:13 }}>YTD total: ${total.toFixed(2)}</span>
          <button onClick={() => setShowAdd(v => !v)}
            style={{ padding:'7px 16px', background:'#f97316', color:'#fff', border:'none', borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer' }}>
            {showAdd ? '✕ Cancel' : '+ Add Expense'}
          </button>
        </div>
      </div>

      {/* Quick Add Form */}
      {showAdd && (
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #fed7aa', background:'#fffbf7', display:'flex', flexWrap:'wrap', gap:10, alignItems:'flex-end' }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#888', marginBottom:4 }}>VENDOR</div>
            <select value={form.vendor} onChange={e => handleVendorChange(e.target.value)}
              style={{ padding:'7px 10px', border:'1px solid #ddd', borderRadius:6, fontSize:13, background:'#fff', color:'#000' }}>
              {VENDORS.map(v => <option key={v.vendor} value={v.vendor}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#888', marginBottom:4 }}>AMOUNT ($)</div>
            <input type="number" step="0.01" placeholder="0.00" value={form.amount_usd}
              onChange={e => setForm(f => ({ ...f, amount_usd: e.target.value }))}
              style={{ width:100, padding:'7px 10px', border:'1px solid #ddd', borderRadius:6, fontSize:13, background:'#fff', color:'#000' }} />
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#888', marginBottom:4 }}>DATE</div>
            <input type="date" value={form.expense_date}
              onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
              style={{ padding:'7px 10px', border:'1px solid #ddd', borderRadius:6, fontSize:13, background:'#fff', color:'#000' }} />
          </div>
          <div style={{ flex:1, minWidth:180 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#888', marginBottom:4 }}>DESCRIPTION (optional)</div>
            <input type="text" placeholder="e.g. Credits top-up $10" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              style={{ width:'100%', padding:'7px 10px', border:'1px solid #ddd', borderRadius:6, fontSize:13, background:'#fff', color:'#000' }} />
          </div>
          <button onClick={submit} disabled={saving || !form.amount_usd}
            style={{ padding:'8px 20px', background: form.amount_usd ? '#16a34a' : '#ddd', color: form.amount_usd ? '#fff' : '#999', border:'none', borderRadius:8, fontWeight:700, fontSize:13, cursor: form.amount_usd ? 'pointer' : 'default' }}>
            {saving ? 'Saving…' : '✓ Save'}
          </button>
        </div>
      )}

      {/* Vendor summary pills */}
      {Object.keys(byVendor).length > 0 && (
        <div style={{ padding:'10px 20px', borderBottom:'1px solid #eee', display:'flex', flexWrap:'wrap', gap:8 }}>
          {Object.entries(byVendor).sort((a,b) => b[1]-a[1]).map(([v, amt]) => (
            <span key={v} style={{ background:'#f5f5f5', border:'1px solid #ddd', borderRadius:20, padding:'3px 10px', fontSize:12, fontWeight:700 }}>
              {v}: <span style={{ color:'#dc2626' }}>${(amt as number).toFixed(2)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Entries table */}
      {loading ? (
        <div style={{ padding:24, textAlign:'center', color:'#888', fontSize:13 }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div style={{ padding:'32px 24px', textAlign:'center', color:'#888', fontSize:14 }}>
          <div style={{ fontSize:28, marginBottom:8 }}>📋</div>
          <div style={{ fontWeight:600, marginBottom:4 }}>No expenses logged yet</div>
          <div style={{ fontSize:13 }}>Hit "+ Add Expense" to log your first entry — like that OpenAI credit purchase.</div>
        </div>
      ) : (
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ background:'#f9f9f9' }}>
              <th style={{ textAlign:'left', padding:'8px 14px', borderBottom:'2px solid #eee', fontWeight:700 }}>Date</th>
              <th style={{ textAlign:'left', padding:'8px 14px', borderBottom:'2px solid #eee', fontWeight:700 }}>Vendor</th>
              <th style={{ textAlign:'left', padding:'8px 14px', borderBottom:'2px solid #eee', fontWeight:700 }}>Description</th>
              <th style={{ textAlign:'right', padding:'8px 14px', borderBottom:'2px solid #eee', fontWeight:700 }}>Amount</th>
              <th style={{ textAlign:'center', padding:'8px 14px', borderBottom:'2px solid #eee', fontWeight:700 }}>Source</th>
              <th style={{ padding:'8px 8px', borderBottom:'2px solid #eee' }}></th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id} style={{ borderBottom:'1px solid #f0f0f0' }}>
                <td style={{ padding:'8px 14px', color:'#555' }}>{e.expense_date}</td>
                <td style={{ padding:'8px 14px', fontWeight:600 }}>{e.vendor}</td>
                <td style={{ padding:'8px 14px', color:'#666' }}>{e.description || '—'}</td>
                <td style={{ padding:'8px 14px', textAlign:'right', fontWeight:700, color:'#dc2626' }}>${parseFloat(e.amount_usd).toFixed(2)}</td>
                <td style={{ padding:'8px 14px', textAlign:'center' }}>
                  <span style={{ background: e.entry_type==='auto'?'#dcfce7':'#f3f4f6', color: e.entry_type==='auto'?'#16a34a':'#666', borderRadius:10, padding:'2px 8px', fontSize:11, fontWeight:700 }}>
                    {e.entry_type === 'auto' ? '⚡ auto' : '✋ manual'}
                  </span>
                </td>
                <td style={{ padding:'4px 8px', textAlign:'center' }}>
                  <button onClick={() => del(e.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626', fontSize:16, lineHeight:1 }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background:'#fff7ed', fontWeight:800, borderTop:'2px solid #fed7aa' }}>
              <td colSpan={3} style={{ padding:'8px 14px' }}>YTD TOTAL ({YEAR})</td>
              <td style={{ padding:'8px 14px', textAlign:'right', color:'#dc2626', fontSize:15 }}>${total.toFixed(2)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}

// ─── OPENAI DETAIL TAB ────────────────────────────────────────────────────────
function OpenAITab() {
  const [selMonth, setSelMonth] = useState(new Date().getMonth())
  const [monthly, setMonthly] = useState<{month:number;dalle_images:number;dalle_cost:number;gpt_input:number;gpt_output:number;gpt_cost:number;total_cost:number}[]>([])
  const [byPurpose, setByPurpose] = useState<{purpose:string;calls:number;images:number;input:number;output:number;cost:number;type:string}[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/openai-usage?view=monthly&year=${YEAR}`)
      .then(r => r.json()).then(d => setMonthly(d.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/openai-usage?view=byPurpose&year=${YEAR}&month=${selMonth+1}`)
      .then(r => r.json()).then(d => { setByPurpose(d.data || []); setLoading(false) }).catch(() => setLoading(false))
  }, [selMonth])

  const S: Record<string,React.CSSProperties> = {
    card: { background:'#fff', border:'1px solid #ddd', borderRadius:10, overflow:'hidden', marginBottom:20 },
    cardHead: { background:'#fafafa', borderBottom:'1px solid #eee', padding:'12px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' },
    table: { width:'100%', borderCollapse:'collapse' as const, fontSize:13 },
    th: { textAlign:'right' as const, padding:'8px 12px', borderBottom:'2px solid #eee', fontWeight:700, background:'#f5f5f5' },
    thL: { textAlign:'left' as const, padding:'8px 12px', borderBottom:'2px solid #eee', fontWeight:700, background:'#f5f5f5' },
    td: { textAlign:'right' as const, padding:'8px 12px', borderBottom:'1px solid #f0f0f0' },
    tdL: { textAlign:'left' as const, padding:'8px 12px', borderBottom:'1px solid #f0f0f0' },
  }

  const selData = monthly[selMonth] || { dalle_images:0, dalle_cost:0, gpt_input:0, gpt_output:0, gpt_cost:0, total_cost:0 }
  const ytdDalle = monthly.reduce((s,m) => s + (m?.dalle_cost||0), 0)
  const ytdGpt   = monthly.reduce((s,m) => s + (m?.gpt_cost||0), 0)
  const ytdTotal = monthly.reduce((s,m) => s + (m?.total_cost||0), 0)

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {MONTHS.map((m,i) => (
          <button key={m} onClick={() => setSelMonth(i)}
            style={{ padding:'6px 14px', borderRadius:8, border:`1px solid ${selMonth===i?'#f97316':'#ddd'}`, background:selMonth===i?'#f97316':'#fff', color:selMonth===i?'#fff':'#333', fontWeight:600, fontSize:13, cursor:'pointer' }}>
            {m}
          </button>
        ))}
      </div>

      <div style={{ display:'flex', gap:16, marginBottom:20, flexWrap:'wrap' }}>
        {[
          { label:'DALL-E Images', value:(selData.dalle_images||0).toLocaleString() },
          { label:'DALL-E Cost', value:`$${(selData.dalle_cost||0).toFixed(2)}` },
          { label:'GPT Cost', value:`$${(selData.gpt_cost||0).toFixed(2)}` },
          { label:'Month Total', value:`$${(selData.total_cost||0).toFixed(2)}` },
          { label:`${YEAR} DALL-E YTD`, value:`$${ytdDalle.toFixed(2)}` },
          { label:`${YEAR} GPT YTD`, value:`$${ytdGpt.toFixed(2)}` },
          { label:`${YEAR} OpenAI Total`, value:`$${ytdTotal.toFixed(2)}` },
        ].map(({ label, value }) => (
          <div key={label} style={{ background:'#fff', border:'1px solid #ddd', borderRadius:10, padding:'14px 20px', flex:1, minWidth:120 }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:1, color:'#888', marginBottom:4 }}>{label}</div>
            <div style={{ fontSize:20, fontWeight:900, color:'#111' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={S.card}>
        <div style={S.cardHead}>
          <span style={{ fontWeight:700 }}>🎨 Cost by Purpose — {MONTHS[selMonth]} {YEAR}</span>
          {loading && <span style={{ fontSize:12, color:'#888' }}>Loading…</span>}
        </div>
        {byPurpose.length === 0 ? (
          <div style={{ padding:'40px 24px', textAlign:'center', color:'#888', fontSize:14 }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🎨</div>
            <div style={{ fontWeight:600, marginBottom:6 }}>No OpenAI calls logged yet</div>
            <div style={{ fontSize:13 }}>DALL-E cover art and GPT calls will appear here automatically once stories are generated.</div>
          </div>
        ) : (
          <table style={S.table}>
            <thead><tr>
              <th style={S.thL}>Purpose</th>
              <th style={S.th}>Type</th>
              <th style={S.th}>Calls</th>
              <th style={S.th}>Images</th>
              <th style={S.th}>Cost</th>
            </tr></thead>
            <tbody>
              {byPurpose.map((r,i) => (
                <tr key={i}>
                  <td style={S.tdL}>{r.purpose}</td>
                  <td style={{ ...S.td, color: r.type==='image' ? '#7c3aed' : '#1d4ed8' }}>{r.type==='image' ? '🖼️ DALL-E' : '💬 GPT'}</td>
                  <td style={S.td}>{r.calls.toLocaleString()}</td>
                  <td style={S.td}>{r.images > 0 ? r.images : '—'}</td>
                  <td style={{ ...S.td, fontWeight:700, color: r.cost > 1 ? '#dc2626' : '#111' }}>${r.cost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={S.card}>
        <div style={S.cardHead}><span style={{ fontWeight:700 }}>📅 Monthly OpenAI Spend — {YEAR}</span></div>
        <table style={S.table}>
          <thead><tr>
            <th style={S.thL}>Month</th>
            <th style={S.th}>DALL-E Images</th>
            <th style={S.th}>DALL-E Cost</th>
            <th style={S.th}>GPT Cost</th>
            <th style={S.th}>Total</th>
          </tr></thead>
          <tbody>
            {monthly.map((m, i) => {
              if (!m || m.total_cost === 0) return null
              return (
                <tr key={i} style={{ background: i === selMonth ? '#fff7ed' : undefined }}>
                  <td style={{ ...S.tdL, fontWeight: i === selMonth ? 700 : 400 }}>{MONTHS[i]}</td>
                  <td style={S.td}>{(m.dalle_images||0).toLocaleString()}</td>
                  <td style={S.td}>{m.dalle_cost > 0 ? `$${m.dalle_cost.toFixed(2)}` : '—'}</td>
                  <td style={S.td}>{m.gpt_cost > 0 ? `$${m.gpt_cost.toFixed(2)}` : '—'}</td>
                  <td style={{ ...S.td, fontWeight:700 }}>${m.total_cost.toFixed(2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding:'12px 0', fontSize:12, color:'#888' }}>
        💡 Rates: DALL-E 3 HD $0.08/image · DALL-E 3 Standard $0.04/image · GPT-4o $5/$15 per MTok · GPT-4o-mini $0.15/$0.60 per MTok
      </div>
    </div>
  )
}

// ─── ANTHROPIC DETAIL TAB ─────────────────────────────────────────────────────
function AnthropicTab() {
  const [selMonth, setSelMonth] = useState(new Date().getMonth())
  const [monthly, setMonthly] = useState<{month:number;input_tokens:number;output_tokens:number;cost_usd:number;calls:number}[]>([])
  const [byRoute, setByRoute] = useState<{purpose:string;calls:number;input:number;output:number;cost:number}[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/anthropic-usage?view=monthly&year=${YEAR}`)
      .then(r => r.json()).then(d => setMonthly(d.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/anthropic-usage?view=byRoute&year=${YEAR}&month=${selMonth+1}`)
      .then(r => r.json()).then(d => { setByRoute(d.data || []); setLoading(false) }).catch(() => setLoading(false))
  }, [selMonth])

  const S: Record<string,React.CSSProperties> = {
    card: { background:'#fff', border:'1px solid #ddd', borderRadius:10, overflow:'hidden', marginBottom:20 },
    cardHead: { background:'#fafafa', borderBottom:'1px solid #eee', padding:'12px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' },
    table: { width:'100%', borderCollapse:'collapse' as const, fontSize:13 },
    th: { textAlign:'right' as const, padding:'8px 12px', borderBottom:'2px solid #eee', fontWeight:700, background:'#f5f5f5' },
    thL: { textAlign:'left' as const, padding:'8px 12px', borderBottom:'2px solid #eee', fontWeight:700, background:'#f5f5f5' },
    td: { textAlign:'right' as const, padding:'8px 12px', borderBottom:'1px solid #f0f0f0' },
    tdL: { textAlign:'left' as const, padding:'8px 12px', borderBottom:'1px solid #f0f0f0' },
  }

  const selData = monthly[selMonth] || { input_tokens:0, output_tokens:0, cost_usd:0, calls:0 }
  const ytdCost = monthly.reduce((s,m) => s + parseFloat(String(m?.cost_usd||0)), 0)

  return (
    <div>
      {/* Month selector */}
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {MONTHS.map((m,i) => (
          <button key={m} onClick={() => setSelMonth(i)}
            style={{ padding:'6px 14px', borderRadius:8, border:`1px solid ${selMonth===i?'#f97316':'#ddd'}`, background:selMonth===i?'#f97316':'#fff', color:selMonth===i?'#fff':'#333', fontWeight:600, fontSize:13, cursor:'pointer' }}>
            {m}
          </button>
        ))}
      </div>

      {/* KPI row */}
      <div style={{ display:'flex', gap:16, marginBottom:20, flexWrap:'wrap' }}>
        {[
          { label:'This Month Cost', value:`$${parseFloat(String(selData.cost_usd)).toFixed(2)}` },
          { label:'API Calls', value:(selData.calls||0).toLocaleString() },
          { label:'Input Tokens', value:((selData.input_tokens||0)/1000).toFixed(1)+'K' },
          { label:'Output Tokens', value:((selData.output_tokens||0)/1000).toFixed(1)+'K' },
          { label:`${YEAR} YTD Cost`, value:`$${ytdCost.toFixed(2)}` },
        ].map(({ label, value }) => (
          <div key={label} style={{ background:'#fff', border:'1px solid #ddd', borderRadius:10, padding:'14px 20px', flex:1, minWidth:130 }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:1, color:'#888', marginBottom:4 }}>{label}</div>
            <div style={{ fontSize:22, fontWeight:900, color:'#111' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* By Route */}
      <div style={S.card}>
        <div style={S.cardHead}>
          <span style={{ fontWeight:700 }}>🤖 Cost by Purpose — {MONTHS[selMonth]} {YEAR}</span>
          {loading && <span style={{ fontSize:12, color:'#888' }}>Loading…</span>}
        </div>
        {byRoute.length === 0 ? (
          <div style={{ padding:'40px 24px', textAlign:'center', color:'#888', fontSize:14 }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🤖</div>
            <div style={{ fontWeight:600, marginBottom:6 }}>No Anthropic calls logged yet</div>
            <div style={{ fontSize:13 }}>Usage will appear here once the app starts using <code>anthropicCall()</code> from <code>app/lib/anthropic-logger.ts</code></div>
          </div>
        ) : (
          <table style={S.table}>
            <thead><tr>
              <th style={S.thL}>Purpose</th>
              <th style={S.th}>Calls</th>
              <th style={S.th}>Input Tokens</th>
              <th style={S.th}>Output Tokens</th>
              <th style={S.th}>Cost</th>
            </tr></thead>
            <tbody>
              {byRoute.map((r,i) => (
                <tr key={i}>
                  <td style={S.tdL}>{r.purpose}</td>
                  <td style={S.td}>{r.calls.toLocaleString()}</td>
                  <td style={S.td}>{(r.input/1000).toFixed(1)}K</td>
                  <td style={S.td}>{(r.output/1000).toFixed(1)}K</td>
                  <td style={{ ...S.td, fontWeight:700, color: r.cost > 1 ? '#dc2626' : '#111' }}>${r.cost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Monthly trend */}
      <div style={S.card}>
        <div style={S.cardHead}><span style={{ fontWeight:700 }}>📅 Monthly Anthropic Spend — {YEAR}</span></div>
        <table style={S.table}>
          <thead><tr>
            <th style={S.thL}>Month</th>
            <th style={S.th}>Calls</th>
            <th style={S.th}>Input Tokens</th>
            <th style={S.th}>Output Tokens</th>
            <th style={S.th}>Cost</th>
          </tr></thead>
          <tbody>
            {monthly.map((m, i) => {
              const cost = parseFloat(String(m?.cost_usd || 0))
              if (!m || (cost === 0 && !m.calls)) return null
              return (
                <tr key={i} style={{ background: i === selMonth ? '#fff7ed' : undefined }}>
                  <td style={{ ...S.tdL, fontWeight: i === selMonth ? 700 : 400 }}>{MONTHS[i]}</td>
                  <td style={S.td}>{(m.calls||0).toLocaleString()}</td>
                  <td style={S.td}>{((m.input_tokens||0)/1000).toFixed(1)}K</td>
                  <td style={S.td}>{((m.output_tokens||0)/1000).toFixed(1)}K</td>
                  <td style={{ ...S.td, fontWeight:700 }}>{cost > 0 ? `$${cost.toFixed(2)}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding:'12px 0', fontSize:12, color:'#888' }}>
        💡 Rates: Claude Sonnet $3/$15 per MTok (input/output) · Haiku $0.80/$4 · Opus $15/$75 · Tracking begins when routes use <code>anthropicCall()</code> from the shared logger.
      </div>
    </div>
  )
}

// ─── EL DETAIL TAB ────────────────────────────────────────────────────────────
function ELDetailTab() {
  const [selMonth, setSelMonth] = useState(2) // default March (index 2)
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [storiesProduced, setStoriesProduced] = useState(3) // editable

  useEffect(() => {
    setLoading(true)
    const mm = String(selMonth + 1).padStart(2,'0')
    const start = `${YEAR}-${mm}-01`
    const end   = `${YEAR}-${mm}-31`
    fetch(`/api/admin/el-usage?start=${start}&end=${end}`)
      .then(r => r.json())
      .then(d => { setRows(d.rows || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [selMonth])

  const totalCharsUsed = rows.reduce((s,r) => s + (r.chars_used||0), 0)
  const totalOverageChars = rows.reduce((s,r) => s + (r.chars_overage||0), 0)
  const totalOverageCost = rows.reduce((s,r) => s + parseFloat(r.cost_overage||0), 0)
  const totalELCost = EL_PLAN_MONTHLY + totalOverageCost
  const planCostPerStory = storiesProduced > 0 ? EL_PLAN_MONTHLY / storiesProduced : 0
  const overageCostPerStory = storiesProduced > 0 ? totalOverageCost / storiesProduced : 0
  const totalCostPerStory = planCostPerStory + overageCostPerStory
  const pctUsed = Math.min(100, (totalCharsUsed / EL_INCLUDED_CHARS) * 100)

  const S: Record<string,React.CSSProperties> = {
    card: { background:'#fff', border:'1px solid #ddd', borderRadius:10, overflow:'hidden', marginBottom:20 },
    cardHead: { background:'#fafafa', borderBottom:'1px solid #eee', padding:'12px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' },
    kpi: { background:'#fff', border:'1px solid #ddd', borderRadius:10, padding:'16px 20px', flex:1, minWidth:150 },
    label: { fontSize:11, fontWeight:700, textTransform:'uppercase' as const, letterSpacing:1, color:'#888', marginBottom:4 },
    big: { fontSize:26, fontWeight:900, color:'#111' },
    table: { width:'100%', borderCollapse:'collapse' as const, fontSize:13 },
    th: { textAlign:'right' as const, padding:'8px 12px', borderBottom:'2px solid #eee', fontWeight:700, background:'#f5f5f5' },
    thL: { textAlign:'left' as const, padding:'8px 12px', borderBottom:'2px solid #eee', fontWeight:700, background:'#f5f5f5' },
    td: { textAlign:'right' as const, padding:'8px 12px', borderBottom:'1px solid #f0f0f0' },
    tdL: { textAlign:'left' as const, padding:'8px 12px', borderBottom:'1px solid #f0f0f0' },
  }

  return (
    <div>
      {/* Month selector */}
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {MONTHS.map((m,i) => (
          <button key={m} onClick={() => setSelMonth(i)}
            style={{ padding:'6px 14px', borderRadius:8, border:`1px solid ${selMonth===i?'#f97316':'#ddd'}`, background:selMonth===i?'#f97316':'#fff', color:selMonth===i?'#fff':'#333', fontWeight:600, fontSize:13, cursor:'pointer' }}>
            {m}
          </button>
        ))}
      </div>

      {/* ── What you pay for: plain English ── */}
      <div style={{ ...S.card, border:'1px solid #fed7aa' }}>
        <div style={{ ...S.cardHead, background:'#fff7ed', borderBottom:'1px solid #fed7aa' }}>
          <span style={{ fontWeight:700, color:'#9a3412' }}>📖 What You Pay For — ElevenLabs {MONTHS[selMonth]} {YEAR}</span>
        </div>
        <div style={{ padding:'20px 24px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px,1fr))', gap:12, marginBottom:20 }}>
            <div style={S.kpi}>
              <div style={S.label}>Monthly Subscription</div>
              <div style={S.big}>${EL_PLAN_MONTHLY.toFixed(2)}</div>
              <div style={{ fontSize:12, color:'#888', marginTop:4 }}>Fixed — includes 2M chars/month<br/>Growing Business annual plan</div>
            </div>
            <div style={S.kpi}>
              <div style={S.label}>Chars Used This Month</div>
              <div style={{ ...S.big, color: totalCharsUsed > EL_INCLUDED_CHARS ? '#ef4444' : '#22c55e' }}>
                {rows.length > 0 ? fmtNum(totalCharsUsed) : selMonth===2 ? '9,426,096' : '—'}
              </div>
              <div style={{ fontSize:12, color:'#888', marginTop:4 }}>Of {fmtNum(EL_INCLUDED_CHARS)} included free<br/>{rows.length === 0 && selMonth===2 ? '(estimated — create el_usage_log table)' : ''}</div>
            </div>
            <div style={S.kpi}>
              <div style={S.label}>Overage Chars</div>
              <div style={{ ...S.big, color: totalOverageChars > 0 ? '#ef4444' : '#22c55e' }}>
                {rows.length > 0 ? fmtNum(totalOverageChars) : selMonth===2 ? '7,426,096' : '0'}
              </div>
              <div style={{ fontSize:12, color:'#888', marginTop:4 }}>× $0.30 per 1,000 chars</div>
            </div>
            <div style={{ ...S.kpi, borderColor: totalOverageCost > 0 ? '#fca5a5' : '#bbf7d0' }}>
              <div style={S.label}>Overage Charge</div>
              <div style={{ ...S.big, color: totalOverageCost > 0 ? '#ef4444' : '#22c55e' }}>
                {rows.length > 0 ? `$${totalOverageCost.toFixed(2)}` : selMonth===2 ? '$2,227.83' : '$0.00'}
              </div>
              <div style={{ fontSize:12, color:'#888', marginTop:4 }}>Added to your invoice on top of subscription</div>
            </div>
            <div style={{ ...S.kpi, borderLeft:'4px solid #f97316' }}>
              <div style={S.label}>Total EL Cost This Month</div>
              <div style={{ ...S.big, color:'#f97316' }}>
                {rows.length > 0 ? `$${totalELCost.toFixed(2)}` : selMonth===2 ? '$2,543.16' : `$${EL_PLAN_MONTHLY.toFixed(2)}`}
              </div>
              <div style={{ fontSize:12, color:'#888', marginTop:4 }}>Subscription + overage combined</div>
            </div>
          </div>

          {/* Usage bar */}
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#666', marginBottom:4 }}>
              <span>Character Usage</span>
              <span>{rows.length > 0 ? `${fmtNum(totalCharsUsed)} / ${fmtNum(EL_INCLUDED_CHARS)}` : selMonth===2 ? '9,426,096 / 2,000,000 (471% over)' : '— / 2,000,000'}</span>
            </div>
            <div style={{ height:12, background:'#f0f0f0', borderRadius:6, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${Math.min(100,pctUsed || (selMonth===2?100:0))}%`, background: pctUsed > 100 || selMonth===2 ? '#ef4444' : pctUsed > 80 ? '#f97316' : '#22c55e', borderRadius:6 }}/>
            </div>
          </div>
        </div>
      </div>

      {/* ── Per-story cost breakdown ── */}
      <div style={S.card}>
        <div style={S.cardHead}>
          <span style={{ fontWeight:700 }}>🎙️ Cost Per Story — {MONTHS[selMonth]} {YEAR}</span>
          <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13 }}>
            <label style={{ color:'#666' }}>Stories produced this month:</label>
            <input type="number" min="1" value={storiesProduced}
              onChange={e => setStoriesProduced(parseInt(e.target.value)||1)}
              style={{ width:48, padding:'4px 6px', border:'1px solid #ddd', borderRadius:6, textAlign:'center', fontSize:13, fontWeight:700, background:'#fff', color:'#000' }}
            />
          </div>
        </div>
        <div style={{ padding:'16px 24px' }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.thL}>Cost Component</th>
                <th style={S.th}>Total This Month</th>
                <th style={S.th}>÷ {storiesProduced} Stories</th>
                <th style={S.th}>Cost Per Story</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={S.tdL}>
                  <strong>Subscription (prorated)</strong>
                  <div style={{ fontSize:11, color:'#888' }}>$315.33/mo ÷ stories produced = your "studio time" per story</div>
                </td>
                <td style={S.td}>${EL_PLAN_MONTHLY.toFixed(2)}</td>
                <td style={S.td}>{storiesProduced}</td>
                <td style={{ ...S.td, fontWeight:700 }}>${planCostPerStory.toFixed(2)}</td>
              </tr>
              <tr>
                <td style={S.tdL}>
                  <strong>Overage charges (est.)</strong>
                  <div style={{ fontSize:11, color:'#888' }}>Extra chars beyond 2M included in plan × $0.30/1K</div>
                </td>
                <td style={{ ...S.td, color: totalOverageCost > 0 ? '#ef4444' : '#666' }}>
                  {selMonth===2 && rows.length===0 ? '$2,227.83' : `$${totalOverageCost.toFixed(2)}`}
                </td>
                <td style={S.td}>{storiesProduced}</td>
                <td style={{ ...S.td, fontWeight:700, color: overageCostPerStory > 0 ? '#ef4444' : '#666' }}>
                  {selMonth===2 && rows.length===0 ? `$${(2227.83/storiesProduced).toFixed(2)}` : `$${overageCostPerStory.toFixed(2)}`}
                </td>
              </tr>
              <tr style={{ background:'#fff7ed', fontWeight:800 }}>
                <td style={{ ...S.tdL, fontWeight:800 }}>TOTAL COST PER STORY</td>
                <td style={S.td}>—</td>
                <td style={S.td}>—</td>
                <td style={{ ...S.td, fontSize:18, color:'#f97316', fontWeight:900 }}>
                  {selMonth===2 && rows.length===0 ? `$${(315.33/storiesProduced + 2227.83/storiesProduced).toFixed(2)}` : `$${totalCostPerStory.toFixed(2)}`}
                </td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop:12, padding:12, background:'#f0fdf4', borderRadius:8, fontSize:12, color:'#166534' }}>
            💡 <strong>Normal months (no overage):</strong> Cost per story = ${EL_PLAN_MONTHLY.toFixed(2)} ÷ {storiesProduced} stories = <strong>${planCostPerStory.toFixed(2)}/story</strong> — just your subscription prorated.
            The March overage ($2,228) was caused entirely by the News Briefings feature (daily SC news with 5 voices) — NOT story production. News Briefings are now deprecated. Story production costs ~$2-5 each. This overage will not repeat.
          </div>
        </div>
      </div>

      {/* ── Daily log ── */}
      <div style={S.card}>
        <div style={S.cardHead}>
          <span style={{ fontWeight:700 }}>📅 Daily Usage Log — {MONTHS[selMonth]} {YEAR}</span>
          <span style={{ fontSize:12, color:'#888' }}>Auto-logged from ASC3 v2.3.59+</span>
        </div>
        <div style={{ padding:'0 0 16px' }}>
          {loading ? (
            <p style={{ textAlign:'center', color:'#888', padding:24 }}>Loading...</p>
          ) : rows.length === 0 ? (
            <div style={{ padding:'24px', textAlign:'center', color:'#888' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>📭</div>
              <div style={{ fontWeight:600, marginBottom:4 }}>No daily data logged yet for {MONTHS[selMonth]}</div>
              <div style={{ fontSize:12 }}>
                {selMonth === 2
                  ? 'March data exists but the el_usage_log table needs to be created in Supabase first.\n Run the SQL shown below, then re-run ASC3 to start logging automatically.'
                  : 'Daily data is captured automatically each time you run ASC3 v2.3.59+.'}
              </div>
              {selMonth === 2 && (
                <div style={{ marginTop:16, background:'#f5f5f5', borderRadius:8, padding:'12px 16px', textAlign:'left', fontFamily:'monospace', fontSize:12 }}>
                  {`CREATE TABLE IF NOT EXISTS el_usage_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  usage_date DATE NOT NULL,
  story_title TEXT, story_id TEXT,
  chars_used INTEGER NOT NULL DEFAULT 0,
  chars_included INTEGER NOT NULL DEFAULT 0,
  chars_overage INTEGER NOT NULL DEFAULT 0,
  cost_overage NUMERIC(10,4) NOT NULL DEFAULT 0,
  model TEXT, notes TEXT
);`}
                </div>
              )}
            </div>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.thL}>Date</th>
                  <th style={S.thL}>Story</th>
                  <th style={S.th}>Chars Used</th>
                  <th style={S.th}>Included (free)</th>
                  <th style={S.th}>Overage Chars</th>
                  <th style={S.th}>Overage Cost</th>
                  <th style={S.th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r:any) => (
                  <tr key={r.id}>
                    <td style={S.tdL}>{r.usage_date}</td>
                    <td style={S.tdL}>{r.story_title || '—'}</td>
                    <td style={S.td}>{fmtNum(r.chars_used||0)}</td>
                    <td style={{ ...S.td, color:'#22c55e' }}>{fmtNum(r.chars_included||0)}</td>
                    <td style={{ ...S.td, color: r.chars_overage>0?'#ef4444':'#22c55e' }}>{fmtNum(r.chars_overage||0)}</td>
                    <td style={{ ...S.td, fontWeight:700, color: parseFloat(r.cost_overage||0)>0?'#ef4444':'#22c55e' }}>${parseFloat(r.cost_overage||0).toFixed(2)}</td>
                    <td style={{ ...S.td, fontSize:11, color:'#999' }}>{r.notes||'—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background:'#f9f9f9', fontWeight:800 }}>
                  <td colSpan={2} style={{ ...S.tdL, fontWeight:800 }}>TOTAL</td>
                  <td style={S.td}>{fmtNum(totalCharsUsed)}</td>
                  <td style={{ ...S.td, color:'#22c55e' }}>{fmtNum(Math.min(totalCharsUsed,EL_INCLUDED_CHARS))}</td>
                  <td style={{ ...S.td, color:totalOverageChars>0?'#ef4444':'#22c55e' }}>{fmtNum(totalOverageChars)}</td>
                  <td style={{ ...S.td, color:totalOverageCost>0?'#ef4444':'#22c55e', fontWeight:900 }}>${totalOverageCost.toFixed(2)}</td>
                  <td style={S.td}>—</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── STORIES COST TAB ─────────────────────────────────────────────────────────
interface StoryCostRow {
  id: string
  title: string
  author: string
  published_on: string | null
  created_at: string | null
  is_hidden: boolean
  production_cost: {
    claude?: number
    elevenlabs?: number
    elevenlabs_credits?: number
    elevenlabs_estimated?: number
    el_verified_at?: string
    openai?: number
    suno?: number
    other?: number
  } | null
}

const STORY_COST_KEYS = ['claude','elevenlabs','openai','suno','other'] as const
const STORY_COST_LABELS: Record<string, string> = {
  claude: '🤖 Claude',
  elevenlabs: '🎙️ ElevenLabs',
  openai: '🧠 OpenAI',
  suno: '🎵 Suno',
  other: '💰 Other',
}
const BUDGET_STORAGE_KEY = 'et_story_cost_budgets_2026'
const DEFAULT_BUDGETS: Record<string, number> = {
  claude: 50,
  elevenlabs: 500,
  openai: 20,
  suno: 20,
  other: 50,
}

function StoriesCostTab({ supabase }: { supabase: any }) {
  const [stories, setStories] = useState<StoryCostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [budgets, setBudgets] = useState<Record<string, number>>(DEFAULT_BUDGETS)
  const [editingBudget, setEditingBudget] = useState<string | null>(null)
  const [budgetDraft, setBudgetDraft] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem(BUDGET_STORAGE_KEY)
    if (saved) setBudgets(JSON.parse(saved))
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('stories')
        .select('id, title, author, published_on, created_at, is_hidden, production_cost')
        .order('created_at', { ascending: false })
      if (!error && data) setStories(data)
      setLoading(false)
    }
    load()
  }, [])

  const saveBudgets = (next: Record<string, number>) => {
    setBudgets(next)
    localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(next))
  }

  const storyMonth = (s: StoryCostRow) => {
    const d = s.published_on || s.created_at
    if (!d) return -1
    return new Date(d).getMonth()
  }

  const storiesInMonth = (m: number) => stories.filter(s => storyMonth(s) === m)

  const storyCost = (s: StoryCostRow, key?: string) => {
    if (!s.production_cost) return 0
    if (key) return (s.production_cost as any)[key] || 0
    return STORY_COST_KEYS.reduce((sum, k) => sum + ((s.production_cost as any)?.[k] || 0), 0)
  }

  const elVerified = (s: StoryCostRow) => !!s.production_cost?.el_verified_at
  const elDiscrepancy = (s: StoryCostRow) => {
    const est = s.production_cost?.elevenlabs_estimated
    const actual = s.production_cost?.elevenlabs
    if (!est || !actual) return null
    return Math.abs((actual - est) / est) * 100
  }
  const elVerifyStatus = (s: StoryCostRow): { icon: string; color: string; label: string } => {
    if (!s.production_cost?.elevenlabs) return { icon: '—', color: '#bbb', label: 'No EL cost' }
    if (!elVerified(s)) return { icon: '⏳', color: '#f59e0b', label: 'Pending verification' }
    const disc = elDiscrepancy(s)
    if (disc === null) return { icon: '✅', color: '#16a34a', label: 'Verified' }
    if (disc > 10) return { icon: '🚨', color: '#dc2626', label: `${disc.toFixed(1)}% discrepancy` }
    if (disc > 5) return { icon: '⚠️', color: '#ea580c', label: `${disc.toFixed(1)}% discrepancy` }
    return { icon: '✅', color: '#16a34a', label: `Verified (${disc.toFixed(1)}% diff)` }
  }

  const monthCatTotal = (m: number, key: string) =>
    storiesInMonth(m).reduce((sum, s) => sum + storyCost(s, key), 0)

  const monthTotal = (m: number) =>
    STORY_COST_KEYS.reduce((sum, k) => sum + monthCatTotal(m, k), 0)

  const ytdCatTotal = (key: string) =>
    Array.from({ length: 12 }, (_, i) => monthCatTotal(i, key)).reduce((a, b) => a + b, 0)

  const fmtC = (n: number) => n === 0 ? '—' : `$${n.toFixed(2)}`
  const pct = (n: number, budget: number) => budget > 0 ? Math.round((n / budget) * 100) : 0

  const S: Record<string, React.CSSProperties> = {
    card: { background: '#fff', border: '1px solid #ddd', borderRadius: 10, overflow: 'hidden', marginBottom: 20 },
    cardHead: { background: '#fafafa', borderBottom: '1px solid #eee', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
    th: { textAlign: 'right' as const, padding: '8px 10px', borderBottom: '2px solid #eee', fontWeight: 700, color: '#000', whiteSpace: 'nowrap' as const, background: '#fafafa' },
    thLeft: { textAlign: 'left' as const, padding: '8px 14px', borderBottom: '2px solid #eee', fontWeight: 700, color: '#000', background: '#fafafa' },
    td: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', textAlign: 'right' as const },
    tdLeft: { padding: '8px 14px', borderBottom: '1px solid #f0f0f0', textAlign: 'left' as const },
  }

  const monthBtn = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 6, border: `1px solid ${active ? '#f97316' : '#ddd'}`,
    background: active ? '#f97316' : '#fff', color: active ? '#fff' : '#333',
    fontWeight: 600, fontSize: 12, cursor: 'pointer',
  })

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading story cost data...</div>
  )

  const currentMonth = new Date().getMonth()
  const activeMonthStories = selectedMonth !== null ? storiesInMonth(selectedMonth) : []

  return (
    <div>
      {/* Budget Panel */}
      <div style={S.card}>
        <div style={S.cardHead}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>📊 Monthly Production Budget</div>
          <div style={{ fontSize: 12, color: '#888' }}>Per-category monthly caps · 90% threshold alerts · click amount to edit</div>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 12 }}>
            {STORY_COST_KEYS.map(key => {
              const spent = monthCatTotal(currentMonth, key)
              const budget = budgets[key] || 0
              const p = pct(spent, budget)
              const atRisk = p >= 90
              const over = p >= 100
              return (
                <div key={key} style={{
                  flex: '1 1 160px',
                  background: over ? '#fef2f2' : atRisk ? '#fff7ed' : '#f9fafb',
                  border: `1px solid ${over ? '#fecaca' : atRisk ? '#fed7aa' : '#e5e7eb'}`,
                  borderRadius: 8, padding: '12px 16px',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{STORY_COST_LABELS[key]}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: over ? '#dc2626' : atRisk ? '#ea580c' : '#000' }}>
                      {fmtC(spent)}
                    </span>
                    <span style={{ fontSize: 11, color: '#888' }}>of&nbsp;
                      {editingBudget === key ? (
                        <input type="number" value={budgetDraft} autoFocus
                          onChange={e => setBudgetDraft(e.target.value)}
                          onBlur={() => { saveBudgets({ ...budgets, [key]: parseFloat(budgetDraft) || 0 }); setEditingBudget(null) }}
                          onKeyDown={e => { if (e.key === 'Enter') { saveBudgets({ ...budgets, [key]: parseFloat(budgetDraft) || 0 }); setEditingBudget(null) } }}
                          style={{ width: 60, fontSize: 11, border: '1px solid #f97316', borderRadius: 4, padding: '1px 4px' }}
                        />
                      ) : (
                        <span onClick={() => { setEditingBudget(key); setBudgetDraft(budget.toString()) }}
                          style={{ cursor: 'pointer', textDecoration: 'underline dotted', color: '#666' }}>
                          ${budget}
                        </span>
                      )}
                    </span>
                  </div>
                  <div style={{ background: '#e5e7eb', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 99,
                      width: `${Math.min(p, 100)}%`,
                      background: over ? '#dc2626' : atRisk ? '#f97316' : '#22c55e',
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  <div style={{ fontSize: 11, marginTop: 4, color: over ? '#dc2626' : atRisk ? '#ea580c' : '#888', fontWeight: atRisk ? 700 : 400 }}>
                    {over ? `⛔ Over by $${(spent - budget).toFixed(2)}` : atRisk ? `⚠️ ${p}% used` : `${p}% used`}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 12 }}>Showing {MONTH_FULL[currentMonth]} spend vs budget.</div>
        </div>
      </div>

      {/* Monthly Summary */}
      <div style={S.card}>
        <div style={S.cardHead}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>📅 Monthly Story Production Costs</div>
          <div style={{ fontSize: 12, color: '#888' }}>Click a month to drill down</div>
        </div>
        <div style={{ overflowX: 'auto' as const }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.thLeft}>Category</th>
                {MONTH_NAMES.map((m, i) => (
                  <th key={m} style={S.th}>
                    <button style={monthBtn(selectedMonth === i)} onClick={() => setSelectedMonth(selectedMonth === i ? null : i)}>{m}</button>
                  </th>
                ))}
                <th style={S.th}>YTD</th>
              </tr>
            </thead>
            <tbody>
              {STORY_COST_KEYS.map(key => (
                <tr key={key}>
                  <td style={S.tdLeft}>{STORY_COST_LABELS[key]}</td>
                  {Array.from({ length: 12 }, (_, i) => {
                    const val = monthCatTotal(i, key)
                    const budget = budgets[key] || 0
                    const p = pct(val, budget)
                    const atRisk = p >= 90 && val > 0
                    return (
                      <td key={i} style={{ ...S.td, color: atRisk ? (p >= 100 ? '#dc2626' : '#ea580c') : val > 0 ? '#000' : '#bbb', fontWeight: atRisk ? 700 : 400, background: selectedMonth === i ? '#fff7ed' : 'transparent' }}>
                        {fmtC(val)}{atRisk ? (p >= 100 ? ' ⛔' : ' ⚠️') : ''}
                      </td>
                    )
                  })}
                  <td style={{ ...S.td, fontWeight: 700 }}>{fmtC(ytdCatTotal(key))}</td>
                </tr>
              ))}
              <tr style={{ background: '#f9fafb' }}>
                <td style={{ ...S.tdLeft, color: '#666', fontSize: 12 }}>📖 Stories</td>
                {Array.from({ length: 12 }, (_, i) => (
                  <td key={i} style={{ ...S.td, color: '#666', fontSize: 12, background: selectedMonth === i ? '#fff7ed' : 'transparent' }}>
                    {storiesInMonth(i).length || '—'}
                  </td>
                ))}
                <td style={{ ...S.td, color: '#666', fontSize: 12 }}>{stories.length}</td>
              </tr>
              <tr style={{ background: '#fff7ed', fontWeight: 700, borderTop: '2px solid #ddd' }}>
                <td style={S.tdLeft}>TOTAL</td>
                {Array.from({ length: 12 }, (_, i) => (
                  <td key={i} style={{ ...S.td, fontWeight: 700, background: selectedMonth === i ? '#fed7aa' : '#fff7ed' }}>{fmtC(monthTotal(i))}</td>
                ))}
                <td style={{ ...S.td, fontWeight: 700 }}>{fmtC(STORY_COST_KEYS.reduce((s, k) => s + ytdCatTotal(k), 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Drilldown */}
      {selectedMonth !== null && (
        <div style={S.card}>
          <div style={S.cardHead}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>📖 {MONTH_FULL[selectedMonth]} — Story Breakdown</div>
            <div style={{ fontSize: 12, color: '#888' }}>{activeMonthStories.length} stories</div>
          </div>
          {activeMonthStories.length === 0 ? (
            <div style={{ padding: '24px 20px', color: '#888', fontSize: 13 }}>No stories this month.</div>
          ) : (
            <div style={{ overflowX: 'auto' as const }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.thLeft}>Story</th>
                    <th style={S.th}>Status</th>
                    {STORY_COST_KEYS.map(k => <th key={k} style={S.th}>{STORY_COST_LABELS[k]}</th>)}
                    <th style={S.th}>Total</th>
                    <th style={S.th}>EL Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {activeMonthStories.map(s => {
                    const vs = elVerifyStatus(s)
                    const disc = elDiscrepancy(s)
                    return (
                    <tr key={s.id}>
                      <td style={S.tdLeft}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{s.title}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>{s.author}</div>
                      </td>
                      <td style={S.td}>
                        <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: s.is_hidden ? '#fef2f2' : '#f0fdf4', color: s.is_hidden ? '#dc2626' : '#16a34a' }}>
                          {s.is_hidden ? 'Hidden' : 'Live'}
                        </span>
                      </td>
                      {STORY_COST_KEYS.map(k => (
                        <td key={k} style={{ ...S.td, color: storyCost(s, k) > 0 ? '#000' : '#ddd' }}>{fmtC(storyCost(s, k))}</td>
                      ))}
                      <td style={{ ...S.td, fontWeight: 700 }}>{fmtC(storyCost(s))}</td>
                      <td style={{ ...S.td, fontSize: 11, color: vs.color, fontWeight: disc && disc > 5 ? 700 : 400 }}>
                        <div>{vs.icon} {vs.label}</div>
                        {s.production_cost?.elevenlabs_credits && (
                          <div style={{ color: '#888', marginTop: 2 }}>{s.production_cost.elevenlabs_credits.toLocaleString()} credits</div>
                        )}
                        {s.production_cost?.el_verified_at && (
                          <div style={{ color: '#aaa', fontSize: 10 }}>{new Date(s.production_cost.el_verified_at).toLocaleDateString()}</div>
                        )}
                      </td>
                    </tr>
                    )
                  })}
                  <tr style={{ background: '#fff7ed', fontWeight: 700, borderTop: '2px solid #ddd' }}>
                    <td style={S.tdLeft}>TOTAL</td>
                    <td style={S.td} />
                    {STORY_COST_KEYS.map(k => <td key={k} style={{ ...S.td, fontWeight: 700 }}>{fmtC(monthCatTotal(selectedMonth, k))}</td>)}
                    <td style={{ ...S.td, fontWeight: 700 }}>{fmtC(monthTotal(selectedMonth))}</td>
                    <td style={S.td} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* All Stories */}
      <div style={S.card}>
        <div style={S.cardHead}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>📚 All Stories — Production Cost Summary</div>
          <div style={{ fontSize: 12, color: '#888' }}>{stories.length} total</div>
        </div>
        <div style={{ overflowX: 'auto' as const }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.thLeft}>Story</th>
                <th style={S.th}>Month</th>
                <th style={S.th}>Status</th>
                {STORY_COST_KEYS.map(k => <th key={k} style={S.th}>{STORY_COST_LABELS[k]}</th>)}
                <th style={S.th}>Total</th>
                <th style={S.th}>EL Verified</th>
              </tr>
            </thead>
            <tbody>
              {stories.map(s => {
                const m = storyMonth(s)
                const vs = elVerifyStatus(s)
                const disc = elDiscrepancy(s)
                return (
                  <tr key={s.id}>
                    <td style={S.tdLeft}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{s.title}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{s.author}</div>
                    </td>
                    <td style={{ ...S.td, color: '#666', fontSize: 12 }}>{m >= 0 ? MONTH_NAMES[m] : '—'}</td>
                    <td style={S.td}>
                      <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: s.is_hidden ? '#fef2f2' : '#f0fdf4', color: s.is_hidden ? '#dc2626' : '#16a34a' }}>
                        {s.is_hidden ? 'Hidden' : 'Live'}
                      </span>
                    </td>
                    {STORY_COST_KEYS.map(k => (
                      <td key={k} style={{ ...S.td, color: storyCost(s, k) > 0 ? '#000' : '#ddd' }}>{fmtC(storyCost(s, k))}</td>
                    ))}
                    <td style={{ ...S.td, fontWeight: 700 }}>{fmtC(storyCost(s))}</td>
                    <td style={{ ...S.td, fontSize: 11, color: vs.color, fontWeight: disc && disc > 5 ? 700 : 400 }}>
                      <div>{vs.icon} {vs.label}</div>
                      {s.production_cost?.elevenlabs_credits && (
                        <div style={{ color: '#888', fontSize: 10 }}>{s.production_cost.elevenlabs_credits.toLocaleString()} cr</div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}



// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function FinancePage() {
  const [tab, setTab] = useState<'expenses'|'revenue'|'pl'|'balance'|'el'|'anthropic'|'openai'|'stories'>('expenses')

  const expDefaults = Object.fromEntries(EXPENSES.map(e => [e.id, [...e.defaults]]))
  const revDefaults = Object.fromEntries(REVENUES.map(r => [r.id, [...r.defaults]]))
  const exp = useFinanceData(`et_expenses_${YEAR}`, expDefaults)
  const rev = useFinanceData(`et_revenue_${YEAR}`, revDefaults)

  const monthExpTotal = (m: number) => EXPENSES.reduce((s,e) => s + (exp.data[e.id]?.[m]||0), 0)
  const monthRevTotal = (m: number) => REVENUES.reduce((s,r) => s + (rev.data[r.id]?.[m]||0), 0)
  const monthNetTotal = (m: number) => monthRevTotal(m) - monthExpTotal(m)
  const catMonthTotal = (cat: string, m: number) => EXPENSES.filter(e=>e.category===cat).reduce((s,e) => s + (exp.data[e.id]?.[m]||0), 0)
  const catTotal = (cat: string) => MONTHS.reduce((s,_,i) => s + catMonthTotal(cat,i), 0)
  const ytdExp = MONTHS.slice(0,3).reduce((s,_,i) => s + monthExpTotal(i), 0)
  const ytdRev = MONTHS.slice(0,3).reduce((s,_,i) => s + monthRevTotal(i), 0)
  const ytdNet = ytdRev - ytdExp

  const S: Record<string,React.CSSProperties> = {
    page: { background:'#f5f5f5', minHeight:'100vh', padding:24, fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', color:'#000' },
    header: { background:'#fff', border:'1px solid #ddd', borderRadius:10, padding:'18px 24px', marginBottom:20 },
    tabs: { display:'flex', gap:4, marginBottom:20, flexWrap:'wrap' as const },
    tab: (active:boolean): React.CSSProperties => ({ padding:'8px 20px', borderRadius:8, border:`1px solid ${active?'#f97316':'#ddd'}`, background:active?'#f97316':'#fff', color:active?'#fff':'#333', fontWeight:600, fontSize:14, cursor:'pointer' }),
    card: { background:'#fff', border:'1px solid #ddd', borderRadius:10, overflow:'hidden', marginBottom:20 },
    cardHead: { background:'#fafafa', borderBottom:'1px solid #eee', padding:'12px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' },
    table: { width:'100%', borderCollapse:'collapse' as const, fontSize:13 },
    th: { textAlign:'right' as const, padding:'8px 10px', borderBottom:'2px solid #eee', fontWeight:700, color:'#000', whiteSpace:'nowrap' as const },
    thLeft: { textAlign:'left' as const, padding:'8px 14px', borderBottom:'2px solid #eee', fontWeight:700, color:'#000' },
    td: { padding:'8px 10px', borderBottom:'1px solid #f0f0f0', textAlign:'right' as const },
    tdLeft: { padding:'8px 14px', borderBottom:'1px solid #f0f0f0', textAlign:'left' as const },
    catHeader: { background:'#f0f4ff', padding:'7px 14px', fontWeight:700, fontSize:12, color:'#1e40af', borderBottom:'1px solid #e0e7ff', letterSpacing:0.5 },
    catSubtotal: { background:'#f5f5f5', fontWeight:700, borderTop:'1px solid #e5e7eb', borderBottom:'2px solid #e5e7eb' },
    totalRow: { background:'#fff7ed', fontWeight:700, borderTop:'2px solid #ddd' },
    summaryCard: (color:string): React.CSSProperties => ({ background:'#fff', border:'1px solid #ddd', borderLeft:`4px solid ${color}`, borderRadius:8, padding:'14px 20px', flex:1, minWidth:160 }),
  }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, margin:0 }}>💰 Finance — {YEAR}</h1>
            <p style={{ fontSize:13, color:'#666', margin:'4px 0 0' }}>Endless Tales · Wonder Books Press LLC · YTD through March</p>
          </div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            <div style={S.summaryCard('#ef4444')}>
              <div style={{ fontSize:11, color:'#666', fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>YTD Expenses</div>
              <div style={{ fontSize:22, fontWeight:900, color:'#ef4444' }}>${ytdExp.toFixed(2)}</div>
            </div>
            <div style={S.summaryCard('#22c55e')}>
              <div style={{ fontSize:11, color:'#666', fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>YTD Revenue</div>
              <div style={{ fontSize:22, fontWeight:900, color:'#22c55e' }}>${ytdRev.toFixed(2)}</div>
            </div>
            <div style={S.summaryCard(ytdNet>=0?'#3b82f6':'#f97316')}>
              <div style={{ fontSize:11, color:'#666', fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>YTD Net</div>
              <div style={{ fontSize:22, fontWeight:900, color:ytdNet>=0?'#3b82f6':'#f97316' }}>{fmtSigned(ytdNet)}</div>
            </div>
            <div style={S.summaryCard('#9333ea')}>
              <div style={{ fontSize:11, color:'#666', fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>Avg Burn/Mo</div>
              <div style={{ fontSize:22, fontWeight:900, color:'#9333ea' }}>${(ytdExp/3).toFixed(0)}/mo</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        {([['expenses','📋 Expenses'],['revenue','💵 Revenue'],['pl','📊 P&L'],['balance','🏦 Balance Sheet'],['el','🎙️ EL Detail'],['anthropic','🤖 Anthropic'],['openai','🎨 OpenAI'],['stories','📚 Stories']] as const).map(([id,label]) => (
          <button key={id} style={S.tab(tab===id)} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {/* ── EXPENSES TAB ── */}
      {tab === 'expenses' && (
        <div>
          <LiveExpenses />
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button onClick={exp.save} style={{ padding:'8px 20px', background:exp.dirty?'#f97316':'#ddd', color:exp.dirty?'#fff':'#999', border:'none', borderRadius:8, fontWeight:700, cursor:exp.dirty?'pointer':'default' }}>
              {exp.dirty ? '💾 Save Changes' : '✓ Saved'}
            </button>
          </div>
          <div style={{ overflowX:'auto' }}>
            <div style={S.card}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={{ ...S.thLeft, minWidth:220, position:'sticky', left:0, background:'#fafafa', zIndex:2 }}>Service</th>
                    {MONTHS.map(m => <th key={m} style={{ ...S.th, minWidth:78 }}>{m}</th>)}
                    <th style={{ ...S.th, minWidth:90, background:'#fff7ed' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {EXPENSE_CATEGORIES.map(cat => {
                    const catItems = EXPENSES.filter(e => e.category === cat)
                    const cTotal = catTotal(cat)
                    return (
                      <>
                        {/* Category header row */}
                        <tr key={`cat-${cat}`}>
                          <td colSpan={14} style={S.catHeader}>{CAT_ICONS[cat]} {cat}</td>
                        </tr>
                        {/* Line items */}
                        {catItems.map(item => (
                          <tr key={item.id}>
                            <td style={{ ...S.tdLeft, position:'sticky', left:0, background:'#fff', zIndex:1 }}>
                              <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color:'#2563eb', textDecoration:'none', fontWeight:500 }}>{item.name} ↗</a>
                              <div style={{ fontSize:11, color:'#999', marginTop:2 }}>{item.notes}</div>
                            </td>
                            {MONTHS.map((_,i) => (
                              <td key={i} style={S.td}>
                                <EditCell value={exp.data[item.id]?.[i]||0} onChange={v => exp.update(item.id,i,v)} />
                              </td>
                            ))}
                            <td style={{ ...S.td, background:'#fff7ed', fontWeight:700 }}>
                              ${(exp.data[item.id]||[]).reduce((a,b)=>a+b,0).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                        {/* Category subtotal row */}
                        <tr key={`sub-${cat}`} style={S.catSubtotal}>
                          <td style={{ ...S.tdLeft, position:'sticky', left:0, background:'#f5f5f5', zIndex:1, fontWeight:700, color:'#374151' }}>
                            {CAT_ICONS[cat]} {cat} Subtotal
                          </td>
                          {MONTHS.map((_,i) => (
                            <td key={i} style={{ ...S.td, fontWeight:700, color: catMonthTotal(cat,i)>0?'#111':'#ccc' }}>
                              {catMonthTotal(cat,i)>0 ? `$${catMonthTotal(cat,i).toFixed(2)}` : '—'}
                            </td>
                          ))}
                          <td style={{ ...S.td, background:'#e5e7eb', fontWeight:900, color:'#111' }}>
                            ${cTotal.toFixed(2)}
                          </td>
                        </tr>
                      </>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={S.totalRow}>
                    <td style={{ ...S.tdLeft, position:'sticky', left:0, background:'#fff7ed', fontWeight:800, zIndex:1 }}>TOTAL EXPENSES</td>
                    {MONTHS.map((_,i) => (
                      <td key={i} style={{ ...S.td, background:'#fff7ed', fontWeight:700, color:'#dc2626' }}>${monthExpTotal(i).toFixed(2)}</td>
                    ))}
                    <td style={{ ...S.td, background:'#fee2e2', fontWeight:900, color:'#dc2626', fontSize:14 }}>
                      ${MONTHS.reduce((s,_,i)=>s+monthExpTotal(i),0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <p style={{ fontSize:12, color:'#888', marginTop:8 }}>💡 Click any cell to edit. Changes save to browser. Blue subtotal rows = category totals. See 🎙️ EL Detail for per-story/daily breakdown.</p>
        </div>
      )}

      {/* ── REVENUE TAB ── */}
      {tab === 'revenue' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button onClick={rev.save} style={{ padding:'8px 20px', background:rev.dirty?'#f97316':'#ddd', color:rev.dirty?'#fff':'#999', border:'none', borderRadius:8, fontWeight:700, cursor:rev.dirty?'pointer':'default' }}>
              {rev.dirty ? '💾 Save Changes' : '✓ Saved'}
            </button>
          </div>
          <div style={S.card}>
            <div style={S.cardHead}>
              <span style={{ fontWeight:700 }}>💵 Revenue by Stream</span>
              <span style={{ fontSize:12, color:'#888' }}>App launches April 17 — revenue begins ~May 2026</span>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={{ ...S.thLeft, minWidth:260 }}>Revenue Stream</th>
                    {MONTHS.map(m => <th key={m} style={{ ...S.th, minWidth:80 }}>{m}</th>)}
                    <th style={{ ...S.th, minWidth:90, background:'#f0fdf4' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {REVENUES.map(item => (
                    <tr key={item.id}>
                      <td style={S.tdLeft}>
                        <div style={{ fontWeight:500 }}>{item.name}</div>
                        <div style={{ fontSize:11, color:'#999', marginTop:2 }}>{item.notes}</div>
                      </td>
                      {MONTHS.map((_,i) => (
                        <td key={i} style={S.td}><EditCell value={rev.data[item.id]?.[i]||0} onChange={v => rev.update(item.id,i,v)}/></td>
                      ))}
                      <td style={{ ...S.td, background:'#f0fdf4', fontWeight:700 }}>
                        ${(rev.data[item.id]||[]).reduce((a,b)=>a+b,0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ ...S.totalRow, background:'#f0fdf4' }}>
                    <td style={{ ...S.tdLeft, fontWeight:800 }}>TOTAL REVENUE</td>
                    {MONTHS.map((_,i) => <td key={i} style={{ ...S.td, background:'#f0fdf4', fontWeight:700 }}>${monthRevTotal(i).toFixed(2)}</td>)}
                    <td style={{ ...S.td, background:'#dcfce7', fontWeight:900, color:'#22c55e' }}>
                      ${MONTHS.reduce((s,_,i)=>s+monthRevTotal(i),0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── P&L TAB ── */}
      {tab === 'pl' && (
        <div style={S.card}>
          <div style={S.cardHead}>
            <span style={{ fontWeight:700 }}>📊 Profit & Loss Statement — {YEAR}</span>
            <span style={{ fontSize:12, color:'#888' }}>Auto-calculated from Expenses + Revenue tabs</span>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={{ ...S.thLeft, minWidth:220 }}>Category</th>
                  {MONTHS.map(m => <th key={m} style={{ ...S.th, minWidth:88 }}>{m}</th>)}
                  <th style={{ ...S.th, minWidth:100 }}>Full Year</th>
                </tr>
              </thead>
              <tbody>
                <tr><td colSpan={14} style={{ ...S.catHeader, color:'#166534', background:'#f0fdf4' }}>💵 Revenue</td></tr>
                {REVENUES.map(item => (
                  <tr key={item.id}>
                    <td style={S.tdLeft}>{item.name}</td>
                    {MONTHS.map((_,i) => <td key={i} style={S.td}>{fmt(rev.data[item.id]?.[i]||0)}</td>)}
                    <td style={{ ...S.td, fontWeight:700 }}>${(rev.data[item.id]||[]).reduce((a,b)=>a+b,0).toFixed(2)}</td>
                  </tr>
                ))}
                <tr style={{ background:'#f0fdf4', fontWeight:700 }}>
                  <td style={S.tdLeft}>Total Revenue</td>
                  {MONTHS.map((_,i) => <td key={i} style={{ ...S.td, fontWeight:700 }}>${monthRevTotal(i).toFixed(2)}</td>)}
                  <td style={{ ...S.td, fontWeight:900, color:'#22c55e' }}>${MONTHS.reduce((s,_,i)=>s+monthRevTotal(i),0).toFixed(2)}</td>
                </tr>

                <tr><td colSpan={14} style={{ ...S.catHeader, paddingTop:10 }}>📋 Expenses by Category</td></tr>
                {EXPENSE_CATEGORIES.map(cat => {
                  const cTotal = catTotal(cat)
                  if (cTotal === 0) return null
                  return (
                    <tr key={cat}>
                      <td style={S.tdLeft}>{CAT_ICONS[cat]} {cat}</td>
                      {MONTHS.map((_,i) => <td key={i} style={S.td}>{fmt(catMonthTotal(cat,i))}</td>)}
                      <td style={{ ...S.td, fontWeight:700 }}>${cTotal.toFixed(2)}</td>
                    </tr>
                  )
                })}
                <tr style={{ background:'#fff7ed', fontWeight:700 }}>
                  <td style={S.tdLeft}>Total Expenses</td>
                  {MONTHS.map((_,i) => <td key={i} style={{ ...S.td, fontWeight:700, color:'#dc2626' }}>${monthExpTotal(i).toFixed(2)}</td>)}
                  <td style={{ ...S.td, fontWeight:900, color:'#dc2626' }}>${MONTHS.reduce((s,_,i)=>s+monthExpTotal(i),0).toFixed(2)}</td>
                </tr>

                <tr><td colSpan={14} style={{ ...S.catHeader, paddingTop:10, background:'#f5f3ff', color:'#5b21b6' }}>📈 Net Income</td></tr>
                <tr style={{ background:'#f5f5f5', fontWeight:800, fontSize:14 }}>
                  <td style={{ ...S.tdLeft, fontWeight:800 }}>NET INCOME (LOSS)</td>
                  {MONTHS.map((_,i) => {
                    const net = monthNetTotal(i)
                    return <td key={i} style={{ ...S.td, fontWeight:800, color:net>=0?'#22c55e':'#dc2626' }}>{fmtSigned(net)}</td>
                  })}
                  <td style={{ ...S.td, fontWeight:900, fontSize:15, color:MONTHS.reduce((s,_,i)=>s+monthNetTotal(i),0)>=0?'#22c55e':'#dc2626' }}>
                    {fmtSigned(MONTHS.reduce((s,_,i)=>s+monthNetTotal(i),0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── BALANCE SHEET TAB ── */}
      {tab === 'balance' && (
        <div>
          <div style={S.card}>
            <div style={S.cardHead}>
              <span style={{ fontWeight:700 }}>🏦 Balance Sheet — As of March 21, 2026</span>
              <span style={{ fontSize:12, color:'#888' }}>Pre-launch snapshot · Update manually each quarter</span>
            </div>
            <div style={{ padding:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>
              <div>
                <h3 style={{ fontWeight:800, fontSize:15, marginBottom:12 }}>ASSETS</h3>
                <table style={{ ...S.table, marginBottom:24 }}>
                  <thead><tr>
                    <th style={{ ...S.thLeft, background:'#f5f5f5' }}>Item</th>
                    <th style={{ ...S.th, background:'#f5f5f5' }}>Value</th>
                  </tr></thead>
                  <tbody>
                    <tr><td colSpan={2} style={S.catHeader}>Current Assets</td></tr>
                    <tr><td style={S.tdLeft}>Cash / Operating Funds</td><td style={S.td}><span style={{color:'#aaa'}}>Enter manually</span></td></tr>
                    <tr><td style={S.tdLeft}>Stripe Balance</td><td style={S.td}>$0.00</td></tr>
                    <tr><td colSpan={2} style={S.catHeader}>Intangible Assets</td></tr>
                    <tr><td style={S.tdLeft}>Software / App (dev cost)</td><td style={S.td}><span style={{color:'#aaa'}}>Enter manually</span></td></tr>
                    <tr><td style={S.tdLeft}>Brand / Domain</td><td style={S.td}>$12.00</td></tr>
                    <tr><td style={S.tdLeft}>Audio Content Library</td><td style={S.td}><span style={{color:'#aaa'}}>Enter manually</span></td></tr>
                    <tr style={{ fontWeight:700, background:'#f5f5f5' }}>
                      <td style={S.tdLeft}>TOTAL ASSETS</td><td style={S.td}>—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div>
                <h3 style={{ fontWeight:800, fontSize:15, marginBottom:12 }}>LIABILITIES & EQUITY</h3>
                <table style={S.table}>
                  <thead><tr>
                    <th style={{ ...S.thLeft, background:'#f5f5f5' }}>Item</th>
                    <th style={{ ...S.th, background:'#f5f5f5' }}>Value</th>
                  </tr></thead>
                  <tbody>
                    <tr><td colSpan={2} style={S.catHeader}>Current Liabilities</td></tr>
                    <tr><td style={S.tdLeft}>Accounts Payable</td><td style={S.td}>$0.00</td></tr>
                    <tr><td style={S.tdLeft}>Deferred Revenue</td><td style={S.td}>$0.00</td></tr>
                    <tr><td colSpan={2} style={S.catHeader}>Owner's Equity</td></tr>
                    <tr><td style={S.tdLeft}>Owner's Investment</td><td style={S.td}><span style={{color:'#aaa'}}>Enter manually</span></td></tr>
                    <tr>
                      <td style={S.tdLeft}>Retained Earnings (YTD Net Loss)</td>
                      <td style={{ ...S.td, color:'#dc2626', fontWeight:700 }}>{fmtSigned(ytdNet)}</td>
                    </tr>
                    <tr style={{ fontWeight:700, background:'#f5f5f5' }}>
                      <td style={S.tdLeft}>TOTAL LIABILITIES + EQUITY</td><td style={S.td}>—</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ marginTop:20, background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:8, padding:16 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#9a3412', textTransform:'uppercase', letterSpacing:1, marginBottom:4 }}>Monthly Burn Rate (Avg)</div>
                  <div style={{ fontSize:28, fontWeight:900, color:'#ea580c' }}>${(ytdExp/3).toFixed(2)}/mo</div>
                  <div style={{ fontSize:12, color:'#9a3412', marginTop:4 }}>Jan–Mar avg · ${ytdExp.toFixed(2)} total YTD</div>
                </div>
              </div>
            </div>
            <div style={{ padding:'12px 24px', borderTop:'1px solid #eee', fontSize:12, color:'#888' }}>
              ⚠️ Balance Sheet requires manual entry for cash, dev costs, and owner investment. Contact your accountant before April 17 launch for formal books.
            </div>
          </div>
        </div>
      )}

      {/* ── EL DETAIL TAB ── */}
      {tab === 'el' && <ELDetailTab />}

      {/* ── ANTHROPIC TAB ── */}
      {tab === 'anthropic' && <AnthropicTab />}

      {/* ── OPENAI TAB ── */}
      {tab === 'openai' && <OpenAITab />}
      {tab === 'stories' && <StoriesCostTab supabase={supabase} />}

    </div>
  )
}
