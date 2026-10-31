import 'server-only'
import {db} from './store'
export async function acknowledgeSupport(){
 if(process.env.ADMIN_SUPPORT_ACK_ENABLED!=='true'||!process.env.RESEND_API_KEY||!process.env.ADMIN_CENTER_EVENT_SINCE)return{status:'blocked',reason:'Provider verification and acknowledgment activation required'}
 const client=db(),{data,error}=await client.from('support_messages').select('id,user_id,email,created_at').eq('status','new').gte('created_at',process.env.ADMIN_CENTER_EVENT_SINCE).limit(50)
 if(error)throw new Error('Support feed unavailable')
 let accepted=0
 for(const m of data||[]){
  if(!m.user_id)continue
  const {data:{user},error}=await client.auth.admin.getUserById(m.user_id)
  // Public forms cannot cause email to arbitrary third parties.
  if(error||!user?.email_confirmed_at||user.email?.toLowerCase()!==m.email?.toLowerCase())continue
  const {data:claim,error:claimError}=await client.from('admin_center_acknowledgments').upsert({message_id:m.id,status:'pending'},{onConflict:'message_id',ignoreDuplicates:true}).select('message_id').maybeSingle()
  if(claimError||!claim)continue
  try{
   const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`admin-ack-${m.id}`},body:JSON.stringify({from:'Endless Tales <hello@endless-tales.com>',to:[user.email],subject:'We received your Endless Tales message',text:'Thanks for contacting Endless Tales. We received your message and will review it. If a response is needed, we will follow up by email.',reply_to:'hello@endless-tales.com'}),signal:AbortSignal.timeout(10000)})
   const result=await r.json()
   await client.from('admin_center_acknowledgments').update({status:r.ok&&result.id?'accepted':'failed',provider_id:result.id||null,updated_at:new Date().toISOString()}).eq('message_id',m.id)
   if(r.ok&&result.id)accepted++
  }catch{await client.from('admin_center_acknowledgments').update({status:'failed',updated_at:new Date().toISOString()}).eq('message_id',m.id)}
 }
 return{status:'processed',accepted}
}
