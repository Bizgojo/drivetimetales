import {NextRequest,NextResponse} from 'next/server'
import {adminAccess} from '@/lib/admin-center/auth'
import {storyCosts} from '@/lib/admin-center/cost-source'
export const dynamic='force-dynamic'
export const maxDuration=60
export async function GET(req:NextRequest){const denied=await adminAccess(req);if(denied)return denied;try{return NextResponse.json(await storyCosts(),{headers:{'Cache-Control':'private, no-store'}})}catch{return NextResponse.json({error:'Story cost sources unavailable'},{status:503})}}
