// Canonical presentation contract shared by both Admin versions. No price multipliers or default zeros.
export type SharedMetric={id:string;label:string;value:string|number;note?:string}
const money=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v):'Unavailable'
const count=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:'Unavailable'
export function overviewMetrics(data:any):SharedMetric[]{const stripe=data?.stripe?.status==='connected'?data.stripe:{},bank=data?.mercury?.status==='connected'?data.mercury:{};return[
 {id:'cash',label:'Bank available cash',value:money(bank.cash),note:data?.mercury?.status},
 {id:'paid',label:'Active paid subscriptions',value:count(stripe.paid)},
 {id:'collections',label:'Net collections · period',value:money(stripe.collections),note:stripe.period},
 {id:'mrr',label:'MRR · normalized',value:money(stripe.mrr),note:'Before discounts / tax; paid invoice evidence required'},
 {id:'newPaid',label:'New paid · period',value:count(stripe.newPaid)},
 {id:'cancellations',label:'Cancellation requests · period',value:count(stripe.cancellations),note:stripe.cancellationReason},
 {id:'cac',label:'Paid acquisition CAC · period',value:data?.acquisition?.status==='connected'?money(data.acquisition.cac):'Unavailable',note:'Requires complete matched acquisition costs'},
 {id:'churn',label:'Subscriber churn · period',value:typeof stripe.churn==='number'&&Number.isFinite(stripe.churn)?stripe.churn.toFixed(2)+'%':'Unavailable',note:'Opening paid cohort whose access ended'},
 {id:'ltv',label:'Lifetime value (LTV)',value:ltv(stripe,data),note:'Revenue per subscriber per month ÷ churn. Blank until there is a real CAC and real churn'},
 {id:'ltvCac',label:'LTV : CAC · measured',value:ltvCac(stripe,data),note:'Lifetime value ÷ paid acquisition CAC. Blank until both are measured'},
]}
// LTV (Marc, Nov 8 2026): no assumed figures. Shown only when CAC and churn are both measured.
function cacValue(data:any){return data?.acquisition?.status==='connected'&&typeof data.acquisition.cac==='number'&&Number.isFinite(data.acquisition.cac)&&data.acquisition.cac>0?data.acquisition.cac:null}
function ltvPerSub(stripe:any,data:any){const churn=typeof stripe.churn==='number'&&Number.isFinite(stripe.churn)&&stripe.churn>0?stripe.churn/100:null
 const arpu=typeof stripe.mrr==='number'&&typeof stripe.paid==='number'&&stripe.paid>0?stripe.mrr/stripe.paid:null
 return cacValue(data)===null||!churn||!arpu?null:arpu/churn}
function ltv(stripe:any,data:any){const v=ltvPerSub(stripe,data);return v===null?'Unavailable':money(v)}
function ltvCac(stripe:any,data:any){const v=ltvPerSub(stripe,data),cac=cacValue(data);return v===null||cac===null?'Unavailable':(v/cac).toFixed(1)+' : 1'}
export function financeMetrics(data:any):SharedMetric[]{const target=data?.policy?.data?.[0]?.policy?.marketingPercent;return[
 {id:'cash',label:'Bank available cash',value:money(data?.mercury?.status==='connected'?data.mercury.cash:null)},
 {id:'collections',label:'Net collections · 30 days',value:money(data?.stripe?.status==='connected'?data.stripe.collections:null)},
 {id:'marketingTarget',label:'Marketing target',value:typeof target==='number'&&Number.isFinite(target)&&target>=0&&target<=100?target+'%':'Unavailable'},
 {id:'profit',label:'Verified distributable profit',value:'Unavailable',note:'Complete accounting, tax, reserve and liability reconciliation required'},
]}
