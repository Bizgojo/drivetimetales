import { INTERNAL_ADMIN_PATHS } from './access-policy'
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
 if(!INTERNAL_ADMIN_PATHS.has(url.pathname))return fetch(input,init)
 const allowed=new Set(['http://127.0.0.1:3000','http://localhost:3000',...ownLoopbackOrigins(),...(process.env.ADMIN_INTERNAL_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean)])
 if(!allowed.has(url.origin))throw new Error('Admin self-fetch origin is not authorized; configure ADMIN_INTERNAL_ORIGINS')
 const token=process.env.ADMIN_INTERNAL_TOKEN
 if(!token||token.length<32)throw new Error('Admin service authentication is not configured')
 const headers=new Headers(input instanceof Request?input.headers:undefined)
 new Headers(init?.headers).forEach((value,key)=>headers.set(key,value))
 headers.set('x-et-internal-key',token)
 return fetch(input,{...init,headers})
}
