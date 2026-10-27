export function preferenceTrends(rows: Array<{genres?: string[]; interests?: string; avoid?: string; preferred_minutes?: number}>) {
 const genres: Record<string,number>={},lengths: Record<string,number>={}, interests: Record<string,number>={},avoid:Record<string,number>={}
 const countTopics=(value:string|undefined,target:Record<string,number>)=>new Set((value||'').toLowerCase().split(/[,;\n]+/).map(x=>x.trim()).filter(x=>x.length>1)).forEach(x=>{target[x]=(target[x]||0)+1})
 for(const row of rows){new Set(row.genres||[]).forEach(g=>{genres[g]=(genres[g]||0)+1});const length=String(row.preferred_minutes||0);lengths[length]=(lengths[length]||0)+1;countTopics(row.interests,interests);countTopics(row.avoid,avoid)}
 const rank=(counts:Record<string,number>)=>Object.entries(counts).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name))
 return {respondents:rows.length,genres:rank(genres),lengths:rank(lengths),interests:rank(interests),avoid:rank(avoid)}
}
