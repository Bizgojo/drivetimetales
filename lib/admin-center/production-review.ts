import {createHash} from 'node:crypto'
import {internalAdminFetch} from './internal-fetch'
export type ReviewKind='voice'|'sfx'
export type ReviewPolicy={voices:'ai'|'review';sfx:'ai'|'review';version:number;updatedAt?:string}
export async function reviewPolicy(client:any):Promise<ReviewPolicy>{const{data,error}=await client.from('atlas_settings').select('value,updated_at').eq('key','admin_review_policy').maybeSingle();if(error)throw new Error('Review policy unavailable');if(!data)return{voices:'ai',sfx:'ai',version:0};const p=JSON.parse(data.value);if(!['ai','review'].includes(p.voices)||!['ai','review'].includes(p.sfx)||!Number.isInteger(p.version))throw new Error('Invalid review policy');return{...p,updatedAt:data.updated_at}}
export function reviewFingerprint(kind:ReviewKind,items:unknown[],scripts:unknown[]){return createHash('sha256').update(JSON.stringify({kind,items,scripts})).digest('hex')}
export function appliesToJob(policy:ReviewPolicy,job:any,kind:ReviewKind){return policy[kind==='voice'?'voices':'sfx']==='review'&&!!policy.updatedAt&&Date.parse(job.created_at)>=Date.parse(policy.updatedAt)}
// Opt-in release flag; defaults preserve existing production behavior and add no provider calls.
export async function enforceAdminReview(client:any,job:any,lockHolder:string,kind:ReviewKind,origin:string){
 if(process.env.ADMIN_REVIEW_CONTROLS_ENABLED!=='true')return null
 const {data:history,error:historyError}=await client.from('admin_center_production_policies').select('version,voices,sfx,created_at').lte('created_at',job.created_at).order('created_at',{ascending:false}).limit(1);if(historyError)throw new Error('Job review policy history unavailable');if(!history?.length)return null;const policy:ReviewPolicy={...history[0],updatedAt:history[0].created_at};if(!appliesToJob(policy,job,kind))return null
 const state=job.state_json||{},seriesId=job.series_id||state.seriesId
 const query=client.from('stories').select('id,title,script,sfx_disabled,series_name,episode_number')
 const{data:stories,error}=await(seriesId?query.eq('series_id',seriesId).order('episode_number'):query.eq('id',job.story_id));if(error||!stories?.length)throw new Error('Review package stories unavailable')
 const items:any[]=[]
 for(const story of stories){
  if(kind==='voice'){
   const response=await internalAdminFetch(new URL('/api/admin/generate-voices',origin).toString(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:story.id,castOnly:true})});const report=await response.json();if(!response.ok||!report.success||!Array.isArray(report.cast))throw new Error('Exact voice cast could not be loaded')
   for(const voice of report.cast){if(!voice.voiceId)throw new Error('Cast has an unassigned voice');const r=await fetch('https://api.elevenlabs.io/v1/voices/'+encodeURIComponent(voice.voiceId),{headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY||''},signal:AbortSignal.timeout(10000)});const p=await r.json();if(!r.ok||!p.preview_url?.startsWith('https://'))throw new Error('Assigned voice has no playable provider audition');items.push({storyId:story.id,storyTitle:story.title,character:voice.speaker,voiceId:voice.voiceId,voiceName:voice.voiceName,previewUrl:p.preview_url,previewKind:'Provider voice demo, not a generated story-line audition'})}
  }else if(!story.sfx_disabled){
   const files:any[]=[];for(let offset=0;offset<10000;offset+=1000){const{data,error}=await client.storage.from('audio').list('asc3/'+story.id,{limit:1000,offset,sortBy:{column:'name',order:'asc'}});if(error)throw new Error('SFX review inventory unavailable');files.push(...data);if(data.length<1000)break;if(offset===9000)throw new Error('SFX inventory limit reached')}
   const sounds=files.filter(f=>/^sfx_\d{4}\.mp3$/.test(f.name));if(/\[SFX\s*:/i.test(story.script||'')&&!sounds.length)throw new Error('Expected sound effects have no reviewable assets')
   const base=process.env.NEXT_PUBLIC_SUPABASE_URL+'/storage/v1/object/public/audio/asc3/'+story.id+'/'
   for(const f of sounds){const index=Number(f.name.match(/\d{4}/)[0]),before=files.filter(x=>/^segment_\d{4}\.mp3$/.test(x.name)&&Number(x.name.match(/\d{4}/)[0])<index).at(-1),after=files.find(x=>/^segment_\d{4}\.mp3$/.test(x.name)&&Number(x.name.match(/\d{4}/)[0])>index);items.push({storyId:story.id,storyTitle:story.title,name:f.name,previewUrl:base+f.name,contextBefore:before?base+before.name:null,contextAfter:after?base+after.name:null,assetId:f.id,updatedAt:f.updated_at,metadata:f.metadata})}
  }
 }
 if(!items.length)return null
 const fingerprint=reviewFingerprint(kind,items,stories.map((s:any)=>[s.id,s.script])),prior=state.adminReviews?.[kind]
 if(prior?.fingerprint===fingerprint&&prior.approvedAt)return null
 const review={kind,fingerprint,requestedAt:new Date().toISOString(),approvedAt:null,items}
 const{data:held,error:holdError}=await client.from('production_jobs').update({status:'waiting_for_external',state_json:{...state,adminReviews:{...state.adminReviews,[kind]:review}},error_json:{kind:'awaiting_admin_'+kind,step:job.current_step,marc_required:true,message:'Review '+kind+' in Admin Production'},locked_by:null,locked_at:null}).eq('id',job.id).eq('locked_by',lockHolder).eq('locked_at',job.locked_at).select('id').single();if(holdError||!held)throw new Error('Review hold lost its job ownership fence')
 return{success:true,action:'awaiting_admin_'+kind,jobId:job.id,review,status:'waiting_for_external'}
}
