import{NextRequest,NextResponse}from'next/server'
import{adminAccess}from'@/lib/admin-center/auth'
import{db}from'@/lib/admin-center/store'
import{feedbackAdmin}from'@/lib/server/feedbackAdmin'
export async function POST(req:NextRequest){
 const denied=await adminAccess(req);if(denied)return denied
 try{const{id,requestedAt}=await req.json(),user=await feedbackAdmin()
 if(typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id)||typeof requestedAt!=='string')return NextResponse.json({error:'Exact job and review version required'},{status:400})
 const{error}=await db().rpc('admin_center_approve_voice',{p_id:id,p_actor:user!.id,p_requested_at:requestedAt})
 if(error)return NextResponse.json({error:'Approval refused. Review changed, job is locked, or no specific voice approval is required.'},{status:409})
 return NextResponse.json({success:true,message:'This requested cast review was approved. Existing production gates and spending authorization still apply.'})
 }catch{return NextResponse.json({error:'Voice approval not saved'},{status:400})}
}
