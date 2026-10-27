import { NextRequest,NextResponse } from 'next/server'
import { accountAdmin } from '@/lib/server/accountUser'
import { reconcileFeedback,deliverFeedbackEmails } from '@/lib/server/subscriberFeedback'
export const dynamic='force-dynamic'
export const maxDuration=60
export async function GET(req:NextRequest){const secret=process.env.CRON_SECRET;if(!secret||req.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401});try{const admin=accountAdmin();await reconcileFeedback(admin);return NextResponse.json(await deliverFeedbackEmails(admin))}catch{return NextResponse.json({error:'Feedback processing failed'},{status:500})}}
