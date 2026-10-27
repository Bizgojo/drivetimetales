import { resolveRequestOrigin,isLocalOrigin } from '@/lib/requestOrigin'
export const MAGIC_INVITE_OWNER = 'm.postlewaite@gmail.com'
export function isMagicInviteOwner(email?: string | null){return email?.trim().toLowerCase()===MAGIC_INVITE_OWNER}
export function isIphone(userAgent:string){return /iphone|ipod/i.test(userAgent)}
export function magicInviteOrigin(request:Request){
 const origin=resolveRequestOrigin(request)
 if(isLocalOrigin(origin))return origin
 if(['https://test.endless-tales.com','https://app.endless-tales.com'].includes(origin))return origin
 return process.env.VERCEL_ENV==='preview'?'https://test.endless-tales.com':'https://app.endless-tales.com'
}
export function magicInvitationUrl(origin:string,hash:string){return `${origin}/auth/invitation#token_hash=${encodeURIComponent(hash)}`}
export function inviteSmsHref(phone:string,body:string,userAgent:string){return `sms:${phone.replace(/[^\d+]/g,'')}${isIphone(userAgent)?'&':'?'}body=${encodeURIComponent(body)}`}

export function magicInviteCode(days:number,id:string){return `M${days}-${id.replace(/-/g,'').slice(0,15).toUpperCase()}`}
