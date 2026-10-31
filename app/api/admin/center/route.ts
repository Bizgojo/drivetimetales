import { publishedLibrary } from '@/lib/admin-center/library'
import { NextRequest, NextResponse } from 'next/server'
import { adminAccess } from '@/lib/admin-center/auth'
import { rows, testUserIds } from '@/lib/admin-center/store'
import { stripeSummary, mercurySummary, metaSummary } from '@/lib/admin-center/providers'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export async function GET(req: NextRequest) {
  const denied = await adminAccess(req); if (denied) return denied
  const section = req.nextUrl.searchParams.get('section') || 'overview'
  const days = [1,7,30].includes(Number(req.nextUrl.searchParams.get('days')))?Number(req.nextUrl.searchParams.get('days')):30
  const sources: Record<string, () => Promise<unknown>> = {
    overview: async () => {
      const [stripe, mercury, published, jobs, inbox, campaigns] = await Promise.all([stripeSummary(days),mercurySummary(),publishedLibrary(),rows('production_jobs','id,story_id,status,current_step,updated_at','updated_at',100),rows('support_messages','id,subject,status,created_at','created_at',100),metaSummary()])
      return {stripe,mercury,published,jobs,inbox,campaigns}
    },
    agents: async () => ({activity:await rows('agent_logs','agent,event_type,event,importance,created_at'),workers:await rows('workers_heartbeat','worker_id,last_run_at,last_error,updated_at','updated_at')}),
    production: async () => ({jobs:await rows('production_jobs','id,story_id,series_id,status,current_step,step_index,total_steps,error_json,updated_at,state_json','updated_at').then(feed=>({...feed,data:feed.data?.map((j:any)=>{const{state_json,...rest}=j;return{...rest,castReview:state_json?.castReview||null,adminReviews:state_json?.adminReviews||null}})||null})),queue:await rows('story_queue_items','id,title,status,authorized,released_to_hal,updated_at','updated_at')}),
    stories: async () => ({stories:await publishedLibrary()}),
    customers: async () => ({messages:await rows('support_messages'),users:{status:'search_required',data:null},referrals:await rows('referrals','id,status,created_at,completed_at'),ideas:await rows('story_idea_workflows','*','selected_at',200),replies:await rows('admin_center_replies','message_id,status,provider_id,updated_at','updated_at',200),preferences:await rows('listener_preferences','user_id,genres,interests,preferred_minutes,updated_at','updated_at',200),travel:await rows('user_travel_insights_preferences','user_id,setting,updated_at','updated_at',200),listening:await rows('play_history','id,user_id,story_id,current_time_seconds,progress_percent,completed,last_played_at','last_played_at',1000).then(async feed=>{if(!feed.data)return feed;try{const test=await testUserIds();return {...feed,data:feed.data.filter((r:any)=>!r.user_id||!test.has(String(r.user_id)))} }catch{return feed}})}),
    marketing: async () => ({meta:await metaSummary(),campaigns:await rows('campaigns'),metrics:await rows('campaign_metrics_daily','*','date'),spend:await rows('campaign_spend_actuals','*','spend_date')}),
    finance: async () => ({profitPlan:await rows('admin_center_profit_plan','*','updated_at',1),ledger:await rows('admin_center_finance_entries','*','period',1000),stripe:await stripeSummary(),mercury:await mercurySummary(),expenses:await rows('expenses_log','*','expense_date',1000),policy:await rows('admin_center_policy','*','updated_at',1),reports:await rows('cfo_reports','report_date,report_json,created_at','report_date',1)}),
  }
  if (!sources[section]) return NextResponse.json({error:'Unknown section'},{status:400})
  try { return NextResponse.json({section,fetchedAt:new Date().toISOString(),...await sources[section]() as object},{headers:{'Cache-Control':'private, no-store'}}) }
  catch { return NextResponse.json({error:'Sources unavailable'},{status:503}) }
}
