import { redirect } from 'next/navigation'
import { feedbackAdmin } from '@/lib/server/feedbackAdmin'
import AdminFrame from './AdminFrame'
import {cookies} from 'next/headers'
import {adminVersion,ADMIN_VERSION_COOKIE} from '@/lib/admin-center/admin-version'
export const dynamic = 'force-dynamic'
export default async function AdminLayout({children}:{children:React.ReactNode}){
 let admin: Awaited<ReturnType<typeof feedbackAdmin>> = null
 try { admin = await feedbackAdmin() } catch {}
 if(!admin) redirect('/signin?returnTo=%2Fadmin')
 return <AdminFrame initialVersion={adminVersion(cookies().get(ADMIN_VERSION_COOKIE)?.value)||'new'} identity={{name:admin.user_metadata?.first_name||admin.user_metadata?.full_name||admin.email||'Administrator',email:admin.email||''}}>{children}</AdminFrame>
}
