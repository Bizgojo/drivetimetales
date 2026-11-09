'use client'
// FINANCE-STATEMENT-001 — Admin → Finance → Statement (approved sample, Nov 8 2026).
import { useCallback, useEffect, useState } from 'react'

type Num = number | null
interface Item { section: string; item: string; ai_service: string | null; purpose: string | null; cards: string[]; values: number[] }
interface Camp { name: string; platform: string; dates: string; days: number; trials: number; subs: number; cost: number; costPerTrial: Num; cac: Num; status: string }
interface Data {
  basis: string; columns: string[]; vp: Record<string, Num[]>; revenue: Record<string, number[]>; items: Item[]
  sections: Record<string, number[]>; memo: Record<string, number[]>; totals: { revenue: number[]; expenses: number[]; result: number[]; plowBack: number[]; retained: number[] }
  pipeline?: { stages: { stage: string; episodes: number; series: { title: string; episodes: number; live: number; total: number }[] }[]; coldStorage: number }
  vpDetail: { stories: { title: string; episodes: number; voiceCost: Num; complete?: boolean }[][]; finished: { title: string; episodes: number; voiceCost: Num; live?: number }[][]; costPerEpisode: { item: string; ai_service: string | null; total: number; perEpisode: Num }[][] }
  recon?: { mercury: Record<string, number[]>; stripe: Record<string, number[]>; outside: Record<string, number[]>; check: Num[] }
  campaigns: Camp[]; uncategorizedCount: number; notes: string[]; lastSynced: string | null; error?: string
}
const SECTIONS = ['Operating Exp', 'Production Exp', 'Ad Spend', 'Marketing Services', 'R & D', 'Uncategorized']
const MONEY_ROWS = new Set(['Production cost per finished episode', 'Ad spend', 'Blended cost per trial', 'Blended CAC', 'LTV (measured)', 'Net LTV-CAC $', 'Run rate (yearly)'])
const PCT_ROWS = new Set(['Net LTV-CAC %', 'Monthly churn (measured)'])
const DRILL_ROWS = new Set(['Stories published', 'Partly published (rule break)', 'Episodes finished (voiced)', 'Production cost per finished episode'])

const money = (v: Num) => v == null || !isFinite(v) ? '—' : (v < 0 ? '−$' : '$') + (Math.abs(v) >= 100 ? Math.round(Math.abs(v)).toLocaleString() : Math.abs(v).toFixed(2))
const fmt = (row: string, v: Num) => v == null || !isFinite(v as number) ? '—' : PCT_ROWS.has(row) ? Math.round((v as number) * 100) + '%' : MONEY_ROWS.has(row) ? money(v) : Math.round(v as number).toLocaleString()

