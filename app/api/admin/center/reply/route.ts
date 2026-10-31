import { NextRequest, NextResponse } from 'next/server'
import { adminAccess } from '@/lib/admin-center/auth'
import { db, audit } from '@/lib/admin-center/store'
import { feedbackAdmin } from '@/lib/server/feedbackAdmin'
export async function POST(req: NextRequest) {
  const denied = await adminAccess(req); if(denied) return denied
  try {
    const { id, response } = await req.json()
    if(typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id) || typeof response !== 'string' || !response.trim() || response.length > 10000) return NextResponse.json({error:'Valid message and reply required'},{status:400})
    if(!process.env.RESEND_API_KEY) return NextResponse.json({error:'Email delivery is not configured. Nothing sent or marked answered.'},{status:503})
    const user = await feedbackAdmin()
    const {data:message,error} = await db().from('support_messages').select('*').eq('id',id).single()
    if(error || !message) return NextResponse.json({error:'Message not found'},{status:404})
    // Recipient comes from the original record, never a client-supplied email.
    const {data:claim,error:claimError} = await db().rpc('admin_center_claim_reply',{p_message:id,p_actor:user!.id,p_body:response.trim()})
    if(claimError || !claim) return NextResponse.json({error:'Reply already sent, pending, or a different reply was prepared. Inspect delivery history before retrying.'},{status:409})
    const delivery = await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`admin-reply-${id}`},body:JSON.stringify({from:'Endless Tales <hello@endless-tales.com>',to:[message.email],reply_to:'hello@endless-tales.com',subject:`Re: ${message.subject}`,text:response.trim()}),signal:AbortSignal.timeout(15000)})
    const result = await delivery.json()
    if(!delivery.ok || !result.id) {
      await db().from('admin_center_replies').update({status:'failed',provider_status:delivery.status}).eq('message_id',id)
      return NextResponse.json({error:'Provider did not accept the reply. It remains unanswered; inspect delivery history.'},{status:502})
    }
    // Atomic provider-accepted + message state + audit. Never label this delivered.
    const {error:saveError} = await db().rpc('admin_center_finish_reply',{p_message:id,p_actor:user!.id,p_provider_id:result.id})
    if(saveError) return NextResponse.json({error:'Email accepted by provider but local reconciliation failed. Do not send another reply; reconcile provider ID.',providerId:result.id},{status:502})
    return NextResponse.json({success:true,status:'accepted',providerId:result.id,message:'Email accepted by Resend; delivery receipt is not yet verified.'})
  } catch {return NextResponse.json({error:'Reply outcome uncertain. Inspect sent history before retrying.'},{status:502})}
}
