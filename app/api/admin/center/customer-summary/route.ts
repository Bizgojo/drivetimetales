import {NextRequest,NextResponse} from 'next/server'
import {adminAccess} from '@/lib/admin-center/auth'
import {db} from '@/lib/admin-center/store'
import {stripeSummary} from '@/lib/admin-center/providers'
import {isLaunchStandardPlan,normalizePlan,normalizeSubscriptionStatus} from '@/lib/admin/subscriberClassification'
export const dynamic='force-dynamic'
export const maxDuration=60
// SINCE-LAUNCH-FILTER-20261031: app launch cutoff (UTC). ?since= ISO overrides;
// the 7-day "new" window is preserved unchanged.
export const SINCE_LAUNCH_ISO='2026-11-06T00:00:00.000Z'
// Pure helper (unit-tested): count standard rows created on/after sinceISO.
export function countNewSinceLaunch(rows:Array<{created_at:string|number}>,sinceISO:string):number{
 const cutoff=Date.parse(sinceISO)
 if(Number.isNaN(cutoff))throw Error('Invalid since date')
 return rows.filter(u=>Date.parse(u.created_at as string)>=cutoff).length
}
export async function GET(req:NextRequest){const denied=await adminAccess(req);if(denied)return denied;try{
 const sinceRaw=req.nextUrl.searchParams.get('since')||SINCE_LAUNCH_ISO
 if(Number.isNaN(Date.parse(sinceRaw)))return NextResponse.json({error:'Invalid since date'},{status:400})
 const sinceISO=new Date(sinceRaw).toISOString()
 const all:any[]=[];for(let page=0;page<100;page++){const{data,error}=await db().from('users').select('id,plan,subscription_type,subscription_plan,is_founding_member,is_test_account,created_at,cancelled_at,subscription_ends_at').order('id').range(page*1000,page*1000+999);if(error)throw error;all.push(...data||[]);if((data||[]).length<1000)break;if(page===99)throw Error('Summary limit exceeded')}
 const standard=all.filter(u=>!u.is_test_account&&isLaunchStandardPlan(normalizePlan(u.plan||u.subscription_plan||u.subscription_type),u.is_founding_member));const stripe=await stripeSummary(7)
 return NextResponse.json({summary:{totalStandard:standard.length,activePaid:stripe.status==='connected'?stripe.paid:null,canceledExpired:standard.filter(u=>u.cancelled_at||(u.subscription_ends_at&&Date.parse(u.subscription_ends_at)<Date.now())||['canceled','expired','past_due'].includes(normalizeSubscriptionStatus(u.subscription_type))).length,foundingMembers:standard.filter(u=>u.is_founding_member||['founding','founder','founding_member'].includes(normalizePlan(u.plan))).length,newThisWeek:standard.filter(u=>Date.parse(u.created_at)>=Date.now()-7*86400000).length,newSinceLaunch:countNewSinceLaunch(standard,sinceISO),sinceLaunch:sinceISO},note:'Standard inventory excludes internal/test accounts. Active paid uses verified live Stripe subscriptions and invoice evidence across paid plans, not profile labels. Canceled/expired includes recorded cancellation requests, ended access and past-due status; it is not a churn rate. New means account creation in the last seven days. New since launch means account creation on/after the since-launch cutoff. '+(stripe.status!=='connected'?'Live paid count unavailable.':'')},{headers:{'Cache-Control':'private, no-store'}})
 }catch{return NextResponse.json({error:'Complete customer summary unavailable; no zero substituted'},{status:503})}}
