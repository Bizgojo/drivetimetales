'use client'
import {useId,useState} from 'react'
import {META_TEST_PLAN,metaTestBudget,META_WEEKLY_FORECAST,META_DECISION_RULES,META_STANDING_RULES} from '@/lib/admin-center/meta-test-plan'

const SHEETS=['Budget','Actual Results','Actual vs. Budget','Variance Analysis'] as const
const WEEKS=Array.from({length:8},(_,i)=>i+1)
const ROWS=[
 {label:'Acquisition results · eight-week budget',kind:'heading'},
 {label:'Ad views',kind:'count'},
 {label:'Signups',kind:'count'},
 {label:'Trial starts',kind:'count'},
 {label:'New paid subscribers',kind:'count'},
 {label:'Paid subscriber CAC',kind:'ratio'},
 {label:'Cost per trial',kind:'ratio'},
 {label:'Trial-to-paid conversion',kind:'ratio'},
 {label:'Monthly paid subscribers',kind:'count'},
 {label:'Annual paid subscribers',kind:'count'},
 {label:'Attributed subscription revenue',kind:'money'},
 {label:'Marketing expenses',kind:'heading'},
 {label:'Meta advertising',kind:'money'},
 {label:'Ad creative / contractors',kind:'money'},
 {label:'Marketing AI / software',kind:'money'},
 {label:'Other marketing expenses',kind:'money'},
 {label:'Total marketing expenses',kind:'total'},
 {label:'Additional metrics · not provided by source',kind:'heading'},
 ...['Impressions','Ad clicks','Landing-page visits','Free story plays','30-second listens'].map(label=>({label,kind:'count'})),
 ...['Cost per 1,000 impressions','Cost per click','Cost per landing-page visit','Cost per free story play','Cost per 30-second listen','Cost per signup','Return on ad spend'].map(label=>({label,kind:'ratio'})),
]

