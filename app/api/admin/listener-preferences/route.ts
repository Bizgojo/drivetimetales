import { NextRequest, NextResponse } from 'next/server'
import { accountAdmin } from '@/lib/server/accountUser'
import { feedbackAdmin } from '@/lib/server/feedbackAdmin'
import { preferenceTrends } from '@/lib/preferenceTrends'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest){
 if(!await feedbackAdmin())return NextResponse.json({error:'Admin access required'},{status:403})
 const admin=accountAdmin();const rows:any[]=[]
 const userId=req.nextUrl.searchParams.get('userId')
 if(userId&&! /^[0-9a-f-]{36}$/i.test(userId))return NextResponse.json({error:'Invalid subscriber ID'},{status:400})
 // Fetch every response, beyond PostgREST's default row limit.
 for(let offset=0;;offset+=1000){let query=admin.from('listener_preferences').select('*').order('user_id').range(offset,offset+999);if(userId)query=query.eq('user_id',userId);const {data,error}=await query;if(error)return NextResponse.json({error:error.message},{status:500});rows.push(...(data||[]));if(!data||data.length<1000)break}
 const profiles:any[]=[]
 for(let offset=0;offset<rows.length;offset+=100){const {data,error}=await admin.from('users').select('id,first_name,last_name,email').in('id',rows.slice(offset,offset+100).map(r=>r.user_id));if(error)return NextResponse.json({error:error.message},{status:500});profiles.push(...(data||[]))}
 const byId=new Map(profiles.map(p=>[p.id,p]));return NextResponse.json({trends:preferenceTrends(rows),subscribers:rows.map(row=>({...row,profile:byId.get(row.user_id)||null}))},{headers:{'Cache-Control':'private, no-store'}})
}
