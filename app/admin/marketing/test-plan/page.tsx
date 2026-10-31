'use client'
import {useId,useState} from 'react'
import {META_TEST_PLAN,metaTestBudget} from '@/lib/admin-center/meta-test-plan'

const SHEETS=['Budget','Actual Results','Actual vs. Budget','Variance Analysis'] as const
const WEEKS=Array.from({length:8},(_,i)=>i+1)
const ROWS=[
 {label:'Marketing expenses',kind:'heading'},
 {label:'Meta advertising',kind:'money'},
 {label:'Ad creative / contractors',kind:'money'},
 {label:'Marketing AI / software',kind:'money'},
 {label:'Other marketing expenses',kind:'money'},
 {label:'Total marketing expenses',kind:'total'},
 {label:'Campaign funnel',kind:'heading'},
 ...['Impressions','Ad clicks','Landing-page visits','Free story plays','30-second listens','Signups','Trial starts','New paid subscribers'].map(label=>({label,kind:'count'})),
 {label:'Attributed subscription revenue',kind:'money'},
 ...['Cost per 1,000 impressions','Cost per click','Cost per landing-page visit','Cost per free story play','Cost per 30-second listen','Cost per signup','Cost per trial','Paid subscriber CAC','Trial-to-paid conversion','Return on ad spend'].map(label=>({label,kind:'ratio'})),
]
export default function TestPlan(){
 const[selected,setSelected]=useState(0),id=useId(),sheet=SHEETS[selected]
 return <main style={{padding:'28px 18px',maxWidth:1200,margin:'auto',color:'#172b36'}}>
  <a href="/admin?section=marketing" style={{display:'inline-block',padding:'12px 0'}}>← Marketing</a>
  <h1>6+2-Week Plan and Spreadsheet</h1>
  <p>Approved six-week Meta test plus the two-week follow-up period requested by the owner. Budget and dates below use the owner-provided transcription of the final October 29 workbook. Forecasts are planned outcomes, not actual results. The original file and its Decision Rules tab have not yet been imported.</p>
  <nav style={{display:'flex',flexWrap:'wrap',gap:16,padding:'12px 0'}}><a href="#plan">View plan</a><a href="#spreadsheet">View weekly spreadsheets</a><a href="/admin/marketing/campaign-plan">Live Campaign Plan and timeline →</a></nav>
  <section id="plan"><h2>Plan</h2>
   <ul style={{lineHeight:1.9}}><li>Weeks 1–6: Meta test with a $4,000 total budget. Use the weekly schedule below; it supersedes the older October 27 daily-spend schedule.</li><li>Goal: paid subscriber CAC below $30.</li><li>Four personas and eight initial ad variants, two per persona. Review every Monday; create 3–4 fresh ads each week.</li><li>Weeks 7–8: no ad spend. Wait for trials to convert; assess the forecast at week 8.</li><li>After the complete 6+2-week test: establish the 12-month budget.</li></ul>
   <p>Planned start: November 6, 2026. The last waiting week begins December 25. These are plan dates; no campaign is launched or scheduled by this page.</p>
   <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><caption>Final October 29 weekly budget · USD · total $4,000</caption><thead><tr>{['Week','Starts · 2026','Phase','Budget'].map(h=><th key={h} scope="col" style={{padding:12,textAlign:'left'}}>{h}</th>)}</tr></thead><tbody>{META_TEST_PLAN.weeks.map(w=><tr key={w.week}><th scope="row" style={{padding:12,textAlign:'left'}}>Week {w.week}</th><td style={{padding:12}}>{w.start}</td><td style={{padding:12}}>{w.phase}</td><td style={{padding:12}}>${w.spend.toLocaleString('en-US')}</td></tr>)}</tbody></table></div>
   <p>Week-8 forecast: 270 trials · 135 paid subscribers · $29.63 ad-spend CAC ($4,000 ÷ 135, rounded). Weekly trial and subscriber timing was not supplied.</p>
   <p>Source: {META_TEST_PLAN.source}, saved October 29 at 12:24 PM, as reported by the owner. This supersedes the two earlier downloads and the October 27 plan. The reported $400 reserve is not added on top of the $4,000; its exact allocation and Strategos’s Decision Rules await the original file.</p>
  </section>
  <section id="spreadsheet"><h2>Weekly spreadsheets</h2>
   <p role="status">Owner-confirmed budget and forecasts · actual results not connected. In Budget, $0 for weeks 7–8 is the planned no-spend amount. Elsewhere, 0* is an unfilled placeholder; it is never verified actual zero. Variances stay pending.</p>
   <p>Known inputs: $4,000 Meta ad budget over six weeks, then two weeks of conversion waiting with $0 ad spend. The week-8 forecast is 270 trials and 135 paid subscribers; $29.63 forecast CAC is below the $30 target. Other expense categories remain unfilled.</p>
   <div role="tablist" aria-label="6+2-week marketing worksheets" style={{display:'flex',gap:8,flexWrap:'wrap',padding:'12px 0'}}>
    {SHEETS.map((name,i)=><button key={name} id={`${id}-tab-${i}`} role="tab" aria-selected={selected===i} aria-controls={`${id}-panel`} tabIndex={selected===i?0:-1} onClick={()=>setSelected(i)} onKeyDown={e=>{const next=e.key==='ArrowRight'?(i+1)%SHEETS.length:e.key==='ArrowLeft'?(i+SHEETS.length-1)%SHEETS.length:e.key==='Home'?0:e.key==='End'?SHEETS.length-1:null;if(next!==null){e.preventDefault();setSelected(next);document.getElementById(`${id}-tab-${next}`)?.focus()}}} style={{minHeight:48,padding:'10px 16px',border:'1px solid #cbd5dc',borderRadius:10,fontWeight:700,background:selected===i?'#153d43':'white',color:selected===i?'white':'#172b36'}}>{name}</button>)}
   </div>
   <section id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${selected}`}>
    <h3>{sheet}</h3>
    <p>{selected===0?'Confirmed weekly ad budgets are populated below. Only the eight-week period forecast is supplied for trials, paid subscribers and CAC; missing weekly targets remain pending.':selected===1?'Verified source results will be recorded for the same line items and weeks. Zero cells are placeholders and do not establish that no spending occurred.':selected===2?'Each cell shows Budget / Actual / Difference (Actual − Budget). Known budget values are populated; actuals and differences remain pending until source results are verified.': 'Weekly differences use Actual − Budget. Explanations, causes, owners and corrective actions remain pending until actuals and their matched budget targets are verified. Positive expense variance means over budget; positive result variance means above target. No automatic favorable/unfavorable judgment is made.'}</p>
    <div role="region" aria-label={`${sheet} marketing spreadsheet preview`} tabIndex={0} style={{overflowX:'auto',maxHeight:'65vh',border:'1px solid #ccd7dd'}}>
     <table style={{borderCollapse:'separate',borderSpacing:0,minWidth:selected>=2?1800:1300,width:'100%',fontSize:14}}>
      <caption style={{textAlign:'left',padding:12}}>USD unless a count or ratio is specified · 0* = unfilled placeholder · known Budget $0 is planned zero</caption>
      <thead><tr>{['Metric / category',...WEEKS.map(w=>`Week ${w} · ${META_TEST_PLAN.weeks[w-1].start.slice(5)}${w>6?' · wait':''}`),'Weeks 1–6 total','8-week total',...(selected===3?['Variance %','Explanation / corrective action','Owner / next review']:[])].map((h,i)=><th key={h} scope="col" style={{padding:12,position:'sticky',top:0,left:i===0?0:undefined,zIndex:i===0?3:2,background:'#153d43',color:'white',textAlign:i===0?'left':'right',minWidth:i===0?190:100}}>{h}</th>)}</tr></thead>
      <tbody>{ROWS.map(row=><tr key={row.label}>
       <th scope="row" style={{padding:12,position:'sticky',left:0,zIndex:1,textAlign:'left',borderBottom:'1px solid #dce3e7',background:row.kind==='heading'?'#dceceb':row.kind==='total'?'#e9eff5':'white'}}>{row.label}</th>
       {Array.from({length:10},(_,i)=>{const zero=row.kind==='money'||row.kind==='total'?'$0':'0';return <td key={i} style={{padding:12,textAlign:'right',whiteSpace:'nowrap',borderBottom:'1px solid #dce3e7',background:row.kind==='heading'?'#dceceb':row.kind==='total'?'#e9eff5':i>=8?'#f2f6f8':'white'}}>{row.kind==='heading'?'':selected===3?'Pending':selected===1?(row.kind==='ratio'?'Pending':zero+'*'):selected===2?`${budgetValue(row.label,row.kind,i)} / Pending / Pending`:budgetValue(row.label,row.kind,i)}</td>})}
       {selected===3&&<><td style={{padding:12}}>{row.kind==='heading'?'':'Pending'}</td><td style={{padding:12,minWidth:230}}>{row.kind==='heading'?'':'Pending verified actuals and matched budget'}</td><td style={{padding:12,minWidth:160}}>{row.kind==='heading'?'':'Unassigned / pending'}</td></>}
      </tr>)}</tbody>
     </table>
    </div>
   </section>
   <p>Meta ad budget totals are calculated from the supplied weekly allocations. The week-8 outcome forecasts come from the owner’s transcription. Total marketing expenses remain pending because other costs were not supplied. Period ratios use period totals, not sums of weekly ratios. Actuals must be reconciled before any variance is calculated.</p>
   <p>Review weeks 1–6 every Monday. Weeks 7–8 wait for trials to convert. Exact Decision Rules remain pending the original file. Live campaign data stays in the linked Campaign Plan; these sheets do not import or reconcile those records, authorize spending, or schedule a campaign.</p>
  </section>
 </main>
}

function budgetValue(label:string,kind:string,column:number){const n=metaTestBudget(label,column);if(n!==null)return kind==='money'||kind==='total'||label==='Paid subscriber CAC'?'$'+n.toLocaleString('en-US',{maximumFractionDigits:2}):String(n);return 'Pending'}
