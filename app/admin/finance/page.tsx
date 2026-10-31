'use client'
import CommandCenter from '../CommandCenter'
import {useAdminVersion} from '../AdminVersion'
import ClassicFinance from '../classic/ClassicFinance'
export default function Finance(){return useAdminVersion().version==='classic'?<ClassicFinance/>:<CommandCenter initialSection="finance"/>}
