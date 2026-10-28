import { hasValidRequestOrigin } from '@/lib/requestOrigin'
import { NextRequest,NextResponse } from 'next/server'
import { accountAdmin } from '@/lib/server/accountUser'
import { feedbackAdmin } from '@/lib/server/feedbackAdmin'
import { reconcileFeedback,deliverFeedbackEmails } from '@/lib/server/subscriberFeedback'
export const dynamic='force-dynamic'
export async function GET(){
 if(!await feedbackAdmin())return NextResponse.json({error:'Admin access required'},{status:403})
 try{const admin=accountAdmin();await reconcileFeedback(admin)
 const results=await Promise.all([admin.from('support_messages').select('*').like('subject','[Story Idea]%').order('created_at',{ascending:false}).limit(1000),admin.from('story_idea_workflows').select('*').limit(1000),admin.from('subscriber_notifications').select('idea_id,kind,email_status,email_error').limit(2000)])
 for(const r of results)if(r.error)throw r.error
 return NextResponse.json({ideas:results[0].data,workflows:results[1].data,notifications:results[2].data},{headers:{'Cache-Control':'private, no-store'}})
 }catch(err){return NextResponse.json({error:err instanceof Error?err.message:'Could not load story ideas'},{status:500})}
}
export async function POST(req:NextRequest){
 if(!hasValidRequestOrigin(req))return NextResponse.json({error:'Invalid request origin'},{status:403})
 const user=await feedbackAdmin();if(!user)return NextResponse.json({error:'Admin access required'},{status:403})
 try{const {id,action}=await req.json();const admin=accountAdmin()
 if(action==='reconcile'){await reconcileFeedback(admin);return NextResponse.json(await deliverFeedbackEmails(admin))}
 if(typeof id!=='string'||! /^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:'Invalid idea ID'},{status:400})
 if(action==='select'){const {data,error}=await admin.rpc('select_subscriber_story_idea',{p_idea_id:id,p_selected_by:user.id});if(error)return NextResponse.json({error:error.message},{status:422});const email=await deliverFeedbackEmails(admin,id);return NextResponse.json({workflow:data,email})}
 if(action==='review'){const {error}=await admin.from('support_messages').update({status:'read'}).eq('id',id).like('subject','[Story Idea]%');if(error)throw error;return NextResponse.json({success:true})}
 if(action==='retry'){await reconcileFeedback(admin);return NextResponse.json(await deliverFeedbackEmails(admin,id))}
 return NextResponse.json({error:'Unknown action'},{status:400})
 }catch(err){return NextResponse.json({error:err instanceof Error?err.message:'Could not update idea'},{status:500})}
}
