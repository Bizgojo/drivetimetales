import{acknowledgeSupport}from'@/lib/admin-center/acknowledgments'
import {NextRequest,NextResponse} from 'next/server'
import {syncEvents} from '@/lib/admin-center/events'
import {deliverPush} from '@/lib/admin-center/push'
export const dynamic='force-dynamic'
export const maxDuration=60
export async function GET(req:NextRequest){
 const secret=process.env.CRON_SECRET
 if(!secret||req.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:403})
 try{return NextResponse.json({sync:await syncEvents(),push:await deliverPush(),acknowledgments:await acknowledgeSupport()},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'Alert reconciliation failed'},{status:503})}
}
