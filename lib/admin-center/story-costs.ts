// Usage records are not invoices. Never treat absent attribution as zero spend.
export type CostBucket={writing:number|null;production:number|null;elevenlabs:number|null;total:number|null;recorded:number|null}
export function classifyCost(provider:string,purpose:string):'writing'|'production'|'elevenlabs'|null{
 if(provider==='elevenlabs')return 'elevenlabs'
 if(/personalization|support|marketing|variance/i.test(purpose))return null
 if(/script|outline|story-generation|package-plan|quality-gate-rewrite|belle.*repair|belle.*variant|description-repair/i.test(purpose))return 'writing'
 if(/cover|validator|continuity|resolution|quality/i.test(purpose))return 'production'
 return null
}
export function costBucket():CostBucket{return{writing:null,production:null,elevenlabs:null,total:null,recorded:null}}
export function finishCost(c:CostBucket){const parts=[c.writing,c.production,c.elevenlabs];c.recorded=parts.some(v=>v!==null)?parts.reduce<number>((n,v)=>n+(v??0),0):null;c.total=parts.every(v=>v!==null)?c.recorded:null;return c}
export function combineCosts(costs:CostBucket[]):CostBucket{const result=costBucket();for(const k of ['writing','production','elevenlabs'] as const)result[k]=costs.length&&costs.every(c=>c[k]!==null)?costs.reduce((n,c)=>n+c[k]!,0):null;return finishCost(result)}
