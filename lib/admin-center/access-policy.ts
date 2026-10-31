// Shared by Edge middleware and Node self-fetch transport. No privileged SDK imports.
export const ADMIN_EMAILS = new Set(['marc@endless-tales.com','hello.endlesstales@gmail.com','williampostlewaite@icloud.com','m.postlewaite@gmail.com'])
export const INTERNAL_ADMIN_PATHS = new Set(['/api/admin/production-jobs/run-next','/api/admin/generate-voices','/api/admin/complete-story-package','/api/admin/generate-belle-variants'])
export function validInternalToken(provided:string|null,expected:string|undefined,path:string){
 if(!INTERNAL_ADMIN_PATHS.has(path)||!expected||expected.length<32||!provided||provided.length!==expected.length)return false
 let diff=0;for(let i=0;i<expected.length;i++)diff|=provided.charCodeAt(i)^expected.charCodeAt(i)
 return diff===0
}
