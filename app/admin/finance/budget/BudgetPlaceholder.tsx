'use client'
import HorizontalTable from '../../HorizontalTable'
import {downloadCsv} from '@/lib/admin-center/csv'
import {useState} from 'react'
const SHEETS=[
 {name:'Budget',description:'The approved 12-month income, expense, profit and cash-flow plan will appear here.'},
 {name:'Actual',description:'Recorded income, expenses, profit and cash flow for the same 12-month period will appear here, with source and reconciliation status.'},
 {name:'Actual vs. Budget',description:'The same line items and months will compare actual results with the approved budget.'},
 {name:'Variance Analysis',description:'Differences between actual and budget will be explained by category and subcategory, with causes and recommended actions.'},
]
const GROUPS=[
 {name:'Sources of Income',items:['Monthly subscriptions','Annual subscriptions','Other earned income']},
 {name:'Operating',items:['Hosting and servers','Database and storage','Email and customer support','Software subscriptions','Administrative AI tools','Payment processing fees','Bank fees','Accounting and legal','Insurance','Payroll and contractors','Office and administration','Taxes and licenses','Other operating expenses']},
 {name:'Story Production',items:['Story research and writing','Narration and voice generation','Music and sound effects','Cover artwork','Audio mixing and rendering','Quality assurance','Production contractors','Other story production expenses']},
 {name:'Marketing',items:['Meta advertising','Other paid advertising','Ad creative and testing','Marketing AI and software','Email campaigns','Referral incentives','Marketing contractors','Other marketing expenses']},
 {name:'R&D',items:['Product development','Engineering contractors','Experimental AI and APIs','Testing and research','Development infrastructure','Other R&D expenses']},
]
const ROWS=GROUPS.flatMap(g=>[{label:g.name,kind:'heading'},...g.items.map(label=>({label,kind:'detail'})),{label:`Total ${g.name}`,kind:'total'}]).concat([
 {label:'Total Expenses',kind:'grand'},{label:'Profit (Income − Expenses)',kind:'grand'},
 {label:'Cash Flow',kind:'heading'},{label:'Opening cash balance',kind:'detail'},
 {label:'Cash received from customers',kind:'detail'},{label:'Cash paid for expenses',kind:'detail'},
 {label:'Owner contributions / financing',kind:'detail'},{label:'Capital purchases',kind:'detail'},
 {label:'Loan principal repayments',kind:'detail'},{label:'Owner distributions',kind:'detail'},
 {label:'Net Cash Flow',kind:'grand'},{label:'Closing cash balance',kind:'grand'},
])
export default function BudgetPlaceholder(){
 const[selected,setSelected]=useState(0)
 return <main style={{maxWidth:1100,margin:'auto',padding:'28px 18px 60px',color:'#172b36'}}>
  <a href="/admin?section=finance" style={{display:'inline-flex',alignItems:'center',minHeight:44}}>← Finance</a>
  <h1 style={{fontSize:30,margin:'12px 0'}}>12-Month Budget</h1>
  <p role="status" style={{padding:16,background:'#fff4df',borderRadius:10,border:'1px solid #e8d4ad'}}>Format preview · figures will be established after the 6+2-week test is completed.</p>
  <p>The budget period begins after that test. Month 1–12 are undated. Every $0 below is a layout placeholder, including Actual and variance, and does not mean verified zero income or spending.</p>
  <div role="tablist" aria-label="Planned budget worksheets" style={{display:'flex',gap:8,overflowX:'auto',padding:'12px 0'}}>
   {SHEETS.map((s,i)=><button key={s.name} id={`budget-tab-${i}`} role="tab" aria-selected={i===selected} aria-controls="budget-panel" tabIndex={i===selected?0:-1} onClick={()=>setSelected(i)} onKeyDown={e=>{const next=e.key==='ArrowRight'?(i+1)%SHEETS.length:e.key==='ArrowLeft'?(i+SHEETS.length-1)%SHEETS.length:e.key==='Home'?0:e.key==='End'?SHEETS.length-1:null;if(next!==null){e.preventDefault();setSelected(next);document.getElementById(`budget-tab-${next}`)?.focus()}}} style={{minHeight:48,padding:'10px 16px',flexShrink:0,border:'1px solid #cbd5dc',borderRadius:10,fontWeight:700,cursor:'pointer',background:i===selected?'#153d43':'white',color:i===selected?'white':'#172b36'}}>{s.name}</button>)}
  </div>
  <section id="budget-panel" role="tabpanel" aria-labelledby={`budget-tab-${selected}`} style={{padding:22,background:'white',border:'1px solid #dce3e7',borderRadius:14}}>
   <h2 style={{marginTop:0}}>{SHEETS[selected].name}</h2><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{SHEETS.map(s=><button key={s.name} onClick={()=>downloadCsv('12-Month-'+s.name,[['Worksheet',s.name],['Status','Unfilled format after the 6+2-week test. Blank is unknown, not zero. Independent editable copy; no changes sync to Admin.'],['Category',...Array.from({length:12},(_,i)=>'Month '+(i+1)),'Annual total'],...ROWS.map(r=>[r.label,...Array(13).fill(null)])])}>Export {s.name} CSV</button>)}</div><p>Open in Excel and calculate freely. Downloaded edits do not affect Admin. Numeric cells are blank because this budget has not been established.</p>
   <p>Scroll sideways to view all 12 months and the annual total. Proposed subcategories can be refined after the test.</p>
   {selected===2&&<p>Each cell shows Budget / Actual / Difference (Actual − Budget), all in USD.</p>}
   {selected===3&&<p>Variance is Actual − Budget. Percentages and explanations remain pending until figures are verified.</p>}
   <HorizontalTable label={`${SHEETS[selected].name} columns`}><div role="region" aria-label={`${SHEETS[selected].name} spreadsheet preview`} tabIndex={0} style={{border:'1px solid #cbd5dc'}}>
    <table style={{borderCollapse:'separate',borderSpacing:0,minWidth:1550,width:'100%',tableLayout:'fixed',fontSize:14}}>
     <caption style={{textAlign:'left',padding:12}}>USD · Format preview · $0 = unfilled placeholder</caption>
     <thead><tr>{['Category / Subcategory',...Array.from({length:12},(_,i)=>`Month ${i+1}`),'12-Month Total',...(selected===3?['Explanation / Action']:[])].map((h,i)=><th key={h} scope="col" style={{position:'sticky',top:0,left:i===0?0:undefined,zIndex:i===0?3:2,background:'#153d43',color:'white',padding:12,width:i===0?170:100,textAlign:i===0?'left':'right',borderBottom:'1px solid #cbd5dc'}}>{h}</th>)}</tr></thead>
     <tbody>{ROWS.map(row=><tr key={row.label}>
      <th scope="row" style={{position:'sticky',left:0,zIndex:1,textAlign:'left',padding:'10px 12px',paddingLeft:row.kind==='detail'?26:12,background:row.kind==='heading'?'#dceceb':row.kind==='grand'?'#e9eff5':'white',fontWeight:row.kind==='detail'?400:700,borderBottom:'1px solid #dce3e7'}}>{row.label}</th>
      {Array.from({length:13},(_,i)=><td key={i} style={{textAlign:'right',padding:10,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap',background:row.kind==='heading'?'#dceceb':row.kind==='grand'?'#e9eff5':i===12?'#f2f6f8':'white',fontWeight:row.kind==='detail'?400:700,borderBottom:'1px solid #dce3e7',borderLeft:'1px solid #edf0f2'}}>{row.kind==='heading'?'':selected===2?'$0 / $0 / $0':'$0'}</td>)}
      {selected===3&&<td style={{padding:10,minWidth:210,borderBottom:'1px solid #dce3e7'}}>{row.kind==='heading'?'':'Pending verified budget and actuals'}</td>}
     </tr>)}</tbody>
    </table>
   </div></HorizontalTable>
  </section>
  <section style={{padding:22,marginTop:18,background:'white',border:'1px solid #dce3e7',borderRadius:14}}>
   <h2>Known planning references</h2>
   <p>Marketing allocation target: 75% of eligible revenue, after essential expenses, taxes and reserves. Owner-adjustable.</p>
   <p>Approved initial Meta test ceiling: $4,000 over six weeks. This belongs to the test period and has not been assigned to the later 12-month budget.</p>
   <p>These policy references are not monthly financial results. No verified amounts for the future budget period are available to populate the grid. Cash-flow annual opening and closing balances will use the first and last month, rather than summing balances.</p>
  </section>
 </main>
}
