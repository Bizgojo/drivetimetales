import {NextRequest,NextResponse} from 'next/server'
import {adminAccess} from '@/lib/admin-center/auth'
import {db} from '@/lib/admin-center/store'
import {stripeSummary} from '@/lib/admin-center/providers'
import {isLaunchStandardPlan,normalizePlan,normalizeSubscriptionStatus} from '@/lib/admin/subscriberClassification'
export const dynamic='force-dynamic'
export const maxDuration=60
export async function GET(req:NextRequest){const denied=await adminAccess(req);if(denied)return denied;try{
 const all:any[]=[];for(let page=0;page<100;page++){const{data,error}=await db().from('users').select('id,plan,subscription_type,subscription_plan,is_founding_member,is_test_account,created_at,cancelled_at,subscription_ends_at').order('id').range(page*1000,page*1000+999);if(error)throw error;all.push(...data||[]);if((data||[]).length<1000)break;if(page===99)throw Error('Summary limit exceeded')}
 const standard=all.filter(u=>!u.is_test_account&&isLaunchStandardPlan(normalizePlan(u.plan||u.subscription_plan||u.subscription_type),u.is_founding_member));const stripe=await stripeSummary(7)
 return NextResponse.json({summary:{totalStandard:standard.length,activePaid:stripe.status==='connected'?stripe.paid:null,canceledExpired:standard.filter(u=>u.cancelled_at||(u.subscription_ends_at&&Date.parse(u.subscription_ends_at)<Date.now())||['canceled','expired','past_due'].includes(normalizeSubscriptionStatus(u.subscription_type))).length,foundingMembers:standard.filter(u=>u.is_founding_member||['founding','founder','founding_member'].includes(normalizePlan(u.plan))).length,newThisWeek:standard.filter(u=>Date.parse(u.created_at)>=Date.now()-7*86400000).length},note:'Standard inventory excludes internal/test accounts. Active paid uses verified live Stripe subscriptions and invoice evidence across paid plans, not profile labels. Canceled/expired includes recorded cancellation requests, ended access and past-due status; it is not a churn rate. New means account creation in the last seven days. '+(stripe.status!=='connected'?'Live paid count unavailable.':'')},{headers:{'Cache-Control':'private, no-store'}})
 }catch{return NextResponse.json({error:'Complete customer summary unavailable; no zero substituted'},{status:503})}}
