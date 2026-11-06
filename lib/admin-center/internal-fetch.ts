import { INTERNAL_ADMIN_PATHS, isProtectedAsc3Write } from './access-policy'
// ZERO-DOWNTIME-001 follow-up (2026-11-02): with deploy slots the app listens on
// 3001/3002, and its self-fetch origin is http://localhost:<PORT>. This server's
// own loopback address is always allowed.
export function ownLoopbackOrigins(env:Record<string,string|undefined>=process.env):string[]{
 const port=String(env.PORT||'').trim()
 if(!/^\d{2,5}$/.test(port))return []
 return [`http://127.0.0.1:${port}`,`http://localhost:${port}`]
}
// Authentication transport only; production steps, payloads and retry behavior stay unchanged.
export function internalAdminFetch(input:RequestInfo|URL,init?:RequestInit):Promise<Response>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url)
 const method=String(init?.method||(input instanceof Request?input.method:'GET'))
 const asc3Write=!INTERNAL_ADMIN_PATHS.has(url.pathname)&&isProtectedAsc3Write(url.pathname,method)
 if(!INTERNAL_ADMIN_PATHS.has(url.pathname)&&!asc3Write)return fetch(input,init)
 const allowed=new Set(['http://127.0.0.1:3000','http://localhost:3000',...ownLoopbackOrigins(),...(process.env.ADMIN_INTERNAL_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean)])
 // ASC3-AUTH-001: our own public origin is also ours; any other origin gets a
 // plain (token-less) fetch, never a thrown error, so old call paths fail visibly at the gate.
 if(asc3Write){for(const o of ['https://app.endless-tales.com',process.env.NEXT_PUBLIC_APP_URL||''])if(o)try{allowed.add(new URL(o).origin)}catch{}}
 if(!allowed.has(url.origin)){if(asc3Write)return fetch(input,init);throw new Error('Admin self-fetch origin is not authorized; configure ADMIN_INTERNAL_ORIGINS')}
 const token=process.env.ADMIN_INTERNAL_TOKEN
 if(!token||token.length<32)throw new Error('Admin service authentication is not configured')
 const headers=new Headers(input instanceof Request?input.headers:undefined)
 new Headers(init?.headers).forEach((value,key)=>headers.set(key,value))
 headers.set('x-et-internal-key',token)
 return fetch(input,{...init,headers})
}
