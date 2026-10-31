'use client'
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react'
import {usePathname,useRouter,useSearchParams} from 'next/navigation'
import {adminVersion,ADMIN_VERSION_COOKIE,versionHref,type AdminVersion} from '@/lib/admin-center/admin-version'
import {request} from './command-ui'
const Context=createContext<{version:AdminVersion;choose:(v:AdminVersion)=>void;days:string;setDays:(v:string)=>void;overview:(days:number,force?:boolean)=>Promise<any>}>({version:'new',choose:()=>{},days:'30',setDays:()=>{},overview:days=>request('/api/admin/center?section=overview&days='+days)})
export function AdminVersionProvider({initialVersion='new',children}:{initialVersion?:AdminVersion;children:ReactNode}){
 const params=useSearchParams(),pathname=usePathname(),router=useRouter(),[choice,setChoice]=useState(adminVersion(params.get('adminView'))||initialVersion),[days,setDays]=useState('30'),cache=useRef(new Map<number,{at:number;promise:Promise<any>}>());const version=adminVersion(params.get('adminView'))||choice
 useEffect(()=>{const explicit=adminVersion(params.get('adminView'));if(explicit){setChoice(explicit);document.cookie=ADMIN_VERSION_COOKIE+'='+explicit+'; Path=/admin; Max-Age=31536000; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'')}},[params])
 const choose=useCallback((v:AdminVersion)=>{document.cookie=ADMIN_VERSION_COOKIE+'='+v+'; Path=/admin; Max-Age=31536000; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');setChoice(v);router.replace(versionHref(pathname||'/admin',params.toString(),v))},[pathname,params,router])
 const overview=useCallback((days:number,force=false)=>{const current=cache.current.get(days);if(!force&&current&&Date.now()-current.at<60000)return current.promise;const item={at:Date.now(),promise:request('/api/admin/center?section=overview&days='+days)};cache.current.set(days,item);item.promise.catch(()=>{if(cache.current.get(days)===item)cache.current.delete(days)});return item.promise},[])
 return <Context.Provider value={{version,choose,days,setDays,overview}}>{children}</Context.Provider>
}
export const useAdminVersion=()=>useContext(Context)
export function AdminVersionToggle({dark=false}:{dark?:boolean}){const{version,choose}=useAdminVersion();return <div role="group" aria-label="Admin version" style={{display:'flex',gap:4,padding:4,border:'1px solid '+(dark?'#475569':'#cedbd5'),borderRadius:10,margin:'0 0 16px',background:dark?'#102c2b':'#f0f4f0'}}>{(['new','classic'] as const).map(v=><button key={v} type="button" aria-pressed={version===v} onClick={()=>choose(v)} style={{flex:1,minHeight:44,padding:'8px 6px',border:0,borderRadius:7,fontSize:13,fontWeight:700,cursor:'pointer',color:version===v?'#173e3d':dark?'white':'#173e3d',background:version===v?'#f4cfaa':'transparent'}}>{v==='new'?'New Admin':'Classic Admin'}</button>)}</div>}
