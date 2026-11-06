// Shared by Edge middleware and Node self-fetch transport. No privileged SDK imports.
export const ADMIN_EMAILS = new Set(['marc@endless-tales.com','hello.endlesstales@gmail.com','williampostlewaite@icloud.com','m.postlewaite@gmail.com'])
export const INTERNAL_ADMIN_PATHS = new Set(['/api/admin/production-jobs/run-next','/api/admin/generate-voices','/api/admin/complete-story-package','/api/admin/generate-belle-variants','/api/admin/progress-alarm'])
export function validInternalToken(provided:string|null,expected:string|undefined,path:string){
 if(!INTERNAL_ADMIN_PATHS.has(path)||!expected||expected.length<32||!provided||provided.length!==expected.length)return false
 let diff=0;for(let i=0;i<expected.length;i++)diff|=provided.charCodeAt(i)^expected.charCodeAt(i)
 return diff===0
}

// ASC3-AUTH-001 (Marc, 2026-11-06): the /api/asc3 write routes (update, publish,
// generate, render, cover) were open to the internet. Every non-read call now
// needs an admin session or the internal service key. GET reads stay public
// (the player needs story-playlist); music-callback stays public because the
// music vendor calls it.
export const PUBLIC_ASC3_WRITE_PATHS = new Set(['/api/asc3/music-callback'])
export function isProtectedAsc3Write(path:string,method:string){
 return path.startsWith('/api/asc3/')&&!['GET','HEAD','OPTIONS'].includes(method.toUpperCase())&&!PUBLIC_ASC3_WRITE_PATHS.has(path)
}
export function tokenMatches(provided:string|null,expected:string|undefined){
 if(!expected||expected.length<32||!provided||provided.length!==expected.length)return false
 let diff=0;for(let i=0;i<expected.length;i++)diff|=provided.charCodeAt(i)^expected.charCodeAt(i)
 return diff===0
}
/** Headers for a server-side call to a protected /api/asc3 route. */
export function internalKeyHeaders(extra:Record<string,string>={}):Record<string,string>{
 const token=process.env.ADMIN_INTERNAL_TOKEN
 return token?{...extra,'x-et-internal-key':token}:{...extra}
}
