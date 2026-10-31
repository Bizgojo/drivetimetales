export function periodMetrics(events:any[],reviews:any[],since:string){
 const metrics:Record<string,{starts:number;finishes:number;reviews:number;rating:number|null;ratingSum:number}>={},seen=new Map<string,Set<string>>(),cutoff=Date.parse(since)
 const get=(id:string)=>metrics[id]||=( {starts:0,finishes:0,reviews:0,rating:null,ratingSum:0})
 for(const e of events){if(!e.story_id||!e.session_id)continue;const key=e.story_id+':'+e.session_id,flags=seen.get(key)||new Set<string>(),m=get(e.story_id)
 if(Date.parse(e.started_at)>=cutoff&&!flags.has('start')){m.starts++;flags.add('start')}
 if(Date.parse(e.ended_at)>=cutoff&&(/^(completed?|ended|finished?)$/.test(e.stop_reason||'')||(e.progress_pct!=null&&Number(e.progress_pct)>=95))&&!flags.has('finish')){m.finishes++;flags.add('finish')}seen.set(key,flags)
 }
 for(const r of reviews){if(r.story_id&&r.rating!=null&&Number.isFinite(Number(r.rating))&&Number(r.rating)>=1&&Number(r.rating)<=5&&Date.parse(r.created_at)>=cutoff){const m=get(r.story_id);m.reviews++;m.ratingSum+=Number(r.rating);m.rating=m.ratingSum/m.reviews}}
 return metrics
}