export default function StatementPage() {
  const [basis, setBasis] = useState('cash'), [period, setPeriod] = useState('d30')
  const [from, setFrom] = useState(''), [to, setTo] = useState('')
  const [data, setData] = useState<Data | null>(null), [loading, setLoading] = useState(false), [msg, setMsg] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({ 'Ad Spend': true }), [openItem, setOpenItem] = useState<Record<string, boolean>>({})
  const [drill, setDrill] = useState<{ row: string; col: number } | null>(null)
  const [openStage, setOpenStage] = useState<string | null>(null)
  const [ideas, setIdeas] = useState<{ month: string; items: { title: string; detail: string; impact: string }[]; created_at: string } | null>(null)
  const [ideasBusy, setIdeasBusy] = useState(false), [ideasMsg, setIdeasMsg] = useState('')
  useEffect(() => { fetch('/api/admin/finance/suggestions', { cache: 'no-store' }).then(r => r.json()).then(j => setIdeas(j.suggestions || null)).catch(() => {}) }, [])
  async function saveIdeas(items: { title: string; detail: string; impact: string }[]) {
    if (!ideas) return
    const before = ideas
    setIdeas({ ...ideas, items }); setIdeasMsg('')
    try {
      const r = await fetch('/api/admin/finance/suggestions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: ideas.month, items }) })
      const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Could not save')
    } catch (e) { setIdeas(before); setIdeasMsg(e instanceof Error ? e.message : 'Could not save') }
  }
  const moveIdea = (i: number, d: -1 | 1) => { if (!ideas) return; const a = ideas.items.slice(), j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; saveIdeas(a) }
  const deleteIdea = (i: number) => { if (!ideas) return; saveIdeas(ideas.items.filter((_, k) => k !== i)) }
  async function writeIdeas() {
    setIdeasBusy(true); setIdeasMsg('')
    try { const r = await fetch('/api/admin/finance/suggestions', { method: 'POST' }); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Suggestions failed'); setIdeas(j.suggestions) }
    catch (e) { setIdeasMsg(e instanceof Error ? e.message : 'Suggestions failed') } finally { setIdeasBusy(false) }
  }

  const load = useCallback(async () => {
    setLoading(true); setMsg('')
    try {
      const q = new URLSearchParams({ basis, period }); if (period === 'custom') { if (from) q.set('from', from); if (to) q.set('to', to) }
      const r = await fetch('/api/admin/finance/statement?' + q.toString(), { cache: 'no-store' })
      const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Statement unavailable'); setData(j)
    } catch (e) { setData(null); setMsg(e instanceof Error ? e.message : 'Statement unavailable') } finally { setLoading(false) }
  }, [basis, period, from, to])
  useEffect(() => { if (period !== 'custom' || (from && to)) load() }, [load, period, from, to])

  async function sync() {
    setLoading(true); setMsg('')
    try { const r = await fetch('/api/admin/finance/sync', { method: 'POST' }); const j = await r.json(); setMsg(j.message || j.error); if (r.ok) await load() }
    catch { setMsg('Mercury sync failed') } finally { setLoading(false) }
  }

  const cols = data?.columns || []
  const row = (label: string, vals: Num[], f: (v: Num) => string, cls = '', extra: any = {}) =>
    <tr className={cls} key={label + cls} {...extra}><td>{label}</td>{vals.map((v, i) => <td key={i} className={'n' + ((v ?? 0) < 0 ? ' neg' : '')}>{f(v)}</td>)}</tr>

  return <main className="fs">
    <style>{CSS}</style>
    <p className="fs-crumb"><a href="/admin/finance">Finance</a> › Statement</p>
    <h1>Financial statement</h1>
    <div className="fs-controls">
      <label>Basis<select value={basis} onChange={e => setBasis(e.target.value)}><option value="cash">Cash flow</option><option value="accrual">Accrual</option></select></label>
      <label>Time period<select value={period} onChange={e => setPeriod(e.target.value)}>
        <option value="d1">Last 24 hours</option><option value="d7">Last 7 days</option><option value="d30">Last 30 days</option>
        <option value="custom">Custom</option><option value="monthly">Actual monthly</option></select></label>
      {period === 'custom' && <label>From – To<span className="fs-dates"><input type="date" value={from} onChange={e => setFrom(e.target.value)} /><input type="date" value={to} onChange={e => setTo(e.target.value)} /></span></label>}
      <button onClick={sync} disabled={loading}>Sync Mercury &amp; Stripe now</button>
      <span className="fs-muted">{loading ? 'Loading…' : data?.lastSynced ? 'Mercury synced ' + new Date(data.lastSynced).toLocaleString() : ''}</span>
    </div>
    {msg && <p role="status" className="fs-msg">{msg}</p>}
    {data && data.uncategorizedCount > 0 && <p className="fs-warn">{data.uncategorizedCount} Mercury transactions have no category yet. They appear under “Uncategorized” until a vendor rule covers them.</p>}
    {data && <>
      <div className="fs-table"><table>
        <thead><tr><th>{data.basis === 'cash' ? 'Cash flow' : 'Accrual'}</th>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          <tr className="sec"><td colSpan={cols.length + 1}>Volume &amp; productivity</td></tr>
          {Object.entries(data.vp).flatMap(([k, v]) => {
            if (!DRILL_ROWS.has(k)) return [row(k, v, x => fmt(k, x))]
            const d = drill && drill.row === k ? drill : null
            const out = [<tr key={k}><td>{k}</td>{v.map((x, i) => <td key={i} className="n"><button className="fs-drill" aria-expanded={!!d && d.col === i} onClick={() => setDrill(d && d.col === i ? null : { row: k, col: i })}>{fmt(k, x)} <span className="car">{d && d.col === i ? '▾' : '▸'}</span></button></td>)}</tr>]
            if (d) {
              const partly = k === 'Partly published (rule break)'
              const finishedRow = k === 'Episodes finished (voiced)'
              const stories = finishedRow ? (data.vpDetail.finished[d.col] || []) : (data.vpDetail.stories[d.col] || []).filter(s => partly ? s.complete === false : s.complete !== false), costs = data.vpDetail.costPerEpisode[d.col] || []
              const eps = data.vp['Episodes finished (voiced)'][d.col] || 0
              out.push(<tr key={k + '-d'} className="detail"><td colSpan={cols.length + 1}>
                <b>{cols[d.col]}</b>{' — '}
                {k !== 'Production cost per finished episode'
                  ? (stories.length ? <ul className="fs-list">{stories.map(s => <li key={s.title}>{s.title} <span className="fs-muted">· {s.episodes} episode{s.episodes === 1 ? '' : 's'}{finishedRow ? <> · {s.live || 0} live</> : null}{s.voiceCost != null ? <> · voices {money(s.voiceCost)}</> : null}</span></li>)}</ul> : finishedRow ? 'No episodes finished in this period.' : partly ? 'None. Every story published this period has all its episodes live.' : 'No complete stories published in this period.')
                  : (costs.length ? <table className="fs-mini"><thead><tr><th>Cost</th><th>AI / service</th><th>Cost this period</th><th>Per episode</th></tr></thead><tbody>
                      {costs.map(c => <tr key={c.item}><td>{c.item}</td><td>{c.ai_service || '—'}</td><td className="n">{money(c.total)}</td><td className="n">{money(c.perEpisode)}</td></tr>)}
                      <tr className="sub"><td>Total ({eps} episode{eps === 1 ? '' : 's'})</td><td></td><td className="n">{money(costs.reduce((a, c) => a + c.total, 0))}</td><td className="n">{money(eps ? costs.reduce((a, c) => a + c.total, 0) / eps : null)}</td></tr>
                    </tbody></table> : 'No production costs in this period.')}
                {k === 'Production cost per finished episode' && <p className="fs-muted" style={{ margin: '6px 0 0' }}>Yearly purchases (Sound Ideas, Soundsnap, Airtable) are spread evenly over their year, so each month carries 1/12. ElevenLabs is credits used × your plan's price per credit. Divided by episodes finished this period, published or not.</p>}
              </td></tr>)
            }
            return out
          })}
          <tr className="sec"><td colSpan={cols.length + 1}>Revenues</td></tr>
          {Object.entries(data.revenue).map(([k, v]) => row(k, v, money, 'item'))}
          {row('Total revenue (net)', data.totals.revenue, money, 'total')}
          <tr className="sec"><td colSpan={cols.length + 1}>Expenses</td></tr>
          {SECTIONS.filter(s => data.items.some(it => it.section === s)).map(s => {
            const items = data.items.filter(it => it.section === s), o = !!open[s]
            return [
              <tr key={s} className="cat" tabIndex={0} role="button" aria-expanded={o} onClick={() => setOpen({ ...open, [s]: !o })} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen({ ...open, [s]: !o }) } }}>
                <td colSpan={cols.length + 1}><span className="car">{o ? '▾' : '▸'}</span><b>{s}</b> <span className="fs-muted">{items.length} items</span></td></tr>,
              ...(o ? items.flatMap(it => {
                const k = s + '|' + it.item, oi = !!openItem[k], camp = s === 'Ad Spend' ? data.campaigns.find(c => c.name === it.item) : undefined
                return [
                  <tr key={k} className="item click" tabIndex={0} role="button" aria-expanded={oi} onClick={() => setOpenItem({ ...openItem, [k]: !oi })} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenItem({ ...openItem, [k]: !oi }) } }}>
                    <td><span className="car">{oi ? '▾' : '▸'}</span>{it.item}</td>{it.values.map((v, i) => <td key={i} className="n">{money(v)}</td>)}</tr>,
                  ...(oi ? [<tr key={k + '-d'} className="detail"><td colSpan={cols.length + 1}>{camp
                    ? <>{camp.dates} ({camp.days} days) · <b>{camp.status}</b> · Total cost <b>{money(camp.cost)}</b> · Trials <b>{camp.trials}</b> · Cost per trial <b>{money(camp.costPerTrial)}</b> · Paid subs <b>{camp.subs}</b> · CAC <b>{camp.cac == null ? '— (no paid subs yet)' : money(camp.cac)}</b></>
                    : <>{it.ai_service && <>AI / service: <b>{it.ai_service}</b> · </>}{it.purpose || 'No description yet'}{it.cards.length ? <> · Card {it.cards.join(', ')}</> : null}</>}</td></tr>] : [])]
              }) : []),
              row('Subtotal ' + s, data.sections[s], money, 'sub'),
            ]
          })}
          {row('Total expenses', data.totals.expenses, money, 'total')}
          {row(data.basis === 'cash' ? 'Cash flow' : 'Profit before tax', data.totals.result, money, 'grand')}
          {row('Plow back % ', cols.map(() => 0.75), v => Math.round((v || 0) * 100) + '%')}
          {row('Plow back $ (to next month, profit months only)', data.totals.plowBack, money)}
          {row('Retained %', cols.map(() => 0.25), v => Math.round((v || 0) * 100) + '%')}
          {row('Retained $', data.totals.retained, money)}
          <tr className="sec"><td colSpan={cols.length + 1}>Memo (not counted in revenue or cash flow)</td></tr>
          {Object.entries(data.memo || {}).map(([k, v]) => row(k, v, money, 'item'))}
        </tbody></table></div>
      {data.recon && <section className="fs-pipe" aria-label="Mercury reconciliation">
        <h2>Mercury reconciliation <span className="fs-muted">— where every dollar that moved through Mercury went</span></h2>
        <div className="fs-table"><table>
          <thead><tr><th>Mercury</th>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {Object.entries(data.recon.mercury).map(([k, v]) => row(k, v, money, k === 'Net change across Mercury accounts' ? 'total' : 'item'))}
            <tr className="sec"><td colSpan={cols.length + 1}>Stripe → Mercury</td></tr>
            {Object.entries(data.recon.stripe).map(([k, v]) => row(k, v, money, 'item'))}
            <tr className="sec"><td colSpan={cols.length + 1}>Costs not paid through Mercury</td></tr>
            {Object.entries(data.recon.outside).map(([k, v]) => row(k, v, money, 'item'))}
            <tr className="grand"><td>Check: statement vs Mercury</td>{data.recon.check.map((v, i) => <td key={i} className="n">{v == null ? 'cash view only' : v === 0 ? '✓ $0.00' : <span className="neg">✗ {money(v)}</span>}</td>)}</tr>
          </tbody></table></div>
        <p className="fs-muted" style={{ margin: 0 }}>The check compares the expenses on this statement that Mercury paid with Mercury's own money out. ✓ $0.00 means they match to the cent. "Unexplained" should always be $0.00. Stripe in transit is money Stripe has paid out that hasn't landed in Mercury yet.</p>
      </section>}
      <section className="fs-pipe" aria-label="Profit suggestions">
        <h2>Profit suggestions <span className="fs-muted">— written by Claude from this statement{ideas ? ` · ${new Date(ideas.created_at).toLocaleDateString()}` : ''}</span></h2>
        <p className="fs-muted" style={{ margin: 0 }}>Rule for every suggestion: story quality stays the same. No cheaper voices, no weaker script model, no shorter episodes.</p>
        {ideas ? <ol className="fs-ideas">{ideas.items.map((x, i) => <li key={x.title + i}>
          <div className="fs-idea-text"><b>{x.title}.</b> {x.detail} {x.impact && <span className="fs-muted">— {x.impact}</span>}</div>
          <div className="fs-idea-btns">
            <button aria-label={'Move up: ' + x.title} disabled={i === 0} onClick={() => moveIdea(i, -1)}>▲ Up</button>
            <button aria-label={'Move down: ' + x.title} disabled={i === ideas.items.length - 1} onClick={() => moveIdea(i, 1)}>▼ Down</button>
            <button aria-label={'Delete: ' + x.title} onClick={() => deleteIdea(i)}>✕ Delete</button>
          </div></li>)}</ol> : <p style={{ margin: 0 }}>No suggestions yet for this month.</p>}
        <div><button onClick={writeIdeas} disabled={ideasBusy}>{ideasBusy ? 'Claude is writing…' : ideas ? 'Rewrite suggestions' : "Write this month's suggestions"}</button>{ideasMsg && <span role="status" className="fs-warn" style={{ marginLeft: 10 }}>{ideasMsg}</span>}</div>
      </section>
      {data.pipeline && <section className="fs-pipe" aria-label="In the pipeline now">
        <h2>In the pipeline now <span className="fs-muted">— not yet live to listeners{data.pipeline.coldStorage ? ` · ${data.pipeline.coldStorage} in cold storage (not shown)` : ''}</span></h2>
        <table><thead><tr><th>Stage</th><th className="n">Stories</th><th className="n">Episodes</th></tr></thead><tbody>
          {data.pipeline.stages.flatMap(st => {
            const o = openStage === st.stage
            return [
              <tr key={st.stage} className="click" tabIndex={0} role="button" aria-expanded={o} onClick={() => setOpenStage(o ? null : st.stage)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenStage(o ? null : st.stage) } }}>
                <td><span className="car">{o ? '▾' : '▸'}</span>{st.stage}</td><td className="n">{st.series.length}</td><td className="n">{st.episodes}</td></tr>,
              ...(o ? [<tr key={st.stage + '-d'} className="detail"><td colSpan={3}><ul className="fs-list">{st.series.map(x => <li key={x.title}>{x.title} <span className="fs-muted">· {x.episodes} episode{x.episodes === 1 ? '' : 's'} at this stage · {x.live} of {x.total} live</span></li>)}</ul></td></tr>] : []),
            ]
          })}
        </tbody></table>
      </section>}
      <ul className="fs-notes">{data.notes.map(n => <li key={n}>{n}</li>)}<li>Blended CAC and cost per trial use all new subscribers and trials in the period; per-campaign figures are under Ad Spend.</li></ul>
    </>}
  </main>
}

