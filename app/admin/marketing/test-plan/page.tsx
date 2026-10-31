export default function TestPlan(){
 const weeks=Array.from({length:8},(_,i)=>i+1)
 return <main style={{padding:'28px 18px',maxWidth:1200,margin:'auto',color:'#172b36'}}>
  <a href="/admin?section=marketing" style={{display:'inline-block',padding:'12px 0'}}>← Marketing</a>
  <h1>6+2-Week Plan and Spreadsheet</h1>
  <p>Approved six-week Meta test plus the two-week follow-up period requested by the owner. The detailed original workbook has not been recovered. This view shows confirmed requirements and identifies the remaining gaps.</p>
  <nav style={{display:'flex',flexWrap:'wrap',gap:16,padding:'12px 0'}}><a href="#plan">View plan</a><a href="#spreadsheet">View weekly spreadsheet</a><a href="/admin/marketing/campaign-plan">Live Campaign Plan and timeline →</a></nav>
  <section id="plan"><h2>Plan</h2>
   <ul style={{lineHeight:1.9}}><li>Weeks 1–6: Meta test with a total ceiling of $4,000; approximately $95/day. The total ceiling controls.</li><li>Goal: paid subscriber CAC below $30.</li><li>Four personas and eight initial ad variants, two per persona. Review every Monday; create 3–4 fresh ads each week.</li><li>Weeks 7–8: follow-up period. Detailed activities, spending authorization and acceptance criteria have not been recovered and remain unconfirmed.</li><li>After the complete 6+2-week test: establish the 12-month budget.</li></ul>
   <p>Start date: not verified. The requested start is next week; no exact date is assumed. Ads stay paused/draft until owner launch approval.</p>
  </section>
  <section id="spreadsheet"><h2>Weekly spreadsheet</h2>
   <p>USD. Every 0 is an unfilled layout placeholder, not verified actual results. No weekly budget allocation or subscriber forecast has been invented. The approved $4,000 is shown once as the six-week ceiling.</p>
   <div role="region" aria-label="6+2-week spreadsheet" tabIndex={0} style={{overflowX:'auto',border:'1px solid #ccd7dd'}}><table style={{borderCollapse:'collapse',minWidth:1150,width:'100%'}}>
    <caption style={{textAlign:'left',padding:12}}>Six-week Meta ceiling: $4,000 · Weeks 7–8 spending: not authorized by this plan</caption>
    <thead><tr>{['Metric',...weeks.map(w=>`Week ${w}`),'Period total'].map(h=><th key={h} style={{padding:12,background:'#153d43',color:'white',textAlign:'left'}}>{h}</th>)}</tr></thead>
    <tbody>{['Weekly ad budget (unallocated)','Actual ad spend','Budget variance','Impressions','Ad clicks','Landing-page visits','Signups','Trial starts','New paid subscribers','Attributed subscription revenue','Ad creative / contractor costs'].map(label=><tr key={label}><th scope="row" style={{padding:12,textAlign:'left',borderBottom:'1px solid #dce3e7'}}>{label}</th>{Array.from({length:9},(_,i)=><td key={i} style={{padding:12,textAlign:'right',borderBottom:'1px solid #dce3e7'}}>0</td>)}</tr>)}
     {['Paid CAC (ad spend ÷ new paid subscribers)','Trial-to-paid conversion','Return on ad spend'].map(label=><tr key={label}><th scope="row" style={{padding:12,textAlign:'left'}}>{label}</th>{Array.from({length:9},(_,i)=><td key={i} style={{padding:12}}>Pending</td>)}</tr>)}
     <tr><th scope="row" style={{padding:12,textAlign:'left'}}>Review / next action</th>{weeks.map(w=><td key={w} style={{padding:12}}>{w<=6?'Monday review':'Details pending'}</td>)}<td style={{padding:12}}>Test review</td></tr>
    </tbody>
   </table></div>
   <p>Live campaign data remains in the linked Campaign Plan. This format preview does not import or reconcile those records, authorize spending, or claim that the first campaign is scheduled.</p>
  </section>
 </main>
}
