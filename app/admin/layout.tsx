import { redirect } from 'next/navigation'
import { feedbackAdmin } from '@/lib/server/feedbackAdmin'
import AdminShell from './AdminShell'
export const dynamic = 'force-dynamic'
export default async function AdminLayout({children}:{children:React.ReactNode}){
 let admin: Awaited<ReturnType<typeof feedbackAdmin>> = null
 try { admin = await feedbackAdmin() } catch {}
 if(!admin) redirect('/signin?returnTo=%2Fadmin')
 return <AdminShell>{children}</AdminShell>
}
