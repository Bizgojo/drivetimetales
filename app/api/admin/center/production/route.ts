import {NextRequest,NextResponse} from 'next/server'
import {adminAccess} from '@/lib/admin-center/auth'
import {db} from '@/lib/admin-center/store'
import {feedbackAdmin} from '@/lib/server/feedbackAdmin'
import {reviewPolicy} from '@/lib/admin-center/production-review'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest){const denied=await adminAccess(req);if(denied)return denied;try{const client=db(),p=await reviewPolicy(client),{data,error}=await client.from('atlas_settings').select('value,updated_at').eq('key','publish_mode').maybeSingle();if(error)throw error;return NextResponse.json({policy:p,publication:data?.value||'direct',publicationVersion:data?.updated_at||null,reviewControlsEnabled:process.env.ADMIN_REVIEW_CONTROLS_ENABLED==='true',scope:'Voice/SFX choices apply only to jobs created after the policy change. Publication uses the existing global completion-time gate.'},{headers:{'Cache-Control':'private, no-store'}})}catch{return NextResponse.json({error:'Production settings unavailable'},{status:503})}}
export async function POST(req:NextRequest){const denied=await adminAccess(req);if(denied)return denied;try{const b=await req.json(),actor=await feedbackAdmin();if(b.action==='review'){
 if(!['voice','sfx'].includes(b.kind)||!Number.isSafeInteger(b.version)||typeof b.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(b.fingerprint)||typeof b.id!=='string')return NextResponse.json({error:'Exact review version required'},{status:400})
 const{error}=await db().rpc('admin_center_review_decision',{p_id:b.id,p_actor:actor!.id,p_kind:b.kind,p_fingerprint:b.fingerprint});if(error)return NextResponse.json({error:'Review changed, job is locked, or decision already recorded. Reload.'},{status:409});return NextResponse.json({success:true,message:'Exact review approved. Job resumes through existing quality and spending gates.'})
 }
 if(!Number.isInteger(b.version)||!['direct','rfr'].includes(b.publication)||!['ai','review'].includes(b.voices)||!['ai','review'].includes(b.sfx))return NextResponse.json({error:'Invalid production policy'},{status:400})
 if(process.env.ADMIN_REVIEW_CONTROLS_ENABLED!=='true'&&(b.voices==='review'||b.sfx==='review'))return NextResponse.json({error:'Review controls have not been enabled after worker acceptance testing'},{status:409})
 const{error}=await db().rpc('admin_center_production_policy',{p_actor:actor!.id,p_expected_version:b.version,p_publication_version:b.publicationVersion,p_publication:b.publication,p_voices:b.voices,p_sfx:b.sfx});if(error)return NextResponse.json({error:'Settings changed or audit storage unavailable. Reload before saving.'},{status:409});return NextResponse.json({success:true,message:'Production policy saved with audit. No active job was restarted or spending authorization changed.'})
 }catch{return NextResponse.json({error:'Production change not saved'},{status:503})}}
