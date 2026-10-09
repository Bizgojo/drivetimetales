'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type Campaign = { id: string; fields: Record<string, unknown> }
type ResponseData = { success: boolean; campaigns?: Campaign[]; error?: string }
const views = ['Recommendation Queue','Approval Pipeline','Active Campaigns','Variance Watch']
const numeric = (f: Record<string,unknown>, key: string): number | null => {
  const x = f[key]
  return typeof x === 'number' && Number.isFinite(x) ? x : null
}
const label = (f: Record<string,unknown>, key: string) => typeof f[key] === 'string' ? String(f[key]) : '—'
const fmt = (x: number | null, currency = false) => x === null ? 'Not reported' : x.toLocaleString('en-US', currency ? { style:'currency', currency:'USD', maximumFractionDigits:2 } : { maximumFractionDigits:0 })
const difference = (forecast: number | null, actual: number | null) => forecast === null || actual === null ? null : actual - forecast
const change = (forecast: number | null, actual: number | null) => forecast === null || forecast === 0 || actual === null ? null : (actual / forecast - 1) * 100
const percent = (x: number | null) => x === null ? 'N/A' : `${x >= 0 ? '+' : ''}${x.toFixed(1)}%`
const sum = (campaigns: Campaign[], field: string) => {
  const numbers = campaigns.map(c => numeric(c.fields,field)).filter((n): n is number => n !== null)
  return numbers.length ? numbers.reduce((a,b)=>a+b,0) : null
}
const pairs = [
  ['Spend', 'Forecast Spend','Actual Spend',true],
  ['Impressions','Forecast Impressions','Actual Impressions',false],
  ['Clicks','Forecast Clicks','Actual Clicks',false],
  ['Landing page visits','Forecast Landing Page Visits','Actual Landing Page Visits',false],
  ['Free story plays','Forecast Free Story Plays','Actual Free Story Plays',false],
  ['Trial signups','Forecast Trial Signups','Actual Trial Signups',false],
  ['Paid subscribers','Forecast Paid Subs','Actual Paid Subs',false],
] as const
export default function IndependentMarketingCommandCenter() {
  const [campaigns,setCampaigns] = useState<Campaign[]>([])
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [loadedAt,setLoadedAt] = useState('')
  const [selected,setSelected] = useState('')
  const [status,setStatus] = useState('All')
  const regenerate = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const responses = await Promise.all(views.map(async view => {
        const res = await fetch('/api/admin/marketing/campaigns?view='+encodeURIComponent(view),{cache:'no-store'})
        const data = await res.json() as ResponseData
        if (!res.ok || !data.success) throw new Error(data.error || 'Could not retrieve '+view)
        return data.campaigns || []
      }))
      const unique = new Map<string,Campaign>()
      responses.flat().forEach(c=>unique.set(c.id,c))
      const next = Array.from(unique.values())
      setCampaigns(next)
      setSelected(previous=>next.some(c=>c.id===previous)?previous:next[0]?.id || '')
      setLoadedAt(new Date().toISOString())
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally {setLoading(false)}
  },[])
  useEffect(()=>{ void regenerate() },[regenerate])
  const statuses = useMemo(()=>['All',...Array.from(new Set(campaigns.map(c=>label(c.fields,'Status')))).sort()], [campaigns])
  const filtered = useMemo(()=>campaigns.filter(c=>status==='All'||label(c.fields,'Status')===status),[campaigns,status])
  const focused=filtered.find(c=>c.id===selected)||filtered[0]
  const spending = sum(filtered,'Actual Spend')
  const paid = sum(filtered,'Actual Paid Subs')
  const plannedSpending = sum(filtered,'Forecast Spend')
  const plannedPaid = sum(filtered,'Forecast Paid Subs')
  const blendedCAC = spending !== null && paid !== null && paid > 0 ? spending / paid : null
  const targetCAC = plannedSpending !== null && plannedPaid !== null && plannedPaid > 0 ? plannedSpending / plannedPaid : null
  const complete = filtered.filter(c=>pairs.every(([,forecast,actual])=>numeric(c.fields,forecast)!==null&&numeric(c.fields,actual)!==null)).length
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
          <div><p className="text-xs tracking-widest font-bold text-sky-400">ENDLESS TALES / ADMIN / INDEPENDENT VIEW</p>
            <h1 className="text-2xl md:text-3xl font-bold mt-2">Marketing Variance Command Center</h1>
            <p className="text-slate-400 mt-2">An independent presentation of the existing Airtable campaign records. Atlas's dashboard remains unchanged.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/marketing/campaign-plan" className="rounded-lg border border-slate-600 px-4 py-2 text-sm">Atlas campaign plan ↗</Link>
            <button onClick={()=>void regenerate()} disabled={loading} className="rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 px-5 py-2 font-bold">{loading?'Regenerating…':'Regenerate'}</button>
          </div>
        </div>
        <div className="rounded-xl border border-amber-700/60 bg-amber-950/40 p-4 text-sm text-amber-100 mb-5" role="status">
          <strong>Data provenance:</strong> Live requests use the same secured campaign API and Airtable records as Atlas's Campaign Plan.
          Regenerate fetches the latest stored campaign figures; it does not independently sync Meta, TikTok or Stripe.
          Blank actuals are displayed as missing, never as zero. {loadedAt && <span>Last retrieved: {new Date(loadedAt).toLocaleString()}.</span>}
          {error && <p role="alert" className="mt-2 text-red-300">Regeneration failed: {error}. Previously retrieved records remain visible.</p>}
        </div>
        <div className="flex items-center gap-3 mb-5"><label htmlFor="et-status" className="text-sm text-slate-300">Campaign status</label><select id="et-status" value={status} onChange={e=>{setStatus(e.target.value);setSelected('')}} className="bg-slate-800 border border-slate-600 rounded-lg p-2 text-sm">{statuses.map(s=><option key={s}>{s}</option>)}</select></div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          {([['Campaigns',fmt(filtered.length)],['Actual spend',fmt(spending,true)],['Paid subscribers',fmt(paid)],['Blended CAC',fmt(blendedCAC,true)],['Forecast CAC',fmt(targetCAC,true)]] as const).map(([name,value])=>
            <section key={name} className="bg-slate-900 border border-slate-700 rounded-xl p-4"><h2 className="text-xs uppercase tracking-wider text-slate-400">{name}</h2><p className="mt-2 text-xl md:text-2xl font-bold break-words">{value}</p></section>)}
        </div>
        <div className="grid lg:grid-cols-3 gap-5">
          <section className="lg:col-span-2 rounded-xl border border-slate-700 bg-slate-900 p-4">
            <h2 className="font-bold text-lg mb-1">Campaign portfolio</h2><p className="text-xs text-slate-400 mb-4">Click any row for its identical underlying forecast and actual figures.</p>
            <div className="overflow-x-auto"><table className="min-w-[650px] w-full text-sm"><thead><tr className="text-left text-slate-400 border-b border-slate-700"><th className="p-3">Campaign</th><th>Forecast spend</th><th>Actual spend</th><th>Paid subs</th><th>Actual CAC</th></tr></thead>
              <tbody>{filtered.map(c=>{const f=c.fields,spent=numeric(f,'Actual Spend'),subs=numeric(f,'Actual Paid Subs'); const cac=spent!==null&&subs!==null&&subs>0?spent/subs:null
                return <tr key={c.id} onClick={()=>setSelected(c.id)} className={`cursor-pointer border-b border-slate-800 hover:bg-slate-800 ${focused?.id===c.id?'bg-slate-800/70':''}`}><td className="p-3"><strong>{label(f,'Campaign Name')}</strong><p className="text-xs text-slate-400">{label(f,'Channel')} · {label(f,'Status')}</p></td><td>{fmt(numeric(f,'Forecast Spend'),true)}</td><td>{fmt(spent,true)}</td><td>{fmt(subs)}</td><td>{fmt(cac,true)}</td></tr>
              })}</tbody></table>{!loading&&filtered.length===0&&<p className="p-5 text-slate-400">No campaigns found in the selected status.</p>}</div>
          </section>
          <section className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <h2 className="font-bold text-lg">Executive variance</h2><p className="text-xs text-slate-400 mt-1 mb-5">Same records, different presentation.</p>
            {([['Spend',plannedSpending,spending],['Paid subscribers',plannedPaid,paid],['CAC',targetCAC,blendedCAC]] as const).map(([name,forecast,actual])=>
              <div key={name} className="mb-6"><div className="flex justify-between items-start gap-2"><span className="text-slate-300">{name}</span><span className="font-bold">{percent(change(forecast,actual))}</span></div><p className="text-xs text-slate-400 mt-1">Forecast {fmt(forecast,name!=='Paid subscribers')} · Actual {fmt(actual,name!=='Paid subscribers')}</p></div>)}
            <p className="text-xs text-amber-200">Complete forecast/actual coverage: {complete} of {filtered.length} campaigns. Incomplete records must be checked before financial decisions.</p>
          </section>
        </div>
        {focused&&<section className="mt-5 bg-slate-900 border border-slate-700 rounded-xl p-5">
          <h2 className="text-lg font-bold">{label(focused.fields,'Campaign Name')} · Variance detail</h2>
          <p className="text-sm text-slate-400 mt-1">A positive variance means actual is above forecast; whether favorable depends on the metric.</p>
          <div className="overflow-x-auto mt-4"><table className="w-full min-w-[550px] text-sm"><thead><tr className="text-left border-b border-slate-700 text-slate-400"><th className="p-2">Metric</th><th>Forecast</th><th>Actual</th><th>Difference</th><th>Variance</th></tr></thead><tbody>
            {pairs.map(([name,forecastKey,actualKey,isMoney])=>{const f=numeric(focused.fields,forecastKey),a=numeric(focused.fields,actualKey)
              return <tr key={name} className="border-b border-slate-800"><td className="p-2">{name}</td><td>{fmt(f,isMoney)}</td><td>{fmt(a,isMoney)}</td><td>{fmt(difference(f,a),isMoney)}</td><td>{percent(change(f,a))}</td></tr>
            })}</tbody></table></div>
          <div className="mt-5 grid md:grid-cols-2 gap-4 text-sm"><div className="bg-slate-800 rounded-lg p-4"><h3 className="font-bold mb-2">Recorded variance analysis</h3><p className="whitespace-pre-wrap text-slate-300">{label(focused.fields,'Variance Analysis')}</p></div>
            <div className="bg-slate-800 rounded-lg p-4"><h3 className="font-bold mb-2">Campaign information</h3><p className="text-slate-300">Status: {label(focused.fields,'Status')}</p><p className="text-slate-300 mt-1">Channel: {label(focused.fields,'Channel')}</p><p className="text-slate-300 mt-1">Last actuals update: {label(focused.fields,'Last Actuals Update')}</p><p className="text-slate-300 mt-1">Variance flag: {label(focused.fields,'Variance Flag')}</p></div></div>
        </section>}
      </div>
    </main>
  )
}
