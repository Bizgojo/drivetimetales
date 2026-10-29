import { syncEvents } from '@/lib/admin-center/events'
import { NextRequest, NextResponse } from 'next/server'
import { adminAccess } from '@/lib/admin-center/auth'
import { db } from '@/lib/admin-center/store'
import { feedbackAdmin } from '@/lib/server/feedbackAdmin'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest){
 const denied=await adminAccess(req);if(denied)return denied
 const user=await feedbackAdmin()
 let sync:unknown
 try{sync=await syncEvents()}catch{sync={status:'unavailable'}}
 const [events,reads,settings]=await Promise.all([db().from('admin_center_events').select('*').order('created_at',{ascending:false}).limit(100),db().from('admin_center_reads').select('event_id').eq('user_id',user!.id),db().from('admin_center_alert_settings').select('*').eq('user_id',user!.id).maybeSingle()])
 if(events.error||reads.error||settings.error)return NextResponse.json({error:'Notification storage unavailable; apply and verify migration'},{status:503})
 return NextResponse.json({sync,events:events.data,readIds:reads.data?.map(r=>r.event_id),settings:settings.data,pushReady:false,pushBlocker:'VAPID credentials and delivery worker/device verification required'},{headers:{'Cache-Control':'private, no-store'}})
}
export async function POST(req:NextRequest){
 const denied=await adminAccess(req);if(denied)return denied
 const user=await feedbackAdmin()
 try{const b=await req.json();let error
 if(b.action==='read'&&typeof b.id==='string')({error}=await db().from('admin_center_reads').upsert({user_id:user!.id,event_id:b.id}))
 else if(b.action==='settings'&&typeof b.audio==='boolean'&&Number.isInteger(b.quietStart)&&Number.isInteger(b.quietEnd)&&b.quietStart>=0&&b.quietStart<24&&b.quietEnd>=0&&b.quietEnd<24&&typeof b.timezone==='string'){
  try{new Intl.DateTimeFormat('en',{timeZone:b.timezone})}catch{return NextResponse.json({error:'Invalid timezone'},{status:400})}
  ({error}=await db().from('admin_center_alert_settings').upsert({user_id:user!.id,audio:b.audio,quiet_start:b.quietStart,quiet_end:b.quietEnd,timezone:b.timezone,updated_at:new Date().toISOString()}))
 }else return NextResponse.json({error:'Invalid action'},{status:400})
 if(error)throw error
 return NextResponse.json({success:true})
 }catch{return NextResponse.json({error:'Notification update failed'},{status:400})}
}
