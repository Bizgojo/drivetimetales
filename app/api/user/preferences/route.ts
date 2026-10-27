import { NextRequest, NextResponse } from 'next/server'
import { accountUser, accountAdmin } from '@/lib/server/accountUser'
import { cleanListeningPreferences } from '@/lib/listeningPreferences'
export const dynamic = 'force-dynamic'
export async function GET() {
 const user = await accountUser()
 if (!user) return NextResponse.json({error:'Please sign in.'},{status:401})
 const {data,error}=await accountAdmin().from('listener_preferences').select('genres,interests,avoid,preferred_minutes,updated_at').eq('user_id',user.id).maybeSingle()
 if(error)return NextResponse.json({error:'Could not load preferences.'},{status:503})
 return NextResponse.json({preferences:data?cleanListeningPreferences({...data,minutes:data.preferred_minutes}):cleanListeningPreferences(user.user_metadata?.listening_preferences)},{headers:{'Cache-Control':'private, no-store'}})
}
export async function POST(req: NextRequest) {
 if (req.headers.get('origin') && req.headers.get('origin') !== req.nextUrl.origin) return NextResponse.json({error:'Invalid request origin'},{status:403})
 const user=await accountUser()
 if(!user)return NextResponse.json({error:'Please sign in again.'},{status:401})
 try {
  const preferences=cleanListeningPreferences(await req.json())
  const {error}=await accountAdmin().from('listener_preferences').upsert({user_id:user.id,genres:preferences.genres,interests:preferences.interests,avoid:preferences.avoid,preferred_minutes:preferences.minutes,updated_at:new Date().toISOString()},{onConflict:'user_id'})
  if(error)throw error
  return NextResponse.json({preferences})
 }catch{return NextResponse.json({error:'Could not save your preferences. Please try again.'},{status:500})}
}
