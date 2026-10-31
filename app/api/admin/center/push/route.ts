import {NextRequest,NextResponse} from 'next/server'
import {adminAccess} from '@/lib/admin-center/auth'
import {db} from '@/lib/admin-center/store'
import {feedbackAdmin} from '@/lib/server/feedbackAdmin'
import {validPushSubscription} from '@/lib/admin-center/push-policy'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest){const denied=await adminAccess(req);if(denied)return denied;return NextResponse.json({publicKey:process.env.ADMIN_PUSH_VAPID_PUBLIC_KEY||null,configured:!!(process.env.ADMIN_PUSH_VAPID_PUBLIC_KEY&&process.env.ADMIN_PUSH_VAPID_PRIVATE_KEY&&process.env.ADMIN_PUSH_SUBJECT),deliveryEnabled:process.env.ADMIN_PUSH_ENABLED==='true'},{headers:{'Cache-Control':'private, no-store'}})}
export async function POST(req:NextRequest){
 const denied=await adminAccess(req);if(denied)return denied
 try{const {subscription}=await req.json()
 if(!validPushSubscription(subscription))return NextResponse.json({error:'Unsupported push endpoint or malformed browser keys'},{status:400})
 const user=await feedbackAdmin()
 const {error}=await db().from('admin_center_push_subscriptions').upsert({user_id:user!.id,endpoint:subscription.endpoint,subscription},{onConflict:'endpoint'})
 if(error)throw error
 return NextResponse.json({success:true,message:'Device registered. Delivery requires configured scheduler and verified platform testing.'})
 }catch{return NextResponse.json({error:'Device registration failed'},{status:503})}
}
