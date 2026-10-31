import 'server-only'
import{db}from'./store'
// Matches the existing Admin library eligibility rule, including source publication status.
export async function publishedLibrary(){
 try{
  const client=db(),ids:string[]=[],episodeOrder=new Map<string,number>()
  for(let page=0;page<100;page++){
   const {data,error}=await client.from('stories').select('id,episode_number').eq('status','published').eq('is_hidden',false).order('id').range(page*1000,page*1000+999)
   if(error)throw error
   for(const r of data||[])episodeOrder.set(r.id,r.episode_number||0);ids.push(...(data||[]).map(r=>r.id));if((data||[]).length<1000)break;if(page===99)throw new Error('Library exceeds reconciliation limit')
  }
  const all:any[]=[]
  for(let offset=0;offset<ids.length;offset+=200){
   const{data,error}=await client.from('story_analytics').select('id,title,author,genre,duration_mins,cover_url,audio_url,series_id,series_name,series_total,published_on,downloads_total,pct_finished,is_hidden').in('id',ids.slice(offset,offset+200)).eq('is_hidden',false).not('cover_url','is',null)
   if(error)throw error
   all.push(...(data||[]).filter(r=>!!r.cover_url).map(r=>({...r,episode_number:episodeOrder.get(r.id)})))
  }
  return{status:'connected',source:'stories published + visible story_analytics + cover',fetchedAt:new Date().toISOString(),data:all.sort((a,b)=>Date.parse(b.published_on||'')-Date.parse(a.published_on||'')),count:all.length}
 }catch{return{status:'unavailable',source:'Published-library reconciliation',fetchedAt:new Date().toISOString(),data:null,count:null}}
}
