import 'server-only'
import { db } from './store'
import{mercurySummary}from'./providers'
import { allocation, pendingVoice } from './model'
// Read-only reconciliation of source systems. Never advances a production job.
export async function syncEvents() {
 const cutoff=process.env.ADMIN_CENTER_EVENT_SINCE
 if(!cutoff || !Number.isFinite(Date.parse(cutoff)))return {status:'blocked',reason:'ADMIN_CENTER_EVENT_SINCE must be set to the approved activation timestamp'}
 const client=db()
 const [jobs,stories,campaigns]=await Promise.all([
  client.from('production_jobs').select('id,state_json,error_json,status,updated_at').eq('status','waiting_for_external').gte('updated_at',cutoff).limit(500),
  client.from('stories').select('id,title,published_on,status,is_hidden').eq('status','published').eq('is_hidden',false).gte('published_on',cutoff).limit(500),
  client.from('admin_center_campaigns').select('id,name,status,updated_at').eq('status','awaiting_approval').limit(500),
 ])
 const events:any[]=[]
 for(const j of jobs.data||[])if(pendingVoice(j))events.push({event_key:`voice:${j.id}:${j.state_json.castReview.requestedAt}`,kind:'voice',title:'Voice review required',explanation:'A production job is explicitly waiting for your cast decision.',href:`/admin?section=production#job-${j.id}`,urgent:false})
 for(const s of stories.data||[])events.push({event_key:`published:${s.id}:${s.published_on}`,kind:'published',title:s.title,explanation:'This episode was successfully published.',href:`/admin?section=stories#story-${s.id}`,urgent:false})
 for(const c of campaigns.data||[])events.push({event_key:`campaign:${c.id}:${c.updated_at}`,kind:'campaign',title:c.name,explanation:'Susan’s campaign is ready for your review.',href:`/admin?section=marketing#campaign-${c.id}`,urgent:false})
 const{data:policy}=await client.from('admin_center_policy').select('*').eq('id',true).maybeSingle()
 let funding='blocked until reconciled commitments verified'
 if(policy?.verified&&Date.now()-Date.parse(policy.verified_at)<30*86400000){
  const bank=await mercurySummary()
  if(bank.status==='connected'&&typeof bank.cash==='number'){
   funding='verified commitments compared with live Mercury cash'
   if(allocation(0,bank.cash,policy.policy).shortfall>0)events.push({event_key:`funding:${policy.version}:${new Date().toISOString().slice(0,10)}`,kind:'funding',title:'Urgent funding need',explanation:'Available bank cash is below the owner-attested essential, tax, reserve and marketing commitments. Review funding.',href:'/admin?section=finance#funding',urgent:true})
  }
 }
 for(const event of events){event.sting_url=process.env.ADMIN_ALERT_STING_URL||null;event.belle_url=process.env[`ADMIN_ALERT_BELLE_${event.kind.toUpperCase()}_URL`]||null}
 if(events.length){
  const {error}=await client.from('admin_center_events').upsert(events,{onConflict:'event_key',ignoreDuplicates:true})
  if(error)throw new Error('Event synchronization failed')
 }
 return {status:jobs.error||stories.error||campaigns.error?'partial':'connected',count:events.length,funding,audio:'approved sting and Belle assets not provisioned'}
}
