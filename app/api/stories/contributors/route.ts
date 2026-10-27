import { NextRequest,NextResponse } from 'next/server'
import { accountAdmin } from '@/lib/server/accountUser'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest){
 const storyId=req.nextUrl.searchParams.get('storyId'),seriesId=req.nextUrl.searchParams.get('seriesId');const id=storyId||seriesId
 if(!id||! /^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({contributors:[]},{status:400})
 const admin=accountAdmin();let query=admin.from('stories').select('id').eq('status','published').eq('is_hidden',false);query=storyId?query.eq('id',storyId):query.eq('series_id',seriesId!)
 const {data:stories,error}=await query;if(error)return NextResponse.json({contributors:[]},{status:503});if(!stories?.length)return NextResponse.json({contributors:[]})
 const {data,error:creditError}=await admin.from('story_contributor_credits').select('contributor_name').in('story_id',stories.map(s=>s.id));return creditError?NextResponse.json({contributors:[]},{status:503}):NextResponse.json({contributors:Array.from(new Set((data||[]).map(c=>c.contributor_name)))})
}
