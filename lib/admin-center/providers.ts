import 'server-only'
import Stripe from 'stripe'

export function reportingStart(days:number,now=new Date()){
 if(days!==1)return Math.floor(now.getTime()/1000)-days*86400
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now)
 const get=(type:string)=>Number(parts.find(p=>p.type===type)!.value),midnight=Date.UTC(get('year'),get('month')-1,get('day'));let t=midnight
 for(let i=0;i<2;i++){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t));const n=(type:string)=>Number(p.find(v=>v.type===type)!.value);const wall=Date.UTC(n('year'),n('month')-1,n('day'),n('hour'),n('minute'),n('second'));t=midnight-(wall-t)}return t/1000
}
export async function stripeSummary(days=30) {
 if(!process.env.STRIPE_SECRET_KEY)return{status:'unavailable',reason:'Stripe live credentials are missing'}
 if(!/^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY))return{status:'unavailable',reason:'Test-mode Stripe cannot supply actual financial KPIs'}
 try{
  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY,{apiVersion:'2023-10-16',timeout:12000,maxNetworkRetries:1}),since=reportingStart([1,7,30].includes(days)?days:30),started=Date.now()
  const deadline=()=>{if(Date.now()-started>25000)throw new Error('Complete source exceeded read deadline')}
  let paid=0,mrr=0,collections=0,fees=0;const firstPaid=new Map<string,number>(),opening=new Set<string>(),current=new Set<string>(),ended=new Set<string>(),cancelRequests=new Set<string>()
  for await(const sub of stripe.subscriptions.list({status:'all',limit:100,expand:['data.latest_invoice']})){
   deadline();const customer=typeof sub.customer==='string'?sub.customer:sub.customer.id;const invoice=sub.latest_invoice as Stripe.Invoice|null
   let hasPaid=false
   for await(const inv of stripe.invoices.list({subscription:sub.id,status:'paid',limit:100})){
    deadline();if(!inv.livemode||inv.amount_paid<=0)continue;hasPaid=true;const at=inv.status_transitions.paid_at||inv.created;firstPaid.set(customer,Math.min(firstPaid.get(customer)??Infinity,at))
    let lines=inv.lines.data;if(inv.lines.has_more){lines=[];for await(const line of stripe.invoices.listLineItems(inv.id,{limit:100})){deadline();lines.push(line)}}
    if(at<since&&lines.some(line=>line.type==='subscription'&&line.period.start<=since&&line.period.end>since)&&(!sub.ended_at||sub.ended_at>=since))opening.add(customer)
   }
   if(hasPaid&&sub.status==='active'&&invoice&&typeof invoice!=='string'&&invoice.paid&&invoice.amount_paid>0&&invoice.livemode){
    paid++;current.add(customer)
    for(const item of sub.items.data){const price=item.price,r=price.recurring;if(!r||price.currency!=='usd'||price.unit_amount===null||price.billing_scheme!=='per_unit')throw new Error('Unsupported recurring price');const months=r.interval==='year'?12*r.interval_count:r.interval==='month'?r.interval_count:r.interval==='week'?r.interval_count*12/52:r.interval_count*12/365;mrr+=price.unit_amount*(item.quantity||1)/100/months}
   }
   if(hasPaid&&sub.ended_at&&sub.ended_at>=since)ended.add(customer)
  }
  for await(const tx of stripe.balanceTransactions.list({created:{gte:since},limit:100})){deadline();if(tx.currency!=='usd')throw new Error('Multi-currency reconciliation required');if(['charge','payment','refund','payment_refund','adjustment'].includes(tx.type)){collections+=tx.net/100;fees+=tx.fee/100}}
  for await(const event of stripe.events.list({types:['customer.subscription.updated','customer.subscription.deleted'],created:{gte:since},limit:100})){deadline();const sub=event.data.object as Stripe.Subscription,prior=event.data.previous_attributes as any,customer=typeof sub.customer==='string'?sub.customer:sub.customer.id;if(!firstPaid.has(customer))continue;if(event.type==='customer.subscription.updated'&&sub.cancel_at_period_end&&prior?.cancel_at_period_end===false||event.type==='customer.subscription.deleted'&&sub.cancellation_details?.reason==='cancellation_requested')cancelRequests.add(customer)}
  const lost=Array.from(opening).filter(id=>ended.has(id)&&!current.has(id)).length
  return{status:'connected',source:'Stripe live subscriptions, paid invoice history and balance ledger',fetchedAt:new Date().toISOString(),paid,newPaid:Array.from(firstPaid.values()).filter(at=>at>=since).length,cancellations:cancelRequests.size,cancellationReason:'Unique paid customers with user-requested cancellation events in the period; reverted requests retained',openingPaid:opening.size,lostPaid:lost,churn:opening.size?100*lost/opening.size:undefined,mrr,collections,fees,currency:'usd',period:days===1?'Today · America/New_York':'rolling '+days+' days',definition:'Net collections include fees/refunds; settlements excluded. New paid counts first-ever paid customers; churn uses the invoice-covered opening customer cohort. Active paid count is subscriptions, MRR before discounts/tax. Complete reads only; no capped sample is treated as a total.'}
 }catch{return{status:'unavailable',reason:'Stripe complete read or reconciliation failed; no zero substituted'}}
}
export async function mercurySummary() {
  if (!process.env.MERCURY_API_TOKEN) return { status: 'unavailable', reason: 'MERCURY_API_TOKEN is missing' }
  try {
    const r = await fetch('https://api.mercury.com/api/v1/accounts', { headers: { Authorization: `Bearer ${process.env.MERCURY_API_TOKEN}` }, cache: 'no-store', signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error('Mercury denied')
    const p = await r.json()
    if (!Array.isArray(p.accounts) || !p.accounts.length) throw new Error('No accounts')
    const accounts = p.accounts.map((a: any) => ({ id: a.id, name: a.nickname || a.name || a.kind, balance: a.availableBalance, status: a.status, kind: a.kind }))
    if (accounts.some((a: any) => typeof a.balance !== 'number' || !Number.isFinite(a.balance))) throw new Error('Unverified balance')
    return { status: 'connected', source: 'Mercury availableBalance (USD)', fetchedAt: new Date().toISOString(), cash: accounts.reduce((s: number,a: any) => s+a.balance,0), accounts, transfersEnabled: false }
  } catch { return { status: 'unavailable', reason: 'Mercury account access or balance format could not be verified', transfersEnabled: false } }
}
export async function metaSummary() {
  const token = process.env.META_ACCESS_TOKEN, account = process.env.META_AD_ACCOUNT_ID
  if (!token || !account) return { status: 'unavailable', reason: 'Meta ads read credentials are missing' }
  try {
    const params = new URLSearchParams({ fields: 'id,name,status,effective_status,daily_budget,lifetime_budget', limit: '100' })
    const r = await fetch(`https://graph.facebook.com/v21.0/${account.startsWith('act_') ? account : `act_${account}`}/campaigns?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error('Meta denied')
    const p = await r.json()
    return { status: p.paging?.next ? 'partial' : 'connected', source: 'Meta read-only campaigns', fetchedAt: new Date().toISOString(), data: p.data || [], writeEnabled: false }
  } catch { return { status: 'unavailable', reason: 'Meta ads permissions or read request failed', writeEnabled: false } }
}
