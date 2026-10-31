'use client'
import {AdminVersionProvider,useAdminVersion} from './AdminVersion'
import type {AdminVersion} from '@/lib/admin-center/admin-version'
import AdminShell from './AdminShell'
import ClassicShell from './classic/ClassicShell'
export default function AdminFrame({children,initialVersion,identity}:{children:React.ReactNode;initialVersion:AdminVersion;identity:{name:string;email:string}}){return <AdminVersionProvider initialVersion={initialVersion}><Frame identity={identity}>{children}</Frame></AdminVersionProvider>}
function Frame({children,identity}:{children:React.ReactNode;identity:{name:string;email:string}}){return useAdminVersion().version==='classic'?<ClassicShell>{children}</ClassicShell>:<AdminShell identity={identity}>{children}</AdminShell>}
