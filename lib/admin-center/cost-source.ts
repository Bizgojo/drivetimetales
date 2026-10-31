import 'server-only'
import {db} from './store'
import {classifyCost,costBucket,finishCost,combineCosts,type CostBucket} from './story-costs'
import {publishedLibrary} from './library'
export async function storyCosts(){
 const library=await publishedLibrary();if(!library.data)throw Error('Published story source unavailable')
 const stories=library.data as any[],costs:Record<string,CostBucket>={},sources:any[]=[];for(const s of stories)costs[s.id]=costBucket()
 for(const [table,provider] of [['anthropic_usage_log','anthropic'],['openai_usage_log','openai'],['el_usage_log','elevenlabs']]){
 let available=true,calls=0
 try{for(let i=0;i<stories.length;i+=100){const ids=stories.slice(i,i+100).map(s=>s.id);for(let page=0;page<100;page++){
 const columns=provider==='elevenlabs'?'id,story_id,cost_usd':'id,story_id,cost_usd,purpose'
 const{data,error}=await db().from(table).select(columns).in('story_id',ids).order('id').range(page*1000,page*1000+999);if(error)throw error
 for(const r of (data||[]) as any[]){const k=classifyCost(provider,r.purpose||'');const n=r.cost_usd==null?null:Number(r.cost_usd);if(!k||n===null||!Number.isFinite(n)||n<0)continue;costs[r.story_id][k]=(costs[r.story_id][k]??0)+n;calls++}
 if((data||[]).length<1000)break;if(page===99)throw Error('Cost source exceeds limit')
 }}}catch{available=false}
 sources.push({table,provider:provider==='anthropic'?'Claude':provider==='openai'?'OpenAI':'ElevenLabs',status:available?'connected':'unavailable',attributedCalls:calls})
 }
 // An incomplete provider read must not leave apparently complete totals.
 for(const c of Object.values(costs)){if(sources.find(s=>s.table==='anthropic_usage_log')?.status==='unavailable'){c.writing=null;c.production=null}if(sources.find(s=>s.table==='openai_usage_log')?.status==='unavailable')c.production=null;if(sources.find(s=>s.table==='el_usage_log')?.status==='unavailable')c.elevenlabs=null;finishCost(c)}
 const packages=new Map<string,any[]>();for(const s of stories){const id=s.series_id||s.id;packages.set(id,[...(packages.get(id)||[]),s])}
 const groups=new Map<string,any>();for(const items of Array.from(packages.values())){
 const minutes=items.every(s=>s.duration_mins!=null)?items.reduce((n,s)=>n+Number(s.duration_mins),0):null
 const band=minutes===null?'Unknown runtime':minutes<30?'Under 30 min':minutes<60?'30–59 min':minutes<120?'60–119 min':'120+ min'
 const key=items.length+' episodes · '+band,cost=combineCosts(items.map(s=>costs[s.id]));const g=groups.get(key)||{label:key,packages:0,writing:[],production:[],elevenlabs:[],total:[]};g.packages++;for(const k of ['writing','production','elevenlabs','total'])if(cost[k as keyof CostBucket]!==null)g[k].push(cost[k as keyof CostBucket]);groups.set(key,g)
 }
 return{fetchedAt:new Date().toISOString(),costs,sources,groups:Array.from(groups.values()).map(g=>({label:g.label,packages:g.packages,...Object.fromEntries(['writing','production','elevenlabs','total'].map(k=>[k,{average:g[k].length?g[k].reduce((n:number,v:number)=>n+v,0)/g[k].length:null,covered:g[k].length}]))})),note:'Recorded attributed usage in USD; provider-calculated usage can be estimated, not reconciled invoices. AI production excludes ElevenLabs. Missing/unattributed cover, music, shared series and voice charges are not allocated by guess. Total is unavailable unless all three components have records; coverage does not prove invoice completeness.'}
}
