import{NextRequest,NextResponse}from'next/server'
import{adminAccess}from'@/lib/admin-center/auth'
import{db}from'@/lib/admin-center/store'
import{CATEGORIES}from'@/lib/admin-center/model'
import{mercurySummary}from'@/lib/admin-center/providers'
import{feedbackAdmin}from'@/lib/server/feedbackAdmin'
export async function POST(req:NextRequest){
 const denied=await adminAccess(req);if(denied)return denied
 try{const b=await req.json(),user=await feedbackAdmin()
 if(b.action==='profit-plan'){
  if(typeof b.label!=='string'||!b.label.trim()||b.label.length>200||b.destinationId!==null&&typeof b.destinationId!=='string')return NextResponse.json({error:'Provide a destination label and optional verified account ID'},{status:400})
  if(b.destinationId){const bank=await mercurySummary();if(bank.status!=='connected'||!bank.accounts?.some((a:any)=>a.id===b.destinationId))return NextResponse.json({error:'Destination account not verified in Mercury'},{status:409})}
  const{error}=await db().rpc('admin_center_profit_plan_draft',{p_actor:user!.id,p_label:b.label.trim(),p_destination:b.destinationId});if(error)return NextResponse.json({error:'Preparation not saved; verify audit storage and migration'},{status:503});return NextResponse.json({success:true,message:'Monthly profit policy prepared. Transfers remain disabled; no funds moved.'})
 }

 if(!CATEGORIES.includes(b.category)||!['budget','cash_paid','invoice','usage_estimate','credit_purchase'].includes(b.kind)||typeof b.amount!=='number'||!Number.isFinite(b.amount)||b.amount<0||b.amount>1e8||!/^\d{4}-\d{2}-01$/.test(b.period)||![b.vendor,b.reference,b.sourceKey].every(v=>typeof v==='string'&&v.trim()&&v.length<1000))return NextResponse.json({error:'Valid period, category, kind, amount, vendor, evidence reference and unique source ID required'},{status:400})
 const {error}=await db().from('admin_center_finance_entries').insert({period:b.period,category:b.category,kind:b.kind,amount_usd:b.amount,vendor:b.vendor.trim(),reference:b.reference.trim(),source_key:b.sourceKey.trim(),actor_id:user!.id})
 if(error)return NextResponse.json({error:'Entry refused. Check evidence, source ID duplication and schema.'},{status:409})
 return NextResponse.json({success:true,message:'Evidence-backed ledger record saved. It does not establish completeness or authorize cash movement.'})
 }catch{return NextResponse.json({error:'Financial entry not saved'},{status:400})}
}
