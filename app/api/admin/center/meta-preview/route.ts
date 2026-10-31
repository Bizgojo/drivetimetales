import {NextRequest,NextResponse}from'next/server'
import{adminAccess}from'@/lib/admin-center/auth'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest){
 const denied=await adminAccess(req);if(denied)return denied
 const token=process.env.META_ACCESS_TOKEN,account=process.env.META_AD_ACCOUNT_ID
 if(!token||!account)return NextResponse.json({error:'Meta ads read/preview credentials not configured'},{status:503})
 const id=req.nextUrl.searchParams.get('id'),format=req.nextUrl.searchParams.get('format')||'MOBILE_FEED_STANDARD'
 if(id&&!/^\d+$/.test(id)||!['MOBILE_FEED_STANDARD','DESKTOP_FEED_STANDARD','INSTAGRAM_STANDARD'].includes(format))return NextResponse.json({error:'Invalid ad ID or placement'},{status:400})
 try{
  const root='https://graph.facebook.com/v21.0/',accountId=account.startsWith('act_')?account:`act_${account}`
  const path=id?`${id}/previews?ad_format=${format}`:`${accountId}/ads?fields=id,name,status,creative{body,title,image_url,thumbnail_url,object_story_spec}&limit=50`
  const r=await fetch(root+path,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(12000)})
  if(!r.ok)throw new Error('Meta denied')
  const p=await r.json()
  return NextResponse.json({data:p.data||[],partial:!!p.paging?.next,source:'Meta Graph API',fetchedAt:new Date().toISOString()},{headers:{'Cache-Control':'private, no-store'}})
 }catch{return NextResponse.json({error:'Meta ad preview could not be verified. Check ads_read access and ad account permissions.'},{status:502})}
}
