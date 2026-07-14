require('dotenv').config({path:'/Users/williampostlewaite/Projects/drivetimetales/.env.local'});
const {createClient}=require('@supabase/supabase-js');
const Stripe=require('stripe');
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const st=new Stripe(process.env.STRIPE_SECRET_KEY);
const emailPat=process.argv[2];
(async()=>{
if(emailPat){
  const {data:u,error}=await sb.from('users').select('id,email,display_name,subscription_type,plan,billing_cycle,stripe_customer_id,stripe_subscription_id,utm_source,utm_medium,utm_campaign,signup_promo_code,first_paid_date,cancelled_at,created_at,updated_at').ilike('email','%'+emailPat+'%');
  console.log('USER_ROW:',JSON.stringify(u,null,1),error?JSON.stringify(error):'');
}
const ev=await st.events.list({limit:8});
console.log('STRIPE_EVENTS:',JSON.stringify(ev.data.map(e=>({type:e.type,created:new Date(e.created*1000).toISOString(),pending_webhooks:e.pending_webhooks,obj:e.data.object.id,cust:e.data.object.customer||null})),null,1));
})();
