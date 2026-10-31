import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {adminAccess} from '@/lib/admin-center/auth'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(req:Request){
 const denied=await adminAccess(req)
 if(denied)return denied
 try{
  const bytes=await readFile(path.join(process.cwd(),'content/admin/Endless-Tales-6-plus-2-Marketing-Workbook.xlsx'))
  return new Response(new Uint8Array(bytes),{headers:{
   'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'Content-Disposition':'attachment; filename="Endless-Tales-6-plus-2-Marketing-Workbook.xlsx"',
   'Cache-Control':'private, no-store',
   'X-Content-Type-Options':'nosniff',
  }})
 }catch{
  return Response.json({error:'The marketing Excel workbook is unavailable. Please try again later.'},{status:503})
 }
}
