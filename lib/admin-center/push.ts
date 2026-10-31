import 'server-only'
import {db} from './store'
import {ADMIN_EMAILS} from './access-policy'
import {isQuiet,safeActionPath} from './model'
import {validPushSubscription} from './push-policy'
// Provider acceptance is tracked separately from confirmed on-device delivery.
export async function deliverPush(){
 if(process.env.ADMIN_PUSH_ENABLED!=='true'||!process.env.ADMIN_PUSH_VAPID_PUBLIC_KEY||!process.env.ADMIN_PUSH_VAPID_PRIVATE_KEY||!process.env.ADMIN_PUSH_SUBJECT)return{status:'blocked',reason:'Push delivery has not been activated and verified'}
 const webpush=require('web-push')
 const client=db(),cutoff=new Date(Date.now()-72*3600000).toISOString()
 const [{data:events,error:e},{data:subs,error:s}]=await Promise.all([client.from('admin_center_events').select('*').gte('created_at',cutoff).order('created_at').limit(100),client.from('admin_center_push_subscriptions').select('*').limit(100)])
 if(e||s)throw new Error('Push storage unavailable')
 let accepted=0,failed=0
 for(const sub of subs||[]){
  if(!validPushSubscription(sub.subscription))continue
  const {data:{user},error}=await client.auth.admin.getUserById(sub.user_id)
  if(error||!user?.email||!ADMIN_EMAILS.has(user.email.toLowerCase()))continue
  const {data:settings}=await client.from('admin_center_alert_settings').select('*').eq('user_id',sub.user_id).maybeSingle()
  const hour=Number(new Intl.DateTimeFormat('en-US',{hour:'numeric',hourCycle:'h23',timeZone:settings?.timezone||'America/New_York'}).format(new Date()))
  for(const event of events||[]){
   if(!safeActionPath(event.href)||event.created_at<sub.created_at||(!event.urgent&&isQuiet(hour,settings?.quiet_start??21,settings?.quiet_end??8)))continue
   const {data:read}=await client.from('admin_center_reads').select('event_id').eq('user_id',sub.user_id).eq('event_id',event.id).maybeSingle()
   if(read)continue
   const {data:claim,error}=await client.from('admin_center_push_deliveries').upsert({subscription_id:sub.id,event_id:event.id,status:'pending'},{onConflict:'subscription_id,event_id',ignoreDuplicates:true}).select('id').maybeSingle()
   if(error||!claim)continue
   try{
    await webpush.sendNotification(sub.subscription,JSON.stringify({title:'Endless Tales Admin',body:event.explanation,href:event.href,id:event.id}),{TTL:3600,timeout:10000,vapidDetails:{subject:process.env.ADMIN_PUSH_SUBJECT,publicKey:process.env.ADMIN_PUSH_VAPID_PUBLIC_KEY,privateKey:process.env.ADMIN_PUSH_VAPID_PRIVATE_KEY}})
    await client.from('admin_center_push_deliveries').update({status:'accepted',updated_at:new Date().toISOString()}).eq('id',claim.id);accepted++
   }catch(err:any){
    await client.from('admin_center_push_deliveries').update({status:'failed',provider_status:Number(err.statusCode)||null,updated_at:new Date().toISOString()}).eq('id',claim.id)
    if(err.statusCode===410||err.statusCode===404)await client.from('admin_center_push_subscriptions').delete().eq('id',sub.id)
    failed++
   }
  }
 }
 return{status:'processed',accepted,failed,deliveryConfirmed:false}
}
