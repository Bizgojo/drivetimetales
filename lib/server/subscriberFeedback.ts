import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
export async function reconcileFeedback(admin: SupabaseClient) {
 const { error } = await admin.rpc('reconcile_subscriber_story_ideas')
 if (error) throw error
}
export async function deliverFeedbackEmails(admin: SupabaseClient, ideaId?: string) {
 if (!process.env.RESEND_API_KEY) return { sent: 0, error: 'Email delivery is not configured. In-app notifications remain available.' }
 let query = admin.from('subscriber_notifications').select('*').in('email_status',['pending','failed']).order('created_at').limit(30)
 if (ideaId) query = query.eq('idea_id',ideaId)
 const { data, error } = await query
 if (error) throw error
 let sent = 0
 for (const notice of data || []) {
  try {
   const { data: recipient, error: userError } = await admin.auth.admin.getUserById(notice.user_id)
   if (userError || !recipient.user?.email) throw new Error('Subscriber email unavailable')
   const response = await fetch('https://api.resend.com/emails',{ method:'POST',headers:{ Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`subscriber-notice-${notice.id}` },body:JSON.stringify({from:'Endless Tales <hello@endless-tales.com>',to:recipient.user.email,subject:notice.subject,text:`${notice.message}\n\nOpen Endless Tales and visit Account to see your updates.`,reply_to:'hello@endless-tales.com'}) })
   if (!response.ok) throw new Error(`Email provider returned ${response.status}`)
   const { error: saveError } = await admin.from('subscriber_notifications').update({email_status:'sent',email_sent_at:new Date().toISOString(),email_error:null}).eq('id',notice.id)
   if (saveError) throw saveError
   sent++
  } catch (err) { await admin.from('subscriber_notifications').update({email_status:'failed',email_error:err instanceof Error?err.message:'Delivery failed'}).eq('id',notice.id) }
 }
 return { sent }
}
