export type AdminVersion='new'|'classic'
export const ADMIN_VERSION_COOKIE='et_admin_version'
export function adminVersion(value:unknown):AdminVersion|null{return value==='new'||value==='classic'?value:null}
// These are presentation choices, never authorization or spending policies.
export function versionHref(pathname:string,search:string,version:AdminVersion){const p=new URLSearchParams(search);p.set('adminView',version);return pathname+'?'+p.toString()}
