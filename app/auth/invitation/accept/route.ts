import {NextRequest,NextResponse} from 'next/server'
import {GET as authCallback} from '@/app/auth/callback/route'
import {resolveRequestOrigin} from '@/lib/requestOrigin'
export const dynamic='force-dynamic'
export async function POST(req:NextRequest){
 const origin=resolveRequestOrigin(req)
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return NextResponse.json({error:'Please open your invitation on Endless Tales.'},{status:403})
 const token=(await req.formData()).get('token_hash')
 if(typeof token!=='string'||! /^[a-zA-Z0-9_-]{16,256}$/.test(token))return NextResponse.redirect(new URL('/auth/link-expired',origin),303)
 const callback=new URL('/auth/callback',origin);callback.searchParams.set('token_hash',token);callback.searchParams.set('type','magiclink')
 // Reuse the established server-side cookie exchange. No PKCE verifier or
 // browser storage from the sending device is needed on the recipient phone.
 const response=await authCallback(new Request(callback,{headers:req.headers}))
 if(response.cookies.getAll().some(c=>c.name.startsWith('sb-')))response.headers.set('location',`${origin}/home?welcome=true`)
 // POST must become a GET at Home (307 would repeat the form submission).
 if(response.status>=300&&response.status<400){const redirect=NextResponse.redirect(response.headers.get('location')!,303);for(const cookie of response.cookies.getAll())redirect.cookies.set(cookie);return redirect}
 return response
}
