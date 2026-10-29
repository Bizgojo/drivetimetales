import{NextRequest,NextResponse}from'next/server'
import{adminAccess}from'@/lib/admin-center/auth'
import{db}from'@/lib/admin-center/store'
import{CATEGORIES}from'@/lib/admin-center/model'
import{feedbackAdmin}from'@/lib/server/feedbackAdmin'
export async function POST(req:NextRequest){
 const denied=await adminAccess(req);if(denied)return denied
 try{const b=await req.json(),user=await feedbackAdmin()
 if(!CATEGORIES.includes(b.category)||!['budget','cash_paid','invoice','usage_estimate','credit_purchase'].includes(b.kind)||typeof b.amount!=='number'||!Number.isFinite(b.amount)||b.amount<0||b.amount>1e8||!/^\d{4}-\d{2}-01$/.test(b.period)||![b.vendor,b.reference,b.sourceKey].every(v=>typeof v==='string'&&v.trim()&&v.length<1000))return NextResponse.json({error:'Valid period, category, kind, amount, vendor, evidence reference and unique source ID required'},{status:400})
 const {error}=await db().from('admin_center_finance_entries').insert({period:b.period,category:b.category,kind:b.kind,amount_usd:b.amount,vendor:b.vendor.trim(),reference:b.reference.trim(),source_key:b.sourceKey.trim(),actor_id:user!.id})
 if(error)return NextResponse.json({error:'Entry refused. Check evidence, source ID duplication and schema.'},{status:409})
 return NextResponse.json({success:true,message:'Evidence-backed ledger record saved. It does not establish completeness or authorize cash movement.'})
 }catch{return NextResponse.json({error:'Financial entry not saved'},{status:400})}
}