export default function TestPlan(){
 const[selected,setSelected]=useState(0),id=useId(),sheet=SHEETS[selected]
 return <main style={{padding:'28px 18px',maxWidth:1200,margin:'auto',color:'#172b36'}}>
  <a href="/admin?section=marketing" style={{display:'inline-block',padding:'12px 0'}}>← Marketing</a>
  <h1>6+2-Week Plan and Spreadsheet</h1>
  <p>Approved six-week Meta test plus the two-week follow-up period requested by the owner. Budget and dates below use the owner-provided transcription of the final October 29 workbook. Forecasts are planned outcomes, not actual results. The published artifact has now been read directly, including weekly outcomes and Decision Rules. The shared view disables native XLSX download.</p>
  <section aria-label="Grouped Excel workbook" style={{background:'#eaf2ea',border:'1px solid #ccd7dd',borderRadius:12,padding:18,margin:'18px 0'}}><h2 style={{marginTop:0}}>All marketing spreadsheets in one Excel workbook</h2><p>Budget, Actual Results, Actual vs. Budget, Variance Analysis, Decision Rules and Cash tracking.</p><a className="finance-link" style={{display:'inline-flex',minHeight:48,alignItems:'center',padding:'10px 16px'}} href="/api/admin/center/marketing-workbook">Download Excel workbook (.xlsx) →</a><p>Open the downloaded file in Excel. Verified actuals start blank. Changes saved in Excel stay in that copy.</p></section>
  <nav style={{display:'flex',flexWrap:'wrap',gap:16,padding:'12px 0'}}><a href="#plan">View plan</a><a href="#spreadsheet">View weekly spreadsheets</a><a href="#decision-rules">Decision Rules</a><a href="/admin/marketing/campaign-plan">Live Campaign Plan and timeline →</a></nav>
  <section id="plan"><h2>Plan</h2>
   <ul style={{lineHeight:1.9}}><li>Weeks 1–6: Meta test with a $4,000 total budget. Use the weekly schedule below; it supersedes the older October 27 daily-spend schedule.</li><li>Goal: paid subscriber CAC below $30.</li><li>Four personas and eight initial ad variants, two per persona. Review every Monday; create 3–4 fresh ads each week.</li><li>Weeks 7–8: no ad spend. Wait for trials to convert; assess the forecast at week 8.</li><li>After the complete 6+2-week test: establish the 12-month budget.</li></ul>
   <p>Planned start: November 6, 2026. The last waiting week begins December 25; final CAC review is January 1, 2027. These are plan dates; no campaign is launched or scheduled by this page.</p>
   <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><caption>Final October 29 weekly budget · USD · total $4,000</caption><thead><tr>{['Week','Starts · 2026','Phase','Budget'].map(h=><th key={h} scope="col" style={{padding:12,textAlign:'left'}}>{h}</th>)}</tr></thead><tbody>{META_TEST_PLAN.weeks.map(w=><tr key={w.week}><th scope="row" style={{padding:12,textAlign:'left'}}>Week {w.week}</th><td style={{padding:12}}>{w.start}</td><td style={{padding:12}}>{w.phase}</td><td style={{padding:12}}>${w.spend.toLocaleString('en-US')}</td></tr>)}</tbody></table></div>
   <p>Week-8 forecast: 270 trials · 135 paid subscribers · $29.63 ad-spend CAC ($4,000 ÷ 135, rounded). Paid conversions lag trial starts by two weeks. Judge weeks 1–4 on cost per trial; early cumulative CAC is expected to be high.</p>
   <p>Source: {META_TEST_PLAN.source}, saved October 29 at 12:24 PM, as identified by the owner; weekly figures and rules are now verified against the linked public artifact. This supersedes the two earlier downloads and the October 27 plan. The reported $400 reserve is not added on top of the $4,000; its release conditions are recorded under Decision Rules below. Native unrounded workbook cells remain unavailable.</p>
  </section>
  <section id="spreadsheet"><h2>Weekly spreadsheets</h2>
   <p role="status">Owner-confirmed budget and forecasts · actual results not connected. In Budget, $0 for weeks 7–8 is the planned no-spend amount. Elsewhere, 0* is an unfilled placeholder; it is never verified actual zero. Variances stay pending.</p>
   <p>Known inputs: $4,000 Meta ad budget over six weeks, then two weeks of conversion waiting with $0 ad spend. The week-8 forecast is 270 trials and 135 paid subscribers; $29.63 forecast CAC is below the $30 target. Other expense categories remain unfilled.</p>
   <section aria-label="Budgeted results at week 8" style={{background:'#eaf2ea',border:'1px solid #ccd7dd',borderRadius:12,padding:18,margin:'18px 0'}}>
    <h3 style={{marginTop:0}}>Budgeted results · Week 8</h3>
    <dl style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:16,margin:0}}>{[['Ad spend budget','$4,000'],['Ad views · approximate','286,000'],['Trial subscriptions','270'],['New paid subscriptions','135'],['Paid subscriber CAC','$29.63']].map(([label,value])=><div key={label}><dt>{label}</dt><dd style={{fontSize:26,fontWeight:700,margin:0}}>{value}</dd></div>)}</dl>
    <p>Forecasts from the published plan: cost per trial $14.81; trial-to-paid conversion 50%. Monthly/annual subscriber split, revenue and funnel targets not present in that artifact remain unprovided. The weekly paid-subscriber cells are rounded; see the source rounding note below.</p>
   </section>
   <div role="tablist" aria-label="6+2-week marketing worksheets" style={{display:'flex',gap:8,flexWrap:'wrap',padding:'12px 0'}}>
    {SHEETS.map((name,i)=><button key={name} id={`${id}-tab-${i}`} role="tab" aria-selected={selected===i} aria-controls={`${id}-panel`} tabIndex={selected===i?0:-1} onClick={()=>setSelected(i)} onKeyDown={e=>{const next=e.key==='ArrowRight'?(i+1)%SHEETS.length:e.key==='ArrowLeft'?(i+SHEETS.length-1)%SHEETS.length:e.key==='Home'?0:e.key==='End'?SHEETS.length-1:null;if(next!==null){e.preventDefault();setSelected(next);document.getElementById(`${id}-tab-${next}`)?.focus()}}} style={{minHeight:48,padding:'10px 16px',border:'1px solid #cbd5dc',borderRadius:10,fontWeight:700,background:selected===i?'#153d43':'white',color:selected===i?'white':'#172b36'}}>{name}</button>)}
   </div>
   <section id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${selected}`}>
    <h3>{sheet}</h3>
    <p>{selected===0?'Budgeted acquisition results come first. The highlighted 8-week target column keeps the final targets visible beside their labels; swipe sideways for all weeks. Weekly cells use the published source, including its em dashes and rounded counts. Missing fields are explicitly identified.':selected===1?'Verified source results will be recorded for the same line items and weeks. Zero cells are placeholders and do not establish that no spending occurred.':selected===2?'Each cell shows Budget / Actual / Difference (Actual − Budget). Known budget values are populated; actuals and differences remain pending until source results are verified.': 'Weekly differences use Actual − Budget. Explanations, causes, owners and corrective actions remain pending until actuals and their matched budget targets are verified. Positive expense variance means over budget; positive result variance means above target. No automatic favorable/unfavorable judgment is made.'}</p>
    <div role="region" aria-label={`${sheet} marketing spreadsheet preview`} tabIndex={0} style={{overflowX:'auto',maxHeight:'65vh',border:'1px solid #ccd7dd'}}>
     <table style={{borderCollapse:'separate',borderSpacing:0,minWidth:selected>=2?1800:1300,width:'100%',fontSize:14}}>
      <caption style={{textAlign:'left',padding:12}}>USD unless a count or ratio is specified · source counts are rounded · 0* = unfilled placeholder · Budget $0 is planned zero</caption>
      <thead><tr>{['Metric / category',...(selected===0?['8-week target']:[]),...WEEKS.map(w=>`Week ${w} · ${META_TEST_PLAN.weeks[w-1].start.slice(5)}${w>6?' · wait':''}`),'Weeks 1–6 total','8-week total',...(selected===3?['Variance %','Explanation / corrective action','Owner / next review']:[])].map((h,i)=><th key={h} scope="col" style={{padding:12,position:'sticky',top:0,left:i===0?0:undefined,zIndex:i===0?3:2,background:'#153d43',color:'white',textAlign:i===0?'left':'right',minWidth:i===0?190:100}}>{h}</th>)}</tr></thead>
      <tbody>{ROWS.map(row=><tr key={row.label}>
       <th scope="row" style={{padding:12,position:'sticky',left:0,zIndex:1,textAlign:'left',borderBottom:'1px solid #dce3e7',background:row.kind==='heading'?'#dceceb':row.kind==='total'?'#e9eff5':'white'}}>{row.label==='Paid subscriber CAC'?'Paid subscriber CAC · to date':row.label}</th>
       {selected===0&&<td style={{padding:12,fontWeight:700,textAlign:'right',background:'#eaf2ea',borderBottom:'1px solid #dce3e7'}}>{row.kind==='heading'?'':budgetValue(row.label,row.kind,9)}</td>}
       {Array.from({length:10},(_,i)=>{const zero=row.kind==='money'||row.kind==='total'?'$0':'0';return <td key={i} style={{padding:12,textAlign:'right',whiteSpace:'nowrap',borderBottom:'1px solid #dce3e7',background:row.kind==='heading'?'#dceceb':row.kind==='total'?'#e9eff5':i>=8?'#f2f6f8':'white'}}>{row.kind==='heading'?'':selected===3?'Pending':selected===1?(row.kind==='ratio'?'Pending':zero+'*'):selected===2?`${budgetValue(row.label,row.kind,i)} / Pending / Pending`:budgetValue(row.label,row.kind,i)}</td>})}
       {selected===3&&<><td style={{padding:12}}>{row.kind==='heading'?'':'Pending'}</td><td style={{padding:12,minWidth:230}}>{row.kind==='heading'?'':'Pending verified actuals and matched budget'}</td><td style={{padding:12,minWidth:160}}>{row.kind==='heading'?'':'Unassigned / pending'}</td></>}
      </tr>)}</tbody>
     </table>
    </div>
   </section>
   <p>Meta ad budget totals are calculated from the supplied weekly allocations. The week-8 outcome forecasts and weekly result cells come from the published artifact. Total marketing expenses remain pending because other costs were not supplied. Period ratios use period totals, not sums of weekly ratios. Actuals must be reconciled before any variance is calculated.</p>
   <p><strong>Source rounding:</strong> the published weekly paid-subscriber cells add to 136, while its week-8 headline is 135. Weekly views add to 285,714; its headline rounds to approximately 286,000. Both displayed weekly values and headline forecasts are preserved. Signup totals and unprovided period totals are not inferred from rounded cells. Exact unrounded cells require the XLSX.</p>
   <p>Review weeks 1–6 every Monday. Weeks 7–8 wait for trials to convert. Decision Rules below are marked awaiting owner approval in the source, not activated here. Live campaign data stays in the linked Campaign Plan; these sheets do not import or reconcile those records, authorize spending, or schedule a campaign.</p>
  </section>
  <section id="decision-rules" style={{marginTop:24}}><h2>Decision Rules · awaiting owner approval</h2>
   <p>Set by Strategos October 29. The source explicitly says “Awaiting your approval.” These are reference rules, not active advertising controls.</p>
   <div style={{overflowX:'auto'}}><table aria-label="Strategos decision rules" style={{borderCollapse:'collapse',width:'100%',minWidth:650}}><thead><tr>{['Measure','Scale','Stop / revise','Judged after'].map(h=><th key={h} scope="col" style={{padding:12,textAlign:'left',background:'#153d43',color:'white'}}>{h}</th>)}</tr></thead><tbody>{META_DECISION_RULES.map(r=><tr key={r[0]}>{r.map((v,i)=>i===0?<th key={i} scope="row" style={{padding:12,textAlign:'left'}}>{v}</th>:<td key={i} style={{padding:12}}>{v}</td>)}</tr>)}</tbody></table></div>
   <h3>Standing rules from the source</h3><ul>{META_STANDING_RULES.map(r=><li key={r} style={{marginBottom:10}}>{r}</li>)}</ul>
   <p>January ad spend remains $0 until the week-8 review. Susan records last week's actuals each Monday; source status labels are ON TRACK, WATCH, or STOP / REVISE. Cash tracking compares the planned $4,000 Mercury deposit with actual Meta card charges and remaining spend weeks; neither a deposit nor those charges is verified by this plan. No email schedule is activated here.</p>
   <p><a href={META_TEST_PLAN.artifactUrl} target="_blank" rel="noreferrer">Open the original published Meta Test Plan →</a></p>
  </section>
 </main>
}

function budgetValue(label:string,kind:string,column:number){const n=metaTestBudget(label,column);if(n!==null)return kind==='money'||kind==='total'||label==='Paid subscriber CAC'||label==='Cost per trial'?'$'+n.toLocaleString('en-US',{maximumFractionDigits:2}):label==='Trial-to-paid conversion'?n+'%':n.toLocaleString('en-US');if(column<8&&META_WEEKLY_FORECAST[label])return '—';return 'Not provided in source'}
