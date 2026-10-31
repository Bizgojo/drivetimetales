import { NextRequest,NextResponse } from 'next/server'
import { adminAccess } from '@/lib/admin-center/auth'
import { db,rows } from '@/lib/admin-center/store'
import { feedbackAdmin } from '@/lib/server/feedbackAdmin'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest){const denied=await adminAccess(req);if(denied)return denied;return NextResponse.json(await rows('admin_center_campaigns'),{headers:{'Cache-Control':'private, no-store'}})}
export async function POST(req:NextRequest){
 const denied=await adminAccess(req);if(denied)return denied
 const user=await feedbackAdmin()
 try{const b=await req.json()
 if(b.action==='create'){
  if(![b.name,b.audience,b.body].every(s=>typeof s==='string'&&s.trim()&&s.length<=10000)||typeof b.budget!=='number'||!Number.isFinite(b.budget)||b.budget<=0||b.budget>4000)return NextResponse.json({error:'Enter name, audience, ad text and budget within $4,000'},{status:400})
  for(const u of [b.mediaUrl,b.landingUrl]){try{if(new URL(u).protocol!=='https:')throw 0}catch{return NextResponse.json({error:'Ad media and landing links must use HTTPS'},{status:400})}}
  // Database trigger audits insert in the same transaction.
  const {data,error}=await db().from('admin_center_campaigns').insert({name:b.name.trim(),audience:b.audience.trim(),body:b.body.trim(),media_url:b.mediaUrl,landing_url:b.landingUrl,budget_usd:b.budget,created_by:user!.id}).select('id').single()
  if(error)throw error
  return NextResponse.json({success:true,id:data.id,message:'Draft saved. No Meta campaign was created or launched.'})
 }
 if(!['awaiting_approval','approved','rejected'].includes(b.action)||typeof b.id!=='string')return NextResponse.json({error:'Invalid campaign decision'},{status:400})
 const {error}=await db().rpc('admin_center_campaign_decision',{p_id:b.id,p_actor:user!.id,p_action:b.action})
 if(error)return NextResponse.json({error:'Decision refused. Check campaign state and total approved $4,000 envelope.'},{status:409})
 return NextResponse.json({success:true,message:b.action==='approved'?'Budget/creative approval recorded. Launch remains disabled pending pre-launch gates and explicit launch authorization.':'Campaign state saved.'})
 }catch{return NextResponse.json({error:'Campaign update failed; verify schema and audit storage'},{status:503})}
}
