'use client'
import {useId,useState} from 'react'

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
  <p>Approved six-week Meta test plus the two-week follow-up period requested by the owner. The detailed original workbook has not been recovered. This view shows confirmed requirements and identifies the remaining gaps.</p>
  <nav style={{display:'flex',flexWrap:'wrap',gap:16,padding:'12px 0'}}><a href="#plan">View plan</a><a href="#spreadsheet">View weekly spreadsheets</a><a href="/admin/marketing/campaign-plan">Live Campaign Plan and timeline →</a></nav>
  <section id="plan"><h2>Plan</h2>
   <ul style={{lineHeight:1.9}}><li>Weeks 1–6: Meta test with a total ceiling of $4,000; approximately $95/day. The total ceiling controls.</li><li>Goal: paid subscriber CAC below $30.</li><li>Four personas and eight initial ad variants, two per persona. Review every Monday; create 3–4 fresh ads each week.</li><li>Weeks 7–8: follow-up period. Detailed activities, spending authorization and acceptance criteria have not been recovered and remain unconfirmed.</li><li>After the complete 6+2-week test: establish the 12-month budget.</li></ul>
   <p>Start date: not verified. No exact date is assumed. Ads stay paused/draft until owner launch approval.</p>
  </section>
  <section id="spreadsheet"><h2>Weekly spreadsheets</h2>
   <p role="status">Format preview · every 0 is unfilled, including Actual Results and variance. No verified budget allocations or actual results have been entered here.</p>
   <p>Known inputs: $4,000 maximum Meta ad spend for weeks 1–6; paid subscriber CAC target below $30. These are planning limits, not actual results. Weeks 7–8 have no confirmed spending authorization.</p>
   <div role="tablist" aria-label="6+2-week marketing worksheets" style={{display:'flex',gap:8,flexWrap:'wrap',padding:'12px 0'}}>
    {SHEETS.map((name,i)=><button key={name} id={`${id}-tab-${i}`} role="tab" aria-selected={selected===i} aria-controls={`${id}-panel`} tabIndex={selected===i?0:-1} onClick={()=>setSelected(i)} onKeyDown={e=>{const next=e.key==='ArrowRight'?(i+1)%SHEETS.length:e.key==='ArrowLeft'?(i+SHEETS.length-1)%SHEETS.length:e.key==='Home'?0:e.key==='End'?SHEETS.length-1:null;if(next!==null){e.preventDefault();setSelected(next);document.getElementById(`${id}-tab-${next}`)?.focus()}}} style={{minHeight:48,padding:'10px 16px',border:'1px solid #cbd5dc',borderRadius:10,fontWeight:700,background:selected===i?'#153d43':'white',color:selected===i?'white':'#172b36'}}>{name}</button>)}
   </div>
   <section id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${selected}`}>
    <h3>{sheet}</h3>
    <p>{selected===0?'Weekly spending allocations and funnel targets will appear here once approved. Unallocated weeks are placeholders; no weekly forecast has been invented.':selected===1?'Verified source results will be recorded for the same line items and weeks. Zero cells are placeholders and do not establish that no spending occurred.':selected===2?'Each cell shows Budget / Actual / Difference (Actual − Budget). All three entries are currently placeholders.': 'Weekly differences use Actual − Budget. Explanations, causes, owners and corrective actions remain pending until the budget and actuals are verified. Positive expense variance means over budget; positive result variance means above target. No automatic favorable/unfavorable judgment is made.'}</p>
    <div role="region" aria-label={`${sheet} marketing spreadsheet preview`} tabIndex={0} style={{overflowX:'auto',maxHeight:'65vh',border:'1px solid #ccd7dd'}}>
     <table style={{borderCollapse:'separate',borderSpacing:0,minWidth:selected>=2?1800:1300,width:'100%',fontSize:14}}>
      <caption style={{textAlign:'left',padding:12}}>USD unless a count or ratio is specified · $0 / 0 = unfilled placeholder · ratios remain pending</caption>
      <thead><tr>{['Metric / category',...WEEKS.map(w=>`Week ${w}${w>6?' · follow-up':''}`),'Weeks 1–6 total','8-week total',...(selected===3?['Variance %','Explanation / corrective action','Owner / next review']:[])].map((h,i)=><th key={h} scope="col" style={{padding:12,position:'sticky',top:0,left:i===0?0:undefined,zIndex:i===0?3:2,background:'#153d43',color:'white',textAlign:i===0?'left':'right',minWidth:i===0?190:100}}>{h}</th>)}</tr></thead>
      <tbody>{ROWS.map(row=><tr key={row.label}>
       <th scope="row" style={{padding:12,position:'sticky',left:0,zIndex:1,textAlign:'left',borderBottom:'1px solid #dce3e7',background:row.kind==='heading'?'#dceceb':row.kind==='total'?'#e9eff5':'white'}}>{row.label}</th>
       {Array.from({length:10},(_,i)=>{const zero=row.kind==='money'||row.kind==='total'?'$0':'0';return <td key={i} style={{padding:12,textAlign:'right',whiteSpace:'nowrap',borderBottom:'1px solid #dce3e7',background:row.kind==='heading'?'#dceceb':row.kind==='total'?'#e9eff5':i>=8?'#f2f6f8':'white'}}>{row.kind==='heading'?'':row.kind==='ratio'?'Pending':selected===2?`${zero} / ${zero} / ${zero}`:zero}</td>})}
       {selected===3&&<><td style={{padding:12}}>{row.kind==='heading'?'':'Pending'}</td><td style={{padding:12,minWidth:230}}>{row.kind==='heading'?'':'Pending verified budget and actuals'}</td><td style={{padding:12,minWidth:160}}>{row.kind==='heading'?'':'Unassigned / pending'}</td></>}
      </tr>)}</tbody>
     </table>
    </div>
   </section>
   <p>Totals, ratios and variances are layout placeholders, not calculated or reconciled figures. Period ratios will use period totals, not sums of weekly ratios. Budget approval and source reconciliation are required before variance analysis can be populated.</p>
   <p>Review weeks 1–6 every Monday. Weeks 7–8 activities and review criteria remain pending. Live campaign data stays in the linked Campaign Plan; these sheets do not import or reconcile those records, authorize spending, or schedule a campaign.</p>
  </section>
 </main>
}
