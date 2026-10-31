import {NextRequest,NextResponse} from 'next/server'
import {adminAccess} from '@/lib/admin-center/auth'
import {periodMetrics,excludeTestUserEvents} from '@/lib/admin-center/story-performance'
import {db,testUserIds} from '@/lib/admin-center/store'
export const dynamic='force-dynamic'
export const maxDuration=60
// SINCE-LAUNCH-FILTER-20261031: app launch cutoff (UTC). Pages default to this;
// rolling `days` periods are preserved unchanged.
export const SINCE_LAUNCH_ISO='2026-11-06T00:00:00.000Z'
const ALLOWED_DAYS=[0,7,30,90,365]
// Pure period resolver (unit-tested): explicit ?since= ISO wins; otherwise a
// rolling days value from the preserved allow-list. days=-1 marks since-mode.
export function resolvePeriod(params:URLSearchParams):{ok:true;days:number;since:string}|{ok:false;error:string}{
 const sinceRaw=params.get('since')
 if(sinceRaw){
  const parsed=new Date(sinceRaw)
  if(Number.isNaN(parsed.getTime()))return{ok:false,error:'Invalid since date'}
  return{ok:true,days:-1,since:parsed.toISOString()}
 }
 const days=Number(params.get('days'))
 if(!ALLOWED_DAYS.includes(days))return{ok:false,error:'Invalid reporting period'}
 return{ok:true,days,since:new Date(days?Date.now()-days*86400000:0).toISOString()}
}
export async function GET(req:NextRequest){const denied=await adminAccess(req);if(denied)return denied;const resolved=resolvePeriod(req.nextUrl.searchParams);if(!resolved.ok)return NextResponse.json({error:resolved.error},{status:400});const{days,since}=resolved;try{
 const load=async(table:string,columns:string)=>{const all:any[]=[];for(let page=0;page<100;page++){let query=db().from(table).select(columns);query=table==='play_events'?query.or(`started_at.gte.${since},ended_at.gte.${since},created_at.gte.${since}`):query.gte('created_at',since);const{data,error}=await query.order('id').range(page*1000,page*1000+999);if(error)throw error;all.push(...data||[]);if((data||[]).length<1000)return all}throw Error('Reporting limit exceeded')}
 // TEST-ACCOUNTS-AUDIT-20261031: exclude is_test_account=true rows from starts/finishes.
 const [events,reviews,testIds]=await Promise.all([load('play_events','id,story_id,session_id,user_id,started_at,ended_at,progress_pct,stop_reason,created_at'),load('story_reviews','id,story_id,rating,created_at'),testUserIds()]);const metrics=periodMetrics(excludeTestUserEvents(events,testIds),reviews,since)
 return NextResponse.json({metrics,since,days,testAccountsExcluded:testIds.size,note:'Playback-session starts and completions in the selected rolling UTC period, deduplicated by story/session. Test accounts (users.is_test_account=true) are excluded from starts and completions. Completion: ended/complete event or at least 95% progress with an end timestamp. Reviews use review creation date. Events without session IDs are excluded. Historical instrumentation gaps remain possible.'},{headers:{'Cache-Control':'private, no-store'}})
 }catch{return NextResponse.json({error:'Period performance source unavailable; lifetime figures are not substituted.'},{status:503})}}