const CSS = `
.fs{max-width:1180px;margin:0 auto;padding-block:20px 48px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));font-size:17px;display:grid;gap:14px}
.fs h1{margin:0;font-size:30px}
.fs-crumb{margin:0;font-size:16px;color:#2f3a46}.fs-crumb a{color:inherit}
.fs-controls{display:flex;flex-wrap:wrap;gap:14px;align-items:end;border:1px solid #d9dee5;border-radius:10px;padding:14px}
.fs-controls label{display:grid;gap:4px;font-size:15px;font-weight:700;color:#2f3a46;text-transform:uppercase;letter-spacing:.05em}
.fs-controls select,.fs-controls input,.fs-controls button{font:inherit;font-size:18px;padding:8px 10px;border:1px solid #d9dee5;border-radius:8px;min-height:44px;text-transform:none;letter-spacing:0}
.fs-controls button{cursor:pointer;font-weight:600}
.fs button,.fs select,.fs input{color:#002266;-webkit-text-fill-color:#002266}
.fs a{color:#002266}
.fs button:not(.fs-drill){font-weight:700;background:#fff;border:2px solid #002266;border-radius:8px;padding:8px 14px;font-size:17px;cursor:pointer}
.fs-dates{display:flex;gap:8px;flex-wrap:wrap}
.fs-muted{font-size:16px;color:#3b4552}
.fs-msg{margin:0;font-size:16px}.fs-warn{margin:0;padding:10px 14px;border-radius:8px;background:#fff3cd;color:#6b4e00;font-size:16px}
.fs-table{overflow-x:auto;border:1px solid #d9dee5;border-radius:10px}
.fs table{border-collapse:collapse;width:100%;min-width:560px}
.fs th,.fs td{padding:9px 12px;border-bottom:1px solid #d9dee5;text-align:right;white-space:nowrap}
.fs th:first-child,.fs td:first-child{text-align:left;white-space:normal;min-width:230px}
.fs thead th{background:#0b3a66;color:#fff;font-size:17px}
.fs td.n{font-variant-numeric:tabular-nums;font-size:16px}.fs td.neg{color:#b3362c}
.fs tr.sec td{background:#e9edf2;font-weight:700;font-size:16px;letter-spacing:.06em;text-transform:uppercase;color:#2f3a46}
.fs tr.cat td{text-align:left;padding-top:14px;cursor:pointer}
.fs tr.click{cursor:pointer}.fs tr.click:hover td,.fs tr.cat:hover td{background:#f0f3f6}
.fs tr.item td:first-child{padding-left:38px}
.fs tr.sub td{font-weight:700;border-top:1px solid #3b4552}.fs tr.sub td:first-child{padding-left:38px}
.fs tr.total td{font-weight:700;border-top:2px solid currentColor}
.fs tr.grand td{font-weight:700;font-size:18px;background:#e9edf2}
.fs tr.detail td{text-align:left;white-space:normal;font-size:17px;color:#1f2933;padding-left:56px}
.fs .car{display:inline-block;width:1.1em;color:#002266;font-weight:800}
.fs-drill{font:inherit;font-weight:700;color:#002266;background:none;border:0;padding:2px 0;cursor:pointer;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:4px}
.fs-pipe{display:grid;gap:8px}.fs-pipe h2{margin:8px 0 0;font-size:21px}.fs-pipe table{width:100%;border-collapse:collapse}.fs-pipe th,.fs-pipe td{padding:8px 10px;border-bottom:1px solid #d9dee5;text-align:left}.fs-pipe .n{text-align:right}
.fs-ideas{margin:6px 0 0;padding-left:24px;display:grid;gap:12px}.fs-ideas li{display:grid;gap:6px}.fs-idea-btns{display:flex;flex-wrap:wrap;gap:8px}.fs-idea-btns button{min-height:40px;font-size:16px;padding:6px 12px}.fs-idea-btns button:disabled{opacity:.35;cursor:default}
.fs-list{margin:6px 0 0;padding-left:20px;display:grid;gap:3px}
.fs-mini{margin-top:8px;border-collapse:collapse;font-size:17px}.fs-mini th,.fs-mini td{padding:4px 12px 4px 0;text-align:left}.fs-mini td.n{text-align:right}
.fs tr:focus-visible,.fs button:focus-visible,.fs select:focus-visible{outline:3px solid #002266;outline-offset:2px}
.fs-notes{margin:0;padding-left:1.2em;font-size:16px;color:#2f3a46;display:grid;gap:4px}
`
