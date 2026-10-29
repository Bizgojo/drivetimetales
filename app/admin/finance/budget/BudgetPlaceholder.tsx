'use client'
import {useState} from 'react'
const SHEETS=[
 {name:'Budget',description:'The approved 12-month income, expense, profit and cash-flow plan will appear here.'},
 {name:'Actual',description:'Recorded income, expenses, profit and cash flow for the same 12-month period will appear here, with source and reconciliation status.'},
 {name:'Actual vs. Budget',description:'The same line items and months will compare actual results with the approved budget.'},
 {name:'Variance Analysis',description:'Differences between actual and budget will be explained by category and subcategory, with causes and recommended actions.'},
]
export default function BudgetPlaceholder(){
 const[selected,setSelected]=useState(0)
 return <main style={{maxWidth:1100,margin:'auto',padding:'28px 18px 60px',color:'#172b36'}}>
  <a href="/admin?section=finance" style={{display:'inline-flex',alignItems:'center',minHeight:44}}>← Finance</a>
  <h1 style={{fontSize:30,margin:'12px 0'}}>12-Month Budget</h1>
  <p role="status" style={{padding:16,background:'#fff4df',borderRadius:10,border:'1px solid #e8d4ad'}}>Placeholder · to be created after the 6+2-week test is completed.</p>
  <p>The budget period will begin after that test. Its start date and figures have not been set.</p>
  <div role="tablist" aria-label="Planned budget worksheets" style={{display:'flex',gap:8,overflowX:'auto',padding:'12px 0'}}>
   {SHEETS.map((s,i)=><button key={s.name} id={`budget-tab-${i}`} role="tab" aria-selected={i===selected} aria-controls="budget-panel" tabIndex={i===selected?0:-1} onClick={()=>setSelected(i)} onKeyDown={e=>{const next=e.key==='ArrowRight'?(i+1)%SHEETS.length:e.key==='ArrowLeft'?(i+SHEETS.length-1)%SHEETS.length:e.key==='Home'?0:e.key==='End'?SHEETS.length-1:null;if(next!==null){e.preventDefault();setSelected(next);document.getElementById(`budget-tab-${next}`)?.focus()}}} style={{minHeight:48,padding:'10px 16px',flexShrink:0,border:'1px solid #cbd5dc',borderRadius:10,fontWeight:700,cursor:'pointer',background:i===selected?'#153d43':'white',color:i===selected?'white':'#172b36'}}>{s.name}</button>)}
  </div>
  <section id="budget-panel" role="tabpanel" aria-labelledby={`budget-tab-${selected}`} style={{padding:22,background:'white',border:'1px solid #dce3e7',borderRadius:14}}>
   <h2 style={{marginTop:0}}>{SHEETS[selected].name}</h2><p>{SHEETS[selected].description}</p>
   <p><strong>Not yet created.</strong> No budget or actual financial figures are presented in this placeholder.</p>
  </section>
  <section style={{padding:22,marginTop:18,background:'white',border:'1px solid #dce3e7',borderRadius:14}}>
   <h2 style={{marginTop:0}}>Planned spreadsheet structure</h2>
   <ul style={{lineHeight:1.9}}><li>12 monthly columns, with annual totals.</li><li>Sources of Income, broken down into individual sources, with a total.</li><li>Expenses: Operating, Story Production, Marketing, and R&amp;D.</li><li>Each expense category broken into detailed subcategories, with a category total.</li><li>Total of all Expenses.</li><li>Profit and Cash Flow.</li></ul>
   <p>The detailed accounts, starting balances and approved figures will be established after the test. Existing Finance data connections remain available from the Finance overview.</p>
  </section>
 </main>
}
