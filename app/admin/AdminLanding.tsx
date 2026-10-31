'use client'
import {useAdminVersion} from './AdminVersion'
import CommandCenter from './CommandCenter'
import ClassicDashboard from './classic/ClassicDashboard'
export default function AdminLanding(){return useAdminVersion().version==='classic'?<ClassicDashboard/>:<CommandCenter/>}
