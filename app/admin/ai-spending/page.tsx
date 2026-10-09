'use client'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AGENTS, AGENT_ROSTER, PROVIDERS, dayKey, shiftDay, monday, summarize, type DailyCost } from '@/lib/ai-spending/core'
import styles from './spending.module.css'

export const dynamic = 'force-dynamic'

type Payload = { fetchedAt: string; daily: DailyCost[]; payments: any[]; balances: any[]; sources: any[] }
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const labels: Record<string, string> = { usage: 'API estimate', subscription: 'Subscription payment', credit_purchase: 'Credit purchase', invoice: 'Invoice / other payment' }
export default function AISpendingPage() {
  const [data, setData] = useState<Payload | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const [period, setPeriod] = useState('month'), [provider, setProvider] = useState(''), [agent, setAgent] = useState(''), [group, setGroup] = useState('day')
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [open, setOpen] = useState(false), [saving, setSaving] = useState(false), [saveStatus, setSaveStatus] = useState('')
  const [form, setForm] = useState({ provider: 'OpenAI', agent: 'Unassigned', model: '', kind: 'credit_purchase', amount: '', date: dayKey(new Date()), note: '' })
  const request = useRef(0), active = useRef<AbortController | null>(null)
  async function refresh() {
    const id = ++request.current; active.current?.abort(); const controller = new AbortController(); active.current = controller
    const timer = setTimeout(() => controller.abort(), 60000); setLoading(true); setError('')
    try {
      const r = await fetch('/api/admin/ai-spending', { cache: 'no-store', signal: controller.signal }); const p = await r.json()
      if (!r.ok || !p.success) throw new Error(r.status === 401 ? 'Your admin session expired. Sign in again.' : p.error || 'Spending data unavailable.')
      if (id === request.current) setData(p)
    } catch (e: any) { if (id === request.current) setError(e.name === 'AbortError' ? 'Refresh timed out. Try again.' : e.message) }
    finally { clearTimeout(timer); if (id === request.current) setLoading(false) }
  }
  useEffect(() => { refresh(); return () => { ++request.current; active.current?.abort() } }, [])
  const today = dayKey(new Date()), week = monday(today), month = today.slice(0, 7) + '-01'
  const start = period === 'day' ? today : period === 'week' ? week : period === 'month' ? month : period === 'custom' ? from : ''
  const end = period === 'custom' ? to : today
  const scope = useMemo(() => (data?.daily || []).filter(r => (!provider || r.provider === provider) && (!agent || r.agent === agent)), [data, provider, agent])
  const rows = scope.filter(r => (!start || r.date >= start) && (!end || r.date <= end))
  const selected = summarize(rows)
  const hasUsage = data?.sources.some(s => s.provider !== 'Payments' && s.status !== 'unavailable')
  const hasCash = data?.sources.some(s => s.provider === 'Payments' && s.status !== 'unavailable')
  const fmtUsage = (n: number) => hasUsage ? usd(n) : '—', fmtCash = (n: number) => hasCash ? usd(n) : '—'
  const periods = [['Today', today], ['This week', week], ['This month', month], ['Lifetime recorded', '']]
  function rollup(key: 'agent' | 'provider' | 'model') {
    const names = [...new Set(rows.map(r => r[key] || 'Not specified'))]
    return names.map(name => ({ name, ...summarize(rows.filter(r => (r[key] || 'Not specified') === name)) })).sort((a, b) => b.cash - a.cash || b.usage - a.usage)
  }
  const agents = rollup('agent'), models = rollup('model')
  const buckets = new Map<string, DailyCost[]>()
  rows.forEach(r => { const key = group === 'day' ? r.date : group === 'week' ? monday(r.date) : r.date.slice(0, 7); buckets.set(key, [...(buckets.get(key) || []), r]) })
  const history = [...buckets].sort(([a], [b]) => b.localeCompare(a)).map(([date, rs]) => ({ date, ...summarize(rs) }))
  const payments = (data?.payments || []).filter(p => (!provider || p.provider === provider) && (!agent || p.agent === agent) && (!start || p.date >= start) && (!end || p.date <= end))
  const warnings = data?.sources.filter(s => s.status !== 'connected') || []
  const allAgents = [...new Set([...AGENTS, ...(data?.daily || []).map(r => r.agent)])]
  async function save(e: FormEvent) {
    e.preventDefault(); setSaving(true); setSaveStatus('')
    try { const r = await fetch('/api/admin/ai-spending', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, amount: Number(form.amount) }) }); const p = await r.json(); if (!r.ok || !p.success) throw new Error(p.error || 'Could not record payment.'); setSaveStatus('Payment recorded in the shared expense ledger.'); setForm(f => ({ ...f, amount: '', note: '', model: '' })); await refresh() }
    catch (e: any) { setSaveStatus(e.message) } finally { setSaving(false) }
  }
  const subtitle = period === 'custom' ? `${from || 'Beginning'} to ${to || 'Today'}` : period === 'lifetime' ? 'All available recorded history' : `Calendar ${period} to date`
  return <div className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>ENDLESS TALES / FINANCE</p><h1>AI spending</h1><p>Agents, APIs, subscriptions—and the credits that keep them working.</p></div><button className={styles.primary} onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : '↻ Refresh data'}</button></header>
    <div className={styles.notice}>USD · America/New_York · API usage estimates and recorded payments are separate views of spending. They are never added together.</div>
    {error && <div role="alert" className={styles.error}>{error}{data ? ' Showing the last successful snapshot.' : ''}</div>}
    {warnings.length > 0 && <div className={styles.error}>Partial data: {warnings.map(s => s.provider).join(', ')}. Totals below cover available records only. See source coverage.</div>}
    <section className={styles.filters}>
      <div className={styles.tabs}>{[['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['lifetime', 'Lifetime'], ['custom', 'Custom']].map(([id, text]) => <button key={id} onClick={() => setPeriod(id)} aria-pressed={period === id} className={period === id ? styles.active : ''}>{text}</button>)}</div>
      <label>Provider<select value={provider} onChange={e => setProvider(e.target.value)}><option value="">All providers</option>{PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      <label>Agent<select value={agent} onChange={e => setAgent(e.target.value)}><option value="">All agents</option>{allAgents.map(a => <option key={a}>{a}</option>)}</select></label>
      {period === 'custom' && <><label>From<input type="date" value={from} onChange={e => setFrom(e.target.value)} max={to || today} /></label><label>To<input type="date" value={to} onChange={e => setTo(e.target.value)} min={from} max={today} /></label></>}
    </section>
    <p className={styles.meta}>{subtitle} · {data ? `Fetched ${new Date(data.fetchedAt).toLocaleString()}` : loading ? 'Loading recorded data…' : 'No data loaded'} · Weeks start Monday</p>
    <section className={styles.cards}>{[
      ['RECORDED PAYMENTS', fmtCash(selected.cash), 'Subscriptions, credits, and paid invoices'],
      ['API USAGE ESTIMATE', fmtUsage(selected.usage), `${selected.calls.toLocaleString()} logged calls · existing rate estimates`],
      ['SUBSCRIPTION PAYMENTS', fmtCash(selected.subscriptions), 'Receipts explicitly marked subscription'],
      ['CREDIT PURCHASES', fmtCash(selected.credits), 'Money paid to replenish credits'],
    ].map(([title, amount, caption]) => <article key={title}><span className={styles.eyebrow}>{title}</span><strong>{amount}</strong><p>{caption}</p></article>)}</section>
    <section className={styles.panel}><h2>Your spending at a glance</h2><div className={styles.periodGrid}>{periods.map(([label, cutoff]) => { const s = summarize(scope.filter(r => (!cutoff || r.date >= cutoff) && r.date <= today)); return <div key={label}><h3>{label}</h3><strong>{fmtCash(s.cash)}</strong><p>Recorded payments</p><span>{fmtUsage(s.usage)} API estimate</span></div> })}</div></section>
    <section className={styles.panel}><div className={styles.sectionHeader}><div><h2>Providers & desktop credit controls</h2><p>Add credits opens the provider’s billing page in a new tab. Complete payment there, then record the receipt below.</p></div><button onClick={() => { setOpen(!open); setSaveStatus('') }}>{open ? 'Close entry' : '+ Record payment'}</button></div>
      <div className={styles.scroll}><table><thead><tr><th>Provider</th><th>Payments</th><th>API estimate</th><th>Balance / quota</th><th>Desktop action</th></tr></thead><tbody>{PROVIDERS.map(p => { const s = summarize(rows.filter(r => r.provider === p.id)); const b = data?.balances.find(b => b.provider === p.id); const source = data?.sources.find(s => s.provider === p.id); return <tr key={p.id}><td><b>{p.label}</b><small>{source ? `${source.rows.toLocaleString()} tracked records · ${source.status}` : 'Receipts only · API history not connected'}</small></td><td>{fmtCash(s.cash)}</td><td>{source && source.status !== 'unavailable' ? usd(s.usage) : 'Not connected'}</td><td>{b?.status === 'live' ? <>{b.credits.toLocaleString()} {b.unit}<small>{b.plan || 'Live balance'}{b.reset ? ` · resets ${dayKey(b.reset)}` : ''}</small></> : <span>{b ? b.status.replace('_', ' ') : 'Check provider billing'}</span>}</td><td>{p.url ? <a className={styles.linkButton} href={p.url} target="_blank" rel="noopener noreferrer">{p.action} ↗</a> : 'Use your provider account'}</td></tr> })}</tbody></table></div>
      <p className={styles.meta}>No credit purchases are executed by ET. Balance units are not converted to dollars. R1 / V3 share a DeepSeek account; model labels are retained when supplied. Hindsight self-hosting and its underlying model costs must be recorded under the account that actually bills you.</p>
      {open && <form className={styles.form} onSubmit={save}><h3>Record a completed payment</h3><p>This saves a receipt to the shared ledger. It does not charge your card. Enter each receipt once.</p><div className={styles.formGrid}>
        <label>Provider<select value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}>{PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <label>Agent allocation<select value={form.agent} onChange={e => setForm({ ...form, agent: e.target.value })}>{AGENTS.map(a => <option key={a}>{a}</option>)}</select></label>
        <label>Payment type<select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}><option value="credit_purchase">Credit purchase</option><option value="subscription">Subscription</option><option value="invoice">Invoice / other payment</option></select></label>
        <label>Amount in USD<input required type="number" min="0.01" max="1000000" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label>
        <label>Payment date<input required type="date" max={today} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
        <label>Model / plan (optional)<input maxLength={80} placeholder="DeepSeek R1, V3, Muse Spark, Claude Max…" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} /></label>
        <label className={styles.wide}>Receipt reference / notes<input maxLength={500} placeholder="Invoice number, account name, billing interval…" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></label>
      </div><button className={styles.primary} disabled={saving}>{saving ? 'Saving…' : 'Save receipt'}</button><p role="status">{saveStatus}</p></form>}
    </section>
    <div className={styles.twoCol}><section className={styles.panel}><h2>Spending by agent</h2><p>Attribution uses explicit agent tags. Shared or untagged costs are not divided arbitrarily.</p><div className={styles.scroll}><table><thead><tr><th>Agent</th><th>Payments</th><th>API estimate</th><th>Calls</th></tr></thead><tbody>{agents.map(a => <tr key={a.name}><td>{a.name}</td><td>{fmtCash(a.cash)}</td><td>{fmtUsage(a.usage)}</td><td>{a.calls.toLocaleString()}</td></tr>)}</tbody></table></div>{agents.length === 0 && <p>No matching agent records.</p>}</section>
    <section className={styles.panel}><h2>Models & subscriptions</h2><p>Only explicit model or plan labels appear here. Purchases covering multiple models can stay unspecified.</p><div className={styles.scroll}><table><thead><tr><th>Model / plan</th><th>Payments</th><th>API estimate</th></tr></thead><tbody>{models.map(m => <tr key={m.name}><td>{m.name}</td><td>{fmtCash(m.cash)}</td><td>{fmtUsage(m.usage)}</td></tr>)}</tbody></table></div>{models.length === 0 && <p>No matching model records.</p>}</section></div>
    <section className={styles.panel}><div className={styles.sectionHeader}><div><h2>Spending over time</h2><p>Recorded dates—not projected bills or recurring assumptions.</p></div><label>Group by<select value={group} onChange={e => setGroup(e.target.value)}><option value="day">Days</option><option value="week">Weeks</option><option value="month">Months</option></select></label></div><div className={styles.scroll}><table><thead><tr><th>{group === 'week' ? 'Week starting' : group === 'month' ? 'Month' : 'Day'}</th><th>Payments</th><th>Subscriptions</th><th>Credit purchases</th><th>API estimate</th><th>Calls</th></tr></thead><tbody>{history.map(h => <tr key={h.date}><td>{h.date}</td><td>{fmtCash(h.cash)}</td><td>{fmtCash(h.subscriptions)}</td><td>{fmtCash(h.credits)}</td><td>{fmtUsage(h.usage)}</td><td>{h.calls.toLocaleString()}</td></tr>)}</tbody></table></div>{history.length === 0 && <p>No spending records for this selection.</p>}</section>
    <section className={styles.panel}><h2>Recent recorded payments</h2><div className={styles.scroll}><table><thead><tr><th>Date</th><th>Provider / agent</th><th>Type</th><th>Amount</th><th>Reference</th></tr></thead><tbody>{payments.map(p => <tr key={p.id}><td>{p.date}</td><td>{p.provider}<small>{p.agent}</small></td><td>{labels[p.kind]}</td><td>{usd(p.amount)}</td><td className={styles.noteCell}>{p.description}</td></tr>)}</tbody></table></div><p className={styles.meta}>Latest 200 AI payment receipts across all dates before filters. Summary totals include all available records. Older untyped receipts appear as invoice / other payment.</p></section>
    <section className={styles.panel}><h2>Agent fleet reference</h2><p>ETD Agent Fleet Architecture v1.0 · approved October 3, 2026. These are declared assignments, not a live configuration audit. Model assignments never determine spending attribution.</p><div className={styles.scroll}><table><thead><tr><th>Agent / role</th><th>Operating model</th><th>Declared model</th></tr></thead><tbody>{AGENT_ROSTER.map(a => <tr key={a.name}><td>{a.name}<small>{a.role}</small></td><td>{a.type}</td><td>{a.model}</td></tr>)}</tbody></table></div></section>
    <section className={styles.panel}><h2>Data coverage & accuracy</h2><p>Lifetime means all available logged history, not a complete provider invoice history. API estimates use the rates recorded by existing ET loggers and may differ from provider charges, discounts, included credits, and taxes. Desktop agent runs outside ET are not automatically included.</p><div className={styles.scroll}><table><thead><tr><th>Source</th><th>Status</th><th>Records</th><th>Earliest date</th><th>Latest date</th></tr></thead><tbody>{data?.sources.map(s => <tr key={s.table}><td>{s.provider}<small>{s.table}</small></td><td>{s.status}{s.skipped > 0 && <small>{s.skipped} invalid records excluded</small>}{s.truncated && <small>100,000 record read limit reached</small>}</td><td>{s.status === 'unavailable' ? '—' : s.rows.toLocaleString()}</td><td>{s.first || '—'}</td><td>{s.last || '—'}</td></tr>)}</tbody></table></div><p><Link href="/admin/finance">Revenue & Costs ↗</Link> · <Link href="/admin/accounts">Accounts & Integrations ↗</Link> · <a href="https://help.openai.com/en/articles/8264644-setting-up-and-managing-prepaid-api-billing" target="_blank" rel="noopener noreferrer">OpenAI credit help ↗</a> · <a href="https://support.claude.com/en/articles/8977456-how-do-i-pay-for-my-claude-api-usage" target="_blank" rel="noopener noreferrer">Anthropic credit help ↗</a></p></section>
  </div>
}
